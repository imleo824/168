import type { Express } from 'express';

import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { getPlatformAiConfig, updatePlatformAiConfig } from '../services/platform-ai-config.service';

function pickPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  ['enabled', 'provider', 'model', 'baseUrl', 'timeoutMs', 'reviewIntervalMinutes'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
  });
  return patch;
}

export function registerPlatformAiRoutes(app: Express) {
  app.get('/api/admin/platform-ai/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getPlatformAiConfig({ force: true }));
  }));

  app.patch('/api/admin/platform-ai/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    return res.json(await updatePlatformAiConfig(pickPatch(body) as any));
  }));
}
