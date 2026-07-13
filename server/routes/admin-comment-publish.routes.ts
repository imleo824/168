import type { Express } from 'express';

import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import {
  getCommentPublishConfig,
  getCommentPublishRunStats,
  getCommentPublishStatus,
  listCommentPublishRuns,
  updateCommentPublishConfig,
  type CommentPublishRunStatus,
} from '../services/comment-publish.service';
import { runObservedCommentPublish } from '../services/interaction-observed-runner.service';

const RUN_STATUSES = new Set(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);

function parseStatus(raw: unknown) {
  const status = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!status) return null;
  return RUN_STATUSES.has(status) ? status as CommentPublishRunStatus : undefined;
}

function parseForce(raw: unknown) {
  return ['true', '1', 'yes', 'on'].includes(String(raw ?? '').trim().toLowerCase());
}

export function registerAdminCommentPublishRoutes(app: Express) {
  app.get('/api/admin/comment-publish/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getCommentPublishConfig());
  }));

  app.get('/api/admin/comment-publish/status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getCommentPublishStatus());
  }));

  app.get('/api/admin/comment-publish/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    const [statuses, latest] = await Promise.all([
      getCommentPublishRunStats(),
      listCommentPublishRuns({ limit: 1 }),
    ]);
    return res.json({
      statuses,
      latestRun: latest.items?.[0] || null,
    });
  }));

  app.get('/api/admin/comment-publish/runs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const status = parseStatus(req.query.status);
    if (status === undefined) return res.status(400).json({ error: 'status 参数不合法' });
    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const result = await listCommentPublishRuns({
      status: status || undefined,
      limit,
      cursor,
    });
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));

  app.patch('/api/admin/comment-publish/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const config = await updateCommentPublishConfig(req.body || {});
    return res.json(config);
  }));

  app.post('/api/admin/comment-publish/run-now', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const force = parseForce(req.query.force ?? req.body?.force);
    const run = await runObservedCommentPublish({ trigger: 'MANUAL', force, reason: 'manual_run_now' });
    return res.json(run);
  }));
}
