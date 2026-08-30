import crypto from 'node:crypto';
import type {
  AutoCrawlCursorKind,
  AutoCrawlSourceConfig,
  AutoCrawlSourceType,
} from './auto-crawl.types';

export const DEFAULT_MAX_ITEMS_PER_SOURCE = 20;
export const DEFAULT_MAX_SOURCES_PER_RUN = 20;
export const DEFAULT_CHECK_INTERVAL_MINUTES = 30;
export const DEFAULT_POLL_INTERVAL_MINUTES = 30;
export const AUTO_CRAWL_MIN_POLL_INTERVAL_MINUTES = 5;
export const AUTO_CRAWL_MAX_POLL_INTERVAL_MINUTES = 240;

const TG_SOURCE_HOSTS = new Set(['t.me', 'telegram.me']);
const BLOCKED_SOURCE_PROTOCOLS = new Set(['file:', 'data:', 'blob:', 'ftp:', 'gopher:', 'javascript:']);

export function sanitizeDatabaseText(raw: unknown, maxLength = 100_000) {
  const input = String(raw ?? '').replace(/\r\n?/g, '\n');
  let output = '';

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 0) continue;

    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        output += input[index] + input[index + 1];
        index += 1;
      }
      continue;
    }
    if (code >= 0xDC00 && code <= 0xDFFF) continue;
    if ((code < 0x20 && code !== 0x09 && code !== 0x0A) || (code >= 0x7F && code <= 0x9F)) continue;
    output += input[index];
  }

  return Array.from(output.normalize('NFKC')).slice(0, Math.max(0, maxLength)).join('');
}

export function stableId(value: string) {
  return crypto.createHash('sha1').update(sanitizeDatabaseText(value || crypto.randomUUID(), 10_000)).digest('hex').slice(0, 24);
}

export function cleanString(raw: unknown, maxLength: number) {
  return sanitizeDatabaseText(raw, Math.max(maxLength * 4, maxLength))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function isPrivateIpv4(host: string) {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isBlockedHost(rawHost: string) {
  const host = rawHost.replace(/^\[|\]$/g, '').trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  return isPrivateIpv4(host);
}

export function normalizeAutoCrawlSourceValue(raw: unknown) {
  const value = cleanString(raw, 500).replace(/\s+/g, '');
  if (!value) return '';
  if (/^@[A-Za-z0-9_]{3,64}$/.test(value)) return value;
  if (/^(?:t\.me|telegram\.me)\/[^/?#\s]+/i.test(value)) return value.replace(/^http:\/\//i, 'https://');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }

  if (BLOCKED_SOURCE_PROTOCOLS.has(parsed.protocol)) return '';
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  if (isBlockedHost(parsed.hostname)) return '';
  if (TG_SOURCE_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.protocol === 'http:') parsed.protocol = 'https:';
  return parsed.toString();
}

export function normalizeType(source: unknown, type: unknown): AutoCrawlSourceType {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'telegram' || value === 'rss') return value;
  if (value) throw new Error('auto_crawl_source_type_invalid');
  return /t\.me\/|telegram\.me\/|^@/i.test(String(source || '')) ? 'telegram' : 'rss';
}

export function normalizeCursor(type: AutoCrawlSourceType, raw: unknown) {
  const cursor = cleanString(raw, 512);
  const numeric = Number(cursor || 0);
  const kind = type === 'telegram' ? 'message_id' : 'timestamp';
  if (cursor === '0') return { cursor: '0', cursorKind: kind as AutoCrawlCursorKind };
  if (!cursor || (type === 'telegram' && (!Number.isFinite(numeric) || numeric >= 1_000_000_000_000))) {
    return { cursor: '', cursorKind: 'baseline_pending' as AutoCrawlCursorKind };
  }
  return { cursor, cursorKind: kind as AutoCrawlCursorKind };
}

export function toInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, Math.round(numeric))) : fallback;
}

export function toBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '是', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '否', '关闭', '停用'].includes(normalized)) return false;
  }
  return fallback;
}

export function nowIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeSource(raw: Partial<AutoCrawlSourceConfig>): AutoCrawlSourceConfig {
  const source = normalizeAutoCrawlSourceValue(raw.source);
  const type = normalizeType(source, raw.type);
  const cursor = normalizeCursor(type, raw.cursor);
  const fallbackPollInterval = type === 'rss' ? 60 : DEFAULT_POLL_INTERVAL_MINUTES;
  return {
    id: cleanString(raw.id, 80) || stableId(source || crypto.randomUUID()),
    source,
    type,
    sourceName: cleanString(raw.sourceName, 120) || source,
    categoryId: cleanString(raw.categoryId, 128),
    categoryName: cleanString(raw.categoryName, 120),
    authorUserId: cleanString(raw.authorUserId, 128),
    showContact: toBool(raw.showContact, true),
    disabled: toBool(raw.disabled, false),
    cursor: cursor.cursor,
    cursorKind: ['message_id', 'timestamp', 'baseline_pending'].includes(String(raw.cursorKind))
      ? raw.cursorKind as AutoCrawlCursorKind
      : cursor.cursorKind,
    backfillBeforeCursor: cleanString(raw.backfillBeforeCursor, 128) || null,
    backfillTargetCursor: cleanString(raw.backfillTargetCursor, 128) || null,
    pollIntervalMinutes: toInt(raw.pollIntervalMinutes, fallbackPollInterval, AUTO_CRAWL_MIN_POLL_INTERVAL_MINUTES, AUTO_CRAWL_MAX_POLL_INTERVAL_MINUTES),
    nextRunAt: raw.nextRunAt ? nowIso(raw.nextRunAt) : null,
    lastSyncAt: raw.lastSyncAt ? nowIso(raw.lastSyncAt) : null,
    lastFetchedCount: toInt(raw.lastFetchedCount, 0, 0, 100000),
    lastParsedCount: toInt(raw.lastParsedCount, 0, 0, 100000),
    lastCandidateCount: toInt(raw.lastCandidateCount, 0, 0, 100000),
    lastDeliveredCount: toInt(raw.lastDeliveredCount, 0, 0, 100000),
    lastFilteredCount: toInt(raw.lastFilteredCount, 0, 0, 100000),
    lastDuplicateCount: toInt(raw.lastDuplicateCount, 0, 0, 100000),
    failCount: toInt(raw.failCount, 0, 0, 999),
    lastError: raw.lastError ? cleanString(raw.lastError, 1000) : null,
    lastVisibleMinCursor: raw.lastVisibleMinCursor || null,
    lastVisibleMaxCursor: raw.lastVisibleMaxCursor || null,
    sourceHealth: raw.sourceHealth || null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
