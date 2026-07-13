import type { Request } from 'express';

export const RANKED_CURSOR_PATTERN = /^rank:v1:[A-Za-z0-9_-]{16,512}$/;

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  options: { min: number; max: number },
) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(options.max, Math.max(options.min, Math.floor(parsed)));
}

const PUBLIC_FEED_RESULT_CACHE_TTL_MS = readPositiveIntegerEnv(
  'PUBLIC_FEED_RESULT_CACHE_TTL_MS',
  180_000,
  { min: 10_000, max: 30 * 60_000 },
);
const PUBLIC_FEED_RESULT_STALE_TTL_MS = readPositiveIntegerEnv(
  'PUBLIC_FEED_RESULT_STALE_TTL_MS',
  10 * 60_000,
  { min: 30_000, max: 60 * 60_000 },
);
const PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES = readPositiveIntegerEnv(
  'PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES',
  640,
  { min: 64, max: 10_000 },
);
const PUBLIC_FEED_READ_MAX_CONCURRENCY = readPositiveIntegerEnv(
  'PUBLIC_FEED_READ_MAX_CONCURRENCY',
  12,
  { min: 2, max: 64 },
);

export type PublicFeedResultPayload = {
  items: any[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type PublicFeedCacheKind = 'posts' | 'posts-tag' | 'home-feed';

export type PublicFeedCachedPayload = PublicFeedResultPayload & {
  body: string;
  cacheState: 'HIT' | 'STALE' | 'FALLBACK';
};

let publicFeedCacheVersion = 1;
const publicFeedResultCache = new Map<string, {
  expiresAt: number;
  staleExpiresAt: number;
  items: any[];
  body: string;
  nextCursor: string | null;
  hasMore: boolean;
}>();
const publicFeedLastGoodCache = new Map<string, {
  createdAt: number;
  items: any[];
  body: string;
  nextCursor: string | null;
  hasMore: boolean;
}>();
const publicFeedResultInflight = new Map<string, Promise<PublicFeedResultPayload>>();

function toVersionlessFeedCacheKey(key: string | null) {
  if (!key) return '';
  return key
    .split('|')
    .filter((part) => part && !part.startsWith('feedVersion='))
    .join('|');
}

function createAsyncLimiter(maxConcurrent: number) {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  let active = 0;
  const queue: Array<() => void> = [];

  const acquire = () => new Promise<void>((resolve) => {
    if (active < limit) {
      active += 1;
      resolve();
      return;
    }

    queue.push(() => {
      active += 1;
      resolve();
    });
  });

  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };

  return async function runLimited<T>(task: () => Promise<T>) {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

export const runPublicFeedRead = createAsyncLimiter(PUBLIC_FEED_READ_MAX_CONCURRENCY);

function stableNormalizeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalizeCacheValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next !== undefined) acc[key] = stableNormalizeCacheValue(next);
        return acc;
      }, {});
  }
  return value;
}

function normalizeJsonLikeCacheValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return trimmed;
  try {
    return JSON.stringify(stableNormalizeCacheValue(JSON.parse(trimmed)));
  } catch {
    return trimmed;
  }
}

function normalizeCacheQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeJsonLikeCacheValue(String(item ?? '')))
      .filter(Boolean)
      .sort()
      .join(',');
  }
  return normalizeJsonLikeCacheValue(String(value ?? ''));
}

function getRefreshIntentFromRequest(req: Request) {
  const headerIntent = String(req.get('x-refresh-intent') || '').trim().toLowerCase();
  const queryIntent = normalizeCacheQueryValue(req.query.refreshIntent || req.query.refresh).toLowerCase();
  return headerIntent || queryIntent;
}

function shouldBypassPublicFeedCache(req: Request) {
  const bypassHeader = String(req.get('x-bypass-feed-cache') || '').trim().toLowerCase();
  if (bypassHeader === '1' || bypassHeader === 'true' || bypassHeader === 'yes') return true;

  const intent = getRefreshIntentFromRequest(req);
  return intent === 'manual' || intent === 'pull' || intent === 'tab' || intent === '1' || intent === 'true';
}

export function bumpPublicFeedCacheVersion(reason: string) {
  publicFeedCacheVersion = (publicFeedCacheVersion % Number.MAX_SAFE_INTEGER) + 1;
  if (process.env.FEED_CACHE_DEBUG === '1') {
    console.info('[feed-cache] version bumped', { version: publicFeedCacheVersion, reason });
  }
}

export function getPublicFeedCacheVersion() {
  return publicFeedCacheVersion;
}

export function getPublicFeedResultCacheKey(
  req: Request,
  kind: PublicFeedCacheKind,
  params: { currentUserId?: string | null; limit: number; cursor?: string; range?: unknown },
) {
  if (params.currentUserId) return null;
  if (shouldBypassPublicFeedCache(req)) return null;
  const cursor = typeof params.cursor === 'string' ? params.cursor.trim() : '';
  if (cursor && !RANKED_CURSOR_PATTERN.test(cursor)) return null;

  const trackedKeys = ['feed', 'tag', 'categorySlug', 'categoryId', 'userId', 'location', 'country', 'query', 'categoryMetaScope', 'categoryMetaFilters'];
  const parts = [`feedVersion=${publicFeedCacheVersion}`, `kind=${kind}`, `limit=${params.limit}`];
  if (cursor) parts.push(`cursor=${cursor}`);
  for (const key of trackedKeys) {
    const value = normalizeCacheQueryValue(req.query[key]);
    if (value) parts.push(`${key}=${value}`);
  }
  return parts.join('|');
}

export function buildPublicFeedCacheKey(
  kind: PublicFeedCacheKind,
  parts: Record<string, string | number | null | undefined>,
) {
  const keyParts = [`feedVersion=${publicFeedCacheVersion}`, `kind=${kind}`];
  for (const [key, value] of Object.entries(parts)) {
    const normalized = normalizeCacheQueryValue(value);
    if (normalized) keyParts.push(`${key}=${normalized}`);
  }
  return keyParts.join('|');
}

export function getPublicFeedResultCache(key: string | null): PublicFeedCachedPayload | null {
  if (!key) return null;
  const cached = publicFeedResultCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (cached.expiresAt > now) {
    return {
      items: cached.items,
      body: cached.body,
      nextCursor: cached.nextCursor,
      hasMore: cached.hasMore,
      cacheState: 'HIT',
    };
  }

  if (cached.staleExpiresAt > now) {
    return {
      items: cached.items,
      body: cached.body,
      nextCursor: cached.nextCursor,
      hasMore: cached.hasMore,
      cacheState: 'STALE',
    };
  }

  publicFeedResultCache.delete(key);
  return null;
}

export function getPublicFeedFallbackCache(key: string | null): PublicFeedCachedPayload | null {
  if (!key) return null;
  const cached = publicFeedLastGoodCache.get(key) ||
    publicFeedLastGoodCache.get(toVersionlessFeedCacheKey(key));
  if (!cached) return null;

  return {
    items: cached.items,
    body: cached.body,
    nextCursor: cached.nextCursor,
    hasMore: cached.hasMore,
    cacheState: 'FALLBACK',
  };
}

export function refreshPublicFeedResultCache(
  key: string | null,
  loadResult: () => Promise<PublicFeedResultPayload>,
) {
  if (!key || getPublicFeedInflight(key)) return;
  const refreshPromise = loadResult()
    .then((result) => {
      setPublicFeedResultCache(key, result, result.items);
      return result;
    })
    .catch((error) => {
      console.warn('Public feed cache refresh failed:', error);
      throw error;
    });
  setPublicFeedInflight(key, refreshPromise);
}

export function setPublicFeedResultCache(
  key: string | null,
  result: { nextCursor: string | null; hasMore: boolean },
  items: any[],
) {
  if (!key) return;

  const now = Date.now();
  const body = JSON.stringify(items);
  publicFeedResultCache.set(key, {
    expiresAt: now + PUBLIC_FEED_RESULT_CACHE_TTL_MS,
    staleExpiresAt: now + PUBLIC_FEED_RESULT_CACHE_TTL_MS + PUBLIC_FEED_RESULT_STALE_TTL_MS,
    items,
    body,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
  publicFeedLastGoodCache.set(key, {
    createdAt: now,
    items,
    body,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
  const stableKey = toVersionlessFeedCacheKey(key);
  if (stableKey) {
    publicFeedLastGoodCache.set(stableKey, {
      createdAt: now,
      items,
      body,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  }

  if (publicFeedResultCache.size <= PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES) return;
  const pruneNow = Date.now();
  for (const [cacheKey, cached] of publicFeedResultCache) {
    if (cached.staleExpiresAt <= pruneNow || publicFeedResultCache.size > PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES) {
      publicFeedResultCache.delete(cacheKey);
    }
    if (publicFeedResultCache.size <= PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES) break;
  }

  while (publicFeedLastGoodCache.size > PUBLIC_FEED_RESULT_CACHE_MAX_ENTRIES) {
    let oldestKey = '';
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [cacheKey, cached] of publicFeedLastGoodCache) {
      if (cached.createdAt < oldestAt) {
        oldestAt = cached.createdAt;
        oldestKey = cacheKey;
      }
    }
    if (!oldestKey) break;
    publicFeedLastGoodCache.delete(oldestKey);
  }
}

export function getPublicFeedInflight(key: string | null) {
  return key ? publicFeedResultInflight.get(key) || null : null;
}

export function setPublicFeedInflight(
  key: string | null,
  promise: Promise<PublicFeedResultPayload>,
) {
  if (!key) return;
  publicFeedResultInflight.set(key, promise);
  promise
    .then((result) => {
      setPublicFeedResultCache(key, result, result.items);
    })
    .finally(() => {
      if (publicFeedResultInflight.get(key) === promise) {
        publicFeedResultInflight.delete(key);
      }
    })
    .catch(() => {});
}

export function clearPublicFeedResultCache() {
  publicFeedResultCache.clear();
  publicFeedLastGoodCache.clear();
  publicFeedResultInflight.clear();
}
