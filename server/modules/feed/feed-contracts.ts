export type FeedKind = 'recommended' | 'following' | 'category';

export type FeedPaginationInput = {
  limit: number;
  cursor?: string | null;
};

export type FeedViewerContext = {
  userId?: string | null;
  viewerKey?: string | null;
  isAuthenticated: boolean;
};

export type FeedCategoryContext = {
  categoryId?: string | null;
  categorySlug?: string | null;
  countryCode?: string | null;
  location?: string | null;
};

export type FeedRequestContext = {
  kind: FeedKind;
  pagination: FeedPaginationInput;
  viewer: FeedViewerContext;
  category?: FeedCategoryContext;
  requestId?: string;
};

export type FeedPageResult<TItem = unknown> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FeedCacheScope = {
  kind: FeedKind;
  categoryId?: string | null;
  countryCode?: string | null;
  location?: string | null;
  limit: number;
  cursor?: string | null;
  cacheVersion: number;
};

export type FeedPerformanceMark = {
  name: string;
  durationMs: number;
  requestId?: string;
  kind?: FeedKind;
  limit?: number;
};
