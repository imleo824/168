import crypto from 'node:crypto';
import type { Express } from 'express';
import { UserType } from '@prisma/client';

import { authMiddleware, adminOnly, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { normalizeStringParam as normalizeString } from '../http/params';
import prisma, { isDbConfigured } from '../db';
import {
  deactivateWebPushSubscription,
  getPushStatus,
  getVapidPublicKey,
  hasWebPushConfig,
  queueWebPushDelivery,
  saveWebPushSubscription,
} from '../services/pwa-push.service';
import { startPwaPushExtraEventPoller } from '../services/pwa-push-extra-events.service';
import { createUserNotification } from '../services/user-notification.service';

function normalizeUserIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => normalizeString(item, 128)).filter(Boolean))).slice(0, 5000);
}

function extractSubscription(body: any) {
  const source = body?.subscription && typeof body.subscription === 'object' ? body.subscription : body;
  return {
    endpoint: normalizeString(source?.endpoint, 4096),
    p256dh: normalizeString(source?.keys?.p256dh, 512),
    auth: normalizeString(source?.keys?.auth, 512),
  };
}

function shouldQueuePushAfterStationNotification(result: { created?: boolean; reason?: string } | null | undefined) {
  return Boolean(result?.created || result?.reason === 'duplicate');
}

async function resolveSystemNotificationRecipients(requestedUserIds: string[]) {
  if (requestedUserIds.length > 0) {
    return prisma.user.findMany({
      where: {
        id: { in: requestedUserIds },
        isDisabled: false,
        userType: { not: UserType.ROBOT },
      },
      select: { id: true },
      take: 5000,
      orderBy: { createdAt: 'desc' },
    });
  }
  return prisma.user.findMany({
    where: {
      isDisabled: false,
      userType: { not: UserType.ROBOT },
    },
    select: { id: true },
    take: 5000,
    orderBy: { createdAt: 'desc' },
  });
}

export function registerPushRoutes(app: Express) {
  startPwaPushExtraEventPoller();

  app.get('/api/push/vapid-public-key', (_req, res) => {
    setNoStore(res);
    res.json({ configured: hasWebPushConfig(), publicKey: getVapidPublicKey() });
  });

  app.get('/api/push/status', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) {
      return res.json({ configured: hasWebPushConfig(), vapidPublicKey: getVapidPublicKey(), activeSubscriptionCount: 0, preference: null });
    }
    return res.json(await getPushStatus(req.user.id));
  }));

  app.post('/api/push/subscribe', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    if (!hasWebPushConfig()) return res.status(503).json({ error: '系统推送暂未配置，请稍后再试' });

    const subscription = extractSubscription(req.body);
    if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
      return res.status(400).json({ error: '推送订阅信息不完整' });
    }

    const status = await saveWebPushSubscription({
      userId: req.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      userAgent: req.get('user-agent') || '',
      platform: normalizeString(req.body?.platform, 80),
    });
    return res.status(201).json({ success: true, status });
  }));

  app.post('/api/push/unsubscribe', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const endpoint = normalizeString(req.body?.endpoint, 4096);
    const status = await deactivateWebPushSubscription(req.user.id, endpoint || null);
    return res.json({ success: true, status });
  }));

  app.post('/api/admin/push/system', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const title = normalizeString(req.body?.title, 60) || '推推';
    const body = normalizeString(req.body?.body, 140);
    const targetUrl = normalizeString(req.body?.targetUrl, 512) || '/messages';
    if (!body) return res.status(400).json({ error: '通知内容不能为空' });

    const requestedUserIds = normalizeUserIds(req.body?.userIds);
    const recipients = await resolveSystemNotificationRecipients(requestedUserIds);
    const recipientIds = recipients.map((user) => user.id).filter(Boolean);
    const batchKey = crypto.createHash('sha256').update(`${title}|${body}|${targetUrl}|${Date.now()}`).digest('hex').slice(0, 24);
    const canPush = hasWebPushConfig();

    let stationQueued = 0;
    let stationExisting = 0;
    let stationSkipped = 0;
    let pushQueued = 0;
    let pushSent = 0;
    let pushSkipped = 0;

    for (const userId of recipientIds) {
      const sourceKey = `SYSTEM:${batchKey}:${userId}`;
      const result = await createUserNotification(prisma, {
        receiverId: userId,
        sourceKey,
        type: 'SYSTEM',
        title,
        body,
        targetUrl,
        metadata: { source: 'admin_system_push', batchKey },
      });

      if (result.created) stationQueued += 1;
      else if (result.reason === 'duplicate') stationExisting += 1;
      else stationSkipped += 1;

      if (!canPush || !shouldQueuePushAfterStationNotification(result)) continue;
      const pushResult = await queueWebPushDelivery({
        userId,
        eventKey: `system:${batchKey}:${userId}`,
        type: 'SYSTEM',
        title,
        body,
        targetUrl,
      });
      const pushResultAny = pushResult as any;
      if (pushResult.queued) pushQueued += 1;
      if (Number(pushResultAny.sent || 0) > 0) pushSent += Number(pushResultAny.sent || 0);
      if (!pushResult.queued || pushResultAny.skipped) pushSkipped += 1;
    }

    return res.status(202).json({
      success: true,
      result: {
        stationQueued,
        stationExisting,
        stationSkipped,
        push: {
          queued: pushQueued,
          sent: pushSent,
          skipped: pushSkipped,
          targetUsers: recipientIds.length,
          reason: canPush ? '' : 'missing_web_push_config',
        },
        targetUsers: recipientIds.length,
        skippedInvalidUsers: Math.max(0, requestedUserIds.length - recipientIds.length),
      },
    });
  }));
}
