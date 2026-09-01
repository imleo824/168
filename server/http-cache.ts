import type { Request, Response } from 'express';

const PUBLIC_FEED_SHARED_CACHE_SECONDS = 90;
const PUBLIC_FEED_SHARED_STALE_SECONDS = 300;

function appendVaryHeader(res: Response, values: string[]) {
  const current = String(res.getHeader('Vary') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const normalized = new Set(current.map((item) => item.toLowerCase()));
  for (const value of values) {
    if (!normalized.has(value.toLowerCase())) {
      current.push(value);
      normalized.add(value.toLowerCase());
    }
  }
  if (current.length > 0) res.setHeader('Vary', current.join(', '));
}

export function setNoStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function setPublicCache(
  res: Response,
  seconds: number,
  staleWhileRevalidate = seconds * 4,
  staleIfError = 60,
) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${seconds}, stale-while-revalidate=${staleWhileRevalidate}, stale-if-error=${staleIfError}`,
  );
}

export function setPrivateCache(
  res: Response,
  seconds: number,
  staleWhileRevalidate = seconds * 2,
  staleIfError = 30,
) {
  res.setHeader(
    'Cache-Control',
    `private, max-age=${seconds}, stale-while-revalidate=${staleWhileRevalidate}, stale-if-error=${staleIfError}`,
  );
  appendVaryHeader(res, ['Authorization', 'Cookie']);
}

export function setListCacheHeaders(res: Response, currentUserId?: string | null, seconds = 15) {
  if (currentUserId) {
    setPrivateCache(res, seconds, 60, 30);
    return;
  }
  setPublicCache(res, seconds, 120, 60);
}

export function setPublicFeedListCacheHeaders(
  res: Response,
  currentUserId?: string | null,
  seconds = 15,
) {
  if (currentUserId) {
    setPrivateCache(res, seconds, 60, 30);
    return;
  }
  const sharedSeconds = Math.max(seconds, PUBLIC_FEED_SHARED_CACHE_SECONDS);
  res.setHeader(
    'Cache-Control',
    `public, max-age=${seconds}, s-maxage=${sharedSeconds}, stale-while-revalidate=${PUBLIC_FEED_SHARED_STALE_SECONDS}, stale-if-error=300`,
  );
}

export function shouldSkipCompression(req: Request) {
  if (req.method !== 'GET') return false;
  return false;
}
