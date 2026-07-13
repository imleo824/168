import type { Express } from 'express';

import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import {
  getAutoLikeConfig,
  getAutoLikeStats,
  listAutoLikeRuns,
  updateAutoLikeConfig,
  type AutoLikeRunStatus,
} from '../services/auto-like.service';
import { runObservedAutoLike } from '../services/interaction-observed-runner.service';

const RUN_STATUSES = new Set(['SUCCEEDED', 'SKIPPED', 'FAILED']);

function parseStatus(raw: unknown) {
  const status = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!status) return null;
  return RUN_STATUSES.has(status) ? status as AutoLikeRunStatus : undefined;
}

function parseForce(raw: unknown) {
  return ['true', '1', 'yes', 'on'].includes(String(raw ?? '').trim().toLowerCase());
}

export function registerAdminAutoLikeRoutes(app: Express) {
  app.get('/api/admin/auto-like/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutoLikeConfig());
  }));

  app.get('/api/admin/auto-like/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutoLikeStats());
  }));

  app.get('/api/admin/auto-like/runs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const status = parseStatus(req.query.status);
    if (status === undefined) return res.status(400).json({ error: 'status 参数不合法' });
    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const result = await listAutoLikeRuns({
      status: status || undefined,
      limit,
      cursor,
    });
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));

  app.patch('/api/admin/auto-like/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return res.json(await updateAutoLikeConfig(req.body || {}));
  }));

  app.post('/api/admin/auto-like/run-now', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return res.json(await runObservedAutoLike({
      trigger: 'MANUAL',
      force: parseForce(req.query.force ?? req.body?.force),
      reason: 'manual_run_now',
    }));
  }));
}
