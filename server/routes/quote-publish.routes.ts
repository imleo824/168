import type { Express, Request } from 'express';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import { registerNotificationRoutes } from './notifications.routes';
import { registerPostCommentRoutes } from './post-comments.routes';
import { registerAdminCommentPublishRoutes } from './admin-comment-publish.routes';
import { registerAdminAutomationRoutes } from './admin-automation.routes';
import {
  getQuotePublishConfig,
  getQuotePublishRunStats,
  getQuotePublishStatus,
  listQuotePublishRuns,
  updateQuotePublishConfig,
  type QuotePublishAfterPostCreated,
  type QuotePublishRunStatus,
} from '../services/quote-publish.service';
import { runObservedQuotePublish } from '../services/interaction-observed-runner.service';

const RUN_STATUSES = new Set(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);

function parseStatus(raw: unknown) {
  const status = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!status) return null;
  return RUN_STATUSES.has(status) ? status as QuotePublishRunStatus : undefined;
}

function parseForce(raw: unknown) {
  return ['true', '1', 'yes', 'on'].includes(String(raw ?? '').trim().toLowerCase());
}

export function registerQuotePublishRoutes(app: Express, options: {
  afterPostCreated?: QuotePublishAfterPostCreated;
} = {}) {
  registerNotificationRoutes(app);
  registerPostCommentRoutes(app);
  registerAdminCommentPublishRoutes(app);
  registerAdminAutomationRoutes(app);

  app.get('/api/admin/quote-publish/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getQuotePublishConfig({ force: true }));
  }));

  app.get('/api/admin/quote-publish/status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getQuotePublishStatus());
  }));

  app.get('/api/admin/quote-publish/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getQuotePublishRunStats());
  }));

  app.get('/api/admin/quote-publish/runs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const status = parseStatus(req.query.status);
    if (status === undefined) return res.status(400).json({ error: 'status 参数不合法' });
    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const result = await listQuotePublishRuns({
      status: status || undefined,
      limit,
      cursor,
    });
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));

  app.patch('/api/admin/quote-publish/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const config = await updateQuotePublishConfig(req.body || {});
    return res.json(config);
  }));

  app.post('/api/admin/quote-publish/run-now', authMiddleware, adminOnly, catchAsync(async (req: Request, res) => {
    setNoStore(res);
    const run = await runObservedQuotePublish({
      trigger: 'MANUAL',
      req,
      afterPostCreated: options.afterPostCreated,
      force: parseForce(req.query.force ?? req.body?.force),
      reason: 'manual_run_now',
    });
    return res.json(run);
  }));
}
