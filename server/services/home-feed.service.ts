import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { ConfigService, isSameCategoryRef, type PublishCategoryMetaConfig } from '../config.service';
import { PromotionType } from '../../shared/domain';
import { getPublicFeedCacheVersion } from '../public-feed-cache';
import { buildFeedCacheKey, feedReadCache, FEED_READ_CACHE_TTL_MS } from './feed-read-cache.service';
import { postFeedListSelect } from './post/post-selects';
import {
  FeedPromotionMixer,
  FeedRankingService,
  createFeedHydratorService,
  createFeedQueryService,
} from '../modules/feed';
import { createFeedRepository } from '../repositories/feed.repository';

export type HomeFeedKind = 'following' | 'recommended' | 'category';

export type HomeFeedCategoryMetaFilter = {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'location';
  value?: string | boolean;
  min?: number;
  max?: number;
};

type HomeFeedOptions = {
  kind: HomeFeedKind;
  currentUserId?: string | null;
  currentUserRole?: string | null;
  categorySlug?: string;
  limit?: number;
  cursor?: string;
  categoryMetaFilters?: HomeFeedCategoryMetaFilter[];
};

type HomeFeedResult = {
  items: any[];
  nextCursor: string | null;
  hasMore: boolean;
};

type PinMeta = {
  postId: string;
  slotIndex: number;
  startsAt: Date;
  endsAt: Date;
};

type HomeRankCursorPayload = {
  s: number;
  a: number;
  c: number;
  id: string;
  i?: number;
};

const DEFAULT_HOME_FEED_LIMIT = 20;
const MAX_HOME_FEED_LIMIT = 50;
const HOME_FEED_READ_CACHE_VERSION = 'v11-config-driven-category-refs';
const HOME_FEED_PIN_CACHE_TTL_MS = 15_000;
const RANKED_CURSOR_PREFIX = 'rank:v1:';
const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const homeFeedPinCache = new Map<string, { expiresAt: number; pins: PinMeta[] }>();
const feedRepository = createFeedRepository(prisma as any);
const feedQueryService = createFeedQueryService({ repository: feedRepository });
const feedHydratorService = createFeedHydratorService({ repository: feedRepository });
const feedRankingService = new FeedRankingService();
const feedPromotionMixer = new FeedPromotionMixer();

function emptyHomeFeedResult(): HomeFeedResult {
  return { items: [], nextCursor: null, hasMore: false };
}

function normalizeLimit(limit?: number) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_HOME_FEED_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), MAX_HOME_FEED_LIMIT);
}

function cleanString(value: unknown, maxLength = 128) {
  if (Array.isArray(value)) return cleanString(value[0], maxLength);
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isRankedCursor(cursor?: string | null) {
  return typeof cursor === 'string' && cursor.startsWith(RANKED_CURSOR_PREFIX);
}

function normalizeCursor(cursor?: string | null) {
  const value = cleanString(cursor, 320);
  if (POST_ID_PATTERN.test(value) || isRankedCursor(value)) return value;
  return undefined;
}

function decodeHomeRankCursor(cursor?: string | null): HomeRankCursorPayload | null {
  if (!isRankedCursor(cursor)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(cursor).slice(RANKED_CURSOR_PREFIX.length), 'base64url').toString('utf8'));
    if (!decoded || typeof decoded.id !== 'string' || !POST_ID_PATTERN.test(decoded.id)) return null;
    const score = Number(decoded.s);
    const activityAt = Number(decoded.a);
    const createdAt = Number(decoded.c);
    if (!Number.isFinite(score) || !Number.isFinite(activityAt) || !Number.isFinite(createdAt)) return null;
    return {
      s: score,
      a: activityAt,
      c: createdAt,
      id: decoded.id,
      i: Number.isFinite(Number(decoded.i)) ? Math.max(0, Math.floor(Number(decoded.i))) : undefined,
    };
  } catch {
    return null;
  }
}

function getRowRecommendationScore(row: any) {
  const score = Number(row?.rankingScore?.recommendationScore ?? row?.recommendationScore ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function getRowCreatedMs(row: any) {
  const date = row?.createdAt ? new Date(row.createdAt) : null;
  const value = date?.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getRowActivityMs(row: any) {
  const date = row?.bumpedAt ? new Date(row.bumpedAt) : null;
  const value = date?.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : getRowCreatedMs(row);
}

function encodeHomeRankCursor(row: any, index?: number) {
  if (!row?.id || !POST_ID_PATTERN.test(String(row.id))) return null;
  const payload: HomeRankCursorPayload = {
    s: getRowRecommendationScore(row),
    a: getRowActivityMs(row),
    c: getRowCreatedMs(row),
    id: String(row.id),
    ...(Number.isFinite(index) ? { i: Math.max(0, Math.floor(index as number)) } : {}),
  };
  return `${RANKED_CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function buildRankScoreEqualWhere(score: number): Prisma.PostWhereInput {
  const scoreEquals = { rankingScore: { is: { recommendationScore: score } } } satisfies Prisma.PostWhereInput;
  if (score !== 0) return scoreEquals;
  return {
    OR: [
      scoreEquals,
      { rankingScore: { is: null } },
    ],
  } satisfies Prisma.PostWhereInput;
}

function buildRankScoreLessThanWhere(score: number): Prisma.PostWhereInput {
  const lowerScore = { rankingScore: { is: { recommendationScore: { lt: score } } } } satisfies Prisma.PostWhereInput;
  if (score <= 0) return lowerScore;
  return {
    OR: [
      lowerScore,
      { rankingScore: { is: null } },
    ],
  } satisfies Prisma.PostWhereInput;
}

function buildRankCursorWhere(cursor?: string) {
  const decoded = decodeHomeRankCursor(cursor);
  if (!decoded) return null;
  const bumpedAt = new Date(decoded.a);
  const createdAt = new Date(decoded.c);
  const sameScore = buildRankScoreEqualWhere(decoded.s);
  return {
    OR: [
      buildRankScoreLessThanWhere(decoded.s),
      {
        AND: [
          sameScore,
          { bumpedAt: { lt: bumpedAt } },
        ],
      },
      {
        AND: [
          sameScore,
          { bumpedAt },
          { createdAt: { lt: createdAt } },
        ],
      },
      {
        AND: [
          sameScore,
          { bumpedAt },
          { createdAt },
          { id: { lt: decoded.id } },
        ],
      },
    ],
  } satisfies Prisma.PostWhereInput;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function getEffectivePublishCategorySchemas(configs: any) {
  return Array.isArray(configs?.publish_category_schema)
    ? configs.publish_category_schema as PublishCategoryMetaConfig[]
    : [];
}

async function loadPublishCategorySchemas() {
  const configs = await ConfigService.getConfigs().catch(() => ({} as any));
  return getEffectivePublishCategorySchemas(configs);
}

function getSchemaCategoryRefs(schema: PublishCategoryMetaConfig) {
  const item = schema as PublishCategoryMetaConfig & {
    id?: string | null;
    label?: string | null;
    title?: string | null;
  };
  return uniqueStrings([
    item.categorySlug,
    item.slug,
    item.id,
    item.name,
    item.label,
    item.title,
  ]);
}

function getHomeCategoryRefs(categoryRef: string, schemas: PublishCategoryMetaConfig[]) {
  const requestedRef = cleanString(categoryRef);
  const requestedRefKey = requestedRef.toLowerCase();
  if (!requestedRef || requestedRefKey === 'all') return [];

  const matchedSchema = schemas.find((schema) =>
    getSchemaCategoryRefs(schema).some((ref) => isSameCategoryRef(ref, requestedRef)),
  );

  return uniqueStrings([
    requestedRef,
    ...(matchedSchema ? getSchemaCategoryRefs(matchedSchema) : []),
  ]);
}

async function resolveHomeCategoryIds(categoryRef?: string | null) {
  const requestedRef = cleanString(categoryRef);
  if (!requestedRef || requestedRef.toLowerCase() === 'all') return [];
  const cacheKey = buildFeedCacheKey('home-feed:category-ids:v4', { categoryRef: requestedRef });
  return feedReadCache.getOrLoad(cacheKey, FEED_READ_CACHE_TTL_MS.metadata, async () => {
    const refs = getHomeCategoryRefs(requestedRef, await loadPublishCategorySchemas());
    if (refs.length === 0) return [];
    return feedRepository.listCategoryIdsByRefs(refs);
  });
}

async function getBlockedUserIds(currentUserId?: string | null) {
  if (!currentUserId) return [] as string[];
  return feedRepository.listBlockedUserIds(currentUserId);
}

async function getReducedPostIds(currentUserId?: string | null) {
  if (!currentUserId) return [] as string[];
  return feedRepository.listReducedPostIds(currentUserId);
}

async function getFollowingAuthorIds(currentUserId: string) {
  return feedRepository.listFollowingAuthorIds(currentUserId);
}

function buildVisiblePostWhere(blockedUserIds: string[], reducedPostIds: string[] = []): Prisma.PostWhereInput {
  // Author userType never removes a post from candidate pools.
  // ROBOT authors are handled only by the persisted effective recommendation score.
  return {
    deletedAt: null,
    isPublished: true,
    ...(reducedPostIds.length > 0 ? { id: { notIn: reducedPostIds } } : {}),
    ...(blockedUserIds.length > 0 ? { userId: { notIn: blockedUserIds } } : {}),
  };
}

function buildCategoryMetaWhereFilters(filters?: HomeFeedCategoryMetaFilter[]) {
  if (!Array.isArray(filters) || filters.length === 0) return [];
  return filters
    .map((filter) => {
      const key = cleanString(filter?.key, 80);
      if (!key) return null;
      if (filter.type === 'boolean' && typeof filter.value === 'boolean') return { categoryMeta: { path: [key], equals: filter.value } };
      if (filter.type === 'number') {
        const rangeFilters = [
          typeof filter.min === 'number' ? { categoryMeta: { path: [key], gte: filter.min } } : null,
          typeof filter.max === 'number' ? { categoryMeta: { path: [key], lte: filter.max } } : null,
        ].filter(Boolean);
        return rangeFilters.length > 1 ? { AND: rangeFilters } : rangeFilters[0] || null;
      }
      const value = typeof filter.value === 'string' ? cleanString(filter.value, 120) : '';
      if (!value) return null;
      if (filter.type === 'text') return { categoryMeta: { path: [key], string_contains: value, mode: 'insensitive' as const } };
      return { categoryMeta: { path: [key], equals: value } };
    })
    .filter(Boolean) as Prisma.PostWhereInput[];
}

function buildHomeFeedReadCacheKey(options: HomeFeedOptions, limit: number) {
  return buildFeedCacheKey(`home-feed:result:${HOME_FEED_READ_CACHE_VERSION}`, {
    feedVersion: getPublicFeedCacheVersion(),
    kind: options.kind,
    viewer: 'anonymous',
    categorySlug: options.categorySlug || '',
    cursor: normalizeCursor(options.cursor) || '',
    limit,
    categoryMetaFilters: options.categoryMetaFilters || [],
  });
}

async function getActivePinMeta(params: { kind: 'recommended' | 'category'; categoryIds?: string[] }): Promise<PinMeta[]> {
  const categoryIds = Array.isArray(params.categoryIds) ? params.categoryIds : [];
  const cacheKey = `${getPublicFeedCacheVersion()}:${params.kind}:${categoryIds.slice().sort().join(',') || 'all'}`;
  const cached = homeFeedPinCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.pins;

  const now = new Date();
  const type = params.kind === 'category' ? PromotionType.PIN_CATEGORY : PromotionType.PIN_HOME;
  const rows = await feedRepository.listActivePinBookings({ type, categoryIds, now });
  const pins = rows
    .filter((row: { postId: string | null }) => Boolean(row.postId))
    .map((row: { postId: string; slotIndex: number; startsAt: Date; endsAt: Date }) => ({
      postId: row.postId,
      slotIndex: Number(row.slotIndex || 0),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    }));
  homeFeedPinCache.set(cacheKey, { expiresAt: Date.now() + HOME_FEED_PIN_CACHE_TTL_MS, pins });
  return pins;
}

const RECOMMENDED_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { rankingScore: { recommendationScore: 'desc' } } as any,
  { bumpedAt: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

const RECENT_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

async function fetchPostRows(params: {
  where: Prisma.PostWhereInput;
  orderBy: Prisma.PostOrderByWithRelationInput[];
  limit: number;
  cursor?: string;
  currentUserId?: string | null;
  useRankCursor?: boolean;
}) {
  const cursor = normalizeCursor(params.cursor);
  const rankedCursorWhere = params.useRankCursor ? buildRankCursorWhere(cursor) : null;
  const legacyIdCursor = cursor && POST_ID_PATTERN.test(cursor) ? cursor : undefined;
  const where = rankedCursorWhere ? { AND: [params.where, rankedCursorWhere] } : params.where;
  return feedRepository.listPostsPage({
    where,
    orderBy: params.orderBy,
    limit: params.limit,
    cursor: legacyIdCursor,
    select: postFeedListSelect(params.currentUserId),
  });
}

async function hydrateRows(
  rows: any[],
  currentUserId?: string | null,
  currentUserRole?: string | null,
  pinMap: Map<string, PinMeta> = new Map(),
) {
  return feedHydratorService.hydratePosts({
    posts: rows,
    currentUserId,
    currentUserRole,
    pinMetaMap: pinMap,
  });
}

async function buildFeedResult(
  rows: any[],
  limit: number,
  currentUserId?: string | null,
  currentUserRole?: string | null,
  pinMap: Map<string, PinMeta> = new Map(),
  cursorMode: 'id' | 'rank' = 'id',
): Promise<HomeFeedResult> {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  return {
    items: await hydrateRows(pageRows, currentUserId, currentUserRole, pinMap),
    nextCursor: hasMore && lastRow
      ? (cursorMode === 'rank' ? encodeHomeRankCursor(lastRow, pageRows.length - 1) : lastRow.id || null)
      : null,
    hasMore,
  };
}

async function fetchPinnedRows(params: {
  where: Prisma.PostWhereInput;
  pins: PinMeta[];
  currentUserId?: string | null;
}) {
  if (params.pins.length === 0) return { rows: [] as any[], pinMap: new Map<string, PinMeta>() };
  const pinMap = new Map(params.pins.map((pin) => [pin.postId, pin]));
  const rows = await feedRepository.listPostsByIds({
    where: { AND: [params.where, { id: { in: params.pins.map((pin) => pin.postId) } }] },
    postIds: params.pins.map((pin) => pin.postId),
    select: postFeedListSelect(params.currentUserId),
  });
  return {
    rows: feedPromotionMixer.sortPinnedRows(rows, pinMap),
    pinMap,
  };
}

async function listRecommendedOrCategory(params: {
  baseWhere: Prisma.PostWhereInput;
  kind: 'recommended' | 'category';
  categoryIds?: string[];
  limit: number;
  cursor?: string;
  currentUserId?: string | null;
  currentUserRole?: string | null;
}) {
  const cursor = normalizeCursor(params.cursor);
  const pins = cursor ? [] : await getActivePinMeta({ kind: params.kind, categoryIds: params.categoryIds });
  const { rows: allPinnedRows, pinMap } = await fetchPinnedRows({ where: params.baseWhere, pins, currentUserId: params.currentUserId });
  const promotedPostIds = feedPromotionMixer.getPromotedPostIds(pinMap);
  const regularWhere = feedPromotionMixer.buildRegularWhereExclusion(params.baseWhere, promotedPostIds);
  const rankedCursorWhere = buildRankCursorWhere(cursor);
  const regularRankWhere = rankedCursorWhere ? { AND: [regularWhere, rankedCursorWhere] } : regularWhere;
  const cursorPostId = decodeHomeRankCursor(cursor)?.id || (cursor && POST_ID_PATTERN.test(cursor) ? cursor : undefined);
  const regularRows = await feedRepository.listHumanRankedCandidatePosts({
    where: regularRankWhere,
    limit: params.limit,
    cursor: cursorPostId,
    select: postFeedListSelect(params.currentUserId),
    promotedPostIds,
    useRankCursor: true,
  });
  const rankedRows = feedRankingService.rankRecommendedRows(regularRows, {
    isCursorPage: Boolean(cursor),
    promotedPostIds: new Set(promotedPostIds),
  });
  const mixed = feedPromotionMixer.mixPinnedRows({
    pinnedRows: allPinnedRows,
    regularRows: rankedRows,
    limit: params.limit + 1,
    pinMetaMap: pinMap,
  });
  return buildFeedResult(mixed.rows, params.limit, params.currentUserId, params.currentUserRole, pinMap, 'rank');
}

async function listFeedUncached(
  options: HomeFeedOptions,
  limit: number,
  currentUserId: string | null,
  currentUserRole: string | null,
): Promise<HomeFeedResult> {
  const [blockedUserIds, reducedPostIds] = currentUserId
    ? await Promise.all([getBlockedUserIds(currentUserId), getReducedPostIds(currentUserId)])
    : [[], []];
  const baseWhere = buildVisiblePostWhere(blockedUserIds, reducedPostIds);

  return feedQueryService.dispatchHomeFeed({
    kind: options.kind,
    currentUserId,
    limit,
    cursor: options.cursor,
    categoryMetaFilters: options.categoryMetaFilters,
  }, {
    following: async () => {
      if (!currentUserId) return emptyHomeFeedResult();
      const followingAuthorIds = await getFollowingAuthorIds(currentUserId);
      const visibleFollowingAuthorIds = followingAuthorIds.filter((authorId) => !blockedUserIds.includes(authorId));
      if (visibleFollowingAuthorIds.length === 0) return emptyHomeFeedResult();
      const rows = await fetchPostRows({
        where: { ...baseWhere, userId: { in: visibleFollowingAuthorIds } },
        orderBy: RECENT_ORDER,
        limit,
        cursor: options.cursor,
        currentUserId,
      });
      return buildFeedResult(rows, limit, currentUserId, currentUserRole, new Map(), 'id');
    },
    category: async () => {
      const categoryIds = await resolveHomeCategoryIds(options.categorySlug);
      if (categoryIds.length === 0) return emptyHomeFeedResult();
      const categoryMetaFilters = buildCategoryMetaWhereFilters(options.categoryMetaFilters);
      const categoryWhere: Prisma.PostWhereInput = {
        ...baseWhere,
        categoryId: { in: categoryIds },
        ...(categoryMetaFilters.length > 0 ? { AND: categoryMetaFilters } : {}),
      };
      return listRecommendedOrCategory({
        baseWhere: categoryWhere,
        kind: 'category',
        categoryIds,
        limit,
        cursor: options.cursor,
        currentUserId,
        currentUserRole,
      });
    },
    recommended: async () => listRecommendedOrCategory({
      baseWhere,
      kind: 'recommended',
      limit,
      cursor: options.cursor,
      currentUserId,
      currentUserRole,
    }),
  });
}

export class HomeFeedService {
  static async listFeed(options: HomeFeedOptions): Promise<HomeFeedResult> {
    if (!isDbConfigured()) return emptyHomeFeedResult();
    const limit = normalizeLimit(options.limit);
    const currentUserId = options.currentUserId || null;
    const currentUserRole = options.currentUserRole || null;

    // Logged-in feeds depend on follow/block/reduce actions and must be read-live.
    // Anonymous public feeds keep a short cache keyed by the global feed version.
    if (currentUserId) return listFeedUncached(options, limit, currentUserId, currentUserRole);

    const cacheKey = buildHomeFeedReadCacheKey(options, limit);
    return feedReadCache.getOrLoad(cacheKey, FEED_READ_CACHE_TTL_MS.anonymousFeed, () => listFeedUncached(options, limit, null, null));
  }
}
