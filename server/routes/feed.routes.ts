import type { Express, Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import type { PostCategoryMetaFilter } from '../post.service';
import { ConfigService, type PublishCategoryMetaConfig } from '../config.service';
import type { PublicFeedCachedPayload, PublicFeedResultPayload } from '../public-feed-cache';
import type { FeedKind } from '../modules/feed';
import { collectFeedPerformance, measureFeedStep } from '../modules/feed';
import { PromotionService } from '../promotion.service';
import { toPublicPromotionAdPayloads } from '../services/promotion-public-ad-payload.service';
import { getCachedCategories, toPublicConfig } from './config.routes';
import type { RouteModule } from './route-module';

type PaginationResult = {
  limit: number;
  cursor?: string | null;
};

type HomeFirstScreenFeedResult = PublicFeedResultPayload & { unavailable?: boolean };
export type FeedRoutesDeps = {
  publicReadLimiter: any;
  authMiddleware: any;
  catchAsync: <T extends (...args: any[]) => any>(handler: T) => any;
  isDbConfigured: () => boolean;
  sendDatabaseUnavailable: (res: Response, action: string) => any;
  getCurrentUserId: (req: Request) => string | null;
  throwOnInvalidPagination: (req: Request, options?: { defaultLimit?: number; maxLimit?: number }) => PaginationResult;
  getConfigs: () => Promise<any>;
  buildLocationPresetValueSet: (presets: unknown) => Set<string>;
  normalizeCategoryMetaFeedFilters: (
    scope: unknown,
    filters: unknown,
    configuredSchemas: PublishCategoryMetaConfig[],
    locationPresetValues: Set<string>,
  ) => { errors: string[]; filters: PostCategoryMetaFilter[] };
  PostService: {
    listPosts: (params: any) => Promise<PublicFeedResultPayload>;
    maskContact: (post: any, currentUserId?: string | null, currentUserRole?: string | null) => any;
  };
  HomeFeedService: {
    listFeed: (params: any) => Promise<PublicFeedResultPayload>;
  };
  runPublicFeedRead: <T>(task: () => Promise<T>) => Promise<T>;
  getPublicFeedResultCacheKey: (req: Request, scope: string, params: Record<string, unknown>) => string | null;
  getPublicFeedResultCache: (key: string | null) => PublicFeedCachedPayload | null;
  refreshPublicFeedResultCache: (key: string | null, loader: () => Promise<PublicFeedResultPayload>) => void;
  getPublicFeedInflight: (key: string | null) => Promise<PublicFeedResultPayload> | null;
  getPublicFeedFallbackCache: (key: string | null) => PublicFeedCachedPayload | null;
  setPublicFeedInflight: (key: string | null, promise: Promise<PublicFeedResultPayload>) => void;
  setPublicFeedResultCache: (key: string | null, result: PublicFeedResultPayload, items: any[]) => void;
  buildPublicFeedCacheKey: (scope: string, params: Record<string, unknown>) => string;
  withTimeout: <T>(promise: Promise<T>, budgetMs: number) => Promise<T | null>;
  sendPublicFeedCachedResult: (res: Response, cachedResult: PublicFeedCachedPayload, currentUserId: string | null, ttlSeconds: number) => any;
  sendPublicFeedResult: (res: Response, result: PublicFeedResultPayload, currentUserId: string | null, ttlSeconds: number, cacheState: string) => any;
  setPaginationHeaders: (res: Response, result: PublicFeedResultPayload) => void;
  setListCacheHeaders: (res: Response, currentUserId: string | null, ttlSeconds: number) => void;
  setPublicFeedListCacheHeaders: (res: Response, currentUserId: string | null, ttlSeconds: number) => void;
  getPublicFeedCacheVersion: () => number;
  isDatabaseUnavailableError: (error: unknown) => boolean;
  PUBLIC_FEED_DEFAULT_LIMIT: number;
  PUBLIC_FEED_MAX_LIMIT: number;
  PUBLIC_FEED_RESPONSE_BUDGET_MS: number;
};

const HOME_FEED_KINDS = new Set<FeedKind>(['following', 'recommended', 'category']);
const HOME_FEED_CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const HOME_FIRST_SCREEN_BOOTSTRAP_BUDGET_MS = 450;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function measureDuration<T>(task: () => Promise<T>, onComplete: (durationMs: number) => void) {
  const startedAt = nowMs();
  try {
    return await task();
  } finally {
    onComplete(Math.max(0, nowMs() - startedAt));
  }
}

function formatServerTimingMetric(name: string, durationMs: number) {
  return `${name};dur=${durationMs.toFixed(1)}`;
}

function sumFeedTimingPrefix(timings: Map<string, number>, prefix: string) {
  let total = 0;
  timings.forEach((durationMs, name) => {
    if (name.startsWith(prefix)) total += durationMs;
  });
  return total;
}

export function normalizeHomeFeedKind(raw: unknown): FeedKind {
  const kind = String(raw || '').trim().toLowerCase() as FeedKind;
  return HOME_FEED_KINDS.has(kind) ? kind : 'recommended';
}

export function normalizeHomeFeedCategorySlug(raw: unknown) {
  const slug = String(raw || '').trim().toLowerCase();
  return HOME_FEED_CATEGORY_SLUG_PATTERN.test(slug) ? slug : '';
}

function createUnavailableFeed(): HomeFirstScreenFeedResult {
  return { items: [], nextCursor: null, hasMore: false, unavailable: true };
}

function toFeedPayloadFromCache(cached: PublicFeedCachedPayload): PublicFeedResultPayload {
  return {
    items: cached.items,
    nextCursor: cached.nextCursor,
    hasMore: cached.hasMore,
  };
}

async function getWithFirstScreenBudget<T>(deps: FeedRoutesDeps, promise: Promise<T>, fallback: T): Promise<T> {
  const guardedPromise = promise.catch(() => fallback);
  return (await deps.withTimeout(guardedPromise, HOME_FIRST_SCREEN_BOOTSTRAP_BUDGET_MS)) ?? fallback;
}

function getPublishCategorySchemaFromConfig(configs: any): PublishCategoryMetaConfig[] {
  return Array.isArray(configs?.publish_category_schema)
    ? configs.publish_category_schema as PublishCategoryMetaConfig[]
    : [];
}

async function buildHomeFirstScreenBootstrap(deps: FeedRoutesDeps, configsPromise: Promise<any>) {
  const defaultConfigs = ConfigService.getDefaultConfigs();
  const [configs, categories, homeAds] = await Promise.all([
    getWithFirstScreenBudget(deps, configsPromise, defaultConfigs),
    getWithFirstScreenBudget(deps, getCachedCategories(), [] as any[]),
    getWithFirstScreenBudget(deps, PromotionService.getActiveHomeAds(), [] as any[]),
  ]);
  const publishCategorySchema = getPublishCategorySchemaFromConfig(configs);

  return {
    config: toPublicConfig(configs, { publishCategorySchema }),
    categories,
    homeAds: toPublicPromotionAdPayloads(homeAds),
  };
}

function listHomeFeed(params: {
  deps: FeedRoutesDeps;
  feedKind: FeedKind;
  categorySlug: string;
  currentUserId: string | null;
  currentUserRole?: string | null;
  limit: number;
  cursor?: string | null;
  categoryMetaFilters: PostCategoryMetaFilter[];
}) {
  if (params.feedKind === 'recommended') {
    return params.deps.PostService.listPosts({
      currentUserId: params.currentUserId,
      currentUserRole: params.currentUserRole || null,
      limit: params.limit,
      cursor: params.cursor,
    });
  }

  return params.deps.HomeFeedService.listFeed({
    kind: params.feedKind,
    categorySlug: params.categorySlug,
    currentUserId: params.currentUserId,
    currentUserRole: params.currentUserRole || null,
    limit: params.limit,
    cursor: params.cursor,
    categoryMetaFilters: params.categoryMetaFilters,
  });
}

export function registerFeedRoutes(app: Express, deps: FeedRoutesDeps) {
  app.get('/api/home/first-screen', deps.publicReadLimiter, deps.authMiddleware, deps.catchAsync(async (req: AuthRequest, res: Response) => {
    const requestStartedAt = nowMs();
    let bootstrapDurationMs = 0;
    let feedDurationMs = 0;
    let serializationDurationMs = 0;
    let feedStepTimings = new Map<string, number>();
    const feedKind = normalizeHomeFeedKind(req.query.feed);
    const categorySlug = normalizeHomeFeedCategorySlug(req.query.categorySlug);
    const currentUserId = deps.getCurrentUserId(req);
    const currentUserRole = req.user?.role;
    const { limit, cursor } = deps.throwOnInvalidPagination(req, {
      defaultLimit: deps.PUBLIC_FEED_DEFAULT_LIMIT,
      maxLimit: deps.PUBLIC_FEED_MAX_LIMIT,
    });

    if (feedKind === 'following' && !currentUserId) {
      return res.status(401).json({ error: '请先登录' });
    }

    if (feedKind === 'category' && !categorySlug) {
      return res.status(400).json({ error: '分类参数不合法' });
    }

    const configsPromise = deps.getConfigs().catch(() => ConfigService.getDefaultConfigs());
    const bootstrapPromise = measureDuration(
      () => buildHomeFirstScreenBootstrap(deps, configsPromise),
      (durationMs) => { bootstrapDurationMs = durationMs; },
    );
    const shouldValidateCategoryMetaFilters = feedKind === 'category' && Boolean(req.query.categoryMetaScope || req.query.categoryMetaFilters);
    let normalizedCategoryMetaFilters: PostCategoryMetaFilter[] = [];

    if (shouldValidateCategoryMetaFilters) {
      const configs = await configsPromise;
      const configuredSchemas = getPublishCategorySchemaFromConfig(configs);
      const locationPresetValues = deps.buildLocationPresetValueSet(configs?.location_presets);
      const validationResult = deps.normalizeCategoryMetaFeedFilters(
        req.query.categoryMetaScope,
        req.query.categoryMetaFilters,
        configuredSchemas,
        locationPresetValues,
      );

      if (validationResult.errors.length > 0) {
        return res.status(400).json({ error: validationResult.errors[0], details: validationResult.errors });
      }
      normalizedCategoryMetaFilters = validationResult.filters;
    }

    const loadFeedResult = () => deps.runPublicFeedRead(async () => {
      const collected = await collectFeedPerformance(() => measureFeedStep({
        name: 'home-first-screen.load',
        requestId: req.requestId,
        kind: feedKind,
        limit,
      }, async () => {
        const feedResult = await listHomeFeed({
          deps,
          feedKind,
          categorySlug,
          currentUserId,
          currentUserRole,
          limit,
          cursor,
          categoryMetaFilters: normalizedCategoryMetaFilters,
        });
        const serializationStartedAt = nowMs();
        const safePosts = feedResult.items.map((post: any) => deps.PostService.maskContact(post, currentUserId, currentUserRole));
        serializationDurationMs += Math.max(0, nowMs() - serializationStartedAt);
        return { ...feedResult, items: safePosts };
      }));
      feedStepTimings = collected.timings;
      return collected.result;
    });

    const publicCacheKey = feedKind !== 'following'
      ? deps.getPublicFeedResultCacheKey(req, 'home-feed', { currentUserId, limit, cursor })
      : null;
    const recommendedPostsFallbackKey = feedKind === 'recommended' && publicCacheKey
      ? deps.buildPublicFeedCacheKey('posts', { limit, cursor })
      : null;
    let feedCacheState = publicCacheKey ? 'MISS' : 'BYPASS';

    const loadFirstScreenFeed = async (): Promise<HomeFirstScreenFeedResult> => {
      if (!deps.isDbConfigured()) return createUnavailableFeed();

      const cachedResult = deps.getPublicFeedResultCache(publicCacheKey);
      if (cachedResult) {
        feedCacheState = cachedResult.cacheState;
        if (cachedResult.cacheState === 'STALE') {
          deps.refreshPublicFeedResultCache(publicCacheKey, loadFeedResult);
        }
        return toFeedPayloadFromCache(cachedResult);
      }

      const inflightResult = deps.getPublicFeedInflight(publicCacheKey);
      if (inflightResult) {
        const budgetResult = await deps.withTimeout(inflightResult, deps.PUBLIC_FEED_RESPONSE_BUDGET_MS);
        if (budgetResult) {
          feedCacheState = 'WAIT';
          return budgetResult;
        }
        const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey) ||
          deps.getPublicFeedFallbackCache(recommendedPostsFallbackKey);
        if (fallbackResult) {
          feedCacheState = fallbackResult.cacheState;
          return toFeedPayloadFromCache(fallbackResult);
        }
        feedCacheState = 'WAIT';
        return inflightResult;
      }

      try {
        const resultPromise = loadFeedResult();
        deps.setPublicFeedInflight(publicCacheKey, resultPromise);
        const budgetResult = await deps.withTimeout(resultPromise, deps.PUBLIC_FEED_RESPONSE_BUDGET_MS);
        if (!budgetResult) {
          const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey) ||
            deps.getPublicFeedFallbackCache(recommendedPostsFallbackKey);
          if (fallbackResult) {
            feedCacheState = fallbackResult.cacheState;
            return toFeedPayloadFromCache(fallbackResult);
          }
          const result = await resultPromise;
          deps.setPublicFeedResultCache(publicCacheKey, result, result.items);
          feedCacheState = publicCacheKey ? 'MISS' : 'BYPASS';
          return result;
        }
        deps.setPublicFeedResultCache(publicCacheKey, budgetResult, budgetResult.items);
        feedCacheState = publicCacheKey ? 'MISS' : 'BYPASS';
        return budgetResult;
      } catch (error) {
        if (!deps.isDatabaseUnavailableError(error)) console.error('[home-first-screen] Failed to load feed', error);
        const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey) ||
          deps.getPublicFeedFallbackCache(recommendedPostsFallbackKey);
        if (fallbackResult) {
          feedCacheState = fallbackResult.cacheState;
          return toFeedPayloadFromCache(fallbackResult);
        }
        return createUnavailableFeed();
      }
    };

    const feedPromise = measureDuration(
      loadFirstScreenFeed,
      (durationMs) => { feedDurationMs = durationMs; },
    );
    const [bootstrap, feed] = await Promise.all([bootstrapPromise, feedPromise]);
    deps.setPublicFeedListCacheHeaders(res, currentUserId, 10);
    res.setHeader('X-Home-First-Screen', '1');
    res.setHeader('X-Feed-Result-Cache', feedCacheState);
    res.setHeader('X-Feed-Cache-Version', String(deps.getPublicFeedCacheVersion()));
    res.setHeader('Server-Timing', [
      formatServerTimingMetric('bootstrap', bootstrapDurationMs),
      formatServerTimingMetric('feed', feedDurationMs),
      formatServerTimingMetric('candidates', sumFeedTimingPrefix(feedStepTimings, 'feed-candidates.')),
      formatServerTimingMetric('promotions', sumFeedTimingPrefix(feedStepTimings, 'feed-promotions.')),
      formatServerTimingMetric('membership', feedStepTimings.get('feed-hydrate.tui-plus') || 0),
      formatServerTimingMetric('activity', feedStepTimings.get('feed-hydrate.recent-author-activity') || 0),
      formatServerTimingMetric('serialize', serializationDurationMs),
      formatServerTimingMetric('total', nowMs() - requestStartedAt),
    ].join(', '));
    return res.json({ bootstrap, feed, generatedAt: new Date().toISOString() });
  }));

  app.get('/api/home/feed', deps.publicReadLimiter, deps.authMiddleware, deps.catchAsync(async (req: AuthRequest, res: Response) => {
    if (!deps.isDbConfigured()) {
      return deps.sendDatabaseUnavailable(res, '加载首页内容');
    }

    const feedKind = normalizeHomeFeedKind(req.query.feed);
    const categorySlug = normalizeHomeFeedCategorySlug(req.query.categorySlug);
    const currentUserId = deps.getCurrentUserId(req);
    const currentUserRole = req.user?.role;
    const { limit, cursor } = deps.throwOnInvalidPagination(req, {
      defaultLimit: deps.PUBLIC_FEED_DEFAULT_LIMIT,
      maxLimit: deps.PUBLIC_FEED_MAX_LIMIT,
    });

    if (feedKind === 'following' && !currentUserId) {
      return res.status(401).json({ error: '请先登录' });
    }

    if (feedKind === 'category' && !categorySlug) {
      return res.status(400).json({ error: '分类参数不合法' });
    }

    let normalizedCategoryMetaFilters: PostCategoryMetaFilter[] = [];
    if (feedKind === 'category' && (req.query.categoryMetaScope || req.query.categoryMetaFilters)) {
      const configs = await deps.getConfigs();
      const configuredSchemas = getPublishCategorySchemaFromConfig(configs);
      const locationPresetValues = deps.buildLocationPresetValueSet(configs?.location_presets);
      const validationResult = deps.normalizeCategoryMetaFeedFilters(
        req.query.categoryMetaScope,
        req.query.categoryMetaFilters,
        configuredSchemas,
        locationPresetValues,
      );

      if (validationResult.errors.length > 0) {
        return res.status(400).json({ error: validationResult.errors[0], details: validationResult.errors });
      }
      normalizedCategoryMetaFilters = validationResult.filters;
    }

    const loadFeedResult = () => listHomeFeed({
      deps,
      feedKind,
      categorySlug,
      currentUserId,
      currentUserRole,
      limit,
      cursor,
      categoryMetaFilters: normalizedCategoryMetaFilters,
    });

    const loadResult = () => deps.runPublicFeedRead(() => measureFeedStep({
      name: 'home-feed.load',
      requestId: req.requestId,
      kind: feedKind,
      limit,
    }, () => loadFeedResult()
      .then((feedResult) => {
        const safePosts = feedResult.items.map((post: any) => deps.PostService.maskContact(post, currentUserId, currentUserRole));
        return { ...feedResult, items: safePosts };
      })));

    const publicCacheKey = feedKind !== 'following'
      ? deps.getPublicFeedResultCacheKey(req, 'home-feed', { currentUserId, limit, cursor })
      : null;
    const recommendedPostsFallbackKey = feedKind === 'recommended' && publicCacheKey
      ? deps.buildPublicFeedCacheKey('posts', { limit, cursor })
      : null;
    const cachedResult = deps.getPublicFeedResultCache(publicCacheKey);
    if (cachedResult) {
      if (cachedResult.cacheState === 'STALE') {
        deps.refreshPublicFeedResultCache(publicCacheKey, loadResult);
      }
      return deps.sendPublicFeedCachedResult(res, cachedResult, currentUserId, 12);
    }

    const inflightResult = deps.getPublicFeedInflight(publicCacheKey);
    if (inflightResult) {
      const result = await deps.withTimeout(inflightResult, deps.PUBLIC_FEED_RESPONSE_BUDGET_MS);
      if (result) return deps.sendPublicFeedResult(res, result, currentUserId, 12, 'WAIT');
      const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey) ||
        deps.getPublicFeedFallbackCache(recommendedPostsFallbackKey);
      if (fallbackResult) return deps.sendPublicFeedCachedResult(res, fallbackResult, currentUserId, 12);
      const waitedResult = await inflightResult;
      return deps.sendPublicFeedResult(res, waitedResult, currentUserId, 12, 'WAIT');
    }

    let result: PublicFeedResultPayload;
    try {
      const resultPromise = loadResult();
      deps.setPublicFeedInflight(publicCacheKey, resultPromise);
      const budgetResult = await deps.withTimeout(resultPromise, deps.PUBLIC_FEED_RESPONSE_BUDGET_MS);
      if (!budgetResult) {
        const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey) ||
          deps.getPublicFeedFallbackCache(recommendedPostsFallbackKey);
        if (fallbackResult) return deps.sendPublicFeedCachedResult(res, fallbackResult, currentUserId, 12);
        result = await resultPromise;
      } else {
        result = budgetResult;
      }
      deps.setPublicFeedResultCache(publicCacheKey, result, result.items);
    } catch (error) {
      if (deps.isDatabaseUnavailableError(error)) {
        return deps.sendDatabaseUnavailable(res, '加载首页内容');
      }
      console.error('[home-feed] Failed to fetch home feed', error);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }

    deps.setPaginationHeaders(res, result);
    if (feedKind === 'following') {
      deps.setListCacheHeaders(res, currentUserId, 10);
    } else {
      deps.setPublicFeedListCacheHeaders(res, currentUserId, 12);
    }

    res.setHeader('X-Feed-Result-Cache', publicCacheKey ? 'MISS' : 'BYPASS');
    res.setHeader('X-Feed-Cache-Version', String(deps.getPublicFeedCacheVersion()));
    return res.json(result.items);
  }));
}

export const feedRouteModule: RouteModule<FeedRoutesDeps> = {
  name: 'feed',
  register: registerFeedRoutes,
};
