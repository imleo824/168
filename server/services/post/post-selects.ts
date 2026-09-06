export const categorySelect = { id: true, name: true, slug: true, order: true };

const quoteAuthorSelect = {
  id: true,
  displayName: true,
  photoUrl: true,
  userType: true,
  plusStatus: true,
  plusExpiresAt: true,
};
const rankingAuthorSelect = { id: true, userType: true };
const feedAuthorSelect = {
  id: true,
  displayName: true,
  photoUrl: true,
  userType: true,
  plusStatus: true,
  plusExpiresAt: true,
};

export const quotePreviewSelect = {
  id: true,
  userId: true,
  title: true,
  content: true,
  images: true,
  isPublished: true,
  deletedAt: true,
  isAnonymous: true,
  createdAt: true,
  user: { select: quoteAuthorSelect },
};

export const rankedPostScoreSelect = {
  id: true,
  userId: true,
  categoryId: true,
  title: true,
  content: true,
  location: true,
  countryCode: true,
  countryName: true,
  source: true,
  contact: true,
  showContact: true,
  isAnonymous: true,
  categoryMeta: true,
  images: true,
  viewCount: true,
  likeCount: true,
  quoteCount: true,
  shareCount: true,
  createdAt: true,
  bumpedAt: true,
  rankingScore: { select: { recommendationScore: true } },
  user: { select: rankingAuthorSelect },
};

export const recommendationCandidateSelect = rankedPostScoreSelect;

export const postListSelect = (currentUserId?: string | null) => {
  return {
    id: true,
    title: true,
    content: true,
    location: true,
    countryCode: true,
    countryName: true,
    source: true,
    contact: true,
    categoryId: true,
    images: true,
    isPublished: true,
    isAnonymous: true,
    showContact: true,
    syncToTelegram: true,
    telegramSyncStatus: true,
    telegramSyncedAt: true,
    telegramSyncRequestedAt: true,
    telegramSyncLastError: true,
    viewCount: true,
    categoryMeta: true,
    shareCount: true,
    likeCount: true,
    quoteCount: true,
    quotedPostId: true,
    rankingScore: { select: { recommendationScore: true } },
    bumpedAt: true,
    userId: true,
    createdAt: true,
    user: { select: feedAuthorSelect },
    category: { select: categorySelect },
    quotedPost: { select: quotePreviewSelect },
    ...(currentUserId ? { likes: { where: { userId: currentUserId }, select: { userId: true } } } : {}),
  };
};

// Ranking scans can inspect many candidates before returning a single page.
// Keep that scan narrow and hydrate only the selected page with the complete
// feed-card projection. This avoids transferring long bodies, images and quote
// previews for candidates that never reach the client.
export const postFastListSelect = (_currentUserId?: string | null) => ({
  id: true,
  bumpedAt: true,
  createdAt: true,
});

export const postFeedListSelect = (currentUserId?: string | null) => {
  return {
    id: true,
    title: true,
    content: true,
    location: true,
    contact: true,
    categoryId: true,
    images: true,
    categoryMeta: true,
    isAnonymous: true,
    showContact: true,
    viewCount: true,
    shareCount: true,
    likeCount: true,
    commentCount: true,
    quoteCount: true,
    quotedPostId: true,
    rankingScore: { select: { recommendationScore: true } },
    bumpedAt: true,
    userId: true,
    createdAt: true,
    user: { select: feedAuthorSelect },
    category: { select: categorySelect },
    quotedPost: { select: quotePreviewSelect },
    ...(currentUserId
      ? {
          isPublished: true,
          syncToTelegram: true,
          telegramSyncStatus: true,
          telegramSyncedAt: true,
          telegramSyncRequestedAt: true,
          telegramSyncLastError: true,
          likes: { where: { userId: currentUserId }, select: { userId: true } },
        }
      : {}),
  };
};
