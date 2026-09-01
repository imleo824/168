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
import { fetcher, pageFetcher, apiFetch, ApiError, type ApiRequestOptions } from './apiCore';
export { ApiError, apiFetch } from './apiCore';

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
export const getConfig = getConfigs;
export const getCategories = (options?: ApiRequestOptions) => fetcher<Category[]>('/api/categories', { cache: 'no-store', ...options });
export const getHomeBootstrap = (options?: ApiRequestOptions) => fetcher<HomeBootstrap>('/api/home/bootstrap', { cache: 'no-store', ...options });

export { getSessionUser, loginWithPasswordApi, registerWithPasswordApi, logoutApi } from './apiCore';
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

export const updateProfile = (payload: Partial<User>) =>
  fetcher<User>('/api/me/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const updateLoginAccount = (payload: { loginAccount: string }) =>
  fetcher<{ success: boolean; loginAccount: string }>('/api/me/login-account', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const updateUserPassword = (payload: Record<string, any>) =>
  fetcher<{ success: boolean }>('/api/me/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const updateUserBio = (payload: { bio: string }) =>
  fetcher<{ success: boolean; bio: string }>('/api/me/bio', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getTuiPlusStatus = (options?: ApiRequestOptions) =>
  fetcher<any>('/api/tui-plus/status', options);

export const startTuiPlusTrial = () =>
  fetcher<any>('/api/tui-plus/trial/start', { method: 'POST' });

export const purchaseTuiPlus = (payload: { plan?: string; planId?: string; paymentPassword?: string }) =>
  fetcher<any>('/api/tui-plus/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getTuiPlusContacts = () =>
  fetcher<{ contacts: any[] }>('/api/tui-plus/contacts');

export const updateTuiPlusContacts = (payload: { contacts: any[] }) =>
  fetcher<{ success: boolean; contacts: any[] }>('/api/tui-plus/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getTuiPlusWebsites = () =>
  fetcher<{ websites: any[] }>('/api/tui-plus/websites');

export const updateTuiPlusWebsites = (payload: { websites: any[] }) =>
  fetcher<{ success: boolean; websites: any[] }>('/api/tui-plus/websites', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const getTuiPlusChannels = () =>
  fetcher<{ channels: any[] }>('/api/tui-plus/channels');

export const updateTuiPlusChannels = (payload: { channels: any[] }) =>
  fetcher<{ success: boolean; channels: any[] }>('/api/tui-plus/channels', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export type TuiPlusLinkTarget = 'contact' | 'website' | 'channel';

const TUI_PLUS_ENDPOINTS: Record<TuiPlusLinkTarget, string> = {
  contact: '/api/tui-plus/contacts',
  website: '/api/tui-plus/websites',
  channel: '/api/tui-plus/channels',
};

export async function mutateTuiPlusLink(
  target: TuiPlusLinkTarget,
  id: string | undefined,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: any,
) {
  const base = TUI_PLUS_ENDPOINTS[target];
  const url = id ? `${base}/${id}` : base;
  return fetcher<any>(url, {
    method,
    headers: method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  });
}

export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  content: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    userType?: string | null;
  } | null;
};

export type CommentPage = {
  items: PostComment[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export async function getPostCommentsPage(
  params: { postId: string; limit?: number; cursor?: string | null },
  options?: ApiRequestOptions,
): Promise<CommentPage> {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit || 20));
  if (params.cursor) query.set('cursor', params.cursor);

  const response = await apiFetch(`/api/posts/${encodeURIComponent(params.postId)}/comments?${query.toString()}`, {
    signal: options?.signal,
    retry: options?.retry ?? false,
  });

  if (!response.ok) {
    let message = `Status: ${response.status}`;
    try {
      const payload = await response.json();
      message = String(payload?.error || payload?.message || message).trim();
    } catch {
      // fallback
    }
    throw new ApiError(message, response.status);
  }

  const payload = await response.json().catch(() => ({}));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const totalFromPayload = Number(payload?.total);
  const totalFromHeader = Number(response.headers.get('X-Total-Count') || '');
  const total = Number.isFinite(totalFromPayload)
    ? totalFromPayload
    : Number.isFinite(totalFromHeader)
      ? totalFromHeader
      : items.length;

  return {
    items,
    total: Math.max(0, Math.floor(total)),
    nextCursor: response.headers.get('X-Next-Cursor') || null,
    hasMore: response.headers.get('X-Has-More') === 'true',
  };
}

export async function createPostComment(
  postId: string,
  payload: { content: string; quoteCommentId?: string },
  options?: ApiRequestOptions,
): Promise<{ comment: PostComment; commentCount: number }> {
  const response = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    let message = `Status: ${response.status}`;
    try {
      const errorPayload = await response.json();
      message = String(errorPayload?.error || errorPayload?.message || message).trim();
    } catch {
      // fallback
    }
    throw new ApiError(message, response.status);
  }

  const result = await response.json();
  return {
    comment: result.comment,
    commentCount: Math.max(0, Number(result.commentCount || 0)),
  };
}

export async function getNotificationsList(params: { type?: string; limit?: number; cursor?: string | null } = {}) {
  const query = new URLSearchParams();
  if (params.type && params.type !== 'ALL') query.set('type', params.type);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  return fetcher<any>(`/api/me/notifications?${query.toString()}`);
}

export const markAllNotificationsAsRead = () =>
  fetcher<{ success: boolean }>('/api/me/notifications/read-all', { method: 'POST' });

export const markNotificationAsRead = (notificationId: string) =>
  fetcher<{ success: boolean }>(`/api/me/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });

export const getRechargeOrders = (params: { limit?: number; cursor?: string | null } = {}, options?: ApiRequestOptions) => {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  return fetcher<any>(`/api/me/orders?${query.toString()}`, options);
};

export const createRechargeOrder = (payload: { usdtAmount?: number; amountUsdt?: number; chain?: string }, options?: ApiRequestOptions) =>
  fetcher<any>('/api/me/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    ...(options || {}),
  });

export const scanRechargeOrder = (orderId: string, options?: ApiRequestOptions) =>
  fetcher<{ success: boolean; status?: string; order?: RechargeOrder }>(`/api/me/orders/${encodeURIComponent(orderId)}/scan`, {
    method: 'POST',
    ...(options || {}),
  });

export async function getPromotionSlotsBatch(
  params: { type: string; dates?: string; startDate?: string; endDate?: string; categoryId?: string },
  options?: ApiRequestOptions,
) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return fetcher<any>(`/api/promotion/slots-batch?${query.toString()}`, options);
}

export const checkPostContactEligibility = (options?: ApiRequestOptions) =>
  fetcher<{ canShowContact: boolean; remainingFreePosts?: number }>('/api/posts/contact-eligibility', options);

export const createPost = (payload: any, options?: ApiRequestOptions & { idempotencyKey?: string }) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  };
  if (options?.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  return fetcher<{ post: Post }>('/api/posts', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...(options || {}),
  });
};

