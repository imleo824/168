import type { Express, Request, Response } from 'express';
import { followLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore, setPrivateCache } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { UserService } from '../user.service';

type PaginationParams = {
  limit: number;
  cursor?: string;
};

export type UserSocialRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  throwOnInvalidPagination: (req: Request, options?: { maxLimit?: number; defaultLimit?: number }) => PaginationParams;
  setPaginationHeaders: (res: Response, result: { nextCursor: string | null; hasMore: boolean }) => void;
  getBlockedUserIds: (currentUserId?: string | null) => Promise<string[]>;
  markInteractionDataChanged: (userIds?: string | null | Array<string | null | undefined>) => void;
  sendDatabaseUnavailable: (res: Response, action: string) => any;
};

export function registerUserSocialRoutes(app: Express, deps: UserSocialRoutesDeps) {
  app.get('/api/me/following', authMiddleware, mustAuth, catchAsync(async (req, res) => {
    setPrivateCache(res, 30, 60, 30);
    if (!isDbConfigured()) {
      deps.setPaginationHeaders(res, { hasMore: false, nextCursor: null });
      return res.json([]);
    }

    const followerId = (req as any).user.id;
    const { limit, cursor } = deps.throwOnInvalidPagination(req, { maxLimit: 80, defaultLimit: 30 });
    let cursorFilter = {};
    if (cursor) {
      const cursorFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId,
            followingId: cursor,
          },
        },
        select: { createdAt: true, followingId: true },
      });
      if (!cursorFollow?.createdAt) {
        return res.status(400).json({ error: 'cursor 无效或已过期' });
      }
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorFollow.createdAt } },
          { createdAt: cursorFollow.createdAt, followingId: { lt: cursorFollow.followingId } },
        ],
      };
    }

    const follows = await prisma.follow.findMany({
      where: {
        followerId,
        ...(cursorFilter as Record<string, unknown>),
      },
      include: {
        following: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true,
            loginAccount: true,
            points: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { followingId: 'desc' }],
      take: limit + 1,
    });
    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;

    deps.setPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.followingId || null : null,
    });
    return res.json(items.map((follow) => ({
      id: follow.following.id,
      displayName: follow.following.displayName,
      photoUrl: follow.following.photoUrl,
      username: follow.following.loginAccount,
      points: follow.following.points,
      createdAt: follow.following.createdAt,
    })));
  }));

  app.get('/api/me/fans', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setPrivateCache(res, 30, 60, 30);
    if (!isDbConfigured()) {
      deps.setPaginationHeaders(res, { hasMore: false, nextCursor: null });
      return res.json([]);
    }

    const followingId = req.user.id;
    const { limit, cursor } = deps.throwOnInvalidPagination(req, { maxLimit: 80, defaultLimit: 30 });
    const blockedIds = await deps.getBlockedUserIds(followingId);
    let cursorFilter = {};
    if (cursor) {
      const cursorFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: cursor,
            followingId,
          },
        },
        select: { createdAt: true, followerId: true },
      });
      if (!cursorFollow?.createdAt) {
        return res.status(400).json({ error: 'cursor 无效或已过期' });
      }
      cursorFilter = {
        OR: [
          { createdAt: { lt: cursorFollow.createdAt } },
          { createdAt: cursorFollow.createdAt, followerId: { lt: cursorFollow.followerId } },
        ],
      };
    }

    const fans = await prisma.follow.findMany({
      where: {
        followingId,
        ...(blockedIds.length > 0 ? { followerId: { notIn: blockedIds } } : {}),
        ...(cursorFilter as Record<string, unknown>),
      },
      include: {
        follower: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true,
            loginAccount: true,
            points: true,
            role: true,
            userType: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
      take: limit + 1,
    });
    const hasMore = fans.length > limit;
    const items = hasMore ? fans.slice(0, limit) : fans;

    deps.setPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.followerId || null : null,
    });
    return res.json(items.map((fan) => ({
      id: fan.follower.id,
      displayName: fan.follower.displayName,
      photoUrl: fan.follower.photoUrl,
      username: fan.follower.loginAccount,
      points: fan.follower.points,
      role: fan.follower.role,
      userType: fan.follower.userType,
      createdAt: fan.follower.createdAt,
    })));
  }));

  app.post('/api/users/:id/follow', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: '不能关注自己' });
    }

    if (!isDbConfigured()) {
      return deps.sendDatabaseUnavailable(res, '关注用户');
    }

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!target) {
      return res.status(404).json({ error: '用户不存在' });
    }

    await UserService.follow(req.user.id, req.params.id);
    deps.markInteractionDataChanged([req.user.id, req.params.id]);
    res.json({ success: true });
  }));

  app.delete('/api/users/:id/follow', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    if (!isDbConfigured()) {
      return deps.sendDatabaseUnavailable(res, '取消关注用户');
    }

    await UserService.unfollow(req.user.id, req.params.id);
    deps.markInteractionDataChanged([req.user.id, req.params.id]);
    res.json({ success: true });
  }));

  app.get('/api/users/:id/follow-status', authMiddleware, catchAsync(async (req: any, res) => {
    setPrivateCache(res, 20, 40, 30);
    if (!req.user || req.user.id === req.params.id) {
      return res.json({ following: false });
    }
    const following = await UserService.isFollowing(req.user.id, req.params.id);
    res.json({ following });
  }));

  app.post('/api/users/:id/block', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { id: blockedId } = req.params;
    const blockerId = req.user.id;

    if (blockerId === blockedId) return res.status(400).json({ error: '不能屏蔽自己' });
    if (!deps.POST_ID_PATTERN.test(blockedId)) return res.status(404).json({ error: '用户不存在' });
    if (!isDbConfigured()) return deps.sendDatabaseUnavailable(res, '屏蔽用户');

    const target = await prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ error: '用户不存在' });

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    deps.markInteractionDataChanged(blockerId);
    setNoStore(res);
    res.json({ success: true, message: '已屏蔽该用户' });
  }));

  app.delete('/api/users/:id/block', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { id: blockedId } = req.params;
    const blockerId = req.user.id;

    if (!isDbConfigured()) return deps.sendDatabaseUnavailable(res, '取消屏蔽用户');

    await prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });

    deps.markInteractionDataChanged(blockerId);
    setNoStore(res);
    res.json({ success: true, message: '已取消屏蔽' });
  }));

  app.get('/api/users/:id/block-status', authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    setNoStore(res);
    const { id: blockedId } = req.params;
    const blockerId = req.user.id;

    if (!isDbConfigured()) return res.json({ blocked: false });

    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    res.json({ blocked: !!block });
  }));
}
