export const FEED_CONTENT_PREVIEW_MAX_CHARS = 220;
export const FEED_TITLE_PREVIEW_MAX_CHARS = 96;
export const FEED_IMAGE_PREVIEW_MAX_COUNT = 4;
export const QUOTE_CONTENT_PREVIEW_MAX_CHARS = 160;
export const QUOTE_TITLE_PREVIEW_MAX_CHARS = 80;

const ANONYMOUS_POST_USER = {
  id: 'anonymous',
  displayName: '匿名贴',
  photoUrl: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=anonymous',
};

export function toCompactFeedAvatarUrl(photoUrl: unknown) {
  const value = typeof photoUrl === 'string' ? photoUrl.trim() : '';
  return value;
}

function isActiveTuiPlusUser(user: any) {
  if (!user) return false;
  if (user.isTuiPlus) return true;
  const status = String(user.plusStatus || '').toUpperCase();
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  return Boolean(expiresAt > Date.now() && (status === 'TRIALING' || status === 'ACTIVE'));
}

export function compactPostUser(user: any, compactForFeed?: boolean) {
  if (!user) return null;
  const safeUser = { ...user };
  delete safeUser.plusStatus;
  delete safeUser.plusPlan;
  delete safeUser.plusExpiresAt;
  delete safeUser.plusTrialUsed;

  return {
    ...safeUser,
    isTuiPlus: isActiveTuiPlusUser(user),
    photoUrl: compactForFeed ? toCompactFeedAvatarUrl(user.photoUrl) : user.photoUrl,
  };
}

export function toFeedPreviewText(value: unknown, maxChars: number) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

export function toPublicHeatScore(value: unknown) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.round(score);
}

function canExposePostManagementFields(post: any, options: { currentUserId?: string | null; currentUserRole?: string | null }) {
  if (options.currentUserRole === 'ADMIN') return true;
  return Boolean(options.currentUserId && post?.userId === options.currentUserId);
}

export function compactFeedPostPayload(
  post: any,
  options: { currentUserId?: string | null; currentUserRole?: string | null } = {},
) {
  const canManagePost = canExposePostManagementFields(post, options);
  const isAnonymous = Boolean(post?.isAnonymous);
  const compacted = {
    ...post,
    title: toFeedPreviewText(post.title, FEED_TITLE_PREVIEW_MAX_CHARS),
    content: toFeedPreviewText(post.content, FEED_CONTENT_PREVIEW_MAX_CHARS),
    images: Array.isArray(post.images) ? post.images : [],
    quotedPost: compactQuotedPostPayload(post.quotedPost, {
      currentUserId: options.currentUserId,
      currentUserRole: options.currentUserRole,
    }),
    category: post.category
      ? { id: post.category.id, name: post.category.name, slug: post.category.slug }
      : post.category,
    userId: isAnonymous ? 'anonymous' : post.userId,
    user: isAnonymous ? ANONYMOUS_POST_USER : post.user,
    isAnonymous,
    isFeedPreview: true,
  };

  if (!Array.isArray(compacted.tags) || compacted.tags.length === 0) compacted.tags = undefined;
  compacted.bumpedAt = undefined;
  compacted.countryCode = undefined;
  compacted.countryName = undefined;
  compacted.recommendationScore = undefined;
  compacted.relevanceScore = undefined;
  if (!canManagePost) {
    compacted.syncToTelegram = undefined;
    compacted.telegramSyncStatus = undefined;
    compacted.telegramSyncedAt = undefined;
    compacted.telegramSyncRequestedAt = undefined;
    compacted.telegramSyncLastError = undefined;
    compacted.isPublished = undefined;
  }
  if (!compacted.isPinned) {
    compacted.pinSlot = undefined;
    compacted.pinStartedAt = undefined;
    compacted.pinExpiredAt = undefined;
  }

  return compacted;
}

export function compactQuotedPostPayload(
  post: any,
  options: { currentUserId?: string | null; currentUserRole?: string | null } = {},
) {
  if (!post) return null;

  const isUnavailable = post.deletedAt !== null || post.isPublished === false;
  if (isUnavailable) {
    return {
      id: post.id,
      unavailable: true,
      deletedAt: post.deletedAt ?? null,
      isPublished: post.isPublished !== false,
    };
  }

  const shouldMaskAuthor = Boolean(post.isAnonymous);
  const user = shouldMaskAuthor
    ? ANONYMOUS_POST_USER
    : compactPostUser(post.user, true);

  return {
    id: post.id,
    title: toFeedPreviewText(post.title, QUOTE_TITLE_PREVIEW_MAX_CHARS),
    content: toFeedPreviewText(post.content, QUOTE_CONTENT_PREVIEW_MAX_CHARS),
    images: Array.isArray(post.images) ? post.images.slice(0, 1) : [],
    createdAt: post.createdAt,
    userId: shouldMaskAuthor ? 'anonymous' : post.userId,
    user,
    isAnonymous: Boolean(post.isAnonymous),
    isPublished: post.isPublished !== false,
    deletedAt: post.deletedAt ?? null,
    unavailable: false,
  };
}
