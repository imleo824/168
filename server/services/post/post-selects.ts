export const categorySelect = { id: true, name: true, slug: true, order: true };

const quoteAuthorSelect = { id: true, displayName: true, photoUrl: true, userType: true };
const rankingAuthorSelect = { id: true, userType: true };
const feedAuthorSelect = { id: true, displayName: true, photoUrl: true, userType: true };

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

export const postFastListSelect = (currentUserId?: string | null) => {
  return postListSelect(currentUserId);
};

export const postFeedListSelect = (currentUserId?: string | null) => {
  return postListSelect(currentUserId);
};
