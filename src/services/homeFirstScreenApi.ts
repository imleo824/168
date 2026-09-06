import { apiFetch, ApiError } from './apiCore';
import type { CategoryMetaFeedFilters, HomeBootstrap, Post } from '@/types';

export type HomeFirstScreenFeedPage = {
  items: Post[];
  nextCursor: string | null;
  hasMore: boolean;
  unavailable?: boolean;
};

export type HomeFirstScreenResponse = {
  bootstrap: HomeBootstrap;
  feed: HomeFirstScreenFeedPage;
  generatedAt?: string;
};

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

function normalizeHomeFirstScreenFeedForDisplay(page: HomeFirstScreenFeedPage): HomeFirstScreenFeedPage {
  return {
    ...page,
    items: page.items.map(normalizeFeedPreviewForDisplay),
  };
}

async function readResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError('服务返回格式异常，请刷新后重试', res.status || 500);
  }
  if (!res.ok) {
    const message = payload?.error || payload?.message || `Status: ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return payload as T;
}

export async function getHomeFirstScreen(params: {
  feed: 'following' | 'recommended' | 'category';
  categorySlug?: string;
  limit?: number;
  categoryMetaScope?: string;
  categoryMetaFilters?: CategoryMetaFeedFilters;
}, options?: RequestInit): Promise<HomeFirstScreenResponse> {
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

  const res = await apiFetch(`/api/home/first-screen?${query.toString()}`, {
    ...options,
    retry: false,
  });
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.homeFeedCache = res.headers.get('X-Feed-Result-Cache') || 'UNKNOWN';
  }
  const payload = await readResponse<HomeFirstScreenResponse>(res);
  const feed = normalizeHomeFirstScreenFeedForDisplay({
    items: Array.isArray(payload.feed?.items) ? payload.feed.items : [],
    nextCursor: payload.feed?.nextCursor || null,
    hasMore: Boolean(payload.feed?.hasMore),
    unavailable: payload.feed?.unavailable,
  });
  return {
    ...payload,
    feed,
  };
}
