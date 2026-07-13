import {
  SystemConfig,
  Category,
  Post,
  User,
  Transaction,
  PromotionBooking,
  PromotionEffectAnalysis,
  RechargeOrder,
  HomeBootstrap,
  FeedBadgeCounts,
  HomeNotificationSummary,
  JoinedTopic,
  ChatBootstrap,
  ChatMessage,
  ChatConfig,
  type PostLikeSummary,
  type CategoryMetaFeedFilters,
  type TelegramSyncStatus,
} from '@/types';

const API_TIMEOUT_MS = 15000;
const API_RETRY_DELAYS_MS = [180, 480];
const inFlightGetRequests = new Map<string, Promise<Response>>();

type RefreshIntent = 'silent' | 'manual' | 'pull' | 'tab' | 'mutation';

type ApiRequestOptions = RequestInit & {
  /**
   * Refresh intent is forwarded to the server so only explicit user refreshes
   * bypass feed result caches. Normal navigation keeps the cheap cached path.
   */
  refreshIntent?: RefreshIntent;
  bypassServerCache?: boolean;
  retry?: boolean;
};

export type MyCommentItem = {
  id: string;
  postId: string;
  userId: string;
  content: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  post?: Pick<Post, 'id' | 'title' | 'content' | 'images' | 'createdAt' | 'userId'> & {
    user?: Partial<User> | null;
  } | null;
};

function normalizeRefreshIntent(value: unknown): RefreshIntent | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'silent' || normalized === 'manual' || normalized === 'pull' || normalized === 'tab' || normalized === 'mutation'
    ? normalized
    : null;
}

function shouldBypassServerCacheForIntent(intent: RefreshIntent | null, explicitBypass: unknown) {
  if (explicitBypass === true) return true;
  return intent === 'manual' || intent === 'pull' || intent === 'tab';
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isApiRequest(url: string) {
  return url.startsWith('/api') || url.includes('/api/');
}

function isReferenceApiRequest(url: string) {
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
  return path === '/api/home/bootstrap' || path === '/api/config' || path === '/api/categories' || path === '/api/promotions/home-ads' || path === '/api/promotions/chat-ads';
}

function resolveRequestCacheMode(url: string, method: string, explicitCache?: RequestCache) {
  if (explicitCache) return explicitCache;
  if (method !== 'GET' || !isApiRequest(url)) return explicitCache;

  // React Query owns dynamic data freshness. Browser HTTP cache is reserved for
  // reference data so mutation invalidation cannot be blocked by a fresh 200.
  return isReferenceApiRequest(url) ? 'default' : 'no-store';
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function shouldRetryRequest(method: string, init: ApiRequestOptions) {
  if (init.retry === false) return false;
  return method === 'GET' && !init.signal;
}

function createAbortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function getGetDedupeKey(method: string, url: string, headers: Headers, init: RequestInit) {
  const auth = headers.get('Authorization') || '';
  const accept = headers.get('Accept') || '';
  const cache = init.cache || '';
  const retry = (init as ApiRequestOptions).retry === false ? '0' : '1';
  const refreshIntent = headers.get('X-Refresh-Intent') || '';
  const bypassFeedCache = headers.get('X-Bypass-Feed-Cache') || '';
  return `${method}:${url}:auth=${auth}:accept=${accept}:cache=${cache}:retry=${retry}:refresh=${refreshIntent}:bypass=${bypassFeedCache}`;
}

function waitForSharedResponse(pending: Promise<Response>, signal?: AbortSignal | null) {
  if (!signal) {
    return pending.then((response) => response.clone());
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<Response>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (response) => {
        cleanup();
        resolve(response.clone());
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function normalizeFetchException(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('请求超时，请稍后重试', 0);
  }
  if (error instanceof TypeError) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(offline ? '当前网络不可用，请检查连接' : '网络连接不稳定，请稍后重试', 0);
  }
  return error;
}

export async function apiFetch(input: RequestInfo | URL, init: ApiRequestOptions = {}): Promise<Response> {
  const url = getRequestUrl(input);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const refreshIntent = normalizeRefreshIntent((init as ApiRequestOptions).refreshIntent);
  if (refreshIntent) {
    headers.set('X-Refresh-Intent', refreshIntent);
  }
  if (shouldBypassServerCacheForIntent(refreshIntent, (init as ApiRequestOptions).bypassServerCache)) {
    headers.set('X-Bypass-Feed-Cache', '1');
  }

  const execute = async (parentSignal: AbortSignal | null | undefined = init.signal) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const abortFromParent = () => controller.abort();

    if (parentSignal?.aborted) {
      controller.abort();
    } else {
      parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    }

    try {
      const response = await fetch(input, {
        ...init,
        method,
        headers,
        cache: resolveRequestCacheMode(url, method, init.cache),
        credentials: init.credentials || 'same-origin',
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  };

  const executeWithRetry = async (parentSignal: AbortSignal | null | undefined = init.signal) => {
    const retryEnabled = shouldRetryRequest(method, { ...init, signal: parentSignal || undefined });

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await execute(parentSignal);
        if (
          !retryEnabled ||
          !isRetriableStatus(response.status) ||
          attempt >= API_RETRY_DELAYS_MS.length
        ) {
          return response;
        }
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        if (!retryEnabled || isAbort || attempt >= API_RETRY_DELAYS_MS.length) {
          throw error;
        }
      }

      await wait(API_RETRY_DELAYS_MS[attempt]);
    }
  };

  if (method === 'GET' && isApiRequest(url)) {
    const dedupeKey = getGetDedupeKey(method, url, headers, init);
    const existing = inFlightGetRequests.get(dedupeKey);
    if (existing) {
      return waitForSharedResponse(existing, init.signal);
    }

    const pending = executeWithRetry(null).finally(() => {
      inFlightGetRequests.delete(dedupeKey);
    });
    inFlightGetRequests.set(dedupeKey, pending);
    return waitForSharedResponse(pending, init.signal);
  }

  return executeWithRetry();
}

async function fetcher<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(url, options);
  } catch (error) {
    throw normalizeFetchException(error);
  }

  if (!res.ok) {
    throw new ApiError(await readApiError(res), res.status);
  }

  return await readJsonBody<T>(res);
}

async function pageFetcher<T>(url: string, options?: ApiRequestOptions): Promise<{ items: T[]; nextCursor: string | null; hasMore: boolean }> {
  let res: Response;
  try {
    res = await apiFetch(url, options);
  } catch (error) {
    throw normalizeFetchException(error);
  }

  if (!res.ok) {
    throw new ApiError(await readApiError(res), res.status);
  }

  const items = await readJsonBody<T[]>(res);

  return {
    items: Array.isArray(items) ? items : [],
    nextCursor: res.headers.get('X-Next-Cursor') || null,
    hasMore: res.headers.get('X-Has-More') === 'true',
  };
}

async function readApiError(res: Response) {
  try {
    const errorData = await res.json();
    return errorData?.error || errorData?.message || `Status: ${res.status}`;
  } catch {
    return `Status: ${res.status}`;
  }
}

async function readJsonBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('服务返回格式异常，请刷新后重试', res.status || 500);
  }
}

function normalizePostText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePostDetailForDisplay(post: Post): Post {
  const title = normalizePostText((post as any)?.title);
  return title ? { ...post, title } : post;
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
export const getChatBootstrap = () => fetcher<ChatBootstrap>('/api/chat/bootstrap');
export async function getChatMessagesPage(params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<ChatMessage>(`/api/chat/messages?${query.toString()}`, options);
}

export async function getAdminChatMessagesPage(params: {
  limit?: number;
  cursor?: string | null;
  status?: string;
  authorType?: string;
  search?: string;
} = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<ChatMessage>(`/api/admin/chat?${query.toString()}`, options);
}
export const updateAdminChatMessageStatus = (id: string, status: ChatMessage['status']) =>
  fetcher<ChatMessage>(`/api/admin/chat/messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
export const createAdminChatMute = (payload: { userId: string; minutes?: number; reason?: string; permanent?: boolean }) =>
  fetcher<{ id: string }>('/api/admin/chat/mutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const getAdminChatConfig = () => fetcher<ChatConfig>('/api/admin/chat/config');
export const updateAdminChatConfig = (payload: Partial<ChatConfig>) =>
  fetcher<ChatConfig>('/api/admin/chat/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

function hasCategoryMetaFeedFilters(filters: CategoryMetaFeedFilters | undefined) {
  return Boolean(filters && Object.keys(filters).length > 0);
}

export async function getPostsPage(params: { categoryId?: string; userId?: string; country?: string; query?: string; limit?: number; cursor?: string | null; location?: string; quotedOnly?: boolean; categoryMetaScope?: string; categoryMetaFilters?: CategoryMetaFeedFilters }, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key === 'categoryMetaFilters') {
      if (hasCategoryMetaFeedFilters(value as CategoryMetaFeedFilters | undefined)) {
        query.set(key, JSON.stringify(value));
      }
      return;
    }
    if (key !== 'enabled' && value && value !== 'all') query.set(key, String(value));
  });
  const page = await pageFetcher<Post>(`/api/posts?${query.toString()}`, options);
  return normalizeFeedPageForDisplay(page);
}

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

export async function getPosts(params: { categoryId?: string; userId?: string; country?: string; query?: string; limit?: number; location?: string; quotedOnly?: boolean; categoryMetaScope?: string; categoryMetaFilters?: CategoryMetaFeedFilters }, options?: ApiRequestOptions) {
  const page = await getPostsPage({ ...params, limit: params.limit ?? 100 }, options);
  return page.items;
}

export const getPost = async (id: string, options?: ApiRequestOptions) => {
  const post = await fetcher<Post>(`/api/posts/${id}`, options);
  return normalizePostDetailForDisplay(post);
};

export async function getPostQuotesPage(params: { postId: string; limit?: number; cursor?: string | null }, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const page = await pageFetcher<Post>(`/api/posts/${params.postId}/quotes?${query.toString()}`, options);
  return normalizeFeedPageForDisplay(page);
}

export const getUser = (id: string) => fetcher<User>(`/api/users/${id}`);
export const reducePostRecommendation = (postId: string) =>
  fetcher<{ success: boolean; postId: string; categoryId?: string | null; authorId?: string | null }>(
    `/api/posts/${postId}/recommendation-feedback`,
    { method: 'POST' },
  );
export async function getTransactionsPage(params: { limit?: number; cursor?: string | null; action?: string } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<Transaction>(`/api/me/transactions?${query.toString()}`, options);
}
export async function getRechargeOrdersPage(
  params: { limit?: number; cursor?: string | null; status?: string; statusGroup?: string } = {},
  options?: ApiRequestOptions,
) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<RechargeOrder>(`/api/me/orders?${query.toString()}`, options);
}
export async function getFollowingPostsPage(params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  const page = await pageFetcher<Post>(`/api/posts/following?${query.toString()}`, options);
  return normalizeFeedPageForDisplay(page);
}
export async function getFollowingUsersPage(params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<User>(`/api/me/following?${query.toString()}`, options);
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
  return fetcher<FeedBadgeCounts>(`/api/notifications/feed-counts${suffix ? `?${suffix}` : ''}`);
};
export const getHomeNotificationSummary = (params: { followingSince?: string; discoverSince?: string }) => {
  const suffix = toFeedUpdateQuery(params);
  return fetcher<HomeNotificationSummary>(`/api/notifications/home-summary${suffix ? `?${suffix}` : ''}`);
};
export async function getFansPage(params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<User>(`/api/me/fans?${query.toString()}`, options);
}
export const followUser = (userId: string) => fetcher<{ success: boolean }>(`/api/users/${userId}/follow`, { method: 'POST' });
export const unfollowUser = (userId: string) => fetcher<{ success: boolean }>(`/api/users/${userId}/follow`, { method: 'DELETE' });
export const getFollowStatus = (userId: string) => fetcher<{ following: boolean }>(`/api/users/${userId}/follow-status`);
export const blockUser = (userId: string) => fetcher<{ success: boolean; message?: string }>(`/api/users/${userId}/block`, { method: 'POST' });
export const getJoinedTopics = () => fetcher<JoinedTopic[]>('/api/me/joined-topics');
export const getTopicJoinStatus = (topicId: string) =>
  fetcher<{ joined: boolean }>(`/api/topics/${encodeURIComponent(topicId)}/join-status`);
export const joinTopic = (topicId: string, name: string) =>
  fetcher<{ success: boolean; topic: JoinedTopic }>(`/api/topics/${encodeURIComponent(topicId)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
export const leaveTopic = (topicId: string) =>
  fetcher<{ success: boolean }>(`/api/topics/${encodeURIComponent(topicId)}/join`, { method: 'DELETE' });
export const toggleLike = (postId: string) => fetcher<{ success: boolean; liked: boolean; likeCount: number; viewCount?: number }>(`/api/posts/${postId}/like`, { method: 'POST' });
export const getPostLikers = (postId: string, params: { limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString();
  return fetcher<PostLikeSummary>(`/api/posts/${postId}/likes${suffix ? `?${suffix}` : ''}`);
};

export const updatePostPublished = (id: string, isPublished: boolean) =>
  fetcher<{ success: boolean; post: Post }>(`/api/posts/${id}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublished })
  });

export const deletePost = (id: string) => 
  fetcher<{ success: boolean }>(`/api/posts/${id}`, {
    method: 'DELETE'
  });

export const getLikes = () => fetcher<Post[]>('/api/me/likes');
export async function getMyCommentsPage(params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, String(value));
  });
  return pageFetcher<MyCommentItem>(`/api/me/comments?${query.toString()}`, options);
}
export const getMyComments = () => fetcher<MyCommentItem[]>('/api/me/comments');
export const recordShare = (postId: string) => fetcher<{ success: boolean; counted?: boolean; shareCount: number }>(`/api/posts/${postId}/share`, { method: 'POST' });
export const syncPostToTelegram = (postId: string) =>
  fetcher<{
    success: boolean;
    postId: string;
    telegramSyncStatus: TelegramSyncStatus;
    telegramSyncedAt?: string | null;
  }>(`/api/posts/${postId}/telegram-sync`, { method: 'POST' });
export const recordView = async (postId: string) => {
  const result = await recordPostViews([postId]);
  const normalizedPostId = (postId || '').trim();
  const viewCount = result.views?.[normalizedPostId];

  return {
    success: true,
    ...(typeof viewCount === 'number' ? { viewCount } : {}),
  };
};
export const recordPostViews = (
  postIds: string[],
  events?: Array<{ postId: string; dwellMs?: number; quickSkip?: boolean }>,
) => fetcher<{ success: boolean; views: Record<string, number> }>('/api/posts/views', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ postIds, ...(events?.length ? { events } : {}) }),
});

export const getHomeAds = (options?: RequestInit) => fetcher<PromotionBooking[]>('/api/promotions/home-ads', options);
export const getChatAds = (options?: RequestInit) => fetcher<PromotionBooking[]>('/api/promotions/chat-ads', options);

export const getMyPromotions = () => fetcher<PromotionBooking[]>('/api/me/promotions');

export const getMyPromotionEffects = (params: { startDate?: string; endDate?: string; includeItems?: boolean } = {}) => {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);
  if (params.includeItems === false) query.set('includeItems', 'false');
  const suffix = query.toString();
  return fetcher<PromotionEffectAnalysis>(`/api/me/promotion-effects${suffix ? `?${suffix}` : ''}`);
};

export const updatePromotionAdCreative = (bookingId: string, payload: {
  adImageUrl: string;
  adMobileImageUrl: string;
  adTargetUrl: string;
}) => fetcher<{ success: boolean; updatedCount: number }>(`/api/promotion/bookings/${bookingId}/ad-creative`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const bookPromotionBatch = (payload: {
  type: string;
  dates: string[];
  slotIndices: number[];
  categoryId?: string;
  postId?: string;
  adImageUrl?: string;
  adMobileImageUrl?: string;
  adTargetUrl?: string;
  paymentPassword?: string;
}) => fetcher<{ success: boolean; bookedCount: number; totalPrice: number; remainingPoints: number; startsAt?: string; endsAt?: string }>('/api/promotion/book-batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const updatePaymentPassword = (payload: { password: string; oldPassword?: string }) =>
  fetcher<{ success: boolean; hasPaymentPassword: boolean }>('/api/me/payment-password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
