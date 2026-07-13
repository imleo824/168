import type { Express } from 'express';

import { setNoStore } from '../http-cache';
import { catchAsync } from '../middlewares/error';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { listAutomationHeartbeats, type AutomationModuleName } from '../services/automation-health.service';
import { forceReleaseAutomationTaskLock } from '../services/automation-task-lock.service';
import { getAutomationStatusSnapshot } from '../services/automation/automation-status.service';

const AUTOMATION_MODULES = new Set<AutomationModuleName>([
  'auto_like',
  'quote_publish',
  'comment_publish',
  'auto_post',
  'auto_crawl',
  'chat_bot',
]);

function parseAutomationModule(raw: unknown) {
  const value = String(raw || '').trim().toLowerCase().replace(/-/g, '_');
  if (!value) return undefined;
  if (value === 'like') return 'auto_like';
  if (value === 'quote') return 'quote_publish';
  if (value === 'comment') return 'comment_publish';
  if (value === 'post') return 'auto_post';
  if (value === 'crawl') return 'auto_crawl';
  if (value === 'chat') return 'chat_bot';
  return AUTOMATION_MODULES.has(value as AutomationModuleName) ? value as AutomationModuleName : null;
}

function parseHeartbeatLimit(raw: unknown) {
  const value = Number(raw || 50);
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : 50;
}

export function registerAdminAutomationRoutes(app: Express) {
  app.get('/api/admin/automation/status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutomationStatusSnapshot());
  }));

  app.get('/api/admin/automation/heartbeats', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const moduleName = parseAutomationModule(req.query.module);
    if (moduleName === null) return res.status(400).json({ error: 'module 参数不合法' });
    const limit = parseHeartbeatLimit(req.query.limit);
    return res.json(await listAutomationHeartbeats({ module: moduleName, limit }));
  }));

  app.post('/api/admin/automation/locks/:module/release', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const moduleName = parseAutomationModule(req.params.module);
    if (!moduleName) return res.status(400).json({ error: 'module 参数不合法' });
    const released = await forceReleaseAutomationTaskLock(moduleName);
    const status = await getAutomationStatusSnapshot();
    return res.json({ released, module: moduleName, status });
  }));
}
