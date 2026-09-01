import type { Express } from 'express';

import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { isDbConfigured } from '../db';
import {
  getNotificationPreference,
  updateNotificationPreference,
} from '../services/pwa-push.service';

const PREFERENCE_KEYS = [
  'pushEnabled',
  'followEnabled',
  'commentEnabled',
  'quoteEnabled',
  'likeEnabled',
  'systemEnabled',
  'rechargeEnabled',
  'promotionEnabled',
] as const;

function normalizePreferencePatch(body: Record<string, unknown>) {
  const patch: Record<string, boolean> = {};
  for (const key of PREFERENCE_KEYS) {
    if (typeof body?.[key] === 'boolean') patch[key] = body[key] as boolean;
  }
  return patch;
}

export function registerNotificationPreferenceRoutes(app: Express) {
  app.get('/api/notification-preferences', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    return res.json(await getNotificationPreference(req.user.id));
  }));

  app.patch('/api/notification-preferences', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const patch = normalizePreferencePatch(req.body || {});
    return res.json(await updateNotificationPreference(req.user.id, patch));
  }));
}
