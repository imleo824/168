import type { Request } from 'express';

import { getPublicFeedCacheVersion } from './public-feed-cache';

function readPositiveIntegerEnv(
  name: string,
  fallback: number,
  options: { min: number; max: number },
) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(options.max, Math.max(options.min, Math.floor(parsed)));
}

const PUBLIC_POST_DETAIL_CACHE_TTL_MS = readPositiveIntegerEnv(
  'PUBLIC_POST_DETAIL_CACHE_TTL_MS',
  90_000,
  { min: 5_000, max: 10 * 60_000 },
);
const PUBLIC_POST_DETAIL_CACHE_MAX_ENTRIES = readPositiveIntegerEnv(
  'PUBLIC_POST_DETAIL_CACHE_MAX_ENTRIES',
  640,
  { min: 64, max: 10_000 },
);

export type PublicPostDetailCachedPayload = {
  body: string;
  cacheState: 'HIT';
};

type PublicPostDetailCacheEntry = {
  body: string;
  expiresAt: number;
};

const publicPostDetailCache = new Map<string, PublicPostDetailCacheEntry>();

function shouldBypassPublicPostDetailCache(req: Request) {
  const bypassHeader = String(req.get('x-bypass-post-detail-cache') || req.get('x-bypass-feed-cache') || '')
    .trim()
    .toLowerCase();
  if (bypassHeader === '1' || bypassHeader === 'true' || bypassHeader === 'yes') return true;

  const refreshIntent = String(req.get('x-refresh-intent') || req.query.refreshIntent || req.query.refresh || '')
    .trim()
    .toLowerCase();
  return refreshIntent === 'manual' || refreshIntent === 'pull' || refreshIntent === '1' || refreshIntent === 'true';
}

function touchPublicPostDetailCache(key: string, cached: PublicPostDetailCacheEntry) {
  publicPostDetailCache.delete(key);
  publicPostDetailCache.set(key, cached);
}

function prunePublicPostDetailCache(now = Date.now()) {
  for (const [cacheKey, cached] of publicPostDetailCache) {
    if (cached.expiresAt <= now || publicPostDetailCache.size > PUBLIC_POST_DETAIL_CACHE_MAX_ENTRIES) {
      publicPostDetailCache.delete(cacheKey);
    }
    if (publicPostDetailCache.size <= PUBLIC_POST_DETAIL_CACHE_MAX_ENTRIES) break;
  }
}

export function getPublicPostDetailCacheKey(req: Request, postId: string, currentUserId?: string | null) {
  if (currentUserId) return null;
  if (!postId) return null;
  if (shouldBypassPublicPostDetailCache(req)) return null;
  return `feedVersion=${getPublicFeedCacheVersion()}|kind=post-detail|postId=${postId}`;
}

export function getPublicPostDetailCache(key: string | null): PublicPostDetailCachedPayload | null {
  if (!key) return null;
  const cached = publicPostDetailCache.get(key);
  if (!cached) return null;

  const now = Date.now();
  if (cached.expiresAt <= now) {
    publicPostDetailCache.delete(key);
    return null;
  }

  touchPublicPostDetailCache(key, cached);
  return { body: cached.body, cacheState: 'HIT' };
}

export function setPublicPostDetailCache(key: string | null, post: unknown) {
  if (!key) return;
  const now = Date.now();
  publicPostDetailCache.set(key, {
    body: JSON.stringify(post),
    expiresAt: now + PUBLIC_POST_DETAIL_CACHE_TTL_MS,
  });
  prunePublicPostDetailCache(now);
}
