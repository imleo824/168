import type { FeedCategoryContext, FeedKind, FeedPaginationInput, FeedViewerContext } from '../modules/feed';

export type FeedQueryInput = {
  kind: FeedKind;
  pagination: FeedPaginationInput;
  viewer: FeedViewerContext;
  category?: FeedCategoryContext;
  blockedUserIds?: string[];
  mutedCategoryIds?: string[];
  categoryMetaFilters?: unknown[];
};

export type FeedQueryPage<TItem = unknown> = {
  items: TItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FeedRepositoryDb = {
  post: {
    findMany: (args: any) => Promise<any[]>;
    count?: (args: any) => Promise<number>;
  };
  postRankingScore?: {
    findUnique: (args: any) => Promise<any | null>;
    findMany: (args: any) => Promise<any[]>;
  };
  promotionBooking?: {
    findMany: (args: any) => Promise<any[]>;
  };
  category?: {
    findMany: (args: any) => Promise<any[]>;
  };
  user?: {
    findMany: (args: any) => Promise<any[]>;
  };
  like?: {
    findMany: (args: any) => Promise<any[]>;
  };
  follow?: {
    findMany: (args: any) => Promise<any[]>;
  };
  block?: {
    findMany: (args: any) => Promise<any[]>;
  };
  userRecommendationFeedback?: {
    findMany: (args: any) => Promise<any[]>;
  };
};

export type FeedPostPageQuery = {
  where: unknown;
  orderBy: unknown[];
  limit: number;
  cursor?: string;
  select: unknown;
};

export type FeedHumanRankedCandidateQuery = {
  where: unknown;
  limit: number;
  cursor?: string;
  select: unknown;
  promotedPostIds?: string[];
  useRankCursor?: boolean;
};

export type FeedActivePinBookingQuery = {
  type: string;
  categoryIds?: string[];
  now?: Date;
};

export type FeedPostsByIdsQuery = {
  where: unknown;
  postIds: string[];
  select: unknown;
  take?: number;
};

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(Math.floor(limit), 100));
}

function uniqueCleanStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function isLegacyRobotSourceExclusion(value: unknown) {
  const objectValue = value as Record<string, any> | null;
  if (!objectValue || typeof objectValue !== 'object' || Array.isArray(objectValue)) return false;
  const keys = Object.keys(objectValue);
  if (!keys.includes('source') || !keys.includes('user')) return false;
  const source = String(objectValue.source || '');
  const userType = String(objectValue.user?.userType || objectValue.user?.is?.userType || '').toUpperCase();
  return source === 'auto_post_curated_content' && userType === 'ROBOT';
}

/**
 * Feed candidate pools must never remove posts merely because the author is ROBOT.
 * The ranking system handles author type through a small score multiplier, while
 * trusted engagement is computed from NORMAL-user behavior in the aggregate SQL.
 *
 * This sanitizer is intentionally kept in the repository boundary so stale callers
 * cannot accidentally keep the old source + ROBOT exclusion alive.
 */
function sanitizeFeedWhere<TWhere>(where: TWhere): TWhere {
  if (!where || typeof where !== 'object') return where;
  if (Array.isArray(where)) return where.map((item) => sanitizeFeedWhere(item)) as TWhere;

  const source = where as Record<string, any>;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'NOT') {
      if (isLegacyRobotSourceExclusion(value)) continue;
      if (Array.isArray(value)) {
        const sanitizedNot = value
          .filter((item) => !isLegacyRobotSourceExclusion(item))
          .map((item) => sanitizeFeedWhere(item));
        if (sanitizedNot.length > 0) result[key] = sanitizedNot;
        continue;
      }
    }
    result[key] = sanitizeFeedWhere(value);
  }
  return result as TWhere;
}

function buildPublishedPostWhere(input: FeedQueryInput) {
  const where: Record<string, unknown> = {
    deletedAt: null,
    isPublished: true,
  };

  if (input.kind === 'category' && input.category?.categoryId) {
    where.categoryId = input.category.categoryId;
  }

  if (input.blockedUserIds?.length) {
    where.userId = { notIn: input.blockedUserIds };
  }

  if (input.mutedCategoryIds?.length) {
    where.categoryId = { notIn: input.mutedCategoryIds };
  }

  return where;
}

export class FeedRepository {
  constructor(private readonly db: FeedRepositoryDb) {}

  buildPublishedPostWhere(input: FeedQueryInput) {
    return buildPublishedPostWhere(input);
  }

  async listCategoryIdsByRefs(refs: string[]) {
    const safeRefs = uniqueCleanStrings(refs);
    if (safeRefs.length === 0 || !this.db.category) return [];
    const categories = await this.db.category.findMany({
      where: {
        OR: [
          { id: { in: safeRefs } },
          { slug: { in: safeRefs } },
          ...safeRefs.map((ref) => ({ name: { equals: ref, mode: 'insensitive' as const } })),
        ],
      },
      select: { id: true },
    });
    return uniqueCleanStrings([...safeRefs, ...categories.map((category: any) => category.id)]);
  }

  async listBlockedUserIds(currentUserId?: string | null) {
    if (!currentUserId || !this.db.block) return [];
    const rows = await this.db.block.findMany({
      where: { OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
      select: { blockerId: true, blockedId: true },
      take: 1000,
    });
    return uniqueCleanStrings(rows.map((row: any) => row.blockerId === currentUserId ? row.blockedId : row.blockerId));
  }

  async listReducedPostIds(currentUserId?: string | null) {
    if (!currentUserId || !this.db.userRecommendationFeedback) return [];
    const rows = await this.db.userRecommendationFeedback.findMany({
      where: { userId: currentUserId, action: 'REDUCE' },
      select: { postId: true },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    return uniqueCleanStrings(rows.map((row: any) => row.postId));
  }

  async listFollowingAuthorIds(currentUserId: string) {
    if (!currentUserId || !this.db.follow) return [];
    const rows = await this.db.follow.findMany({
      where: { followerId: currentUserId },
      select: { followingId: true },
      take: 5000,
    });
    return uniqueCleanStrings(rows.map((row: any) => row.followingId));
  }

  async listActivePinBookings(params: FeedActivePinBookingQuery) {
    if (!this.db.promotionBooking) return [];
    const categoryIds = uniqueCleanStrings(params.categoryIds || []);
    const now = params.now || new Date();
    return this.db.promotionBooking.findMany({
      where: {
        type: params.type,
        ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
        startsAt: { lte: now },
        endsAt: { gt: now },
        postId: { not: null },
        post: {
          is: {
            deletedAt: null,
            isPublished: true,
            user: {
              is: {
                isDisabled: false,
              },
            },
          },
        },
      },
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
      take: 100,
      select: { postId: true, slotIndex: true, startsAt: true, endsAt: true },
    });
  }

  async listPostsByIds(params: FeedPostsByIdsQuery) {
    const postIds = uniqueCleanStrings(params.postIds);
    if (postIds.length === 0) return [];
    return this.db.post.findMany({
      where: { AND: [sanitizeFeedWhere(params.where), { id: { in: postIds } }] },
      select: params.select,
      ...(Number.isFinite(params.take) ? { take: params.take } : {}),
    });
  }

  async listUsersByIds(userIds: string[]) {
    const safeUserIds = uniqueCleanStrings(userIds);
    if (safeUserIds.length === 0 || !this.db.user) return [];
    return this.db.user.findMany({
      where: { id: { in: safeUserIds } },
      select: { id: true, displayName: true, photoUrl: true, userType: true, plusStatus: true, plusExpiresAt: true },
    });
  }

  async listCategoriesByIds(categoryIds: string[]) {
    const safeCategoryIds = uniqueCleanStrings(categoryIds);
    if (safeCategoryIds.length === 0 || !this.db.category) return [];
    return this.db.category.findMany({
      where: { id: { in: safeCategoryIds } },
      select: { id: true, name: true, slug: true },
    });
  }

  async listLikedPostIds(currentUserId: string | null | undefined, postIds: string[]) {
    const safePostIds = uniqueCleanStrings(postIds);
    if (!currentUserId || safePostIds.length === 0 || !this.db.like) return [];
    const rows = await this.db.like.findMany({
      where: { userId: currentUserId, postId: { in: safePostIds } },
      select: { postId: true },
    });
    return uniqueCleanStrings(rows.map((row: any) => row.postId));
  }

  async listPostsPage(params: FeedPostPageQuery) {
    return this.db.post.findMany({
      where: sanitizeFeedWhere(params.where),
      orderBy: params.orderBy,
      take: normalizeLimit(params.limit) + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: params.select,
    });
  }

  async listHumanRankedCandidatePosts(params: FeedHumanRankedCandidateQuery) {
    if (!this.db.postRankingScore) return [];

    const promotedPostIds = uniqueCleanStrings(params.promotedPostIds || []);
    const cursorScore = params.cursor
      ? await this.db.postRankingScore.findUnique({ where: { postId: params.cursor }, select: { recommendationScore: true } })
      : null;
    const rankedCursorFilter = cursorScore
      ? {
          OR: [
            { recommendationScore: { lt: cursorScore.recommendationScore } },
            { AND: [{ recommendationScore: cursorScore.recommendationScore }, { postId: { lt: params.cursor } }] },
          ],
        }
      : undefined;
    const rankedTake = params.cursor ? normalizeLimit(params.limit) + 1 : normalizeLimit(params.limit) + 1 + promotedPostIds.length;
    const rows = await this.db.postRankingScore.findMany({
      where: { ...(rankedCursorFilter || {}), post: sanitizeFeedWhere(params.where) },
      orderBy: [{ recommendationScore: 'desc' }, { postId: 'desc' }],
      take: rankedTake,
      select: { recommendationScore: true, post: { select: params.select } },
    });
    const posts = rows
      .map((row: any) => ({ ...row.post, rankingScore: { recommendationScore: row.recommendationScore } }))
      .filter((post: any) => post?.id);

    if (!params.cursor && promotedPostIds.length > 0) {
      const promotedRows = await this.listPostsByIds({
        where: params.where,
        postIds: promotedPostIds,
        select: params.select,
        take: promotedPostIds.length,
      });
      const postsById = new Map(posts.map((post: any) => [post.id, post] as const));
      for (const post of promotedRows) postsById.set(post.id, post);
      posts.splice(0, posts.length, ...postsById.values());
    }

    return posts;
  }

  async listRecommendedPosts(input: FeedQueryInput): Promise<FeedQueryPage> {
    const limit = normalizeLimit(input.pagination.limit);
    const rows = await this.db.post.findMany({
      where: buildPublishedPostWhere({ ...input, kind: 'recommended' }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(input.pagination.cursor ? { cursor: { id: input.pagination.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      hasMore,
      nextCursor: hasMore ? String(items[items.length - 1]?.id || '') || null : null,
    };
  }

  async listCategoryPosts(input: FeedQueryInput): Promise<FeedQueryPage> {
    const limit = normalizeLimit(input.pagination.limit);
    const rows = await this.db.post.findMany({
      where: buildPublishedPostWhere({ ...input, kind: 'category' }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(input.pagination.cursor ? { cursor: { id: input.pagination.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      hasMore,
      nextCursor: hasMore ? String(items[items.length - 1]?.id || '') || null : null,
    };
  }
}

export function createFeedRepository(db: FeedRepositoryDb) {
  return new FeedRepository(db);
}
