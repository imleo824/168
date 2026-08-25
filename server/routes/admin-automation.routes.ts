import type { Express } from 'express';

import { isDbConfigured } from '../db';
import { setNoStore } from '../http-cache';
import { normalizeIntParam } from '../http/params';
import { catchAsync } from '../middlewares/error';
import { adminOnly, authMiddleware, type AuthRequest } from '../middlewares/auth';
import { listAutomationHeartbeats, type AutomationModuleName } from '../services/automation-health.service';
import { forceReleaseAutomationTaskLock } from '../services/automation-task-lock.service';
import {
  getAutomationBatch,
  getAutomationBatchSnapshot,
  startAutomationBatch,
} from '../services/automation/automation-batch.service';
import { getAutomationStatusSnapshot } from '../services/automation/automation-status.service';
import type { AutoPostAfterPostCreated } from '../services/auto-post.service';
import type { QuotePublishAfterPostCreated } from '../services/quote-publish-v5.service';

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

export function registerAdminAutomationRoutes(app: Express, options: {
  afterAutoPostCreated?: AutoPostAfterPostCreated;
  afterQuotePostCreated?: QuotePublishAfterPostCreated;
} = {}) {
  app.get('/api/admin/automation/status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutomationStatusSnapshot());
  }));

  app.post('/api/admin/automation/run-all', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const result = await startAutomationBatch({
      requestedById: req.user?.id || null,
      afterAutoPostCreated: options.afterAutoPostCreated,
      afterQuotePostCreated: options.afterQuotePostCreated,
    });
    return res.status(result.started ? 202 : 200).json({
      ...result,
      batchId: result.batch.id,
    });
  }));

  app.get('/api/admin/automation/batches/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'batch id is required' });
    const batch = await getAutomationBatch(id);
    if (!batch) return res.status(404).json({ error: 'automation batch not found' });
    return res.json(batch);
  }));

  app.get('/api/admin/automation/heartbeats', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const moduleName = parseAutomationModule(req.query.module);
    if (moduleName === null) return res.status(400).json({ error: 'module 参数不合法' });
    const limit = normalizeIntParam(req.query.limit, 50, 1, 100);
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
