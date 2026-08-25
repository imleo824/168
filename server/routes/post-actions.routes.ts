import type { Express, Request } from 'express';
import { likeLimiter, shareLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import {
  decrementNormalLikeAggregate,
  decrementNormalQuoteAggregate,
  incrementNormalLikeAggregate,
  incrementNormalQuoteAggregate,
} from '../services/post/trusted-engagement-aggregate';

type AccessiblePostMeta = {
  id: string;
};

type QuoteCountPostState = {
  quotedPostId?: string | null;
  isPublished?: boolean | null;
  deletedAt?: Date | string | null;
};

export type PostActionsRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  resolveAccessiblePostMeta: (postId: string, viewerId?: string, viewerRole?: string) => Promise<AccessiblePostMeta | null>;
  getCurrentUserId: (req: Request) => string | null;
  getShareActorKey: (req: Request, currentUserId?: string | null) => string;
  getViewFingerprint: (req: Request) => string;
  shouldCountQuotePost: (post?: QuoteCountPostState | null) => boolean;
  adjustPostQuoteCount: (tx: any, quotedPostId: string | null | undefined, delta: number, actorUserId?: string | null) => Promise<void>;
  markInteractionDataChanged: (userIds?: string | null | Array<string | null | undefined>) => void;
  markContentDataChanged: () => void;
  markPromotionDataChanged: () => void;
};

export function registerPostActionsRoutes(app: Express, deps: PostActionsRoutesDeps) {
  app.post('/api/posts/:id/like', likeLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { id: postId } = req.params;
    const userId = req.user.id;
    const accessiblePost = await deps.resolveAccessiblePostMeta(postId, userId, req.user.role);
    if (!accessiblePost) {
      return res.status(404).json({ error: '帖子不存在或已删除' });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database is not configured' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const [existing, currentPost, actor] = await Promise.all([
        tx.like.findUnique({
          where: { userId_postId: { userId, postId } },
        }),
        tx.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        }),
        tx.user.findUnique({
          where: { id: userId },
          select: { userType: true },
        }),
      ]);
      const isTrustedNormalUser = actor?.userType === 'NORMAL';
      const currentLikeCount = currentPost?.likeCount || 0;

      if (existing) {
        const deleted = await tx.like.deleteMany({
          where: { userId, postId },
        });
        if (deleted.count > 0 && currentLikeCount > 0) {
          await tx.post.update({
            where: { id: postId },
            data: { likeCount: { decrement: 1 } },
          });
        }
        if (deleted.count > 0 && isTrustedNormalUser) {
          await decrementNormalLikeAggregate(postId, tx);
        }
        const latest = await tx.post.findUnique({ where: { id: postId }, select: { likeCount: true } });
        const likeCount = latest?.likeCount || 0;
        return { liked: false, likeCount, trusted: isTrustedNormalUser && deleted.count > 0 };
      }

      const created = await tx.like.createMany({
        data: [{
          userId,
          postId,
        }],
        skipDuplicates: true,
      });
      if (created.count === 0) {
        const latest = await tx.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: latest?.likeCount || 0, trusted: false };
      }
      const latest = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      if (isTrustedNormalUser) {
        await incrementNormalLikeAggregate(postId, tx);
      }
      const likeCount = latest?.likeCount || 0;
      return { liked: true, likeCount, trusted: isTrustedNormalUser };
    });

    deps.markInteractionDataChanged(userId);
    if (result.trusted) {
      PostService.schedulePostRankingRefresh(postId);
    }
    if (result.liked && result.trusted) {
      await PostService.bumpOnInteraction(postId, { cooldownMs: 15 * 60 * 1000 });
    }
    const views = result.liked
      ? await PostService.recordViews([postId], {
        userId,
        fingerprint: deps.getViewFingerprint(req),
        source: 'like',
      })
      : {};

    return res.json({
      success: true,
      liked: result.liked,
      likeCount: result.likeCount,
      ...(typeof views[postId] === 'number' ? { viewCount: views[postId] } : {}),
    });
  }));

  app.post('/api/posts/:id/recommendation-feedback', likeLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { id: postId } = req.params;
    if (!deps.POST_ID_PATTERN.test(postId)) {
      return res.status(404).json({ error: '帖子不存在或已删除' });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database is not configured' });
    }

    const result = await PostService.reduceRecommendationForPost(req.user.id, postId);
    if (!result) {
      return res.status(404).json({ error: '帖子不存在或已删除' });
    }

    deps.markInteractionDataChanged(req.user.id);
    setNoStore(res);
    return res.json({ success: true, ...result });
  }));

  app.post('/api/posts/:id/share', shareLimiter, authMiddleware, catchAsync(async (req, res) => {
    const { id: postId } = req.params;
    if (!deps.POST_ID_PATTERN.test(postId)) {
      return res.status(404).json({ error: 'Post not found' });
    }
    const currentUserId = deps.getCurrentUserId(req);
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Database is not configured' });
    }

    const accessiblePost = await deps.resolveAccessiblePostMeta(postId, currentUserId, req.user?.role);
    if (!accessiblePost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const shareActorKey = deps.getShareActorKey(req, currentUserId);
    const result = await PostService.recordShare(
      accessiblePost.id,
      shareActorKey,
      currentUserId,
    );
    const actor = currentUserId
      ? await prisma.user.findUnique({ where: { id: currentUserId }, select: { userType: true } })
      : null;
    const trusted = actor?.userType === 'NORMAL';

    if (result.counted) {
      deps.markInteractionDataChanged(currentUserId);
      if (trusted) {
        void PostService.bumpOnInteraction(accessiblePost.id, { cooldownMs: 12 * 60 * 1000 })
          .catch((error) => {
            console.error('Failed to bump post after share', error);
          });
      }
    }
    return res.json({
      success: true,
      counted: result.counted,
      shareCount: result.shareCount,
    });
  }));

  app.patch('/api/posts/:id/publish', authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { isPublished } = req.body;
    if (typeof isPublished !== 'boolean') {
      return res.status(400).json({ error: 'isPublished 必须是布尔值' });
    }

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updatedPost = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id: post.id },
        data: { isPublished },
      });

      if (post.quotedPostId && post.deletedAt === null && post.isPublished !== isPublished) {
        await deps.adjustPostQuoteCount(tx, post.quotedPostId, isPublished ? 1 : -1, post.userId);
        const actor = await tx.user.findUnique({ where: { id: post.userId }, select: { userType: true } });
        if (actor?.userType === 'NORMAL') {
          if (isPublished) {
            await incrementNormalQuoteAggregate(post.quotedPostId, tx);
          } else {
            await decrementNormalQuoteAggregate(post.quotedPostId, tx);
          }
        }
      }

      return updated;
    });

    if (post.quotedPostId) PostService.schedulePostRankingRefresh(post.quotedPostId);
    deps.markContentDataChanged();
    return res.json({ success: true, post: updatedPost });
  }));

  app.delete('/api/posts/:id', authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id: post.id },
        data: { deletedAt: new Date() },
      });

      if (deps.shouldCountQuotePost(post)) {
        await deps.adjustPostQuoteCount(tx, post.quotedPostId, -1, post.userId);
        const actor = await tx.user.findUnique({ where: { id: post.userId }, select: { userType: true } });
        if (actor?.userType === 'NORMAL' && post.quotedPostId) {
          await decrementNormalQuoteAggregate(post.quotedPostId, tx);
        }
      }
    });
    if (post.quotedPostId) PostService.schedulePostRankingRefresh(post.quotedPostId);
    deps.markContentDataChanged();
    deps.markPromotionDataChanged();
    return res.json({ success: true });
  }));
}
