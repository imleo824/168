import type { Request } from 'express';
import crypto from 'node:crypto';

import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import { getPlatformDayRange } from '../platform-time';
import {
  AUTO_POST_CONFIG_TOPICS,
  DEFAULT_AUTO_POST_CONFIG,
  getAutoPostConfig,
  normalizeAutoPostConfig,
  updateAutoPostConfig,
  type AutoPostConfig,
} from './auto-post.config';
import { withAutomationTaskLock, type AutomationTaskLockDetails } from './automation-task-lock.service';
import {
  attachInteractionAutomationExecutionEvents,
  logInteractionAutomationEvent,
} from './interaction-automation-execution-log.service';

export { getAutoPostConfig, normalizeAutoPostConfig, updateAutoPostConfig };
export type { AutoPostConfig };

export type AutoPostRunStatus = 'PENDING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
export type AutoPostTrigger = 'MANUAL' | 'SCHEDULED';
export type AutoPostTopic = 'QUOTE' | 'FACT' | 'RIDDLE' | 'JOKE';

export type AutoPostAfterPostCreated = (params: { post: any; user: any; req?: Request }) => Promise<void> | void;

export type AutoPostImportItem = {
  topic?: unknown;
  title?: unknown;
  content?: unknown;
  answer?: unknown;
  author?: unknown;
  sourceName?: unknown;
  sourceUrl?: unknown;
  license?: unknown;
  qualityScore?: unknown;
  isActive?: unknown;
};

type RunOptions = { trigger?: AutoPostTrigger; req?: Request; afterPostCreated?: AutoPostAfterPostCreated; force?: boolean };
type ListRunsOptions = { status?: AutoPostRunStatus; limit?: number; cursor?: string };
type ListContentsOptions = { topic?: AutoPostTopic; used?: boolean; active?: boolean; limit?: number; cursor?: string };

const AUTO_POST_TASK_LOCK_NAME = 'auto_post';
const AUTO_POST_TASK_LOCK_TTL_MS = 20 * 60 * 1000;
const AUTO_POST_SOURCE = 'auto_post_curated_content';
const AUTO_POST_RUN_RETENTION_DAYS = 3;
const TELEGRAM_SYNC_STATUS_NONE = 'NONE';
const PICK_CONTENT_LIMIT = 160;
const PICK_RANDOM_POOL_LIMIT = 50;

export const AUTO_POST_TOPICS: AutoPostTopic[] = ['QUOTE', 'FACT', 'RIDDLE', 'JOKE'];
const RUN_STATUSES = new Set<AutoPostRunStatus>(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);
const TOPIC_ALIASES: Record<string, AutoPostTopic> = {
  quote: 'QUOTE',
  quotes: 'QUOTE',
  famous_quote: 'QUOTE',
  famous_quotes: 'QUOTE',
  famous: 'QUOTE',
  '名人名言': 'QUOTE',
  fact: 'FACT',
  facts: 'FACT',
  cold_fact: 'FACT',
  cold_facts: 'FACT',
  '冷知识': 'FACT',
  riddle: 'RIDDLE',
  riddles: 'RIDDLE',
  brain_teaser: 'RIDDLE',
  brain_teasers: 'RIDDLE',
  '脑筋急转弯': 'RIDDLE',
  joke: 'JOKE',
  jokes: 'JOKE',
  cold_joke: 'JOKE',
  cold_jokes: 'JOKE',
  '冷笑话': 'JOKE',
};
const TOPIC_LABELS: Record<AutoPostTopic, string> = { QUOTE: '名人名言', FACT: '冷知识', RIDDLE: '脑筋急转弯', JOKE: '冷笑话' };
const AUTO_POST_BLOCK_PATTERNS = [
  /https?:\/\/|www\./i,
  /微信|wechat|telegram|tg|纸飞机|whatsapp|line|站外联系|私聊|私信|加我|联系方式/i,
  /付款|支付|转账|收款|充值|usdt|银行卡|担保|定金|汇款/i,
  /赌博|博彩|下注|盘口|洗钱|跑分|私彩|刷流水/i,
  /色情|涉黄|裸聊|约炮|招嫖/i,
  /假护照|假签证|假证|伪造|偷渡|绕关|买通|贿赂|包过|走后门/i,
  /辱骂|傻逼|操你|去死/i,
  /广告|引流|推广合作|商务合作/i,
];

function getDb() { return prisma as any; }
function cleanString(raw: unknown, maxLength: number) { return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, maxLength) : ''; }
function cleanText(raw: unknown, maxLength: number) { return typeof raw === 'string' ? raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, maxLength) : ''; }
function toBoolean(value: unknown, fallback: boolean) { if (typeof value === 'boolean') return value; if (typeof value === 'number') return value > 0; if (typeof value === 'string') { const normalized = value.trim().toLowerCase(); if (['true', '1', 'yes', 'on'].includes(normalized)) return true; if (['false', '0', 'no', 'off'].includes(normalized)) return false; } return fallback; }
function toInteger(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(value); if (!Number.isFinite(parsed)) return fallback; return Math.min(max, Math.max(min, Math.round(parsed))); }
function sliceChars(value: string, limit: number) { return Array.from(value).slice(0, limit).join(''); }
function normalizeForHash(raw: unknown) { return String(raw || '').normalize('NFKC').replace(/\s+/g, '').replace(/[“”"‘’'`，,。.!！?？、；;：:（）()[\]{}《》<>]/g, '').toLowerCase().trim(); }
export function buildAutoPostContentHash(content: string, answer?: string | null) { return crypto.createHash('sha256').update(`${normalizeForHash(content)}|${normalizeForHash(answer || '')}`).digest('hex'); }
export function normalizeAutoPostTopic(raw: unknown): AutoPostTopic | null { const value = String(raw || '').trim(); if (!value) return null; const upper = value.toUpperCase(); if (AUTO_POST_TOPICS.includes(upper as AutoPostTopic)) return upper as AutoPostTopic; return TOPIC_ALIASES[value.toLowerCase()] || TOPIC_ALIASES[value] || null; }
function normalizeRunStatus(raw: unknown) { const status = String(raw || '').trim().toUpperCase() as AutoPostRunStatus; return RUN_STATUSES.has(status) ? status : null; }
function isValidSourceUrl(raw: string) { try { const url = new URL(raw); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; } }
function safetyFailure(content: string, answer?: string | null) { const text = `${content}\n${answer || ''}`.trim(); if (!text) return 'content_empty'; if (AUTO_POST_BLOCK_PATTERNS.some((pattern) => pattern.test(text))) return 'content_blocked'; return ''; }
function normalizeImportItem(raw: AutoPostImportItem) {
  const topic = normalizeAutoPostTopic(raw.topic);
  const title = cleanString(raw.title, 120);
  const content = cleanText(raw.content, 1500);
  const answer = cleanText(raw.answer, 500);
  const author = cleanString(raw.author, 120);
  const sourceName = cleanString(raw.sourceName, 160);
  const sourceUrl = cleanString(raw.sourceUrl, 800);
  const license = cleanString(raw.license, 80);
  const qualityScore = toInteger(raw.qualityScore, 80, 0, 100);
  const isActive = toBoolean(raw.isActive, true);
  if (!topic) return { item: null, reason: 'invalid_topic' };
  if (!content || Array.from(content).length < 4) return { item: null, reason: 'content_too_short' };
  if (topic === 'RIDDLE' && !answer) return { item: null, reason: 'riddle_answer_required' };
  if (!sourceName || !sourceUrl || !license) return { item: null, reason: 'source_required' };
  if (!isValidSourceUrl(sourceUrl)) return { item: null, reason: 'invalid_source_url' };
  const unsafeReason = safetyFailure(content, answer);
  if (unsafeReason) return { item: null, reason: unsafeReason };
  return { item: { topic, title: title || null, content, answer: answer || null, author: author || null, sourceName, sourceUrl, license, contentHash: buildAutoPostContentHash(content, answer), isActive, qualityScore }, reason: '' };
}
function buildPostBody(content: any) { const body = cleanText(content?.content, 1500); const answer = cleanText(content?.answer, 500); if (content?.topic === 'RIDDLE' && answer && !body.includes(answer)) return `${body}\n\n答案：${answer}`; return body; }
function buildPostTitle(content: any, body: string) { const title = cleanString(content?.title, 18); return title || sliceChars(body, 18) || TOPIC_LABELS[content?.topic as AutoPostTopic] || '自动发帖'; }
function formatContentItem(item: any) { return { ...item, topicLabel: TOPIC_LABELS[item.topic as AutoPostTopic] || item.topic }; }

async function enrichRuns(runs: any[]) {
  if (runs.length === 0) return [];
  const postIds = Array.from(new Set(runs.map((run) => run.postId).filter(Boolean)));
  const userIds = Array.from(new Set(runs.map((run) => run.authorUserId).filter(Boolean)));
  const categoryIds = Array.from(new Set(runs.map((run) => run.categoryId).filter(Boolean)));
  const contentIds = Array.from(new Set(runs.map((run) => run.contentId).filter(Boolean)));
  const db = getDb();
  const [posts, users, categories, contents] = await Promise.all([
    postIds.length > 0 ? db.post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true, content: true, isPublished: true, deletedAt: true, createdAt: true } }) : Promise.resolve([]),
    userIds.length > 0 ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, photoUrl: true, userType: true, isDisabled: true } }) : Promise.resolve([]),
    categoryIds.length > 0 ? db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    contentIds.length > 0 ? db.autoPostContent.findMany({ where: { id: { in: contentIds } }, select: { id: true, topic: true, title: true, content: true, answer: true, author: true, sourceName: true, sourceUrl: true, license: true, usedAt: true, postId: true } }) : Promise.resolve([]),
  ]);
  const maps = { posts: new Map<string, any>(posts.map((post: any) => [String(post.id), post])), users: new Map<string, any>(users.map((user: any) => [String(user.id), user])), categories: new Map<string, any>(categories.map((category: any) => [String(category.id), category])), contents: new Map<string, any>(contents.map((content: any) => [String(content.id), formatContentItem(content)])) };
  return runs.map((run) => ({ ...run, topicLabel: run.topic ? TOPIC_LABELS[run.topic as AutoPostTopic] || run.topic : null, post: run.postId ? maps.posts.get(run.postId) || null : null, authorUser: run.authorUserId ? maps.users.get(run.authorUserId) || null : null, category: run.categoryId ? maps.categories.get(run.categoryId) || null : null, contentItem: run.contentId ? maps.contents.get(run.contentId) || null : null }));
}

async function createRun(trigger: AutoPostTrigger) { return getDb().autoPostRun.create({ data: { trigger, status: 'PENDING', startedAt: new Date() } }); }
async function finishRun(runId: string, data: { status: AutoPostRunStatus; contentId?: string | null; topic?: string | null; postId?: string | null; authorUserId?: string | null; categoryId?: string | null; publishedContent?: string | null; skipReason?: string | null; error?: string | null }) {
  const run = await getDb().autoPostRun.update({ where: { id: runId }, data: { ...data, finishedAt: new Date() } });
  await logInteractionAutomationEvent({
    module: 'auto_post',
    runId,
    level: data.status === 'FAILED' ? 'error' : 'info',
    phase: 'run_finished',
    message: data.status === 'SUCCEEDED' ? '自动发帖发布成功' : data.status === 'SKIPPED' ? '自动发帖跳过' : '自动发帖失败',
    status: data.status,
    reason: data.skipReason || data.error || null,
    postId: data.postId || null,
    robotUserId: data.authorUserId || null,
    details: {
      contentId: data.contentId || null,
      topic: data.topic || null,
      categoryId: data.categoryId || null,
      publishedContent: data.publishedContent || null,
    },
  });
  const [payload] = await enrichRuns([run]);
  return payload;
}
async function markRunSideEffectError(runId: string, message: string) { const run = await getDb().autoPostRun.update({ where: { id: runId }, data: { error: cleanString(message, 500), finishedAt: new Date() } }); const [payload] = await enrichRuns([run]); return payload; }
export async function cleanupExpiredAutoPostRuns() { if (!isDbConfigured()) return 0; const cutoff = new Date(Date.now() - AUTO_POST_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000); const result = await getDb().autoPostRun.deleteMany({ where: { createdAt: { lt: cutoff } } }); return Number(result?.count || 0); }
async function countTodaySucceededRuns(topic?: AutoPostTopic) { const todayRange = getPlatformDayRange(); return getDb().autoPostRun.count({ where: { status: 'SUCCEEDED', ...(topic ? { topic } : {}), createdAt: { gte: todayRange.start, lt: todayRange.end } } }); }
function getTopicConfig(config: AutoPostConfig, topic: AutoPostTopic) { return config.topicConfigs?.[topic] || DEFAULT_AUTO_POST_CONFIG.topicConfigs?.[topic] || { enabled: false, authorUserId: '', categoryId: '', dailyLimit: 12 }; }
async function validateTopicRuntimeConfig(config: AutoPostConfig, topic: AutoPostTopic) {
  const topicConfig = getTopicConfig(config, topic);
  if (!topicConfig.enabled) return { ok: false, reason: 'topic_disabled', user: null, category: null };
  if (!topicConfig.authorUserId) return { ok: false, reason: 'author_required', user: null, category: null };
  const [user, category] = await Promise.all([
    getDb().user.findUnique({ where: { id: topicConfig.authorUserId }, select: { id: true, displayName: true, photoUrl: true, role: true, userType: true, isDisabled: true } }),
    topicConfig.categoryId ? getDb().category.findUnique({ where: { id: topicConfig.categoryId }, select: { id: true, name: true, slug: true } }) : Promise.resolve(null),
  ]);
  if (!user) return { ok: false, reason: 'author_not_found', user: null, category };
  if (user.isDisabled) return { ok: false, reason: 'author_disabled', user, category };
  if (topicConfig.categoryId && !category) return { ok: false, reason: 'category_not_found', user, category: null };
  return { ok: true, reason: '', user, category };
}
export async function validateAutoPostConfigForSave(config: AutoPostConfig) { if (!isDbConfigured() || !config.enabled) return; for (const topic of AUTO_POST_CONFIG_TOPICS) { const topicConfig = getTopicConfig(config, topic as AutoPostTopic); if (!topicConfig.enabled) continue; const validation = await validateTopicRuntimeConfig(config, topic as AutoPostTopic); if (!validation.ok) throw new Error(`${topic}_${validation.reason || 'auto_post_config_invalid'}`); } }
async function pickContent(topic: AutoPostTopic) { const items = await getDb().autoPostContent.findMany({ where: { topic, isActive: true, usedAt: null }, orderBy: [{ qualityScore: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }], take: PICK_CONTENT_LIMIT }); if (items.length === 0) return null; const pool = items.slice(0, Math.min(PICK_RANDOM_POOL_LIMIT, items.length)); return pool[Math.floor(Math.random() * pool.length)] || pool[0]; }
async function pickRunnableTopic(config: AutoPostConfig) {
  const topics = AUTO_POST_CONFIG_TOPICS.filter((topic) => getTopicConfig(config, topic as AutoPostTopic).enabled) as AutoPostTopic[];
  if (topics.length === 0) return { topic: null, reason: 'no_topic_enabled' };
  const shuffled = [...topics].sort(() => Math.random() - 0.5);
  for (const topic of shuffled) {
    const topicConfig = getTopicConfig(config, topic);
    if (topicConfig.dailyLimit <= 0) continue;
    const validation = await validateTopicRuntimeConfig(config, topic);
    if (!validation.ok) continue;
    const succeededToday = await countTodaySucceededRuns(topic);
    if (succeededToday >= topicConfig.dailyLimit) continue;
    const content = await pickContent(topic);
    if (content) return { topic, content, validation, reason: '' };
  }
  return { topic: null, reason: 'no_available_topic_content' };
}
async function createPostFromContent(params: { contentItem: any; author: any; category: any | null; config: AutoPostConfig }) {
  const { contentItem, author, category } = params;
  const body = buildPostBody(contentItem);
  const unsafeReason = safetyFailure(body);
  if (unsafeReason) return { post: null, skippedReason: unsafeReason, publishedContent: body };
  const now = new Date();
  const post = await getDb().$transaction(async (tx: any) => {
    const claimed = await tx.autoPostContent.updateMany({ where: { id: contentItem.id, isActive: true, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw new Error('content_already_used');
    const created = await tx.post.create({
      data: {
        title: buildPostTitle(contentItem, body),
        content: body,
        contact: '',
        showContact: false,
        images: [],
        source: AUTO_POST_SOURCE,
        isAnonymous: false,
        isPublished: true,
        syncToTelegram: false,
        telegramSyncStatus: TELEGRAM_SYNC_STATUS_NONE as any,
        telegramSyncRequestedAt: null,
        telegramSyncLastError: null,
        ...(category?.id ? { category: { connect: { id: category.id } } } : {}),
        user: { connect: { id: author.id } },
        createdAt: now,
        bumpedAt: now,
      },
      include: { category: true, quotedPost: true },
    });
    await tx.autoPostContent.update({ where: { id: contentItem.id }, data: { postId: created.id } });
    return created;
  });
  PostService.schedulePostRankingRefresh(post.id);
  return { post, skippedReason: '', publishedContent: body };
}

export async function importAutoPostContents(rawItems: AutoPostImportItem[]) { if (!isDbConfigured()) throw new Error('Database is not configured'); const failures: Array<{ index: number; reason: string }> = []; const seenHashes = new Set<string>(); const data: any[] = []; rawItems.forEach((raw, index) => { const normalized = normalizeImportItem(raw); if (!normalized.item) { failures.push({ index, reason: normalized.reason }); return; } if (seenHashes.has(normalized.item.contentHash)) { failures.push({ index, reason: 'duplicate_in_payload' }); return; } seenHashes.add(normalized.item.contentHash); data.push(normalized.item); }); if (data.length === 0) return { input: rawItems.length, valid: 0, created: 0, skipped: rawItems.length, failures }; const created = await getDb().autoPostContent.createMany({ data, skipDuplicates: true }); return { input: rawItems.length, valid: data.length, created: created.count, skipped: rawItems.length - created.count, failures }; }
export async function listAutoPostContents(options: ListContentsOptions = {}) { if (!isDbConfigured()) return { items: [], nextCursor: null, hasMore: false }; const limit = Math.min(100, Math.max(1, Math.round(Number(options.limit) || 30))); const cursor = typeof options.cursor === 'string' && options.cursor.trim().length <= 128 ? options.cursor.trim() : ''; const items = await getDb().autoPostContent.findMany({ where: { ...(options.topic ? { topic: options.topic } : {}), ...(options.active !== undefined ? { isActive: options.active } : {}), ...(options.used === true ? { usedAt: { not: null } } : {}), ...(options.used === false ? { usedAt: null } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }); const hasMore = items.length > limit; const pageItems = hasMore ? items.slice(0, limit) : items; return { items: pageItems.map(formatContentItem), nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id || null : null, hasMore }; }
export async function updateAutoPostContent(id: string, patch: Record<string, unknown>) { if (!isDbConfigured()) throw new Error('Database is not configured'); const current = await getDb().autoPostContent.findUnique({ where: { id } }); if (!current) return null; const nextRaw = { topic: patch.topic ?? current.topic, title: patch.title ?? current.title, content: patch.content ?? current.content, answer: patch.answer ?? current.answer, author: patch.author ?? current.author, sourceName: patch.sourceName ?? current.sourceName, sourceUrl: patch.sourceUrl ?? current.sourceUrl, license: patch.license ?? current.license, qualityScore: patch.qualityScore ?? current.qualityScore, isActive: patch.isActive ?? current.isActive }; const normalized = normalizeImportItem(nextRaw); if (!normalized.item) throw new Error(normalized.reason || 'invalid_content'); const updated = await getDb().autoPostContent.update({ where: { id }, data: { ...normalized.item, usedAt: patch.usedAt === null ? null : current.usedAt, postId: patch.postId === null ? null : current.postId } }); return formatContentItem(updated); }
export async function listAutoPostRuns(options: ListRunsOptions = {}) { if (!isDbConfigured()) return { items: [], nextCursor: null, hasMore: false }; await cleanupExpiredAutoPostRuns(); const limit = Math.min(100, Math.max(1, Math.round(Number(options.limit) || 30))); const status = normalizeRunStatus(options.status); const cursor = typeof options.cursor === 'string' && options.cursor.trim().length <= 128 ? options.cursor.trim() : ''; const runs = await getDb().autoPostRun.findMany({ where: { ...(status ? { status } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }); const hasMore = runs.length > limit; const items = hasMore ? runs.slice(0, limit) : runs; return { items: await attachInteractionAutomationExecutionEvents('auto_post', await enrichRuns(items)), nextCursor: hasMore ? items[items.length - 1]?.id || null : null, hasMore }; }
export async function getAutoPostContentStats() { if (!isDbConfigured()) return { topics: [], total: 0, unused: 0 }; const [total, unused, grouped] = await Promise.all([getDb().autoPostContent.count(), getDb().autoPostContent.count({ where: { isActive: true, usedAt: null } }), getDb().autoPostContent.groupBy({ by: ['topic'], _count: { _all: true }, where: { isActive: true } })]); return { total, unused, topics: grouped.map((row: any) => ({ topic: row.topic, topicLabel: TOPIC_LABELS[row.topic as AutoPostTopic] || row.topic, active: row._count?._all || 0 })) }; }

export async function runAutoPostOnce(options: RunOptions = {}) {
  if (!isDbConfigured()) throw new Error('Database is not configured');
  await cleanupExpiredAutoPostRuns();
  const trigger = options.trigger || 'MANUAL';
  const run = await createRun(trigger);
  await logInteractionAutomationEvent({
    module: 'auto_post',
    runId: run.id,
    phase: 'run_started',
    message: '自动发帖执行开始',
    status: 'PENDING',
    details: { trigger, force: Boolean(options.force) },
  });
  let activeContentId: string | null = null;
  let activeTopic: AutoPostTopic | null = null;
  let activePublishedContent: string | null = null;
  let activeAuthorUserId: string | null = null;
  let activeCategoryId: string | null = null;
  try {
    const taskLock = await withAutomationTaskLock(AUTO_POST_TASK_LOCK_NAME, { ttlMs: AUTO_POST_TASK_LOCK_TTL_MS, metadata: { trigger, runId: run.id }, force: options.force }, async () => {
      await logInteractionAutomationEvent({ module: 'auto_post', runId: run.id, phase: 'lock_acquired', message: '任务锁已获取', status: 'RUNNING' });
      const config = await getAutoPostConfig({ force: true });
      await logInteractionAutomationEvent({
        module: 'auto_post',
        runId: run.id,
        phase: 'config_loaded',
        message: '自动发帖配置已读取',
        status: config.enabled ? 'ENABLED' : 'DISABLED',
        details: { enabled: config.enabled, checkIntervalMinutes: config.checkIntervalMinutes },
      });
      if (!config.enabled) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'disabled' });
      const picked = await pickRunnableTopic(config);
      await logInteractionAutomationEvent({
        module: 'auto_post',
        runId: run.id,
        phase: 'topic_selected',
        message: picked.topic ? '已选择可执行主题和内容' : '没有可执行主题内容',
        status: picked.topic ? 'READY' : 'SKIPPED',
        reason: picked.reason || null,
        details: { topic: picked.topic || null, contentId: picked.content?.id || null },
      });
      if (!picked.topic || !picked.content) return finishRun(run.id, { status: 'SKIPPED', skipReason: picked.reason || 'no_available_topic_content' });
      activeTopic = picked.topic;
      const validation = picked.validation || await validateTopicRuntimeConfig(config, activeTopic);
      await logInteractionAutomationEvent({
        module: 'auto_post',
        runId: run.id,
        level: validation.ok ? 'info' : 'warn',
        phase: 'runtime_config_checked',
        message: validation.ok ? '主题运行配置有效' : '主题运行配置无效',
        status: validation.ok ? 'PASSED' : 'REJECTED',
        reason: validation.reason || null,
        robotUserId: validation.user?.id || null,
        details: { topic: activeTopic, authorUserId: validation.user?.id || null, categoryId: validation.category?.id || null },
      });
      if (!validation.ok) return finishRun(run.id, { status: 'SKIPPED', topic: activeTopic, skipReason: validation.reason });
      activeAuthorUserId = validation.user.id;
      activeCategoryId = validation.category?.id || null;
      const contentItem = picked.content;
      activeContentId = contentItem.id;
      await logInteractionAutomationEvent({
        module: 'auto_post',
        runId: run.id,
        phase: 'content_selected',
        message: '已选择待发布内容',
        status: 'READY',
        robotUserId: activeAuthorUserId,
        details: { contentId: activeContentId, topic: activeTopic, title: contentItem.title || null, content: contentItem.content || null },
      });
      const created = await createPostFromContent({ contentItem, author: validation.user, category: validation.category, config });
      activePublishedContent = created.publishedContent;
      if (!created.post) return finishRun(run.id, { status: 'SKIPPED', contentId: activeContentId, topic: activeTopic, authorUserId: activeAuthorUserId, categoryId: activeCategoryId, publishedContent: activePublishedContent, skipReason: created.skippedReason || 'content_skipped' });
      await logInteractionAutomationEvent({
        module: 'auto_post',
        runId: run.id,
        phase: 'post_written',
        message: '帖子已写入',
        status: 'PUBLISHED',
        postId: created.post.id,
        robotUserId: activeAuthorUserId,
        details: { contentId: activeContentId, topic: activeTopic, categoryId: activeCategoryId },
      });
      let result = await finishRun(run.id, { status: 'SUCCEEDED', contentId: activeContentId, topic: activeTopic, postId: created.post.id, authorUserId: activeAuthorUserId, categoryId: activeCategoryId, publishedContent: activePublishedContent });
      try { await options.afterPostCreated?.({ post: created.post, user: validation.user, req: options.req }); } catch (error: any) { result = await markRunSideEffectError(run.id, `after_post_created_failed: ${cleanString(error?.message || error, 430)}`); }
      return result;
    });
    if (!taskLock.acquired) {
      const skippedRun = await finishRun(run.id, { status: 'SKIPPED', skipReason: 'another_instance_running' });
      return { ...skippedRun, lock: taskLock.lock as AutomationTaskLockDetails | null };
    }
    return taskLock.result;
  } catch (error: any) {
    return finishRun(run.id, { status: 'FAILED', contentId: activeContentId, topic: activeTopic, authorUserId: activeAuthorUserId, categoryId: activeCategoryId, publishedContent: activePublishedContent, error: cleanString(error?.message || error, 500) });
  }
}
