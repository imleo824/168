import type { Express, Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import type { PostCategoryMetaFilter } from '../post.service';
import type { PublishCategoryMetaConfig } from '../config.service';
import type { PublicFeedCachedPayload, PublicFeedResultPayload } from '../public-feed-cache';
import { measurePostRouteStep } from '../modules/post';
import { listTagFeedPosts } from '../services/tag-feed-search.service';
import type { RouteModule } from './route-module';

type PaginationResult = {
  limit: number;
  cursor?: string | null;
};

export type PostRoutesDeps = {
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
  runPublicFeedRead: <T>(task: () => Promise<T>) => Promise<T>;
  getPublicFeedResultCacheKey: (req: Request, scope: string, params: Record<string, unknown>) => string | null;
  getPublicFeedResultCache: (key: string | null) => PublicFeedCachedPayload | null;
  refreshPublicFeedResultCache: (key: string | null, loader: () => Promise<PublicFeedResultPayload>) => void;
  getPublicFeedInflight: (key: string | null) => Promise<PublicFeedResultPayload> | null;
  getPublicFeedFallbackCache: (key: string | null) => PublicFeedCachedPayload | null;
  setPublicFeedInflight: (key: string | null, promise: Promise<PublicFeedResultPayload>) => void;
  setPublicFeedResultCache: (key: string | null, result: PublicFeedResultPayload, items: any[]) => void;
  withTimeout: <T>(promise: Promise<T>, budgetMs: number) => Promise<T | null>;
  sendPublicFeedCachedResult: (res: Response, cachedResult: PublicFeedCachedPayload, currentUserId: string | null, ttlSeconds: number) => any;
  sendPublicFeedResult: (res: Response, result: PublicFeedResultPayload, currentUserId: string | null, ttlSeconds: number, cacheState: string) => any;
  isHttpError: (error: unknown) => error is { statusCode: number; message: string };
  isDatabaseUnavailableError: (error: unknown) => boolean;
  PUBLIC_FEED_DEFAULT_LIMIT: number;
  PUBLIC_FEED_MAX_LIMIT: number;
  PUBLIC_FEED_RESPONSE_BUDGET_MS: number;
};

export function registerPostRoutes(app: Express, deps: PostRoutesDeps) {
  app.get('/api/posts', deps.publicReadLimiter, deps.authMiddleware, deps.catchAsync(async (req: AuthRequest, res: Response) => {
    if (!deps.isDbConfigured()) {
      return deps.sendDatabaseUnavailable(res, '加载首页内容');
    }

    const { categoryId, userId, location, country, query, tag, quotedOnly, categoryMetaScope, categoryMetaFilters } = req.query;
    const currentUserId = deps.getCurrentUserId(req);
    const currentUserRole = req.user?.role;
    const { limit, cursor } = deps.throwOnInvalidPagination(req, {
      defaultLimit: deps.PUBLIC_FEED_DEFAULT_LIMIT,
      maxLimit: deps.PUBLIC_FEED_MAX_LIMIT,
    });

    let normalizedCategoryMetaFilters: PostCategoryMetaFilter[] = [];
    if (!tag && (categoryMetaScope || categoryMetaFilters)) {
      const configs = await deps.getConfigs();
      const configuredSchemas = Array.isArray(configs?.publish_category_schema)
        ? configs.publish_category_schema as PublishCategoryMetaConfig[]
        : [];
      const locationPresetValues = deps.buildLocationPresetValueSet(configs?.location_presets);
      const validationResult = deps.normalizeCategoryMetaFeedFilters(
        categoryMetaScope,
        categoryMetaFilters,
        configuredSchemas,
        locationPresetValues,
      );

      if (validationResult.errors.length > 0) {
        return res.status(400).json({ error: validationResult.errors[0], details: validationResult.errors });
      }
      normalizedCategoryMetaFilters = validationResult.filters;
    }

    const publicCacheKey = tag
      ? deps.getPublicFeedResultCacheKey(req, 'posts-tag', { currentUserId, limit, cursor, tag: String(tag) })
      : deps.getPublicFeedResultCacheKey(req, 'posts', { currentUserId, limit, cursor });
    const loadResult = () => deps.runPublicFeedRead(() => measurePostRouteStep({
      name: tag ? 'posts.tag-list' : 'posts.list',
      requestId: req.requestId,
      limit,
    }, () => {
      const resultPromise = tag
        ? listTagFeedPosts({ tag, currentUserId, limit, cursor })
        : deps.PostService.listPosts({
            categoryId: categoryId as string,
            userId: userId as string,
            currentUserId,
            currentUserRole,
            limit,
            cursor,
            location: location as string,
            country: country as string,
            query: query as string,
            quotedOnly: quotedOnly === 'true',
            categoryMetaFilters: normalizedCategoryMetaFilters,
          });

      return resultPromise.then((result) => {
        const safePosts = result.items.map((post: any) => deps.PostService.maskContact(post, currentUserId, currentUserRole));
        return { ...result, items: safePosts };
      });
    }));

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
      const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey);
      if (fallbackResult) return deps.sendPublicFeedCachedResult(res, fallbackResult, currentUserId, 12);
      const waitedResult = await inflightResult;
      return deps.sendPublicFeedResult(res, waitedResult, currentUserId, 12, 'WAIT');
    }

    try {
      const resultPromise = loadResult();
      deps.setPublicFeedInflight(publicCacheKey, resultPromise);
      const result = await deps.withTimeout(resultPromise, deps.PUBLIC_FEED_RESPONSE_BUDGET_MS);
      if (!result) {
        const fallbackResult = deps.getPublicFeedFallbackCache(publicCacheKey);
        if (fallbackResult) return deps.sendPublicFeedCachedResult(res, fallbackResult, currentUserId, 12);
        const waitedResult = await resultPromise;
        deps.setPublicFeedResultCache(publicCacheKey, waitedResult, waitedResult.items);
        return deps.sendPublicFeedResult(res, waitedResult, currentUserId, 12, publicCacheKey ? 'MISS' : 'BYPASS');
      }

      deps.setPublicFeedResultCache(publicCacheKey, result, result.items);
      return deps.sendPublicFeedResult(res, result, currentUserId, 12, publicCacheKey ? 'MISS' : 'BYPASS');
    } catch (error) {
      if (deps.isHttpError(error)) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      if (deps.isDatabaseUnavailableError(error)) {
        return deps.sendDatabaseUnavailable(res, '加载首页内容');
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }
  }));
}

export const postRouteModule: RouteModule<PostRoutesDeps> = {
  name: 'post',
  register: registerPostRoutes,
};
