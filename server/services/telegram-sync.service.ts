import type { Request } from 'express';

import { ConfigService } from '../config.service';
import prisma from '../db';
import { TransactionAction } from '../../shared/domain';
import { collapseText } from './text-format.service';
import {
  TELEGRAM_PHOTO_ASSETS_MAX_TOTAL_BYTES,
  buildPostSharePreviewCandidates,
  fetchSocialPreviewImage,
  resolvePublicOriginFromContext,
} from './social-image.service';

export const TELEGRAM_SYNC_STATUS_NONE = 'NONE';
export const TELEGRAM_SYNC_STATUS_PENDING = 'PENDING';
export const TELEGRAM_SYNC_STATUS_SENT = 'SENT';
export const TELEGRAM_SYNC_STATUS_FAILED = 'FAILED';

const TELEGRAM_MESSAGE_TEXT_MAX_LENGTH = 4096;
const TELEGRAM_PHOTO_CAPTION_MAX_LENGTH = 950;
const TELEGRAM_SYNC_MAX_CONCURRENCY = 2;
const TELEGRAM_SYNC_MAX_QUEUE = 120;
const TELEGRAM_SHARE_TEMPLATE_DEFAULT = '{contentLine}\n' +
  '\n' +
  '来自：{authorLine} {contactLine}\n' +
  '\n' +
  '来源：{sourceLine}\n' +
  '\n' +
  '{categoryLine}';

export type TelegramSyncJob = {
  origin: string;
  post: any;
  authorName?: string | null;
  postId: string;
  telegramSyncCost: number;
};

type TelegramPhotoAsset = { buffer: Buffer; contentType: string; fileName: string };

const telegramSyncQueue: TelegramSyncJob[] = [];
const telegramSyncQueuedPostIds = new Set<string>();
const telegramSyncInFlightPostIds = new Set<string>();
let telegramSyncInFlight = 0;

function pickFirstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function parseBooleanConfigFlag(value: unknown, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function parseNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function normalizeTelegramPreservedText(input: unknown) {
  return String(input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+$/g, ''))
    .join('\n')
    .trim();
}

function normalizeTelegramMessageBody(text: string) {
  const lines = `${text || ''}`.split('\n').map((line) => line.trimEnd());
  const normalized: string[] = [];
  let prevEmpty = false;

  for (const line of lines) {
    const isEmpty = !line.trim();
    if (isEmpty) {
      if (!prevEmpty && normalized.length > 0) normalized.push('');
      prevEmpty = true;
      continue;
    }
    normalized.push(line);
    prevEmpty = false;
  }

  return normalized.join('\n').trim();
}

function escapeTelegramHtml(input: unknown) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeTelegramHtmlAttribute(input: unknown) {
  return escapeTelegramHtml(input).replace(/"/g, '&quot;');
}

function buildTelegramHtmlLink(url: string, label: string) {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return '';
  return `<a href="${escapeTelegramHtmlAttribute(normalizedUrl)}">${escapeTelegramHtml(label)}</a>`;
}

function stripInlineTagsForTelegramContent(input: unknown) {
  const text = normalizeTelegramPreservedText(input);
  if (!text) return '';
  return normalizeTelegramMessageBody(
    text
      .replace(/[#＃][\p{L}\p{N}_-]{1,40}/gu, '')
      .split('\n')
      .map((line) => line.replace(/[ \t\u00a0]{2,}/g, ' ').trimEnd())
      .join('\n'),
  );
}

function normalizeTelegramHashtagToken(value: string) {
  const normalized = `${value || ''}`
    .trim()
    .replace(/^[#＃]+/, '')
    .replace(/^📍\s*/, '')
    .replace(/^(?:location|loc|位置|地点)[:：]?\s*/i, '')
    .replace(/[\s\u3000]+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/^_+|_+$/g, '');
  return normalized ? `#${normalized}` : '';
}

function uniqueTelegramTokens(tokens: string[]) {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    const key = token.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTelegramTopicHashtags(post: any) {
  const categoryName = typeof post?.category?.name === 'string' ? post.category.name.trim() : '';
  const categoryToken = normalizeTelegramHashtagToken(categoryName);
  return uniqueTelegramTokens([categoryToken].filter(Boolean)).join(' ');
}

function countCodePoints(value: string) {
  return Array.from(value || '').length;
}

function splitLongLineByCodePoints(line: string, maxLength: number) {
  const chars = Array.from(line || '');
  const chunks: string[] = [];
  for (let cursor = 0; cursor < chars.length; cursor += maxLength) {
    chunks.push(chars.slice(cursor, cursor + maxLength).join(''));
  }
  return chunks;
}

function splitTelegramTextPreservingLines(input: unknown, maxLength: number) {
  const text = normalizeTelegramPreservedText(input);
  if (!text) return [] as string[];

  const safeMaxLength = Math.max(1, Math.floor(maxLength));
  const chunks: string[] = [];
  let current = '';
  const flushCurrent = () => {
    const normalized = current.replace(/[ \t\u00a0]+$/gm, '').trim();
    if (normalized) chunks.push(normalized);
    current = '';
  };

  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (countCodePoints(candidate) <= safeMaxLength) {
      current = candidate;
      continue;
    }
    flushCurrent();
    if (countCodePoints(line) <= safeMaxLength) {
      current = line;
      continue;
    }
    chunks.push(...splitLongLineByCodePoints(line, safeMaxLength));
  }

  flushCurrent();
  return chunks;
}

function splitTelegramCaptionAndRest(text: string) {
  const chunks = splitTelegramTextPreservingLines(text, TELEGRAM_PHOTO_CAPTION_MAX_LENGTH);
  return { caption: chunks[0] || '', restChunks: chunks.slice(1) };
}

function renderTelegramTemplate(template: string, values: Record<string, string>, htmlValues: Record<string, string> = {}) {
  const placeholderReg = /\{([a-zA-Z0-9_]+)\}/g;
  return `${template || ''}`
    .split('\n')
    .map((line) => {
      const keys: string[] = [];
      let rendered = '';
      let cursor = 0;
      for (const match of line.matchAll(placeholderReg)) {
        const [token, key] = match;
        const index = match.index ?? 0;
        rendered += escapeTelegramHtml(line.slice(cursor, index));
        keys.push(key);
        rendered += Object.prototype.hasOwnProperty.call(htmlValues, key)
          ? (htmlValues[key] || '')
          : (Object.prototype.hasOwnProperty.call(values, key) ? escapeTelegramHtml(values[key] || '') : '');
        cursor = index + token.length;
      }
      rendered += escapeTelegramHtml(line.slice(cursor));
      if (!keys.length) return rendered;
      const hasAnyResolvedContent = keys.some((key) => Boolean((values[key] || htmlValues[key] || '').trim()));
      return hasAnyResolvedContent ? rendered : '';
    })
    .join('\n');
}

function extractTelegramHandleFromUrl(input: string) {
  const raw = (input || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/([^/?#]+)/i);
  if (!match) return '';
  return (match[1] || '').replace(/^@+/, '').trim();
}

export function normalizeTelegramContactHandle(input: unknown) {
  if (input === null || input === undefined) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  const fromUrl = extractTelegramHandleFromUrl(raw);
  const candidate = (fromUrl || raw).replace(/^@+/, '').trim();
  if (!candidate) return '';
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(candidate) ? candidate : '';
}

function buildTelegramContactUrl(contact: unknown) {
  const handle = normalizeTelegramContactHandle(contact);
  return handle ? `@${handle}` : '';
}

function normalizeTelegramChatId(input: unknown) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return raw;
  const fromUrl = extractTelegramHandleFromUrl(raw);
  const handle = (fromUrl || raw.replace(/^@+/, '').trim()).replace(/[^a-zA-Z0-9_]/g, '');
  return handle ? `@${handle}` : null;
}

export function resolveTelegramChannelChatId(configs: any) {
  const explicitChatId = normalizeTelegramChatId(configs?.telegram_channel_id);
  if (explicitChatId) return explicitChatId;
  return normalizeTelegramChatId(configs?.telegram_channel);
}

function resolveRechargeNotifyChatId(configs: any) {
  return normalizeTelegramChatId(configs?.telegram_recharge_notify_chat_id);
}

function formatRechargeNotifyDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function formatRechargeNotifyUser(user: any) {
  const displayName = collapseText(String(user?.displayName || '').trim(), 40);
  const loginAccount = collapseText(String(user?.loginAccount || '').trim(), 40);
  if (displayName && loginAccount && displayName !== loginAccount) return `${displayName} / ${loginAccount}`;
  return displayName || loginAccount || '未命名用户';
}

function buildRechargeOrderSubmittedTelegramText(params: { order: any; user: any }) {
  const order = params.order || {};
  const user = params.user || {};
  return normalizeTelegramMessageBody([
    '新充值订单',
    '',
    `订单：${order.id || '-'}`,
    `用户：${formatRechargeNotifyUser(user)}`,
    `金额：${String(order.usdtAmount ?? '-')} ${order.token || 'USDT'}`,
    `地址：${order.toAddress || '-'}`,
    `时间：${formatRechargeNotifyDate(order.createdAt)}`,
  ].join('\n'));
}

async function callTelegramBotApi(params: { token: string; method: string; payload: Record<string, unknown> }) {
  const endpoint = `https://api.telegram.org/bot${params.token}/${params.method}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.payload),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.description || `Telegram API ${params.method} failed`);
  return result;
}

async function callTelegramBotApiMultipart(params: { token: string; method: string; formData: FormData }) {
  const endpoint = `https://api.telegram.org/bot${params.token}/${params.method}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(endpoint, { method: 'POST', body: params.formData, signal: controller.signal }).finally(() => clearTimeout(timeout));
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.description || `Telegram API ${params.method} failed`);
  return result;
}

export async function notifyRechargeOrderSubmitted(params: { configs: any; order: any; user: any }) {
  const token = getTelegramBotToken(params.configs);
  const chatId = resolveRechargeNotifyChatId(params.configs);
  if (!token || !chatId) return;
  await callTelegramBotApi({
    token,
    method: 'sendMessage',
    payload: {
      chat_id: chatId,
      text: buildRechargeOrderSubmittedTelegramText({ order: params.order, user: params.user }),
      link_preview_options: { is_disabled: true },
    },
  });
}

export function evaluateTelegramSyncRule(postLike: { content?: string | null; images?: string[] | null }, configs: any) {
  const minContentChars = parseNonNegativeInt(configs?.telegram_sync_min_content_chars, 0);
  const requireImage = parseBooleanConfigFlag(configs?.telegram_sync_require_image, false);
  const contentLength = Array.from(`${postLike?.content || ''}`.trim()).length;
  const imageCount = Array.isArray(postLike?.images) ? postLike.images.filter((item) => typeof item === 'string' && item.trim()).length : 0;
  if (minContentChars > 0 && contentLength < minContentChars) {
    return { allowed: false, reason: 'content_too_short', minContentChars, contentLength, requireImage, imageCount } as const;
  }
  if (requireImage && imageCount === 0) {
    return { allowed: false, reason: 'image_required', minContentChars, contentLength, requireImage, imageCount } as const;
  }
  return { allowed: true, reason: 'ok', minContentChars, contentLength, requireImage, imageCount } as const;
}

function normalizeShareSource(input: string | undefined) {
  return `${input || ''}`.trim();
}

function getTelegramPostImageSources(post: any, maxCount = 10) {
  if (!Array.isArray(post?.images)) return [] as string[];
  const unique = new Set<string>();
  for (const item of post.images) {
    const source = normalizeShareSource(typeof item === 'string' ? item : '');
    if (!source) continue;
    unique.add(source);
    if (unique.size >= maxCount) break;
  }
  return [...unique];
}

function resolveTelegramPhotoUrlSources(params: { post: any; origin: string; maxCount?: number }) {
  const maxCount = Math.min(Math.max(params.maxCount || 10, 1), 10);
  const imageSources = getTelegramPostImageSources(params.post, maxCount);
  const urls = new Set<string>();
  for (const source of imageSources) {
    for (const candidate of buildPostSharePreviewCandidates(source, params.origin)) {
      if (!/^https?:\/\//i.test(candidate)) continue;
      urls.add(candidate);
      break;
    }
    if (urls.size >= maxCount) break;
  }
  return [...urls];
}

function makeTelegramPhotoFilename(index: number, contentType: string, postId?: string) {
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  return `post-${postId || 'share'}-${index + 1}.${ext}`;
}

async function resolveTelegramPhotoAssetFromSource(sourceImage: string, origin: string) {
  const candidates = buildPostSharePreviewCandidates(sourceImage, origin);
  for (const candidate of candidates) {
    try {
      const image = await fetchSocialPreviewImage(candidate);
      return { candidate, image };
    } catch (error: any) {
      console.warn('[telegram-sync] photo candidate not reachable:', candidate, error?.message || error);
    }
  }
  return null;
}

async function resolveTelegramPhotoAssets(params: { post: any; origin: string; maxCount?: number }) {
  const maxCount = Math.min(Math.max(params.maxCount || 10, 1), 10);
  const imageSources = getTelegramPostImageSources(params.post, maxCount);
  const assets: TelegramPhotoAsset[] = [];
  let totalBytes = 0;
  for (const [index, source] of imageSources.entries()) {
    const resolved = await resolveTelegramPhotoAssetFromSource(source, params.origin);
    if (!resolved) continue;
    const nextTotalBytes = totalBytes + resolved.image.buffer.byteLength;
    if (nextTotalBytes > TELEGRAM_PHOTO_ASSETS_MAX_TOTAL_BYTES) break;
    totalBytes = nextTotalBytes;
    assets.push({
      buffer: resolved.image.buffer,
      contentType: resolved.image.contentType,
      fileName: makeTelegramPhotoFilename(index, resolved.image.contentType, params.post?.id),
    });
  }
  return assets.slice(0, maxCount);
}

function ensureDetailLinkInText(text: string, shareUrl: string) {
  const normalized = normalizeTelegramMessageBody(text);
  if (!shareUrl || normalized.includes(shareUrl)) return normalized;
  if (normalized.includes('查看详情')) return normalized;
  const detailLink = buildTelegramHtmlLink(shareUrl, '查看详情');
  return normalizeTelegramMessageBody(`${normalized}\n\n${detailLink}`);
}

function buildTelegramChannelPostText(params: { post: any; shareUrl: string; authorName: string; template?: string | null }) {
  const content = stripInlineTagsForTelegramContent(params.post?.content || '');
  const contactUrl = params.post?.showContact === false ? '' : buildTelegramContactUrl(params.post?.contact);
  const categoryLine = collapseText(buildTelegramTopicHashtags(params.post), 220);
  const template = (typeof params.template === 'string' ? params.template.trim() : '') || TELEGRAM_SHARE_TEMPLATE_DEFAULT;
  const rendered = renderTelegramTemplate(template, {
    contentLine: content,
    authorLine: `${params.authorName}`,
    contactLine: contactUrl || '',
    sourceLine: '\u200Btuitui888.com',
    categoryLine,
    shareUrl: '查看详情',
  }, {
    shareUrl: buildTelegramHtmlLink(params.shareUrl, '查看详情'),
  });
  return ensureDetailLinkInText(rendered, params.shareUrl);
}

async function sendTelegramTextChunks(params: { token: string; chatId: string; chunks: string[] }) {
  const chunks = params.chunks.map((chunk) => normalizeTelegramPreservedText(chunk)).filter(Boolean);
  for (const chunk of chunks) {
    await callTelegramBotApi({
      token: params.token,
      method: 'sendMessage',
      payload: {
        chat_id: params.chatId,
        text: chunk,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
    });
  }
}

async function sendTelegramChannelPost(params: { token: string; chatId: string; text: string; post: any; origin: string }) {
  const photoAssets = await resolveTelegramPhotoAssets({ post: params.post, origin: params.origin, maxCount: 10 });
  const photoUrls = resolveTelegramPhotoUrlSources({ post: params.post, origin: params.origin, maxCount: 10 });
  const normalizedText = normalizeTelegramPreservedText(params.text);
  const fullTextChunks = splitTelegramTextPreservingLines(normalizedText, TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);

  if (photoAssets.length >= 2) {
    try {
      const { caption, restChunks } = splitTelegramCaptionAndRest(normalizedText);
      const formData = new FormData();
      formData.append('chat_id', params.chatId);
      formData.append('media', JSON.stringify(photoAssets.slice(0, 10).map((_asset, index) => ({
        type: 'photo',
        media: `attach://photo_${index}`,
        ...(index === 0 && caption ? { caption, parse_mode: 'HTML' } : {}),
      }))));
      photoAssets.slice(0, 10).forEach((asset, index) => {
        formData.append(`photo_${index}`, new Blob([asset.buffer], { type: asset.contentType }), asset.fileName);
      });
      await callTelegramBotApiMultipart({ token: params.token, method: 'sendMediaGroup', formData });
      const remainingChunks = splitTelegramTextPreservingLines(restChunks.join('\n'), TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
      if (remainingChunks.length > 0) await sendTelegramTextChunks({ token: params.token, chatId: params.chatId, chunks: remainingChunks });
      return;
    } catch (error: any) {
      console.warn('[telegram-sync] sendMediaGroup failed:', error?.message || error);
    }
  }

  if (photoUrls.length >= 2) {
    try {
      const { caption, restChunks } = splitTelegramCaptionAndRest(normalizedText);
      await callTelegramBotApi({
        token: params.token,
        method: 'sendMediaGroup',
        payload: {
          chat_id: params.chatId,
          media: photoUrls.slice(0, 10).map((url, index) => ({
            type: 'photo',
            media: url,
            ...(index === 0 && caption ? { caption, parse_mode: 'HTML' } : {}),
          })),
        },
      });
      const remainingChunks = splitTelegramTextPreservingLines(restChunks.join('\n'), TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
      if (remainingChunks.length > 0) await sendTelegramTextChunks({ token: params.token, chatId: params.chatId, chunks: remainingChunks });
      return;
    } catch (error: any) {
      console.warn('[telegram-sync] sendMediaGroup by URL failed:', error?.message || error);
    }
  }

  if (photoAssets.length >= 1) {
    try {
      const [image] = photoAssets;
      const { caption, restChunks } = splitTelegramCaptionAndRest(normalizedText);
      const formData = new FormData();
      formData.append('chat_id', params.chatId);
      if (caption) formData.append('caption', caption);
      if (caption) formData.append('parse_mode', 'HTML');
      formData.append('photo', new Blob([image.buffer], { type: image.contentType }), image.fileName);
      await callTelegramBotApiMultipart({ token: params.token, method: 'sendPhoto', formData });
      const remainingChunks = splitTelegramTextPreservingLines(restChunks.join('\n'), TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
      if (remainingChunks.length > 0) await sendTelegramTextChunks({ token: params.token, chatId: params.chatId, chunks: remainingChunks });
      return;
    } catch (error: any) {
      console.warn('[telegram-sync] sendPhoto failed:', error?.message || error);
    }
  }

  if (photoUrls.length >= 1) {
    try {
      const { caption, restChunks } = splitTelegramCaptionAndRest(normalizedText);
      await callTelegramBotApi({
        token: params.token,
        method: 'sendPhoto',
        payload: {
          chat_id: params.chatId,
          photo: photoUrls[0],
          ...(caption ? { caption, parse_mode: 'HTML' } : {}),
        },
      });
      const remainingChunks = splitTelegramTextPreservingLines(restChunks.join('\n'), TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
      if (remainingChunks.length > 0) await sendTelegramTextChunks({ token: params.token, chatId: params.chatId, chunks: remainingChunks });
      return;
    } catch (error: any) {
      console.warn('[telegram-sync] sendPhoto by URL failed:', error?.message || error);
    }
  }

  await sendTelegramTextChunks({ token: params.token, chatId: params.chatId, chunks: fullTextChunks.length ? fullTextChunks : [''] });
}

async function syncPostToTelegramChannel(job: TelegramSyncJob) {
  const post = job.post;
  if (!post?.id) throw new Error('telegram_sync_post_missing');
  const configs = await ConfigService.getConfigs();
  const token = getTelegramBotToken(configs);
  if (!token) throw new Error('telegram_sync_missing_token');
  const chatId = resolveTelegramChannelChatId(configs);
  if (!chatId) throw new Error('telegram_sync_missing_channel');

  const rule = evaluateTelegramSyncRule(post, configs);
  if (!rule.allowed) throw new Error(`telegram_sync_rule_${rule.reason || 'blocked'}`);

  const origin = resolvePublicOriginFromContext(job.origin);
  const shareUrl = `${origin}/share/post/${post.id}`;
  const authorName = post.isAnonymous ? '匿名用户' : collapseText(job.authorName || '用户', 24);
  const text = buildTelegramChannelPostText({ post, shareUrl, authorName, template: configs?.telegram_share_template });
  await sendTelegramChannelPost({ token, chatId, text, post, origin });
}

export function normalizeTelegramSyncStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  return status === TELEGRAM_SYNC_STATUS_PENDING
    || status === TELEGRAM_SYNC_STATUS_SENT
    || status === TELEGRAM_SYNC_STATUS_FAILED
    || status === TELEGRAM_SYNC_STATUS_NONE
    ? status
    : TELEGRAM_SYNC_STATUS_NONE;
}

function normalizeTelegramSyncLastError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message || error || 'telegram_sync_failed');
  return message.trim().slice(0, 500) || 'telegram_sync_failed';
}

export function isTelegramSyncPostSendChargeError(error: unknown) {
  const message = normalizeTelegramSyncLastError(error).toLowerCase();
  return message.includes('pointtransaction')
    || message.includes('pointaction')
    || message.includes('invalid enum')
    || message.includes('enum value')
    || message.includes('扣费失败')
    || message.includes('频道同步扣费');
}

function normalizeTelegramSyncCostValue(value: unknown) {
  const rawCost = Number(value);
  if (!Number.isFinite(rawCost)) return 0;
  return Math.max(0, Math.floor(rawCost));
}

export function resolveTelegramSyncCost(configs: any) {
  return normalizeTelegramSyncCostValue(configs?.prices?.telegram_sync);
}

function resolveTelegramSyncJobCost(job: TelegramSyncJob) {
  return normalizeTelegramSyncCostValue(job.telegramSyncCost);
}

async function markTelegramSyncSent(postId: string) {
  if (!postId) return;
  await prisma.post.updateMany({
    where: { id: postId },
    data: {
      telegramSyncStatus: TELEGRAM_SYNC_STATUS_SENT as any,
      telegramSyncedAt: new Date(),
      telegramSyncLastError: null,
      syncToTelegram: true,
    } as any,
  });
}

export async function markTelegramSyncSentWithCharge(job: TelegramSyncJob, options: { allowFailedStatus?: boolean } = {}) {
  const cost = resolveTelegramSyncJobCost(job);
  if (cost <= 0) {
    await markTelegramSyncSent(job.postId);
    return;
  }
  const userId = String((job.post as any)?.userId || '').trim();
  if (!userId) throw new Error('telegram_sync_post_owner_missing');

  await prisma.$transaction(async (tx) => {
    const debitResult = await tx.user.updateMany({ where: { id: userId, points: { gte: cost } }, data: { points: { decrement: cost } } });
    if (debitResult.count === 0) throw new Error(`积分不足，频道同步扣费失败，需 ${cost} 积分`);
    await tx.pointTransaction.create({ data: { userId, action: TransactionAction.TELEGRAM_SYNC as any, amount: -cost, description: `官方频道同步扣费 ${cost} 积分` } });
    const allowedStatuses = options.allowFailedStatus ? [TELEGRAM_SYNC_STATUS_PENDING, TELEGRAM_SYNC_STATUS_FAILED] : [TELEGRAM_SYNC_STATUS_PENDING];
    const sent = await tx.post.updateMany({
      where: { id: job.postId, telegramSyncStatus: { in: allowedStatuses as any } },
      data: { telegramSyncStatus: TELEGRAM_SYNC_STATUS_SENT as any, telegramSyncedAt: new Date(), telegramSyncLastError: null, syncToTelegram: true } as any,
    });
    if (sent.count === 0) throw new Error('telegram_sync_status_changed');
  });
}

async function validateTelegramSyncBalance(job: TelegramSyncJob) {
  const cost = resolveTelegramSyncJobCost(job);
  if (cost <= 0) return;
  const userId = String((job.post as any)?.userId || '').trim();
  if (!userId) throw new Error('telegram_sync_post_owner_missing');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  if (!user) throw new Error('telegram_sync_post_owner_missing');
  if ((user.points || 0) < cost) throw new Error(`积分不足，频道同步扣费失败，需 ${cost} 积分`);
}

export async function markTelegramSyncFailed(postId: string, error: unknown) {
  if (!postId) return;
  await prisma.post.updateMany({
    where: { id: postId, telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING as any },
    data: { telegramSyncStatus: TELEGRAM_SYNC_STATUS_FAILED as any, telegramSyncLastError: normalizeTelegramSyncLastError(error), syncToTelegram: false } as any,
  });
}

function shouldRetryTelegramSync(error: any) {
  const message = String(error?.message || '').toLowerCase();
  return Boolean(message) && (
    message.includes('timeout')
    || message.includes('abort')
    || message.includes('429')
    || message.includes('too many requests')
    || message.includes('gateway')
    || message.includes('network')
  );
}

async function runTelegramSyncWithRetry(job: TelegramSyncJob) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let sentToTelegram = false;
    try {
      await validateTelegramSyncBalance(job);
      await syncPostToTelegramChannel(job);
      sentToTelegram = true;
      await markTelegramSyncSentWithCharge(job);
      return;
    } catch (error: any) {
      if (sentToTelegram) {
        await markTelegramSyncSent(job.postId);
        console.warn('[telegram-sync] sent but charge finalization failed:', { postId: job.postId, reason: error?.message || error });
        throw error;
      }
      const lastAttempt = attempt >= maxAttempts;
      if (lastAttempt || !shouldRetryTelegramSync(error)) {
        await markTelegramSyncFailed(job.postId, error);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
}

function drainTelegramSyncQueue() {
  while (telegramSyncInFlight < TELEGRAM_SYNC_MAX_CONCURRENCY && telegramSyncQueue.length > 0) {
    const nextJob = telegramSyncQueue.shift();
    if (!nextJob) break;
    telegramSyncQueuedPostIds.delete(nextJob.postId);
    telegramSyncInFlightPostIds.add(nextJob.postId);
    telegramSyncInFlight += 1;
    setTimeout(() => {
      runTelegramSyncWithRetry(nextJob)
        .catch((error: any) => console.warn('[telegram-sync] failed:', error?.message || error))
        .finally(() => {
          telegramSyncInFlight = Math.max(0, telegramSyncInFlight - 1);
          telegramSyncInFlightPostIds.delete(nextJob.postId);
          drainTelegramSyncQueue();
        });
    }, 0);
  }
}

function hasTelegramSyncPostId(postId: string) {
  return telegramSyncQueuedPostIds.has(postId) || telegramSyncInFlightPostIds.has(postId);
}

function enqueueTelegramChannelSync(params: { req: Request | string; post: any; authorName?: string | null; telegramSyncCost: number }) {
  const postId = `${params.post?.id || ''}`.trim();
  if (!postId) return false;
  if (hasTelegramSyncPostId(postId)) return true;

  if (telegramSyncQueue.length >= TELEGRAM_SYNC_MAX_QUEUE) {
    const dropped = telegramSyncQueue.shift();
    if (dropped?.postId) {
      telegramSyncQueuedPostIds.delete(dropped.postId);
      telegramSyncInFlightPostIds.delete(dropped.postId);
      void markTelegramSyncFailed(dropped.postId, new Error('telegram_sync_queue_full'));
    }
  }

  telegramSyncQueuedPostIds.add(postId);
  telegramSyncQueue.push({
    origin: resolvePublicOriginFromContext(params.req),
    post: params.post,
    authorName: params.authorName,
    postId,
    telegramSyncCost: normalizeTelegramSyncCostValue(params.telegramSyncCost),
  });
  drainTelegramSyncQueue();
  return true;
}

export async function scheduleTelegramChannelSync(params: { req: Request | string; post: any; authorName?: string | null; configs?: any; telegramSyncCost?: number }) {
  try {
    const syncStatus = normalizeTelegramSyncStatus(params.post?.telegramSyncStatus);
    if (syncStatus === TELEGRAM_SYNC_STATUS_SENT) return { enabled: false, queued: false } as const;
    if (syncStatus !== TELEGRAM_SYNC_STATUS_PENDING && params.post?.syncToTelegram !== true) return { enabled: false, queued: false } as const;

    const config = params.configs ?? await ConfigService.getConfigs();
    const telegramToken = getTelegramBotToken(config);
    const telegramChatId = resolveTelegramChannelChatId(config);
    const telegramSyncCost = params.telegramSyncCost === undefined ? resolveTelegramSyncCost(config) : normalizeTelegramSyncCostValue(params.telegramSyncCost);
    if (!telegramToken || !telegramChatId) return { enabled: true, queued: false, reason: 'missing_config' } as const;

    const telegramSyncRule = evaluateTelegramSyncRule({ content: params.post?.content, images: params.post?.images }, config);
    if (!telegramSyncRule.allowed) return { enabled: true, queued: false, reason: telegramSyncRule.reason } as const;

    const queued = enqueueTelegramChannelSync({ req: params.req, post: params.post, authorName: params.authorName, telegramSyncCost });
    return queued ? { enabled: true, queued: true } as const : { enabled: true, queued: false, reason: 'queue_full' } as const;
  } catch (error: any) {
    console.warn('[telegram-sync] schedule failed:', { postId: params.post?.id, reason: error?.message || error });
    return { enabled: true, queued: false, reason: 'schedule_error' } as const;
  }
}

export function getTelegramBotToken(configs?: any) {
  return pickFirstNonEmptyString(
    configs?.telegram_bot_token,
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_SYNC_BOT_TOKEN,
    process.env.TELEGRAM_RICH_BOT_TOKEN,
  );
}
