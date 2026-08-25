import type { Express, Request } from 'express';
import { postLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { ConfigService } from '../config.service';
import { isActiveTuiPlusUser } from '../services/tui-plus.service';

export type TelegramSyncStatuses = {
  NONE: string;
  PENDING: string;
  SENT: string;
  FAILED: string;
};

export type PostTelegramSyncRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  statuses: TelegramSyncStatuses;
  normalizeTelegramSyncStatus: (value: unknown) => string;
  getTelegramBotToken: (configs?: any) => string;
  resolveTelegramChannelChatId: (configs: any) => string;
  evaluateTelegramSyncRule: (postLike: { content?: string | null; images?: string[] | null }, configs: any) => { allowed: boolean };
  resolveTelegramSyncCost: (configs: any) => number;
  isTelegramSyncPostSendChargeError: (error: unknown) => boolean;
  markTelegramSyncSentWithCharge: (job: any, options?: { allowFailedStatus?: boolean }) => Promise<void>;
  resolvePublicOriginFromContext: (context?: Request | string) => string;
  scheduleTelegramChannelSync: (params: any) => Promise<{ queued: boolean; reason?: string }>;
  markTelegramSyncFailed: (postId: string, error: unknown) => Promise<void>;
  sendDatabaseUnavailable: (res: any, action: string) => any;
};

export function registerPostTelegramSyncRoutes(app: Express, deps: PostTelegramSyncRoutesDeps) {
  app.post('/api/posts/:id/telegram-sync', postLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { id: postId } = req.params;
    const {
      NONE: TELEGRAM_SYNC_STATUS_NONE,
      PENDING: TELEGRAM_SYNC_STATUS_PENDING,
      SENT: TELEGRAM_SYNC_STATUS_SENT,
      FAILED: TELEGRAM_SYNC_STATUS_FAILED,
    } = deps.statuses;

    if (!deps.POST_ID_PATTERN.test(postId)) {
      return res.status(404).json({ error: '帖子不存在或已删除' });
    }
    if (!isDbConfigured()) {
      return deps.sendDatabaseUnavailable(res, '同步到频道');
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      include: {
        category: true,
        user: { select: { id: true, displayName: true } },
      },
    });

    if (!post) {
      return res.status(404).json({ error: '帖子不存在或已删除' });
    }
    if (post.userId !== req.user.id) {
      return res.status(403).json({ error: '只能同步自己的帖子' });
    }

    const currentStatus = deps.normalizeTelegramSyncStatus((post as any).telegramSyncStatus);
    if (currentStatus === TELEGRAM_SYNC_STATUS_SENT || (currentStatus === TELEGRAM_SYNC_STATUS_NONE && (post as any).syncToTelegram === true)) {
      return res.status(409).json({ error: '该帖子已同步过' });
    }

    const config = await ConfigService.getConfigs({ bypassCache: true });
    const telegramToken = deps.getTelegramBotToken(config);
    const telegramChatId = deps.resolveTelegramChannelChatId(config);
    if (!telegramToken || !telegramChatId) {
      return res.status(503).json({ error: '频道同步暂未配置，请稍后重试' });
    }

    const telegramSyncRule = deps.evaluateTelegramSyncRule({ content: post.content, images: post.images }, config);
    if (!telegramSyncRule.allowed) {
      return res.status(400).json({ error: '该帖子暂不符合频道同步规则' });
    }

    const isTuiPlusMember = await isActiveTuiPlusUser(req.user.id);
    const telegramSyncCost = isTuiPlusMember ? 0 : deps.resolveTelegramSyncCost(config);
    if (!isTuiPlusMember && telegramSyncCost > 0) {
      const owner = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { points: true },
      });
      if (!owner || (owner.points || 0) < telegramSyncCost) {
        return res.status(400).json({ error: `积分不足，频道同步扣费失败，需 ${telegramSyncCost} 积分` });
      }
    }

    if (currentStatus === TELEGRAM_SYNC_STATUS_PENDING) {
      const scheduled = await deps.scheduleTelegramChannelSync({
        req,
        post,
        authorName: post.user?.displayName || req.user?.displayName || null,
        configs: config,
        telegramSyncCost,
      });
      if (!scheduled.queued) {
        await deps.markTelegramSyncFailed(post.id, new Error(scheduled.reason || 'telegram_sync_queue_failed'));
        return res.status(503).json({ error: '同步提交失败，请稍后重试' });
      }
      setNoStore(res);
      return res.json({
        success: true,
        postId: post.id,
        telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING,
        telegramSyncedAt: (post as any).telegramSyncedAt ?? null,
        telegramSyncCost,
        isTuiPlusMember,
      });
    }

    if (currentStatus === TELEGRAM_SYNC_STATUS_FAILED && deps.isTelegramSyncPostSendChargeError((post as any).telegramSyncLastError)) {
      try {
        await deps.markTelegramSyncSentWithCharge({
          origin: deps.resolvePublicOriginFromContext(req),
          post,
          authorName: post.user?.displayName || req.user?.displayName || null,
          postId: post.id,
          telegramSyncCost,
        }, { allowFailedStatus: true });
        const repairedPost = await prisma.post.findUnique({
          where: { id: post.id },
          select: { telegramSyncedAt: true } as any,
        });
        setNoStore(res);
        return res.json({
          success: true,
          postId: post.id,
          telegramSyncStatus: TELEGRAM_SYNC_STATUS_SENT,
          telegramSyncedAt: (repairedPost as any)?.telegramSyncedAt ?? null,
          telegramSyncCost,
        });
      } catch (repairError: any) {
        console.warn('[telegram-sync] charge repair failed:', {
          postId: post.id,
          reason: repairError?.message || repairError,
        });
        return res.status(503).json({ error: repairError?.message || '同步扣费修复失败，请稍后重试' });
      }
    }

    const now = new Date();
    const updated = await prisma.post.updateMany({
      where: {
        id: post.id,
        userId: req.user.id,
        telegramSyncStatus: { in: [TELEGRAM_SYNC_STATUS_NONE, TELEGRAM_SYNC_STATUS_FAILED] as any },
      } as any,
      data: {
        telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING as any,
        telegramSyncRequestedAt: now,
        telegramSyncLastError: null,
        syncToTelegram: false,
      } as any,
    });

    if (updated.count === 0) {
      const latest = await prisma.post.findUnique({
        where: { id: post.id },
        select: { telegramSyncStatus: true, telegramSyncedAt: true } as any,
      });
      const latestStatus = deps.normalizeTelegramSyncStatus((latest as any)?.telegramSyncStatus);
      if (latestStatus === TELEGRAM_SYNC_STATUS_SENT) return res.status(409).json({ error: '该帖子已同步过' });
      if (latestStatus === TELEGRAM_SYNC_STATUS_PENDING) {
        setNoStore(res);
        return res.json({
          success: true,
          postId: post.id,
          telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING,
          telegramSyncedAt: (latest as any)?.telegramSyncedAt ?? null,
        });
      }
      return res.status(409).json({ error: '同步状态已变化，请刷新后重试' });
    }

    const queuedPost = {
      ...post,
      telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING,
      telegramSyncRequestedAt: now,
      telegramSyncLastError: null as string | null,
      syncToTelegram: false,
    };
    const scheduled = await deps.scheduleTelegramChannelSync({
      req,
      post: queuedPost,
      authorName: post.user?.displayName || req.user?.displayName || null,
      configs: config,
      telegramSyncCost,
    });

    if (!scheduled.queued) {
      await deps.markTelegramSyncFailed(post.id, new Error(scheduled.reason || 'telegram_sync_queue_failed'));
      return res.status(503).json({ error: '同步提交失败，请稍后重试' });
    }

    setNoStore(res);
    return res.json({
      success: true,
      postId: post.id,
      telegramSyncStatus: TELEGRAM_SYNC_STATUS_PENDING,
      telegramSyncedAt: null,
      telegramSyncCost,
      isTuiPlusMember,
    });
  }));
}
