import type { Express, Request, Response } from 'express';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setListCacheHeaders, setPrivateCache } from '../http-cache';
import { isDbConfigured } from '../db';
import { listLikedPostsForUser } from '../services/user-likes.service';
import { listCommentsForUser } from '../services/user-comments.service';

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
    return res.json(page.items);
  }));

  app.get('/api/me/comments', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const currentUserId = req.user.id;
    const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 50, defaultLimit: 30 });
    if (!isDbConfigured()) {
      setPaginationHeaders(res, { hasMore: false, nextCursor: null });
      return res.json([]);
    }

    const blockedIds = await getBlockedUserIds(currentUserId);
    const page = await listCommentsForUser({ userId: currentUserId, blockedUserIds: blockedIds, limit, cursor });
    setPaginationHeaders(res, {
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
    setListCacheHeaders(res, currentUserId, 15);
    return res.json(page.items);
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
