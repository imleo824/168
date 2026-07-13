import {
  buildPublicFeedCacheKey,
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
};

export function startPublicFeedWarmup(deps: PublicFeedWarmupDeps, options: PublicFeedWarmupOptions) {
  let timer: NodeJS.Timeout | null = null;

  const warmOnce = async () => {
    if (!deps.isDbConfigured()) return;

    const warmCategories = (await deps.getCachedCategories())
      .map((category) => (typeof category?.id === 'string' ? category.id : ''))
      .filter(Boolean)
      .slice(0, options.categoryMax);

    for (const limit of options.limits) {
      const postsResult = await deps.PostService.listPosts({ limit });
      const safePosts = postsResult.items.map((post: any) => deps.PostService.maskContact(post, null, null));
      setPublicFeedResultCache(buildPublicFeedCacheKey('posts', { limit }), postsResult, safePosts);
      setPublicFeedResultCache(
        buildPublicFeedCacheKey('home-feed', { feed: 'recommended', limit }),
        postsResult,
        safePosts,
      );

      for (const categoryId of warmCategories) {
        const categoryPostsResult = await deps.PostService.listPosts({ limit, categoryId });
        const safeCategoryPosts = categoryPostsResult.items.map((post: any) => deps.PostService.maskContact(post, null, null));
        setPublicFeedResultCache(buildPublicFeedCacheKey('posts', { limit, categoryId }), categoryPostsResult, safeCategoryPosts);
      }
    }
  };

  const run = async () => {
    try {
      await warmOnce();
    } catch (error) {
      console.warn('Public feed cache warmup failed:', error);
    } finally {
      timer = setTimeout(run, options.intervalMs);
      timer.unref?.();
    }
  };

  timer = setTimeout(run, options.initialDelayMs);
  timer.unref?.();

  return () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
