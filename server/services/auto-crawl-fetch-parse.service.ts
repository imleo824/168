import crypto from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { AutoCrawlItem, AutoCrawlSourceConfig } from './auto-crawl.types';
import { cleanString, sanitizeDatabaseText } from './auto-crawl-normalize';

export type FetchAutoCrawlItemsResult = {
  all: AutoCrawlItem[];
  items: AutoCrawlItem[];
  visibleMinCursor: string;
  visibleMaxCursor: string;
  parseMeta: Record<string, unknown>;
};

const USER_AGENT = 'Mozilla/5.0 (compatible; TuiTuiAutoCrawl/1.0)';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES_PER_ITEM = 9;
const MAX_REDIRECTS = 3;
const MAX_TELEGRAM_BACKFILL_PAGES = 20;
const RSS_CURSOR_SLOTS = 2048;
const ALLOWED_TEXT_CONTENT_TYPES = [
  'text/html',
  'text/xml',
  'application/xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/xhtml+xml',
  'text/plain',
];

function hash(value: unknown) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function decode(raw: unknown) {
  return sanitizeDatabaseText(String(raw || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10))), 200_000);
}

function stripHtml(raw: unknown) {
  return decode(String(raw || '')
    .replace(/<!\[CDATA\[/gi, '')
    .replace(/\]\]>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(raw: string, name: string) {
  return decode(raw.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1] || '');
}

function titleOf(title: string, content: string) {
  return cleanString(title || content.split('\n').find(Boolean) || content, 80) || '自动抓取内容';
}

function timestampOf(rawDate: unknown) {
  const text = String(rawDate || '').trim();
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeIso(timestamp: number) {
  const date = new Date(timestamp > 0 ? timestamp : Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function resolveAutoCrawlFetchUrl(source: AutoCrawlSourceConfig) {
  if (source.type !== 'telegram') return source.source;
  const value = String(source.source || '').trim().replace(/^@/, '');
  const match = value.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([^/?#]+)/i);
  return `https://t.me/s/${(match?.[1] || value).replace(/^s\//, '')}`;
}

function splitTelegramBlocks(html: string) {
  const text = String(html || '');
  const starts: number[] = [];
  const re = /<div\b(?=[^>]*\bdata-post\s*=)(?=[^>]*\bclass\s*=\s*["'][^"']*\btgme_widget_message\b)[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) starts.push(match.index);
  return starts.length
    ? starts.map((start, index) => text.slice(start, index + 1 < starts.length ? starts[index + 1] : text.length))
    : text.split(/tgme_widget_message_wrap/gi).slice(1);
}

function elementHtmlByClass(html: string, classToken: string) {
  const token = classToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(`<([a-zA-Z][\\w:-]*)\\b[^>]*class=["'][^"']*\\b${token}\\b[^"']*["'][^>]*>`, 'i');
  const open = openRe.exec(html);
  if (!open) return '';
  const tagName = open[1].toLowerCase();
  let depth = 1;
  const bodyStart = (open.index || 0) + open[0].length;
  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagRe.lastIndex = bodyStart;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(html)) !== null) {
    if (tag[0].startsWith('</')) depth -= 1;
    else if (!/\/>$/.test(tag[0])) depth += 1;
    if (depth === 0) return html.slice(bodyStart, tag.index);
  }
  return html.slice(bodyStart);
}

function normalizeHttpUrl(raw: unknown, baseUrl = '') {
  let url = decode(String(raw || '').trim()).replace(/^[ '\"]+|[ '\"]+$/g, '').replace(/\\u0026/g, '&');
  if (!url) return '';
  if (/^\/\//.test(url)) url = `https:${url}`;
  if (!/^https?:\/\//i.test(url) && baseUrl) {
    try {
      url = new URL(url, baseUrl).toString();
    } catch {
      return '';
    }
  }
  if (!/^https?:\/\//i.test(url)) return '';
  return cleanString(url, 1000);
}

function normalizeImageUrl(raw: unknown, baseUrl = '') {
  return normalizeHttpUrl(raw, baseUrl);
}

function isUsefulBodyImage(url: string) {
  if (!url || /^(?:data|blob):/i.test(url)) return false;
  let lower = url.toLowerCase();
  try { lower = decodeURIComponent(lower); } catch {}
  if (/\.(?:ico|svg|mp3|m4a|wav|ogg|mp4|webm|mov|pdf|zip)(?:$|[?#])/i.test(lower)) return false;
  if (/(?:userpic|userphoto|avatars?|profile|profile_photo|author_photo|owner|channel_photo|group_photo|logo|telegram[-_]logo|reaction|emoji|sticker|link_preview|preview_image|external_preview|favicon)/i.test(lower)) return false;
  return true;
}

function addImage(out: string[], seen: Set<string>, raw: unknown, baseUrl = '') {
  const url = normalizeImageUrl(raw, baseUrl);
  if (!url || seen.has(url) || !isUsefulBodyImage(url)) return;
  seen.add(url);
  out.push(url);
}

function extractTelegramBodyImages(block: string) {
  const images: string[] = [];
  const seen = new Set<string>();
  const mediaTagRe = /<(?:a|div|i|span)\b[^>]*class\s*=\s*(["'])([^"']*(?:tgme_widget_message_)?(?:photo_wrap|video_player|roundvideo_player|document_photo_wrap)[^"']*)\1[^>]*>/gi;
  let media: RegExpExecArray | null;
  while ((media = mediaTagRe.exec(block)) !== null && images.length < MAX_IMAGES_PER_ITEM) {
    const tag = media[0];
    const className = media[2] || '';
    if (/(?:link_preview|author|avatar|userpic|profile|reaction|emoji|sticker|owner|channel|group|message_text|message_author|message_info|reply|forwarded)/i.test(className)) continue;
    const snippet = block.slice(media.index, Math.min(block.length, media.index + 4500));
    const directBg = attr(tag, 'style').match(/background-image\s*:\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/i)?.[2];
    if (directBg) addImage(images, seen, directBg);
    const bgRe = /background-image\s*:\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let bg: RegExpExecArray | null;
    while ((bg = bgRe.exec(snippet)) !== null && images.length < MAX_IMAGES_PER_ITEM) addImage(images, seen, bg[2]);
    const imgRe = /<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
    let image: RegExpExecArray | null;
    while ((image = imgRe.exec(snippet)) !== null && images.length < MAX_IMAGES_PER_ITEM) {
      if (/(?:avatar|userpic|profile|author|emoji|sticker|reaction|logo|preview)/i.test(attr(image[0], 'class'))) continue;
      addImage(images, seen, image[2]);
    }
  }
  return images;
}

export function parseTelegram(html: string): AutoCrawlItem[] {
  return splitTelegramBlocks(html)
    .map((block) => {
      const postPath = attr(block, 'data-post');
      const id = postPath.split('/').pop() || '';
      const text = stripHtml(elementHtmlByClass(block, 'tgme_widget_message_text'));
      const images = extractTelegramBodyImages(block);
      const rawDate = attr(block, 'datetime') || block.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || '';
      const timestamp = timestampOf(rawDate);
      const cursorNumber = Number(id || 0);
      return {
        id: id || hash(`${postPath}:${text}`).slice(0, 24),
        title: titleOf('', text),
        content: sanitizeDatabaseText(text, 100_000),
        rawText: sanitizeDatabaseText(text, 100_000),
        link: postPath ? `https://t.me/${postPath}` : '',
        timestamp: timestamp || Date.now(),
        datetime: rawDate && timestamp ? rawDate : safeIso(timestamp),
        cursorValue: id || String(cursorNumber || 0),
        cursorNumber: Number.isFinite(cursorNumber) ? cursorNumber : 0,
        images,
      };
    })
    .filter((item) => item.id && (item.content || item.images.length))
    .sort((left, right) => left.cursorNumber - right.cursorNumber);
}

function xmlTag(raw: string, tag: string) {
  return stripHtml(raw.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
}

function feedLink(chunk: string, baseUrl: string) {
  const direct = xmlTag(chunk, 'link');
  const raw = direct || chunk.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i)?.[1] || '';
  return normalizeHttpUrl(raw, baseUrl);
}

function extractImagesFromHtml(html: string, baseUrl = '') {
  const images: string[] = [];
  const seen = new Set<string>();
  for (const pattern of [/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi, /<media:content[^>]+url=["']([^"']+)["']/gi, /<enclosure[^>]+url=["']([^"']+)["'][^>]*>/gi]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null && images.length < MAX_IMAGES_PER_ITEM) addImage(images, seen, match[1], baseUrl);
  }
  return images;
}

type RssDraft = Omit<AutoCrawlItem, 'cursorValue' | 'cursorNumber'> & { baseTimestamp: number };

function assignRssCursors(drafts: RssDraft[]) {
  const groups = new Map<number, RssDraft[]>();
  for (const draft of drafts) {
    const group = groups.get(draft.baseTimestamp) || [];
    group.push(draft);
    groups.set(draft.baseTimestamp, group);
  }

  const output: AutoCrawlItem[] = [];
  for (const [timestamp, group] of groups) {
    group.sort((left, right) => left.id.localeCompare(right.id));
    group.forEach((draft, index) => {
      const cursorNumber = timestamp > 0
        ? timestamp + Math.min(index + 1, RSS_CURSOR_SLOTS - 1) / RSS_CURSOR_SLOTS
        : 0;
      output.push({
        ...draft,
        cursorValue: String(cursorNumber),
        cursorNumber,
      });
    });
  }
  return output.sort((left, right) => left.cursorNumber - right.cursorNumber || left.id.localeCompare(right.id));
}

function parseRss(xml: string, baseUrl = ''): AutoCrawlItem[] {
  const chunks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const drafts = chunks
    .map((chunk, index): RssDraft => {
      const title = xmlTag(chunk, 'title');
      const link = feedLink(chunk, baseUrl);
      const rawContent = chunk.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1]
        || chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]
        || chunk.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]
        || title;
      const content = stripHtml(rawContent);
      const rawDate = xmlTag(chunk, 'pubDate') || xmlTag(chunk, 'updated') || xmlTag(chunk, 'published');
      const baseTimestamp = timestampOf(rawDate);
      const id = xmlTag(chunk, 'guid') || link || hash(`${title}:${content}:${index}`);
      return {
        id: cleanString(id, 360),
        title: titleOf(title, content),
        content: sanitizeDatabaseText(content, 100_000),
        rawText: sanitizeDatabaseText(content, 100_000),
        link: cleanString(link, 1000),
        timestamp: baseTimestamp,
        datetime: safeIso(baseTimestamp),
        images: extractImagesFromHtml(`${rawContent}\n${chunk}`, link || baseUrl),
        baseTimestamp,
      };
    })
    .filter((item) => item.id && (item.content || item.images.length));
  return assignRssCursors(drafts);
}

function isAllowedTextContentType(contentType: string) {
  if (!contentType) return true;
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() || '';
  return ALLOWED_TEXT_CONTENT_TYPES.includes(normalized) || normalized.endsWith('+xml');
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (isIP(normalized) === 6) {
    return normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe80')
      || normalized.startsWith('::ffff:127.')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.');
  }
  return true;
}

export async function assertPublicHttpTarget(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('auto_crawl_source_protocol_not_allowed');
  if (url.username || url.password) throw new Error('auto_crawl_source_credentials_not_allowed');
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('auto_crawl_source_host_not_allowed');
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('auto_crawl_source_private_address');
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('auto_crawl_source_private_dns_address');
  }
}

async function fetchText(initialUrl: string) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpTarget(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,application/atom+xml;q=0.8,*/*;q=0.7',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'cache-control': 'no-cache',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount >= MAX_REDIRECTS) throw new Error('auto_crawl_redirect_not_allowed');
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok) throw new Error(`抓取失败 ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!isAllowedTextContentType(contentType)) throw new Error(`抓取响应类型不支持：${contentType || 'unknown'}`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_FETCH_BYTES) throw new Error(`抓取响应过大：${contentLength} bytes`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error(`抓取响应过大：${buffer.byteLength} bytes`);
      return {
        text: sanitizeDatabaseText(new TextDecoder('utf-8', { fatal: false }).decode(buffer), MAX_FETCH_BYTES),
        finalUrl: currentUrl,
        contentType,
        status: response.status,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('auto_crawl_redirect_limit_exceeded');
}

function mergeTelegramItems(items: AutoCrawlItem[]) {
  const byId = new Map<string, AutoCrawlItem>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()].sort((left, right) => left.cursorNumber - right.cursorNumber);
}

type TelegramBackfillSelection = {
  unresolved: boolean;
  backfillCandidateIds: Set<string>;
  backfillBeforeCursor: string | null;
  backfillTargetCursor: string | null;
};

export function selectAutoCrawlCandidates(
  all: AutoCrawlItem[],
  source: AutoCrawlSourceConfig,
  maxItems: number,
  backfill: TelegramBackfillSelection,
) {
  const cursor = Number(source.cursor || 0);
  const newItems = source.cursorKind === 'baseline_pending' || !cursor
    ? all.slice(-5)
    : all.filter((item) => item.cursorNumber === 0 || item.cursorNumber > cursor);
  const selectedNewItems = mergeTelegramItems(newItems).slice(0, maxItems);
  const selectedNewIds = new Set(selectedNewItems.map((item) => item.id));
  const sourceBackfillBefore = Number(source.backfillBeforeCursor || 0);
  const sourceBackfillTarget = Number(source.backfillTargetCursor || 0);
  const sourceHasActiveBackfill = sourceBackfillBefore > 0 && sourceBackfillTarget > 0;
  const resumedItems = sourceHasActiveBackfill ? all
    .filter((item) => backfill.backfillCandidateIds.has(item.id)
      && item.cursorNumber > sourceBackfillTarget
      && item.cursorNumber <= cursor
      && !selectedNewIds.has(item.id))
    .sort((left, right) => right.cursorNumber - left.cursorNumber)
    : [];
  const selectedResumedItems = resumedItems.slice(0, Math.max(0, maxItems - selectedNewItems.length));
  let backfillBeforeCursor = backfill.backfillBeforeCursor;
  let backfillTargetCursor = backfill.backfillTargetCursor;

  if (source.type === 'telegram') {
    const target = backfill.backfillTargetCursor || source.backfillTargetCursor || null;
    const hasUnprocessedFetchedBackfill = selectedResumedItems.length < resumedItems.length;
    if (selectedNewItems.length && sourceHasActiveBackfill) {
      // New live messages have priority; keep the exact historical checkpoint.
      backfillBeforeCursor = source.backfillBeforeCursor || null;
      backfillTargetCursor = source.backfillTargetCursor || null;
    } else if (selectedNewItems.length || newItems.length) {
      // Drain all newer messages from the channel head before moving the
      // historical checkpoint. Persist only the original target meanwhile.
      backfillBeforeCursor = null;
      backfillTargetCursor = target;
    } else if (selectedResumedItems.length && (backfill.unresolved || hasUnprocessedFetchedBackfill)) {
      backfillBeforeCursor = String(Math.min(...selectedResumedItems.map((item) => item.cursorNumber)));
      backfillTargetCursor = target;
    } else if (sourceHasActiveBackfill && backfill.unresolved) {
      backfillBeforeCursor = backfill.backfillBeforeCursor || source.backfillBeforeCursor || null;
      backfillTargetCursor = target;
    } else if (!sourceHasActiveBackfill && backfill.unresolved) {
      // Activate the resumable checkpoint only after the newer range is empty.
      // This activation run intentionally publishes no historical candidate.
      backfillTargetCursor = target;
    } else {
      backfillBeforeCursor = null;
      backfillTargetCursor = null;
    }
  }

  return {
    items: [...selectedNewItems, ...selectedResumedItems],
    backfillBeforeCursor,
    backfillTargetCursor,
  };
}

async function fetchTelegramWithBackfill(source: AutoCrawlSourceConfig, baseUrl: string) {
  const responses = [await fetchText(baseUrl)];
  let all = parseTelegram(responses[0].text);
  const cursor = Number(source.cursor || 0);
  const resumedBefore = Number(source.backfillBeforeCursor || 0);
  const resumedTarget = Number(source.backfillTargetCursor || 0);
  const isResuming = resumedBefore > 0 && resumedTarget > 0;
  const backfillCandidateIds = new Set<string>();
  let pages = 1;
  let previousMin = isResuming
    ? resumedBefore
    : all.length ? Math.min(...all.map((item) => item.cursorNumber)) : 0;
  // A target without a `before` cursor means the live/newer portion of the gap
  // is still being drained. Keep the original target, but paginate from the
  // current Telegram page so no middle page can be skipped.
  const targetCursor = resumedTarget > 0 ? resumedTarget : cursor;
  let stoppedReason = 'cursor_reached';

  while (targetCursor > 0 && previousMin > targetCursor && pages < MAX_TELEGRAM_BACKFILL_PAGES) {
    const olderUrl = new URL(baseUrl);
    olderUrl.searchParams.set('before', String(Math.trunc(previousMin)));
    const response = await fetchText(olderUrl.toString());
    responses.push(response);
    const older = parseTelegram(response.text);
    older.forEach((item) => backfillCandidateIds.add(item.id));
    const merged = mergeTelegramItems([...all, ...older]);
    const nextMin = merged.length ? Math.min(...merged.map((item) => item.cursorNumber)) : previousMin;
    all = merged;
    pages += 1;
    if (!older.length) {
      stoppedReason = 'no_older_items';
      break;
    }
    if (!nextMin || nextMin >= previousMin) {
      stoppedReason = 'pagination_not_progressing';
      break;
    }
    previousMin = nextMin;
  }

  const minCursor = all.length ? Math.min(...all.map((item) => item.cursorNumber)) : previousMin;
  const gapUnresolved = targetCursor > 0 && minCursor > targetCursor
    && !['no_older_items', 'pagination_not_progressing'].includes(stoppedReason);
  if (gapUnresolved && pages >= MAX_TELEGRAM_BACKFILL_PAGES) stoppedReason = 'page_limit_reached';
  return {
    all,
    responses,
    pages,
    gapUnresolved,
    gapFrom: gapUnresolved ? targetCursor + 1 : null,
    gapTo: gapUnresolved ? Math.max(targetCursor + 1, minCursor - 1) : null,
    stoppedReason,
    backfillCandidateIds,
    backfillBeforeCursor: gapUnresolved ? String(minCursor) : null,
    backfillTargetCursor: gapUnresolved ? String(targetCursor) : null,
  };
}

export async function fetchAutoCrawlItems(source: AutoCrawlSourceConfig, options: { maxItemsPerSource: number }): Promise<FetchAutoCrawlItemsResult> {
  const url = resolveAutoCrawlFetchUrl(source);
  let all: AutoCrawlItem[] = [];
  let finalUrl = url;
  let pageCount = 1;
  let contentType = '';
  let status = 0;
  let htmlBytes = 0;
  let telegramGap = {
    unresolved: false,
    from: null as number | null,
    to: null as number | null,
    stoppedReason: '',
    backfillCandidateIds: new Set<string>(),
    backfillBeforeCursor: null as string | null,
    backfillTargetCursor: null as string | null,
  };

  if (source.type === 'telegram') {
    const result = await fetchTelegramWithBackfill(source, url);
    all = result.all;
    pageCount = result.pages;
    finalUrl = result.responses.at(-1)?.finalUrl || url;
    contentType = result.responses[0]?.contentType || '';
    status = result.responses[0]?.status || 0;
    htmlBytes = result.responses.reduce((sum, response) => sum + response.text.length, 0);
    telegramGap = {
      unresolved: result.gapUnresolved,
      from: result.gapFrom,
      to: result.gapTo,
      stoppedReason: result.stoppedReason,
      backfillCandidateIds: result.backfillCandidateIds,
      backfillBeforeCursor: result.backfillBeforeCursor,
      backfillTargetCursor: result.backfillTargetCursor,
    };
  } else {
    const response = await fetchText(url);
    all = parseRss(response.text, response.finalUrl);
    finalUrl = response.finalUrl;
    contentType = response.contentType;
    status = response.status;
    htmlBytes = response.text.length;
  }

  const numericCursors = all.map((item) => item.cursorNumber).filter((value) => value > 0 && Number.isFinite(value));
  const visibleMinCursor = numericCursors.length ? String(Math.min(...numericCursors)) : '';
  const visibleMaxCursor = numericCursors.length ? String(Math.max(...numericCursors)) : '';
  const maxItems = Math.max(1, options.maxItemsPerSource);
  const selection = selectAutoCrawlCandidates(all, source, maxItems, telegramGap);
  const items = selection.items;
  telegramGap.backfillBeforeCursor = selection.backfillBeforeCursor;
  telegramGap.backfillTargetCursor = selection.backfillTargetCursor;

  if (status === 200 && all.length === 0 && htmlBytes > 500) {
    throw new Error('auto_crawl_parser_degraded_zero_items');
  }

  return {
    all,
    items,
    visibleMinCursor,
    visibleMaxCursor,
    parseMeta: {
      htmlBytes,
      parsedTotal: all.length,
      candidateTotal: items.length,
      parser: source.type,
      fetchUrl: url,
      finalUrl,
      contentType,
      responseStatus: status,
      pageCount,
      gapUnresolved: telegramGap.unresolved,
      gapFrom: telegramGap.from,
      gapTo: telegramGap.to,
      gapStoppedReason: telegramGap.stoppedReason,
      backfillBeforeCursor: telegramGap.backfillBeforeCursor,
      backfillTargetCursor: telegramGap.backfillTargetCursor,
      maxFetchBytes: MAX_FETCH_BYTES,
    },
  };
}
