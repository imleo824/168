import type { Express, Request, Response } from 'express';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setListCacheHeaders, setPrivateCache } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { listLikedPostsForUser } from '../services/user-likes.service';

const HIDDEN_AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content';

type PaginationParams = {
  limit: number;
  cursor?: string;
};

type AccountEngagementRoutesContext = {
  throwOnInvalidPagination: (req: Request, options?: { maxLimit?: number; defaultLimit?: number }) => PaginationParams;
  getBlockedUserIds: (currentUserId?: string | null) => Promise<string[]>;
  setPaginationHeaders: (res: Response, result: { nextCursor: string | null; hasMore: boolean }) => void;
  emptyFeedBadgeCounts: () => any;
  getFeedBadgeCounts: (userId: string, query: Request['query']) => Promise<any>;
};

export function registerAccountEngagementRoutes(app: Express, context: AccountEngagementRoutesContext) {
  const {
    throwOnInvalidPagination,
    getBlockedUserIds,
    setPaginationHeaders,
    emptyFeedBadgeCounts,
    getFeedBadgeCounts,
  } = context;

  app.get('/api/me/likes', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const currentUserId = req.user.id;
    const { limit, cursor } = throwOnInvalidPagination(req);
    const blockedIds = await getBlockedUserIds(currentUserId);
    let page;
    try {
      page = await listLikedPostsForUser({
        currentUserId,
        currentUserRole: req.user.role,
        limit,
        cursor,
        blockedUserIds: blockedIds,
      });
    } catch (error: any) {
      if (error?.statusCode === 400) return res.status(400).json({ error: error.message || '请求参数不正确' });
      throw error;
    }

    setPaginationHeaders(res, {
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
    setListCacheHeaders(res, currentUserId, 15);
    res.json(page.items);
  }));

  app.get('/api/me/comments', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const currentUserId = req.user.id;
    const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 50, defaultLimit: 30 });
    if (!isDbConfigured()) {
      setPaginationHeaders(res, { hasMore: false, nextCursor: null });
      return res.json([]);
    }

    const blockedIds = await getBlockedUserIds(currentUserId);
    const comments = await prisma.postComment.findMany({
      where: {
        userId: currentUserId,
        deletedAt: null,
        status: 'VISIBLE',
        post: {
          deletedAt: null,
          isPublished: true,
          ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}),
          NOT: {
            source: HIDDEN_AUTO_POST_CURATED_SOURCE,
            user: { is: { userType: 'ROBOT' as const } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        postId: true,
        userId: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            images: true,
            createdAt: true,
            userId: true,
            user: { select: { id: true, displayName: true, photoUrl: true, userType: true } },
          },
        },
      },
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    setPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
    });
    setListCacheHeaders(res, currentUserId, 15);
    return res.json(items);
  }));

  app.get('/api/notifications/feed-counts', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setPrivateCache(res, 10, 20, 10);
    if (!isDbConfigured()) return res.json(emptyFeedBadgeCounts());

    const feedCounts = await getFeedBadgeCounts(req.user.id, req.query);
    return res.json(feedCounts);
  }));

  app.get('/api/notifications/home-summary', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setPrivateCache(res, 10, 20, 10);
    if (!isDbConfigured()) {
      return res.json({
        followStatus: { hasNew: false },
        feedCounts: emptyFeedBadgeCounts(),
      });
    }

    const feedCounts = await getFeedBadgeCounts(req.user.id, req.query);
    return res.json({
      followStatus: { hasNew: feedCounts.following.count > 0 },
      feedCounts,
    });
  }));
}
