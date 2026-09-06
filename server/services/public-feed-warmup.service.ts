import {
  buildPublicFeedCacheKey,
  setPublicFeedInflight,
  setPublicFeedResultCache,
  type PublicFeedResultPayload,
} from '../public-feed-cache';

export type PublicFeedWarmupDeps = {
  isDbConfigured: () => boolean;
  getCachedCategories: () => Promise<Array<{ id?: string | null }>>;
  PostService: {
    listPosts: (params: { limit: number; categoryId?: string }) => Promise<PublicFeedResultPayload>;
    maskContact: (post: any, currentUserId?: string | null, currentUserRole?: string | null) => any;
  };
};

export type PublicFeedWarmupOptions = {
  limits: number[];
  categoryMax: number;
  intervalMs: number;
  initialDelayMs: number;
  categoryInitialDelayMs: number;
  categoryStepDelayMs: number;
};

type CategoryWarmTarget = { categoryId: string; limit: number };

export function startPublicFeedWarmup(deps: PublicFeedWarmupDeps, options: PublicFeedWarmupOptions) {
  let stopped = false;
  let recommendedTimer: NodeJS.Timeout | null = null;
  let categoryTimer: NodeJS.Timeout | null = null;
  let categoryQueue: CategoryWarmTarget[] = [];

  const setUnrefTimeout = (callback: () => void, delayMs: number) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  };

  const loadPublicPosts = async (params: { limit: number; categoryId?: string }) => {
    const result = await deps.PostService.listPosts(params);
    const safePosts = result.items.map((post: any) => deps.PostService.maskContact(post, null, null));
    return { result, safePosts };
  };

  const warmRecommendedOnce = async () => {
    if (!deps.isDbConfigured()) return;

    for (const limit of options.limits) {
      // Keep this identical to getPublicFeedResultCacheKey's canonical order:
      // kind -> limit -> tracked query values. The shared in-flight entry also
      // prevents a cold request from launching the same expensive query twice.
      const homeFeedKey = buildPublicFeedCacheKey('home-feed', { limit, feed: 'recommended' });
      const loadPromise = loadPublicPosts({ limit }).then(({ result, safePosts }) => {
        setPublicFeedResultCache(buildPublicFeedCacheKey('posts', { limit }), result, safePosts);
        setPublicFeedResultCache(homeFeedKey, result, safePosts);
        return { ...result, items: safePosts };
      });
      setPublicFeedInflight(homeFeedKey, loadPromise);
      await loadPromise;
    }
  };

  const runRecommended = async () => {
    if (stopped) return;
    try {
      await warmRecommendedOnce();
    } catch (error) {
      console.warn('Public recommended feed cache warmup failed:', error);
    } finally {
      if (!stopped) recommendedTimer = setUnrefTimeout(runRecommended, options.intervalMs);
    }
  };

  const refillCategoryQueue = async () => {
    const categoryIds = (await deps.getCachedCategories())
      .map((category) => (typeof category?.id === 'string' ? category.id : ''))
      .filter(Boolean)
      .slice(0, options.categoryMax);

    categoryQueue = options.limits.flatMap((limit) =>
      categoryIds.map((categoryId) => ({ categoryId, limit })),
    );
  };

  const runNextCategory = async () => {
    if (stopped) return;
    try {
      if (!deps.isDbConfigured()) {
        categoryQueue = [];
      } else if (categoryQueue.length === 0) {
        await refillCategoryQueue();
      }

      const target = categoryQueue.shift();
      if (target) {
        const { result, safePosts } = await loadPublicPosts(target);
        setPublicFeedResultCache(
          buildPublicFeedCacheKey('posts', { limit: target.limit, categoryId: target.categoryId }),
          result,
          safePosts,
        );
      }
    } catch (error) {
      console.warn('Public category feed cache warmup failed:', error);
    } finally {
      if (stopped) return;
      const nextDelay = categoryQueue.length > 0
        ? options.categoryStepDelayMs
        : options.intervalMs;
      categoryTimer = setUnrefTimeout(runNextCategory, nextDelay);
    }
  };

  recommendedTimer = setUnrefTimeout(runRecommended, options.initialDelayMs);
  categoryTimer = setUnrefTimeout(runNextCategory, options.categoryInitialDelayMs);

  return () => {
    stopped = true;
    if (recommendedTimer) clearTimeout(recommendedTimer);
    if (categoryTimer) clearTimeout(categoryTimer);
    recommendedTimer = null;
    categoryTimer = null;
    categoryQueue = [];
  };
}
