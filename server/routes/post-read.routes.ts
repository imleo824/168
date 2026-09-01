import type { Express, Request, Response } from 'express';
import { publicReadLimiter, viewLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setListCacheHeaders, setNoStore, setPrivateCache, setPublicCache } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import { measurePostRouteStep } from '../modules/post';
import {
  getPublicPostDetailCache,
  getPublicPostDetailCacheKey,
  setPublicPostDetailCache,
} from '../public-post-detail-cache';

type PaginationParams = {
  limit: number;
  cursor?: string;
};

type AccessiblePostMeta = {
  id: string;
};

type ViewEventPayload = {
  postId: string;
  dwellMs?: number;
  quickSkip?: boolean;
};

export type PostReadRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  MAX_BULK_VIEW_POST_IDS: number;
  HIDDEN_AUTO_POST_CURATED_SOURCE: string;
  getCurrentUserId: (req: Request) => string | null;
  throwOnInvalidPagination: (req: Request, options?: { maxLimit?: number; defaultLimit?: number }) => PaginationParams;
  setPaginationHeaders: (res: Response, result: { nextCursor: string | null; hasMore: boolean }) => void;
  resolveAccessiblePostMeta: (postId: string, viewerId?: string, viewerRole?: string) => Promise<AccessiblePostMeta | null>;
  getViewFingerprint: (req: Request) => string;
  isDatabaseUnavailableError: (error: unknown) => boolean;
  isDatabaseSchemaDriftError: (error: unknown) => boolean;
  sendDatabaseUnavailable: (res: Response, action: string) => any;
  sendDatabaseSchemaDrift: (res: Response, action: string) => any;
};

export function registerPostReadRoutes(app: Express, deps: PostReadRoutesDeps) {
  app.get('/api/posts/following', authMiddleware, mustAuth, catchAsync(async (req, res) => {
    const currentUserId = (req as any).user.id;
    const currentUserRole = (req as AuthRequest).user?.role;
    const { limit, cursor } = deps.throwOnInvalidPagination(req);
    const result = await PostService.listFollowingPosts(currentUserId, { limit, cursor });
    deps.setPaginationHeaders(res, result);
    setListCacheHeaders(res, currentUserId, 10);
    const safePosts = result.items.map((post) => PostService.maskContact(post, currentUserId, currentUserRole));
    return res.json(safePosts);
  }));

  app.get('/api/posts/:id/quotes', publicReadLimiter, authMiddleware, catchAsync(async (req: any, res) => {
    try {
      if (!deps.POST_ID_PATTERN.test(req.params.id)) {
        return res.status(404).json({ error: 'Post not found' });
      }
      if (!isDbConfigured()) {
        return deps.sendDatabaseUnavailable(res, '加载引用内容');
      }

      const currentUserId = deps.getCurrentUserId(req);
      const currentUserRole = currentUserId ? req.user?.role : undefined;
      const accessiblePost = await deps.resolveAccessiblePostMeta(req.params.id, currentUserId, currentUserRole);
      if (!accessiblePost) return res.status(404).json({ error: 'Post not found' });

      const { limit, cursor } = deps.throwOnInvalidPagination(req, { maxLimit: 30, defaultLimit: 20 });
      const result = await PostService.listPostQuotes(accessiblePost.id, {
        currentUserId,
        currentUserRole,
        limit,
        cursor,
      });

      const safePosts = result.items.map((post: any) => PostService.maskContact(post, currentUserId, currentUserRole));
      deps.setPaginationHeaders(res, result);
      setListCacheHeaders(res, currentUserId, 15);
      return res.json(safePosts);
    } catch (error) {
      if (deps.isDatabaseUnavailableError(error)) {
        return deps.sendDatabaseUnavailable(res, '加载引用内容');
      }
      if (deps.isDatabaseSchemaDriftError(error)) {
        return deps.sendDatabaseSchemaDrift(res, '加载引用内容');
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch post quotes' });
    }
  }));

  app.get('/api/posts/:id/likes', publicReadLimiter, authMiddleware, catchAsync(async (req: any, res) => {
    try {
      if (!deps.POST_ID_PATTERN.test(req.params.id)) {
        return res.status(404).json({ error: 'Post not found' });
      }
      if (!isDbConfigured()) {
        return deps.sendDatabaseUnavailable(res, '加载点赞用户');
      }

      const currentUserId = deps.getCurrentUserId(req);
      const currentUserRole = currentUserId ? req.user?.role : undefined;
      const accessiblePost = await deps.resolveAccessiblePostMeta(req.params.id, currentUserId, currentUserRole);
      if (!accessiblePost) return res.status(404).json({ error: 'Post not found' });

      const { limit } = deps.throwOnInvalidPagination(req, { maxLimit: 24, defaultLimit: 18 });
      const [total, likes] = await Promise.all([
        prisma.like.count({ where: { postId: accessiblePost.id } }),
        prisma.like.findMany({
          where: { postId: accessiblePost.id },
          orderBy: [{ createdAt: 'desc' }, { userId: 'asc' }],
          take: limit,
          select: {
            user: {
              select: {
                id: true,
                displayName: true,
                loginAccount: true,
                photoUrl: true,
                userType: true,
              },
            },
          },
        }),
      ]);

      if (currentUserId) {
        setPrivateCache(res, 15, 30, 15);
      } else {
        setPublicCache(res, 15, 60, 30);
      }

      return res.json({
        total,
        items: likes
          .map((like) => like.user)
          .filter(Boolean)
          .map((user) => ({
            id: user.id,
            displayName: user.displayName,
            username: user.loginAccount,
            photoUrl: user.photoUrl,
            userType: user.userType,
          })),
      });
    } catch (error) {
      if (deps.isDatabaseUnavailableError(error)) {
        return deps.sendDatabaseUnavailable(res, '加载点赞用户');
      }
      if (deps.isDatabaseSchemaDriftError(error)) {
        return deps.sendDatabaseSchemaDrift(res, '加载点赞用户');
      }
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch post likes' });
    }
  }));

  app.get('/api/posts/:id', publicReadLimiter, authMiddleware, catchAsync(async (req: any, res) => {
    try {
      if (!deps.POST_ID_PATTERN.test(req.params.id)) {
        return res.status(404).json({ error: 'Post not found' });
      }
      const currentUserId = deps.getCurrentUserId(req);
      const currentUserRole = currentUserId ? req.user?.role : undefined;
      const publicCacheKey = getPublicPostDetailCacheKey(req, req.params.id, currentUserId);
      const cachedPost = getPublicPostDetailCache(publicCacheKey);
      if (cachedPost) {
        setListCacheHeaders(res, currentUserId, 20);
        res.setHeader('X-Post-Detail-Cache', cachedPost.cacheState);
        return res.type('application/json').send(cachedPost.body);
      }

      const post = await measurePostRouteStep({
        name: 'posts.detail',
        requestId: req.requestId,
        postId: req.params.id,
      }, () => PostService.getPost(req.params.id, currentUserId, currentUserRole));
      if (!post) return res.status(404).json({ error: 'Post not found' });

      const finalPost = PostService.maskContact(post, currentUserId, currentUserRole);
      setPublicPostDetailCache(publicCacheKey, finalPost);
      setListCacheHeaders(res, currentUserId, 20);
      res.setHeader('X-Post-Detail-Cache', publicCacheKey ? 'MISS' : 'BYPASS');
      res.json(finalPost);
    } catch (error) {
      if (deps.isDatabaseUnavailableError(error)) {
        return deps.sendDatabaseUnavailable(res, '加载帖子详情');
      }
      if (deps.isDatabaseSchemaDriftError(error)) {
        return deps.sendDatabaseSchemaDrift(res, '加载帖子详情');
      }
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch post detail' });
    }
  }));

  app.post('/api/posts/views', viewLimiter, authMiddleware, catchAsync(async (req: any, res) => {
    const rawPostIds = Array.isArray(req.body?.postIds) ? req.body.postIds : [];
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    const viewEvents = new Map<string, ViewEventPayload>();
    rawPostIds.forEach((id: unknown) => {
      const postId = typeof id === 'string' ? id.trim() : '';
      if (deps.POST_ID_PATTERN.test(postId)) viewEvents.set(postId, { postId });
    });
    rawEvents.forEach((event: any) => {
      const postId = typeof event?.postId === 'string' ? event.postId.trim() : '';
      if (!deps.POST_ID_PATTERN.test(postId)) return;
      const current: ViewEventPayload = viewEvents.get(postId) || { postId };
      const dwellMs = Math.max(Number(current.dwellMs || 0), Number(event?.dwellMs || 0));
      viewEvents.set(postId, {
        postId,
        dwellMs: Number.isFinite(dwellMs) ? Math.min(120_000, Math.max(0, Math.floor(Number(dwellMs)))) : 0,
        quickSkip: Boolean(current.quickSkip || event?.quickSkip),
      });
    });
    const viewInputs = Array.from(viewEvents.values()).slice(0, deps.MAX_BULK_VIEW_POST_IDS);
    const postIds = viewInputs.map((event) => event.postId);

    if (!postIds.length) {
      setNoStore(res);
      return res.json({ success: true, views: {} });
    }

    const visiblePosts = await prisma.post.findMany({
      where: {
        id: { in: postIds },
        deletedAt: null,
        isPublished: true,
      },
      select: { id: true },
    });

    const currentUserId = deps.getCurrentUserId(req);
    const views = await PostService.recordViews(
      visiblePosts.map((post) => viewEvents.get(post.id) || post.id),
      {
        userId: currentUserId,
        fingerprint: deps.getViewFingerprint(req),
        source: 'feed',
      },
    );

    setNoStore(res);
    return res.json({ success: true, views });
  }));
}
