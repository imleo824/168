import type { FeedCacheScope } from './feed-contracts';

function normalizeCachePart(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value).trim().replace(/\s+/g, '_').slice(0, 120) || '-';
}

export function buildFeedCacheKey(scope: FeedCacheScope) {
  return [
    'feed',
    normalizeCachePart(scope.kind),
    `v${normalizeCachePart(scope.cacheVersion)}`,
    `limit:${normalizeCachePart(scope.limit)}`,
    `cursor:${normalizeCachePart(scope.cursor)}`,
    `category:${normalizeCachePart(scope.categoryId)}`,
    `country:${normalizeCachePart(scope.countryCode)}`,
    `location:${normalizeCachePart(scope.location)}`,
  ].join('|');
}
