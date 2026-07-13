export * from './services/post';

import prisma, { isDbConfigured } from './db';
import { PostService as BasePostService } from './services/post';
import { HomeFeedService } from './services/home-feed.service';
import { attachRecentAuthorPostActivity } from './services/post/recent-author-activity';
import { refreshPostCountryFields, refreshPostCountryFieldsBatch } from './services/post-country-resolver.service';
import { postFeedListSelect } from './services/post/post-selects';
import { compactFeedPostPayload, compactPostUser, toPublicHeatScore } from './services/post/feed-payload';


type ListPostsFilter = Parameters<typeof BasePostService.listPosts>[0];
type ListFollowingOptions = Parameters<(typeof BasePostService)['listFollowingPosts']>[1];
type ListPostQuotesOptions = Parameters<(typeof BasePostService)['listPostQuotes']>[1];

const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

async function withRecentAuthorActivity<T extends { items?: any[] }>(result: T): Promise<T> {
  if (!Array.isArray(result.items) || result.items.length === 0) return result;
  return {
    ...result,
    items: await attachRecentAuthorPostActivity(result.items),
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error;
}

function normalizeRefreshPostIds(postIds: string | string[]) {
  return Array.from(
    new Set(
      (Array.isArray(postIds) ? postIds : [postIds])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  );
}

function scheduleCountryRefresh(postIds: string | string[]) {
  const ids = normalizeRefreshPostIds(postIds);
  if (ids.length <= 0) return;

  setTimeout(() => {
    refreshPostCountryFieldsBatch(ids).catch((error) => {
      console.warn('[post-country-refresh] failed:', getErrorMessage(error));
    });
  }, 800).unref?.();
}

function hasTextFilter(value: unknown) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function hasCategoryMetaFilters(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeLimit(limit?: number) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_PAGE_SIZE);
}

function cleanText(value: unknown, maxLength = 120) {
  if (Array.isArray(value)) return cleanText(value[0], maxLength);
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function getViewerRole(filter: ListPostsFilter | undefined) {
  return typeof (filter as any)?.currentUserRole === 'string'
    ? String((filter as any).currentUserRole)
    : null;
}

function isDefaultHomeRecommendedFilter(filter: ListPostsFilter | undefined) {
  if (!filter) return true;
  return !hasTextFilter(filter.categoryId) &&
    !hasTextFilter(filter.userId) &&
    !hasTextFilter(filter.location) &&
    !hasTextFilter(filter.country) &&
    !hasTextFilter(filter.query) &&
    filter.quotedOnly !== true &&
    !hasCategoryMetaFilters(filter.categoryMetaFilters);
}

function isHomeCategoryFeedFilter(filter: ListPostsFilter | undefined) {
  if (!filter) return false;
  return hasTextFilter(filter.categoryId) &&
    !hasTextFilter(filter.userId) &&
    !hasTextFilter(filter.location) &&
    !hasTextFilter(filter.country) &&
    !hasTextFilter(filter.query) &&
    filter.quotedOnly !== true;
}

function buildPostTextSearchFilter(rawText: unknown) {
  const text = cleanText(rawText, 80);
  if (!text) return null;
  return {
    OR: [
      { title: { contains: text, mode: 'insensitive' as const } },
      { content: { contains: text, mode: 'insensitive' as const } },
      { location: { contains: text, mode: 'insensitive' as const } },
    ],
  };
}

function buildCategoryMetaWhereFilters(filters: any[] | undefined) {
  if (!Array.isArray(filters) || filters.length === 0) return [];
  return filters
    .map((filter) => {
      const key = String(filter?.key || '').trim();
      if (!key) return null;
      if (filter.type === 'number') {
        const query: Record<string, unknown> = { path: [key] };
        if (typeof filter.min === 'number' && Number.isFinite(filter.min)) query.gte = filter.min;
        if (typeof filter.max === 'number' && Number.isFinite(filter.max)) query.lte = filter.max;
        return Object.keys(query).length > 1 ? { categoryMeta: query } : null;
      }
      if (filter.type === 'boolean') {
        return typeof filter.value === 'boolean' ? { categoryMeta: { path: [key], equals: filter.value } } : null;
      }
      const value = String(filter.value ?? '').trim();
      if (!value) return null;
      return filter.type === 'text'
        ? { categoryMeta: { path: [key], string_contains: value, mode: 'insensitive' as const } }
        : { categoryMeta: { path: [key], equals: value } };
    })
    .filter(Boolean);
}

async function getBlockedUserIds(currentUserId?: string | null) {
  if (!currentUserId) return [] as string[];
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }] },
    select: { blockerId: true, blockedId: true },
  });
  return Array.from(new Set([...blocks.map((b) => b.blockerId), ...blocks.map((b) => b.blockedId)]))
    .filter((id) => id !== currentUserId);
}

async function resolveCategoryId(categoryRef?: string) {
  const ref = cleanText(categoryRef, 128);
  if (!ref || ref === 'all') return '';
  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { id: ref },
        { slug: ref },
        { name: { equals: ref, mode: 'insensitive' as const } },
      ],
    },
    select: { id: true },
  });
  return category?.id || '';
}

function toPublicPostPayload(post: any, options: { currentUserId?: string | null; currentUserRole?: string | null; compactForFeed?: boolean } = {}) {
  const isOwner = Boolean(options.currentUserId && post.userId === options.currentUserId);
  const isAdmin = options.currentUserRole === 'ADMIN';
  const canSeePrivateContact = isOwner || isAdmin;
  const shouldMaskAuthor = post.isAnonymous && !isOwner && !isAdmin;

  const prepared = {
    ...post,
    contact: post.showContact === false && !canSeePrivateContact ? '' : post.contact,
    heatScore: toPublicHeatScore(post.heatScore ?? post.recommendationScore ?? post.rankingScore?.recommendationScore),
    rankingScore: undefined,
    recommendationScore: undefined,
    userId: shouldMaskAuthor ? 'anonymous' : post.userId,
    user: shouldMaskAuthor
      ? {
          id: 'anonymous',
          displayName: '匿名贴',
          photoUrl: 'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=anonymous',
        }
      : compactPostUser(post.user, options.compactForFeed),
  };

  return options.compactForFeed ? compactFeedPostPayload(prepared, options) : prepared;
}

async function listRobotSafePublicPosts(filter: ListPostsFilter): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }> {
  if (!isDbConfigured()) return { items: [], nextCursor: null, hasMore: false };

  const limit = normalizeLimit(filter?.limit);
  const currentUserRole = getViewerRole(filter);
  const blockedIds = await getBlockedUserIds(filter?.currentUserId);
  const where: any = { deletedAt: null };

  if (filter?.userId) {
    if (blockedIds.includes(filter.userId)) return { items: [], nextCursor: null, hasMore: false };
    where.userId = filter.userId;
    if (filter.userId !== filter.currentUserId) {
      where.isPublished = true;
      where.isAnonymous = false;
    }
  } else {
    where.isPublished = true;
    if (blockedIds.length > 0) where.userId = { notIn: blockedIds };
  }

  if (filter?.categoryId) {
    const categoryId = await resolveCategoryId(filter.categoryId);
    if (!categoryId) return { items: [], nextCursor: null, hasMore: false };
    where.categoryId = categoryId;
  }

  const andFilters: any[] = [];
  const location = cleanText(filter?.location, 120);
  if (location) where.location = { equals: location, mode: 'insensitive' as const };

  const country = cleanText(filter?.country, 40);
  if (country) {
    andFilters.push({
      OR: [
        { countryCode: { equals: country, mode: 'insensitive' as const } },
        { countryName: { equals: country, mode: 'insensitive' as const } },
        { location: { contains: country, mode: 'insensitive' as const } },
      ],
    });
  }

  if (filter?.quotedOnly) where.quotedPostId = { not: null };
  const textFilter = buildPostTextSearchFilter(filter?.query);
  if (textFilter) andFilters.push(textFilter);
  andFilters.push(...buildCategoryMetaWhereFilters(filter?.categoryMetaFilters as any[]));
  if (andFilters.length > 0) where.AND = andFilters;

  const rows = await prisma.post.findMany({
    where,
    orderBy: [
      { rankingScore: { recommendationScore: 'desc' } } as any,
      { bumpedAt: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    take: limit + 1,
    ...(filter?.cursor && POST_ID_PATTERN.test(String(filter.cursor)) ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: postFeedListSelect(filter?.currentUserId),
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: pageRows.map((post: any) => toPublicPostPayload(post, {
      currentUserId: filter?.currentUserId,
      currentUserRole,
      compactForFeed: true,
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id || null : null,
    hasMore,
  };
}

export class PostService extends BasePostService {
  static async refreshPostRankingScore(...args: Parameters<typeof BasePostService.refreshPostRankingScore>) {
    const result = await BasePostService.refreshPostRankingScore(...args);
    await refreshPostCountryFields(args[0]).catch((error) => {
      console.warn('[post-country-refresh] failed:', getErrorMessage(error));
    });
    return result;
  }

  static async refreshPostRankingScores(...args: Parameters<typeof BasePostService.refreshPostRankingScores>) {
    const result = await BasePostService.refreshPostRankingScores(...args);
    await refreshPostCountryFieldsBatch(args[0] || []).catch((error) => {
      console.warn('[post-country-refresh] batch failed:', getErrorMessage(error));
    });
    return result;
  }

  static schedulePostRankingRefresh(...args: Parameters<typeof BasePostService.schedulePostRankingRefresh>) {
    const result = BasePostService.schedulePostRankingRefresh(...args);
    scheduleCountryRefresh(args[0]);
    return result;
  }

  static async listPosts(...args: Parameters<typeof BasePostService.listPosts>) {
    const filter = args[0];
    const currentUserRole = getViewerRole(filter);
    if (isDefaultHomeRecommendedFilter(filter)) {
      return withRecentAuthorActivity(await HomeFeedService.listFeed({
        kind: 'recommended',
        currentUserId: filter?.currentUserId,
        currentUserRole,
        limit: filter?.limit,
        cursor: filter?.cursor,
      }));
    }

    if (isHomeCategoryFeedFilter(filter)) {
      return withRecentAuthorActivity(await HomeFeedService.listFeed({
        kind: 'category',
        categorySlug: String(filter?.categoryId || ''),
        currentUserId: filter?.currentUserId,
        currentUserRole,
        limit: filter?.limit,
        cursor: filter?.cursor,
        categoryMetaFilters: filter?.categoryMetaFilters,
      }));
    }

    return withRecentAuthorActivity(await listRobotSafePublicPosts(filter));
  }

  static async listFollowingPosts(userId: string, options: ListFollowingOptions = {}) {
    return withRecentAuthorActivity(await HomeFeedService.listFeed({
      kind: 'following',
      currentUserId: userId,
      limit: options?.limit,
      cursor: options?.cursor,
    }));
  }

  static async listPostQuotes(postId: string, options: ListPostQuotesOptions = {}) {
    if (!POST_ID_PATTERN.test(postId) || !isDbConfigured()) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    const limit = normalizeLimit(options?.limit);
    const blockedIds = await getBlockedUserIds(options?.currentUserId);
    const where: any = {
      quotedPostId: postId,
      isPublished: true,
      deletedAt: null,
      ...(blockedIds.length > 0 ? { userId: { notIn: blockedIds } } : {}),
    };
    const rows = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(options?.cursor && POST_ID_PATTERN.test(String(options.cursor)) ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      select: postFeedListSelect(options?.currentUserId),
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return withRecentAuthorActivity({
      items: pageRows.map((post: any) => toPublicPostPayload(post, {
        currentUserId: options?.currentUserId,
        currentUserRole: options?.currentUserRole,
        compactForFeed: true,
      })),
      nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id || null : null,
      hasMore,
    });
  }

  static async getPost(id: string, currentUserId?: string, currentUserRole?: string) {
    if (!POST_ID_PATTERN.test(id) || !isDbConfigured()) return null;
    const post = await prisma.post.findUnique({
      where: { id },
      select: { ...postFeedListSelect(currentUserId), deletedAt: true },
    });
    if (!post || (post as any).deletedAt !== null) return null;

    const isOwnerOrAdmin = Boolean(currentUserId && ((post as any).userId === currentUserId || currentUserRole === 'ADMIN'));
    if (!isOwnerOrAdmin) {
      if ((post as any).isPublished !== true) return null;
      if (currentUserId) {
        const blocked = await prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedId: (post as any).userId },
              { blockerId: (post as any).userId, blockedId: currentUserId },
            ],
          },
          select: { blockerId: true },
        });
        if (blocked) return null;
      }
    }

    return toPublicPostPayload(post, { currentUserId, currentUserRole, compactForFeed: false });
  }

  static maskContact(post: any, currentUserId: string | null, currentUserRole?: string | null) {
    return toPublicPostPayload(post, { currentUserId, currentUserRole, compactForFeed: false });
  }
}
