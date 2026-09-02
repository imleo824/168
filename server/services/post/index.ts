import prisma, { isDbConfigured } from '../../db';
import { Prisma } from '@prisma/client';
import { PromotionService } from '../../promotion.service';
import { ConfigService, isSameCategoryRef, type PublishCategoryMetaConfig } from '../../config.service';
import {
  RECOMMENDATION_SCORE_PROFILE_FIELDS,
  getFeedRankingProfile,
} from './ranking-profile';
import {
  RECOMMENDATION_DIVERSITY_SCAN_WINDOW,
  RECOMMENDATION_FIRST_PAGE_FAST_MAX,
  RECOMMENDATION_FIRST_PAGE_FAST_MIN,
  RECOMMENDATION_FIRST_PAGE_FAST_MULTIPLIER,
  buildRankedScorePaginationFilter,
  compareAuthorDisplayPriority,
  emptyListResult,
  encodeRankedCursor,
  getAuthorDisplayBoost,
  getPostActivityAt,
  getPostPublishedAt,
  getRankedCursorDepth,
  isRankedCursor,
  rankedCandidateTake,
  safeCount,
  sliceRankedPage,
  toPrecomputedRecommendationScore,
  type ListResult,
  type RecommendationContext,
} from './ranking-utils';
import {
  compactFeedPostPayload,
  compactQuotedPostPayload,
  compactPostUser,
  toPublicHeatScore,
} from './feed-payload';
import { HomeFeedService } from '../home-feed.service';
import { isOptionalFeedDependencyUnavailable } from './feed-dependency';
import {
  RECOMMENDATION_HIDDEN_POST_LIMIT,
  clearRecommendationContextCache,
  safeBuildRecommendationContext,
} from './recommendation-context';
import {
  postFastListSelect,
  postFeedListSelect,
  postListSelect,
  quotePreviewSelect,
  recommendationCandidateSelect,
  categorySelect,
} from './post-selects';
import { POST_UUID_PATTERN } from './post-identifiers';
import {
  bumpPostOnInteraction,
  recordShare,
  recordViews,
  type PostViewSource,
  type ViewRecordInput,
} from './post-engagement';
import {
  refreshPostRankingScore,
  refreshPostRankingScores,
  schedulePostRankingRefresh,
} from './post-ranking-maintenance';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const PROMOTION_PIN_CACHE_TTL_MS = 15_000;
const HOME_CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content';

export type PostCategoryMetaFilter = {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'location';
  value?: string | boolean;
  min?: number;
  max?: number;
};

type PromotionCacheItem = { postId: string; slotIndex: number };

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_PAGE_SIZE);
}

function normalizeSearchText(raw: unknown, maxLength = 80) {
  if (Array.isArray(raw)) return normalizeSearchText(raw[0], maxLength);
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeHomeCategorySlug(raw: unknown) {
  const slug = normalizeSearchText(raw, 64).toLowerCase();
  return HOME_CATEGORY_SLUG_PATTERN.test(slug) ? slug : '';
}

function buildPostTextSearchFilter(rawText: unknown) {
  const text = normalizeSearchText(rawText);
  if (!text) return null;

  return {
    OR: [
      { title: { contains: text, mode: 'insensitive' as const } },
      { content: { contains: text, mode: 'insensitive' as const } },
      { source: { contains: text, mode: 'insensitive' as const } },
      { location: { contains: text, mode: 'insensitive' as const } },
    ],
  };
}

function buildHiddenAutoPostRobotFilter() {
  return {
    NOT: {
      source: AUTO_POST_CURATED_SOURCE,
      user: { is: { userType: 'ROBOT' as const } },
    },
  };
}

function isHiddenAutoPostRobotPost(post: any) {
  return post?.source === AUTO_POST_CURATED_SOURCE && post?.user?.userType === 'ROBOT';
}

function resolveCountryRankFilter(rawCountry: unknown) {
  const country = normalizeSearchText(rawCountry, 40);
  return country ? { country } : null;
}

function getTodayDate() {
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  return todayDate;
}

const pinnedPostCache = new Map<string, { expiresAt: number; data: PromotionCacheItem[] }>();
async function getFeedBlockedUserIds(currentUserId?: string | null) {
  if (!currentUserId) return [] as string[];

  try {
    const blocks = await prisma.block.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    return Array.from(
      new Set([...blocks.map((b) => b.blockerId), ...blocks.map((b) => b.blockedId)]),
    ).filter((id) => id !== currentUserId);
  } catch (error) {
    console.warn('Blocked user lookup unavailable; falling back to unblocked feed:', error);
    return [];
  }
}

async function getActivePinnedPosts(categoryId?: string) {
  if (!isDbConfigured()) return [] as PromotionCacheItem[];

  const now = Date.now();
  const cacheKey = categoryId || '__home__';
  const cached = pinnedPostCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const scopeKey = categoryId ? `CATEGORY:${categoryId}` : 'GLOBAL';
  const nowTime = new Date();
  const activeTimeWhere = PromotionService.buildActiveTimeWhereClause(nowTime);
  let rows: Array<{ postId: string | null; slotIndex: number }> = [];
  try {
    rows = await (prisma as any).promotionBooking.findMany({
      where: {
        type: categoryId ? 'PIN_CATEGORY' : 'PIN_HOME',
        scopeKey,
        ...activeTimeWhere,
      },
      select: { postId: true, slotIndex: true },
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (error) {
    if (!isOptionalFeedDependencyUnavailable(error)) throw error;
    console.warn('Pinned post lookup unavailable; falling back to unpinned feed:', error);
    pinnedPostCache.set(cacheKey, {
      expiresAt: now + PROMOTION_PIN_CACHE_TTL_MS,
      data: [],
    });
    return [];
  }

  const active = rows
    .filter((item: { postId: string | null }) => Boolean(item.postId))
    .map((item: { postId: string | null; slotIndex: number }) => ({
      postId: item.postId as string,
      slotIndex: item.slotIndex,
    }));

  pinnedPostCache.set(cacheKey, {
    expiresAt: now + PROMOTION_PIN_CACHE_TTL_MS,
    data: active,
  });

  return active;
}

async function getActivePinnedPostsForUser(userId: string) {
  if (!isDbConfigured()) return [] as PromotionCacheItem[];

  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) return [] as PromotionCacheItem[];

  const now = Date.now();
  const cacheKey = `user:${cleanUserId}`;
  const cached = pinnedPostCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  const nowTime = new Date();
  const activeTimeWhere = PromotionService.buildActiveTimeWhereClause(nowTime);
  let rows: Array<{ postId: string | null; slotIndex: number }> = [];
  try {
    rows = await (prisma as any).promotionBooking.findMany({
      where: {
        type: { in: ['PIN_HOME', 'PIN_CATEGORY'] },
        ...activeTimeWhere,
        postId: { not: null },
        post: { is: { userId: cleanUserId, deletedAt: null } },
      },
      select: { postId: true, slotIndex: true },
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (error) {
    if (!isOptionalFeedDependencyUnavailable(error)) throw error;
    console.warn('User pinned post lookup unavailable; falling back to unpinned profile feed:', error);
    pinnedPostCache.set(cacheKey, {
      expiresAt: now + PROMOTION_PIN_CACHE_TTL_MS,
      data: [],
    });
    return [];
  }

  const active = rows
    .filter((item: { postId: string | null }) => Boolean(item.postId))
    .map((item: { postId: string | null; slotIndex: number }) => ({
      postId: item.postId as string,
      slotIndex: item.slotIndex,
    }));

  pinnedPostCache.set(cacheKey, {
    expiresAt: now + PROMOTION_PIN_CACHE_TTL_MS,
    data: active,
  });

  return active;
}

function buildCategoryMetaWhereFilters(filters: PostCategoryMetaFilter[] | undefined) {
  if (!Array.isArray(filters) || filters.length === 0) return [];

  return filters
    .map((filter) => {
      const key = String(filter?.key || '').trim();
      if (!key) return null;

      if (filter.type === 'number') {
        const query: Record<string, unknown> = { path: [key] };
        if (typeof filter.min === 'number' && Number.isFinite(filter.min)) {
          query.gte = filter.min;
        }
        if (typeof filter.max === 'number' && Number.isFinite(filter.max)) {
          query.lte = filter.max;
        }
        return Object.keys(query).length > 1 ? { categoryMeta: query } : null;
      }

      if (filter.type === 'text') {
        const value = String(filter.value ?? '').trim();
        if (!value) return null;
        return {
          categoryMeta: {
            path: [key],
            string_contains: value,
            mode: 'insensitive' as const,
          },
        };
      }

      if (filter.type === 'boolean') {
        if (typeof filter.value !== 'boolean') return null;
        return {
          categoryMeta: {
            path: [key],
            equals: filter.value,
          },
        };
      }

      const value = String(filter.value ?? '').trim();
      if (!value) return null;
      return {
        categoryMeta: {
          path: [key],
          equals: value,
        },
      };
    })
    .filter(Boolean);
}

async function settlePostCandidateQueries(queries: Array<Prisma.PrismaPromise<any[]>>) {
  const settled = await Promise.allSettled(queries);
  return settled
    .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
    .map((result) => result.value);
}

async function resolveCategoryFilterId(categoryId: string) {
  const normalizedCategoryId = normalizeSearchText(categoryId, 128);
  if (!normalizedCategoryId || normalizedCategoryId === 'all') return '';

  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { id: normalizedCategoryId },
        { slug: normalizedCategoryId },
        { name: { equals: normalizedCategoryId, mode: 'insensitive' as const } },
      ],
    },
    select: { id: true },
  });

  if (category?.id) return category.id;
  return ensurePublishCategoryId(normalizedCategoryId);
}

async function ensurePublishCategoryId(categoryRef: string) {
  const normalizedRef = normalizeSearchText(categoryRef, 128);
  if (!normalizedRef || normalizedRef === 'all') return '';

  const existingCategory = await prisma.category.findFirst({
    where: {
      OR: [
        { id: normalizedRef },
        { slug: normalizedRef },
        { name: { equals: normalizedRef, mode: 'insensitive' as const } },
      ],
    },
    select: { id: true },
  });
  if (existingCategory?.id) return existingCategory.id;

  const configs = await ConfigService.getConfigs().catch(() => ConfigService.getDefaultConfigs());
  const schemas = Array.isArray(configs?.publish_category_schema)
    ? configs.publish_category_schema as PublishCategoryMetaConfig[]
    : [];
  const schema = schemas.find((item) =>
    [item.id, item.slug, item.name].some((ref) => isSameCategoryRef(ref, normalizedRef)),
  );
  if (!schema) return '';

  const slug = normalizeHomeCategorySlug(schema.slug || schema.id || normalizedRef);
  const name = normalizeSearchText(schema.name || schema.slug || slug, 64);
  if (!slug || !name) return '';

  const category = await prisma.category.upsert({
    where: { slug },
    update: { name },
    create: {
      slug,
      name,
      order: Math.max(1, schemas.indexOf(schema) + 1),
    },
    select: { id: true },
  });

  return category.id;
}

function diversityRerank<T extends {
  userId?: string | null;
  categoryId?: string | null;
  recommendationScore?: number;
}>(items: T[]) {
  const pool = [...items].sort((a, b) => {
    const authorPriorityDiff = compareAuthorDisplayPriority(a, b);
    if (authorPriorityDiff !== 0) return authorPriorityDiff;
    const scoreDelta = (b.recommendationScore || 0) - (a.recommendationScore || 0);
    if (Math.abs(scoreDelta) > 1e-6) return scoreDelta;
    return new Date((b as any).createdAt).getTime() - new Date((a as any).createdAt).getTime();
  });
  const result: T[] = [];
  const authorSeen = new Map<string, number>();
  const categorySeen = new Map<string, number>();

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    const scanLimit = Math.min(
      pool.length,
      RECOMMENDATION_DIVERSITY_SCAN_WINDOW + Math.floor(result.length / 6),
    );

    for (let index = 0; index < scanLimit; index += 1) {
      const item = pool[index];
      const authorPenalty = item.userId ? (authorSeen.get(item.userId) || 0) * 0.72 : 0;
      const categoryPenalty = item.categoryId ? (categorySeen.get(item.categoryId) || 0) * 0.28 : 0;
      const adjusted = (item.recommendationScore || 0) + getAuthorDisplayBoost(item) - authorPenalty - categoryPenalty;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    }

    const [picked] = pool.splice(bestIndex, 1);
    if (!picked) continue;
    result.push(picked);
    if (picked.userId) authorSeen.set(picked.userId, (authorSeen.get(picked.userId) || 0) + 1);
    if (picked.categoryId) categorySeen.set(picked.categoryId, (categorySeen.get(picked.categoryId) || 0) + 1);
  }

  return result;
}

function mergePostCandidates(candidateGroups: any[][], maxItems: number) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const group of candidateGroups) {
    for (const post of group || []) {
      if (!post?.id || seen.has(post.id)) continue;
      seen.add(post.id);
      merged.push(post);
      if (merged.length >= maxItems) return merged;
    }
  }

  return merged;
}

async function attachTrustedInteractionStats(posts: any[]) {
  const ids = Array.from(new Set(posts.map((post) => post?.id).filter(Boolean)));
  if (ids.length <= 0) return posts;

  let aggregateRows: Array<{
    postId: string;
    verifiedLikeCount: number;
    verifiedViewCount: number;
    verifiedShareCount: number;
    dwellMs: number;
    quickSkipCount: number;
  }> = [];
  try {
    aggregateRows = await prisma.postEngagementAggregate.findMany({
      where: { postId: { in: ids } },
      select: {
        postId: true,
        verifiedLikeCount: true,
        verifiedViewCount: true,
        verifiedShareCount: true,
        dwellMs: true,
        quickSkipCount: true,
      },
    });
  } catch (error) {
    if (!isOptionalFeedDependencyUnavailable(error)) throw error;
    console.warn('Trusted interaction stats unavailable; falling back to raw post counters:', error);
  }
  const aggregateMap = new Map(aggregateRows.map((row) => [row.postId, row]));

  return posts.map((post) => ({
    ...post,
    _trustedCounts: {
      likes: aggregateMap.get(post.id)?.verifiedLikeCount || 0,
      views: aggregateMap.get(post.id)?.verifiedViewCount || 0,
      dwellMs: aggregateMap.get(post.id)?.dwellMs || 0,
      quickSkips: aggregateMap.get(post.id)?.quickSkipCount || 0,
      shares: aggregateMap.get(post.id)?.verifiedShareCount || 0,
    },
  }));
}

async function fetchRecommendationCandidates(params: {
  whereAnd: any[];
  take: number;
  context?: RecommendationContext | null;
}) {
  const baseTake = Math.max(48, Math.ceil(params.take / 2.35));
  const sourceTake = Math.max(34, Math.ceil(baseTake * 0.58));
  const freshTake = Math.max(26, Math.ceil(baseTake * 0.22));
  const exploreTake = Math.max(26, Math.ceil(baseTake * 0.2));
  const personalizedTake = Math.max(24, Math.ceil(baseTake * 0.28));
  const recent3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const recent7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const baseWhere = { AND: params.whereAnd };
  const topCategoryIds = (params.context?.topCategoryIds || []).slice(0, 6);
  const followedAuthorIds = params.context?.followedAuthorIds?.size
    ? Array.from(params.context.followedAuthorIds).slice(0, 160)
    : [];

  const queries: Array<Prisma.PrismaPromise<any[]>> = [
    prisma.post.findMany({
      where: { AND: [...params.whereAnd, { rankingScore: { isNot: null } }] },
      orderBy: [{ user: { userType: 'asc' } }, { rankingScore: { recommendationScore: 'desc' } }, { bumpedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(sourceTake, Math.ceil(params.take * 0.62)),
      select: recommendationCandidateSelect,
    }),
    prisma.post.findMany({
      where: baseWhere,
      orderBy: [{ user: { userType: 'asc' } }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: sourceTake,
      select: recommendationCandidateSelect,
    }),
    prisma.post.findMany({
      where: { AND: [...params.whereAnd, { createdAt: { gte: recent7d } }] },
      orderBy: [{ user: { userType: 'asc' } }, { createdAt: 'desc' }, { id: 'desc' }],
      take: freshTake,
      select: recommendationCandidateSelect,
    }),
    prisma.post.findMany({
      where: { AND: [...params.whereAnd, { createdAt: { gte: recent3d } }] },
      orderBy: [{ user: { userType: 'asc' } }, { viewCount: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: exploreTake,
      select: recommendationCandidateSelect,
    }),
  ];

  if (topCategoryIds.length > 0) {
    queries.unshift(
      prisma.post.findMany({
        where: { AND: [...params.whereAnd, { categoryId: { in: topCategoryIds } }] },
        orderBy: [{ user: { userType: 'asc' } }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: personalizedTake,
        select: recommendationCandidateSelect,
      }),
    );
  }

  if (followedAuthorIds.length > 0) {
    queries.unshift(
      prisma.post.findMany({
        where: { AND: [...params.whereAnd, { userId: { in: followedAuthorIds } }] },
        orderBy: [{ user: { userType: 'asc' } }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: personalizedTake,
        select: recommendationCandidateSelect,
      }),
    );
  }

  const groups = await settlePostCandidateQueries(queries);
  return attachTrustedInteractionStats(mergePostCandidates(groups, params.take));
}

function hydratePost(p: any, options: {
  currentUserId?: string | null;
  currentUserRole?: string | null;
  bookedPinMap?: Map<string, number>;
  nowTime?: Date;
  todayDate?: Date;
  compactForFeed?: boolean;
}) {
  const todayDate = options.todayDate ?? getTodayDate();
  const bookedPinMap = options.bookedPinMap ?? new Map<string, number>();
  const isBookedPinned = bookedPinMap.has(p.id);
  const countryCode = p.countryCode || null;
  const countryName = p.countryName || null;
  const heatScore = toPublicHeatScore(
    p.heatScore ?? p.recommendationScore ?? p.rankingScore?.recommendationScore,
  );

  const hydrated = {
    ...p,
    heatScore,
    rankingScore: undefined,
    recommendationScore: undefined,
    countryCode,
    countryName,
    isPinned: isBookedPinned,
    pinSlot: isBookedPinned ? bookedPinMap.get(p.id) : null,
    pinStartedAt: isBookedPinned ? todayDate : null,
    pinExpiredAt: isBookedPinned ? new Date(todayDate.getTime() + 24 * 3600 * 1000) : null,
    user: compactPostUser(p.user, options.compactForFeed),
    category: p.category,
    location: p.location || null,
    likeCount: p.likeCount || 0,
    shareCount: p.shareCount || 0,
    quoteCount: p.quoteCount || 0,
    quotedPostId: p.quotedPostId || null,
    quotedPost: compactQuotedPostPayload(p.quotedPost, {
      currentUserId: options.currentUserId,
      currentUserRole: options.currentUserRole,
    }),
    hasLiked: options.currentUserId ? p.likes && p.likes.length > 0 : false,
    likes: undefined,
  };

  return options.compactForFeed
    ? compactFeedPostPayload(hydrated, {
        currentUserId: options.currentUserId,
        currentUserRole: options.currentUserRole,
      })
    : hydrated;
}

export class PostService {
  static clearPromotionCache() {
    pinnedPostCache.clear();
  }

  static clearRecommendationContextCache(userId?: string | null) {
    clearRecommendationContextCache(userId);
  }

  static toClientPost(post: any, currentUserId?: string | null) {
    return hydratePost(post, { currentUserId });
  }

  static listPostSelect(currentUserId?: string | null) {
    return postListSelect(currentUserId);
  }

  static async listHomeRecommendedPosts(options: {
    currentUserId?: string | null;
    limit?: number;
    cursor?: string;
  }): Promise<ListResult<any>> {
    return HomeFeedService.listFeed({
      kind: 'recommended',
      currentUserId: options.currentUserId,
      limit: options.limit,
      cursor: options.cursor,
    });
  }

  static async listHomeCategoryPosts(options: {
    categorySlug: string;
    currentUserId?: string | null;
    limit?: number;
    cursor?: string;
    categoryMetaFilters?: PostCategoryMetaFilter[];
  }): Promise<ListResult<any>> {
    return HomeFeedService.listFeed({
      kind: 'category',
      categorySlug: options.categorySlug,
      currentUserId: options.currentUserId,
      limit: options.limit,
      cursor: options.cursor,
      categoryMetaFilters: options.categoryMetaFilters,
    });
  }

  static async getMutedFeedCategoryIds(userId: string) {
    const rows = await prisma.userMutedCategory.findMany({
      where: { userId },
      select: { categoryId: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => row.categoryId);
  }

  static feedPostSelect(currentUserId?: string | null) {
    return postFeedListSelect(currentUserId);
  }

  static getPostPublishedAt(post: { createdAt?: unknown }) {
    return getPostPublishedAt(post);
  }

  static getPostActivityAt(post: { bumpedAt?: unknown; createdAt?: unknown }) {
    return getPostActivityAt(post);
  }

  static async refreshPostRankingScore(postId: string) {
    return refreshPostRankingScore(postId);
  }

  static async refreshPostRankingScores(postIds: string[]) {
    return refreshPostRankingScores(postIds);
  }

  static schedulePostRankingRefresh(postIds: string | string[]) {
    return schedulePostRankingRefresh(postIds);
  }

  static async reduceRecommendationForPost(userId: string, postId: string) {
    if (!userId || !postId) return null;

    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        isPublished: true,
      },
      select: {
        id: true,
        userId: true,
        categoryId: true,
      },
    });
    if (!post) return null;

    await (prisma as any).userRecommendationFeedback.upsert({
      where: {
        userId_postId: {
          userId,
          postId: post.id,
        },
      },
      update: {
        action: 'REDUCE',
        authorId: post.userId,
        categoryId: post.categoryId,
      },
      create: {
        userId,
        postId: post.id,
        action: 'REDUCE',
        authorId: post.userId,
        categoryId: post.categoryId,
      },
    });

    return {
      postId: post.id,
      authorId: post.userId,
      categoryId: post.categoryId,
    };
  }

  static async listPosts(filter: {
    categoryId?: string;
    userId?: string;
    currentUserId?: string | null;
    limit?: number;
    cursor?: string;
    location?: string;
    country?: string;
    query?: string;
    quotedOnly?: boolean;
    categoryMetaFilters?: PostCategoryMetaFilter[];
  }): Promise<ListResult<any>> {
    const limit = normalizeLimit(filter.limit);
    if (!isDbConfigured()) return emptyListResult();

    const whereClause: any = {
      deletedAt: null,
      ...buildHiddenAutoPostRobotFilter(),
    };
    let blockedIds: string[] = [];
    let resolvedCategoryFilterId: string | undefined;

    if (filter.categoryId) {
      const resolvedCategoryId = await resolveCategoryFilterId(filter.categoryId);
      if (!resolvedCategoryId) return emptyListResult();
      resolvedCategoryFilterId = resolvedCategoryId;
      whereClause.categoryId = resolvedCategoryId;
    }
    if (filter.location) {
      const normalizedLocationFilter = normalizeSearchText(filter.location, 120);
      if (!normalizedLocationFilter) return emptyListResult();
      whereClause.location = {
        equals: normalizedLocationFilter,
        mode: 'insensitive' as const,
      };
    }

    if (filter.country) {
      const countryFilter = resolveCountryRankFilter(filter.country);
      if (!countryFilter) return emptyListResult();
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : []),
        {
          OR: [
            { countryCode: { equals: countryFilter.country, mode: 'insensitive' as const } },
            { countryName: { equals: countryFilter.country, mode: 'insensitive' as const } },
            { location: { contains: countryFilter.country, mode: 'insensitive' as const } },
          ],
        },
      ];
    }

    if (filter.quotedOnly) {
      whereClause.quotedPostId = { not: null };
    }

    const categoryMetaWhereFilters = buildCategoryMetaWhereFilters(filter.categoryMetaFilters);
    if (categoryMetaWhereFilters.length > 0) {
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : []),
        ...categoryMetaWhereFilters,
      ];
    }

    const textFilters = [
      buildPostTextSearchFilter(filter.query),
    ].filter(Boolean);
    if (textFilters.length > 0) {
      whereClause.AND = [
        ...(Array.isArray(whereClause.AND) ? whereClause.AND : []),
        ...textFilters,
      ];
    }

    const shouldUseRecommendationRank =
      !filter.userId &&
      !filter.categoryId &&
      !filter.location &&
      !filter.country &&
      !filter.query &&
      !filter.quotedOnly &&
      categoryMetaWhereFilters.length === 0;

    const [feedBlockedIds, activePromotions] = await Promise.all([
      getFeedBlockedUserIds(filter.currentUserId),
      filter.userId
        ? getActivePinnedPostsForUser(filter.userId)
        : getActivePinnedPosts(resolvedCategoryFilterId),
    ]);

    if (filter.currentUserId) {
      blockedIds = feedBlockedIds;

      if (blockedIds.length > 0) {
        whereClause.userId = { ...whereClause.userId, notIn: blockedIds };
      }
    }

    if (filter.userId) {
      if (blockedIds.includes(filter.userId)) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      whereClause.userId = filter.userId;
      if (filter.userId !== filter.currentUserId) {
        whereClause.isPublished = true;
        whereClause.isAnonymous = false;
      }
    } else {
      whereClause.isPublished = true;
    }

    const pinnedWhereClause = { ...whereClause };

    const recommendationContext = shouldUseRecommendationRank
      ? await safeBuildRecommendationContext(filter.currentUserId)
      : null;
    const hiddenRecommendationPostIds = shouldUseRecommendationRank && recommendationContext
      ? Array.from(recommendationContext.hiddenPostIds).slice(0, RECOMMENDATION_HIDDEN_POST_LIMIT)
      : [];
    const hiddenRecommendationPostFilter = hiddenRecommendationPostIds.length > 0
      ? [{ id: { notIn: hiddenRecommendationPostIds } }]
      : [];

    const nowTime = new Date();
    const todayDate = getTodayDate();

    const bookedPinMap = new Map<string, number>(
      activePromotions.map((p: PromotionCacheItem) => [p.postId, p.slotIndex]),
    );
    const promotedPostIds = Array.from(bookedPinMap.keys());
    const shouldInjectPromotedPosts = !filter.userId;
    const pinnedTake = shouldInjectPromotedPosts && !filter.cursor && promotedPostIds.length > 0
      ? Math.min(3, limit, promotedPostIds.length)
      : 0;
    let pinnedPosts: any[] = [];
    if (pinnedTake > 0) {
      const promotedPosts = promotedPostIds.length > 0
        ? await prisma.post.findMany({
            where: { AND: [pinnedWhereClause, { id: { in: promotedPostIds } }] },
            select: postFeedListSelect(filter.currentUserId),
          })
        : [];

      pinnedPosts = promotedPosts.sort((a: any, b: any) => {
        const slotDelta = (bookedPinMap.get(a.id) ?? 99) - (bookedPinMap.get(b.id) ?? 99);
        if (slotDelta !== 0) return slotDelta;
        const authorPriorityDiff = compareAuthorDisplayPriority(a, b);
        if (authorPriorityDiff !== 0) return authorPriorityDiff;
        return getPostActivityAt(b) - getPostActivityAt(a);
      }).slice(0, pinnedTake);
    }

    const pinnedIds = new Set(pinnedPosts.map((p: any) => p.id));
    const regularLimit = Math.max(0, limit - pinnedPosts.length);
    const regularWhereAnd = [
      whereClause,
      ...hiddenRecommendationPostFilter,
      ...(shouldInjectPromotedPosts && promotedPostIds.length > 0 ? [{ id: { notIn: promotedPostIds } }] : []),
    ];

    const toListItem = (p: any) => {
      const hydrated = hydratePost(p, {
        currentUserId: filter.currentUserId,
        bookedPinMap,
        nowTime,
        todayDate,
        compactForFeed: true,
      });
      const relevanceScore: number | undefined = undefined;
      const recommendationScore: number | undefined = undefined;
      return { ...hydrated, relevanceScore, recommendationScore };
    };

    const pinnedItems = pinnedPosts.map(toListItem);

    if (regularLimit <= 0) {
      return { items: pinnedItems, nextCursor: null, hasMore: false };
    }

    const recommendationScoreCursorFilter = buildRankedScorePaginationFilter(
      filter.cursor,
      'recommendationScore',
    );
    if (
      shouldUseRecommendationRank &&
      !filter.currentUserId &&
      (!filter.cursor || recommendationScoreCursorFilter)
    ) {
      let rows: Array<{
        postId: string;
        recommendationScore: number;
        post: any;
      }> = [];
      try {
        rows = await prisma.postRankingScore.findMany({
          where: {
            ...(recommendationScoreCursorFilter || {}),
            post: {
              deletedAt: null,
              isPublished: true,
              ...(shouldInjectPromotedPosts && promotedPostIds.length > 0 ? { id: { notIn: promotedPostIds } } : {}),
            },
          },
          orderBy: [{ recommendationScore: 'desc' }, { postId: 'desc' }],
          take: filter.cursor ? regularLimit + 1 : Math.min(Math.max(regularLimit * 6, regularLimit + 1, 48), 160),
          select: {
            postId: true,
            recommendationScore: true,
            post: { select: postFastListSelect(filter.currentUserId) },
          },
        });
      } catch (error) {
        if (!isOptionalFeedDependencyUnavailable(error)) throw error;
        console.warn('Recommendation score lookup unavailable; falling back to candidate feed:', error);
      }
      const sortedRows = rows
        .map((row) => ({
          ...row,
          displayScore: row.recommendationScore + getAuthorDisplayBoost(row.post),
        }))
        .sort((a, b) => {
          const scoreDiff = b.displayScore - a.displayScore;
          if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
          return b.postId.localeCompare(a.postId);
        });
      const hasMore = sortedRows.length > regularLimit;
      const pageRows = hasMore ? sortedRows.slice(0, regularLimit) : sortedRows;
      const shouldFallbackToCandidateRank = !filter.cursor && pageRows.length === 0;
      if (!shouldFallbackToCandidateRank) {
      const regularItems = pageRows
        .map((row) => ({
          ...toListItem(row.post),
          heatScore: toPublicHeatScore(row.recommendationScore),
          recommendationScore: row.recommendationScore,
        }))
        .filter((p: any) => !pinnedIds.has(p.id));
      const lastRow = pageRows[pageRows.length - 1];

      return {
        items: [
          ...pinnedItems,
          ...regularItems,
        ],
        nextCursor: hasMore && lastRow
          ? encodeRankedCursor(
              {
                id: lastRow.postId,
                recommendationScore: lastRow.recommendationScore,
                bumpedAt: lastRow.post.bumpedAt,
                createdAt: lastRow.post.createdAt,
              },
              'recommendationScore',
              getRankedCursorDepth(filter.cursor) + pageRows.length - 1,
            )
          : null,
        hasMore,
      };
      }
    }

    if (shouldUseRecommendationRank) {
      const rankProfile = await getFeedRankingProfile();
      const rankingNow = Date.now();

      if (filter.currentUserId && !filter.cursor) {
        const fastCandidateTake = Math.min(
          RECOMMENDATION_FIRST_PAGE_FAST_MAX,
          Math.max(
            RECOMMENDATION_FIRST_PAGE_FAST_MIN,
            regularLimit + 1,
            Math.ceil(regularLimit * RECOMMENDATION_FIRST_PAGE_FAST_MULTIPLIER),
          ),
        );
        let fastRows: Array<{
          postId: string;
          recommendationScore: number;
          post: any;
        }> = [];
        try {
          fastRows = await prisma.postRankingScore.findMany({
            where: {
              post: { AND: regularWhereAnd },
            },
            orderBy: [{ recommendationScore: 'desc' }, { postId: 'desc' }],
            take: fastCandidateTake,
            select: {
              postId: true,
              recommendationScore: true,
              post: { select: recommendationCandidateSelect },
            },
          });
        } catch (error) {
          if (!isOptionalFeedDependencyUnavailable(error)) throw error;
          console.warn('Recommendation fast path unavailable; falling back to candidate feed:', error);
        }

        if (fastRows.length > 0) {
          const fastRankedItems = diversityRerank(
            fastRows
              .map((row) => row.post
                ? {
                    ...row.post,
                    recommendationScore: toPrecomputedRecommendationScore(
                      {
                        ...row.post,
                        rankingScore: {
                          recommendationScore: row.recommendationScore,
                        },
                      },
                      recommendationContext,
                      rankingNow,
                      rankProfile.recommendation,
                    ),
                  }
                : null)
              .filter(Boolean),
          );
          const fastRankedPage = sliceRankedPage(fastRankedItems, regularLimit, undefined, 'recommendationScore');
          const fastRankedPageIds = fastRankedPage.pageItems.map((p: any) => p.id).filter(Boolean);
          const fastRankedPagePosts = fastRankedPageIds.length > 0
            ? await prisma.post.findMany({
                where: { id: { in: fastRankedPageIds } },
                select: postFeedListSelect(filter.currentUserId),
              })
            : [];
          const fastPostMap = new Map(fastRankedPagePosts.map((post: any) => [post.id, post]));
          const fastRegularItems = fastRankedPage.pageItems
            .map((candidate: any) => {
              const post = fastPostMap.get(candidate.id);
              return post
                ? {
                    ...toListItem(post),
                    heatScore: toPublicHeatScore(candidate.recommendationScore),
                    recommendationScore: candidate.recommendationScore,
                  }
                : null;
            })
            .filter(Boolean);

          if (fastRegularItems.length > 0) {
            return {
              items: [
                ...pinnedItems,
                ...fastRegularItems.filter((p: any) => !pinnedIds.has(p.id)),
              ],
              nextCursor: fastRankedPage.nextCursor,
              hasMore: fastRankedPage.hasMore,
            };
          }
        }
      }

      const candidateTake = Math.min(
        rankedCandidateTake(
          regularLimit,
          rankProfile.candidate.recommendationMin,
          rankProfile.candidate.recommendationMax,
          8,
          getRankedCursorDepth(filter.cursor),
        ),
        Math.max(100, regularLimit * 5),
      );
      const candidatePosts = await fetchRecommendationCandidates({
        whereAnd: regularWhereAnd,
        take: candidateTake,
        context: recommendationContext,
      });

      const rankedItems = diversityRerank(
        candidatePosts
          .map((post: any) => ({
            ...post,
            recommendationScore: toPrecomputedRecommendationScore(
              post,
              recommendationContext,
              rankingNow,
              rankProfile.recommendation,
            ),
          }))
      );
      const rankedPage = sliceRankedPage(rankedItems, regularLimit, filter.cursor, 'recommendationScore');
      const rankedPageIds = rankedPage.pageItems.map((p: any) => p.id).filter(Boolean);
      const rankedPagePosts = rankedPageIds.length > 0
        ? await prisma.post.findMany({
            where: { id: { in: rankedPageIds } },
            select: postFeedListSelect(filter.currentUserId),
          })
        : [];
      const postMap = new Map(rankedPagePosts.map((post: any) => [post.id, post]));
      const regularItems = rankedPage.pageItems
        .map((candidate: any) => {
          const post = postMap.get(candidate.id);
          return post
            ? {
                ...toListItem(post),
                heatScore: toPublicHeatScore(candidate.recommendationScore),
                recommendationScore: candidate.recommendationScore,
              }
            : null;
        })
        .filter(Boolean);

      if (pinnedItems.length > 0 || regularItems.length > 0) {
        return {
          items: [
            ...pinnedItems,
            ...regularItems.filter((p: any) => !pinnedIds.has(p.id)),
          ],
          nextCursor: rankedPage.nextCursor,
          hasMore: rankedPage.hasMore,
        };
      }
    }

    const regularTake = regularLimit + 1;
    const regularFallbackWhereAnd = shouldUseRecommendationRank
      ? [
          whereClause,
          ...(shouldInjectPromotedPosts && promotedPostIds.length > 0 ? [{ id: { notIn: promotedPostIds } }] : []),
        ]
      : regularWhereAnd;
    const regularQueryArgs: any = {
      where: {
        AND: regularFallbackWhereAnd,
      },
      orderBy: [{ user: { userType: 'asc' } }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: regularTake,
      ...(filter.cursor && !isRankedCursor(filter.cursor) ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      select: postFeedListSelect(filter.currentUserId),
    };
    let regularPosts: any[] = await prisma.post.findMany(regularQueryArgs);
    if (regularPosts.length === 0 && shouldUseRecommendationRank && !filter.cursor) {
      const latestFallbackWhere: any = {
        deletedAt: null,
        isPublished: true,
        ...buildHiddenAutoPostRobotFilter(),
      };
      if (blockedIds.length > 0) {
        latestFallbackWhere.userId = { notIn: blockedIds };
      }
      regularPosts = await prisma.post.findMany({
        where: latestFallbackWhere,
        orderBy: [{ user: { userType: 'asc' } }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: regularTake,
        select: postFeedListSelect(filter.currentUserId),
      });
    }

    const hasMore = regularPosts.length > regularLimit;
    const cursorBasePosts = hasMore ? regularPosts.slice(0, regularLimit) : regularPosts;
    const regularPagePosts = cursorBasePosts;
    const nextCursor = hasMore
      ? cursorBasePosts[cursorBasePosts.length - 1]?.id || null
      : null;
    const pagePosts = [...pinnedPosts, ...regularPagePosts.filter((p: any) => !pinnedIds.has(p.id))];

    const items = pagePosts
      .map(toListItem)
      .sort((a: any, b: any) => {
        const aPinned = Boolean(a.isPinned);
        const bPinned = Boolean(b.isPinned);

        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        if (aPinned && bPinned) return (a.pinSlot ?? 99) - (b.pinSlot ?? 99);

        const authorPriorityDiff = compareAuthorDisplayPriority(a, b);
        if (authorPriorityDiff !== 0) return authorPriorityDiff;

        const tA = getPostActivityAt(a);
        const tB = getPostActivityAt(b);
        if (tA !== tB) return tB - tA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    return { items, nextCursor, hasMore };
  }

  static async listFollowingPosts(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<ListResult<any>> {
    if (!userId || !isDbConfigured()) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const limit = normalizeLimit(options.limit);
    const [cursorPost, blockedIds, follows] = await Promise.all([
      options.cursor
        ? prisma.post.findUnique({
            where: { id: options.cursor },
            select: { createdAt: true },
          })
        : Promise.resolve(null),
      getFeedBlockedUserIds(userId),
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
    ]);

    const followingIds = Array.from(
      new Set(follows.map((follow) => follow.followingId).filter(Boolean)),
    );
    if (followingIds.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const cursorFilter = cursorPost
      ? {
          OR: [
            { createdAt: { lt: cursorPost.createdAt } },
            { createdAt: cursorPost.createdAt, id: { lt: options.cursor! } },
          ],
        }
      : {};

    const posts = await prisma.post.findMany({
      where: {
        ...cursorFilter,
        ...buildHiddenAutoPostRobotFilter(),
        userId: {
          in: followingIds,
          ...(blockedIds.length > 0 ? { notIn: blockedIds } : {}),
        },
        isPublished: true,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: postFeedListSelect(userId),
    });

    const hasMore = posts.length > limit;
    const pagePosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? pagePosts[pagePosts.length - 1]?.id || null : null;

    const items = pagePosts.map((p: any) =>
      hydratePost(p, {
        currentUserId: userId,
        compactForFeed: true,
      }),
    );

    return { items, nextCursor, hasMore };
  }

  static async listPostQuotes(
    postId: string,
    options: {
      currentUserId?: string | null;
      currentUserRole?: string | null;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<ListResult<any>> {
    if (!POST_UUID_PATTERN.test(postId) || !isDbConfigured()) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const limit = normalizeLimit(options.limit);
    const blockedIds = await getFeedBlockedUserIds(options.currentUserId);
    const where: any = {
      quotedPostId: postId,
      isPublished: true,
      deletedAt: null,
      ...buildHiddenAutoPostRobotFilter(),
    };

    if (blockedIds.length > 0) {
      where.userId = { notIn: blockedIds };
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      select: postFeedListSelect(options.currentUserId),
    });

    const hasMore = posts.length > limit;
    const pagePosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? pagePosts[pagePosts.length - 1]?.id || null : null;
    const items = pagePosts.map((p: any) =>
      hydratePost(p, {
        currentUserId: options.currentUserId,
        currentUserRole: options.currentUserRole,
        compactForFeed: true,
      }),
    );

    return { items, nextCursor, hasMore };
  }

  static async getPost(id: string, currentUserId?: string, currentUserRole?: string) {
    if (!isDbConfigured()) return null;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true,
            userType: true,
            loginAccount: true,
          },
        },
        category: { select: categorySelect },
        quotedPost: { select: quotePreviewSelect },
        rankingScore: { select: { recommendationScore: true } },
        ...(currentUserId ? { likes: { where: { userId: currentUserId }, select: { userId: true } } } : {}),
      },
    });
    if (!post || post.deletedAt !== null) return null;

    const isOwnerOrAdmin = !!currentUserId && (post.userId === currentUserId || currentUserRole === 'ADMIN');
    if (!isOwnerOrAdmin) {
      if (isHiddenAutoPostRobotPost(post)) {
        return null;
      }

      if (post.isPublished !== true) {
        return null;
      }

      if (currentUserId) {
        const blocked = await prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: post.userId },
              { blockerId: post.userId, blockedId: currentUserId },
            ],
          },
          select: { blockerId: true },
        });
        if (blocked) return null;
      }
    }

    const hydrated = hydratePost(post, { currentUserId, currentUserRole });

    return {
      ...hydrated,
      user: hydrated.user
        ? {
            ...hydrated.user,
            username: (post.user as any)?.loginAccount || '',
          }
        : null,
    };
  }

  static async recordViews(postInputs: Array<string | ViewRecordInput>, options: {
    userId?: string | null;
    fingerprint?: string | null;
    source?: PostViewSource;
    now?: Date;
  } = {}) {
    return recordViews(postInputs, options);
  }

  static async bumpOnInteraction(postId: string, options: { now?: Date; cooldownMs?: number; force?: boolean } = {}) {
    return bumpPostOnInteraction(postId, options);
  }

  static async recordShare(postId: string, actorKey: string, userId?: string | null) {
    return recordShare(postId, actorKey, userId);
  }

  static maskContact(post: any, currentUserId: string | null, currentUserRole?: string | null) {
    const result = { ...post };
    const isOwner = Boolean(currentUserId && post.userId === currentUserId);
    const isAdmin = currentUserRole === 'ADMIN';
    const canSeePrivateContact = isOwner || isAdmin;

    if (post.showContact === false && !canSeePrivateContact) {
      result.contact = '';
    }

    if (post.isAnonymous) {
      if (!isOwner && !isAdmin) {
        result.user = {
          id: 'anonymous',
          displayName: '匿名贴',
          photoUrl: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=anonymous',
        };
        result.userId = 'anonymous';
      }
    }

    return result;
  }
}
