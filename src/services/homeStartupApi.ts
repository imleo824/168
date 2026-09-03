import type {
  Category,
  CategoryMetaFeedFilters,
  FeedBadgeCounts,
  HomeBootstrap,
  HomeNotificationSummary,
  Post,
  SystemConfig,
} from '@/types';
import { fetcher, pageFetcher, type ApiRequestOptions } from './apiCore';

function hasCategoryMetaFeedFilters(filters: CategoryMetaFeedFilters | undefined) {
  return Boolean(filters && Object.keys(filters).length > 0);
}

function normalizePostText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeFeedPreviewForDisplay(post: Post): Post {
  if (!(post as any)?.isFeedPreview) return post;

  const content = normalizePostText((post as any)?.content);
  const title = normalizePostText((post as any)?.title);
  const visibleText = content || title;
  const isServerTruncatedPreview = visibleText.endsWith('...');

  return isServerTruncatedPreview ? post : { ...post, isFeedPreview: false } as Post;
}

function normalizeFeedPageForDisplay(page: { items: Post[]; nextCursor: string | null; hasMore: boolean }) {
  return {
    ...page,
    items: page.items.map(normalizeFeedPreviewForDisplay),
  };
}

export const getConfigs = (options?: ApiRequestOptions) => fetcher<SystemConfig>('/api/config', { cache: 'no-store', ...options });
export const getCategories = (options?: ApiRequestOptions) => fetcher<Category[]>('/api/categories', { cache: 'no-store', ...options });
export const getHomeBootstrap = (options?: ApiRequestOptions) => fetcher<HomeBootstrap>('/api/home/bootstrap', { cache: 'no-store', ...options });

export async function getHomeFeedPage(params: { feed: 'following' | 'recommended' | 'category'; categorySlug?: string; limit?: number; cursor?: string | null; categoryMetaScope?: string; categoryMetaFilters?: CategoryMetaFeedFilters }, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key === 'categoryMetaFilters') {
      if (hasCategoryMetaFeedFilters(value as CategoryMetaFeedFilters | undefined)) {
        query.set(key, JSON.stringify(value));
      }
      return;
    }
    if (value) query.set(key, String(value));
  });
  const page = await pageFetcher<Post>(`/api/home/feed?${query.toString()}`, {
    ...options,
    retry: false,
  });
  return normalizeFeedPageForDisplay(page);
}

function toFeedUpdateQuery(params: { followingSince?: string; discoverSince?: string }) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

export const getFeedUpdateCounts = (params: { followingSince?: string; discoverSince?: string }) => {
  const suffix = toFeedUpdateQuery(params);
  return fetcher<FeedBadgeCounts>('/api/notifications/feed-counts' + (suffix ? '?' + suffix : ''));
};

export const getHomeNotificationSummary = (params: { followingSince?: string; discoverSince?: string }) => {
  const suffix = toFeedUpdateQuery(params);
  return fetcher<HomeNotificationSummary>('/api/notifications/home-summary' + (suffix ? '?' + suffix : ''));
};

export const getNotificationsList = (
  params: { type?: string; limit?: number; cursor?: string | null } = {},
  options?: ApiRequestOptions,
) => {
  const query = new URLSearchParams();
  if (params.type) query.set('type', params.type);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString();
  return fetcher<{ items: any[]; nextCursor: string | null; hasMore: boolean; unreadCount: number }>(
    '/api/me/notifications' + (suffix ? '?' + suffix : ''),
    options,
  );
};

export const recordPostViews = (
  postIds: string[],
  events?: Array<{ postId: string; dwellMs?: number; quickSkip?: boolean }>,
) => fetcher<{ success: boolean; views: Record<string, number> }>('/api/posts/views', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postIds, ...(events?.length ? { events } : {}) }),
});
