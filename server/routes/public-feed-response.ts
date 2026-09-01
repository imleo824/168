import type { Response } from 'express';
import { setPublicFeedListCacheHeaders } from '../http-cache';
import { getPublicFeedCacheVersion, type PublicFeedCachedPayload, type PublicFeedResultPayload } from '../public-feed-cache';
import { setCursorPaginationHeaders } from '../http/pagination';

export function sendPublicFeedCachedResult(
  res: Response,
  cachedResult: PublicFeedCachedPayload,
  currentUserId?: string | null,
  seconds = 12,
) {
  setCursorPaginationHeaders(res, cachedResult);
  setPublicFeedListCacheHeaders(res, currentUserId, seconds);
  res.setHeader('X-Feed-Result-Cache', cachedResult.cacheState);
  return res.type('application/json').send(cachedResult.body);
}

export function sendPublicFeedResult(
  res: Response,
  result: PublicFeedResultPayload,
  currentUserId?: string | null,
  seconds = 12,
  cacheState = 'BYPASS',
) {
  setCursorPaginationHeaders(res, result);
  setPublicFeedListCacheHeaders(res, currentUserId, seconds);
  res.setHeader('X-Feed-Result-Cache', cacheState);
  res.setHeader('X-Feed-Cache-Version', String(getPublicFeedCacheVersion()));
  return res.json(result.items);
}
