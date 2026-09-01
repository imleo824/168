import type { Express, Request } from 'express';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import { normalizeOptionalBooleanParam, normalizeStringParam } from '../http/params';
import {
  getAutoPostConfig,
  getAutoPostContentStats,
  importAutoPostContents,
  listAutoPostContents,
  listAutoPostRuns,
  normalizeAutoPostConfig,
  normalizeAutoPostTopic,
  updateAutoPostConfig,
  updateAutoPostContent,
  validateAutoPostConfigForSave,
  type AutoPostAfterPostCreated,
  type AutoPostRunStatus,
} from '../services/auto-post.service';
import { runObservedAutoPost } from '../services/auto-post-observed-runner.service';

const RUN_STATUSES = new Set(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);

function parseStatus(raw: unknown) {
  const status = normalizeStringParam(raw, 30).toUpperCase();
  if (!status) return null;
  return RUN_STATUSES.has(status) ? status as AutoPostRunStatus : undefined;
}

function mapConfigError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message === 'author_required') return '请先指定发布账号';
  if (message === 'author_not_found') return '发布账号不存在';
  if (message === 'author_disabled') return '发布账号已被禁用';
  if (message === 'category_not_found') return '发布分类不存在';
  return message || '自动发帖配置不合法';
}

export function registerAutoPostRoutes(app: Express, options: {
  afterPostCreated?: AutoPostAfterPostCreated;
} = {}) {
  app.get('/api/admin/auto-post/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutoPostConfig({ force: true }));
  }));

  app.get('/api/admin/auto-post/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutoPostContentStats());
  }));

  app.patch('/api/admin/auto-post/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const current = await getAutoPostConfig({ force: true });
    const next = normalizeAutoPostConfig({ ...current, ...(req.body || {}) });
    try {
      await validateAutoPostConfigForSave(next);
    } catch (error) {
      return res.status(400).json({ error: mapConfigError(error) });
    }
    return res.json(await updateAutoPostConfig(next));
  }));

  app.post('/api/admin/auto-post/run-now', authMiddleware, adminOnly, catchAsync(async (req: Request, res) => {
    setNoStore(res);
    const run = await runObservedAutoPost({
      trigger: 'MANUAL',
      req,
      reason: 'manual_run_now',
      afterPostCreated: options.afterPostCreated,
    });
    return res.json(run);
  }));

  app.get('/api/admin/auto-post/runs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const status = parseStatus(req.query.status);
    if (status === undefined) return res.status(400).json({ error: 'status 参数不合法' });

    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const result = await listAutoPostRuns({
      status: status || undefined,
      limit,
      cursor,
    });
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));

  app.get('/api/admin/auto-post/contents', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const topic = req.query.topic ? normalizeAutoPostTopic(req.query.topic) : null;
    if (req.query.topic && !topic) return res.status(400).json({ error: 'topic 参数不合法' });

    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
    const result = await listAutoPostContents({
      topic: topic || undefined,
      used: normalizeOptionalBooleanParam(req.query.used),
      active: normalizeOptionalBooleanParam(req.query.active),
      limit,
      cursor,
    });
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));

  app.post('/api/admin/auto-post/contents/import', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const items = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'items 必须是非空数组' });
    if (items.length > 6000) return res.status(400).json({ error: '单次最多导入 6000 条' });
    const result = await importAutoPostContents(items);
    return res.status(201).json(result);
  }));

  app.patch('/api/admin/auto-post/contents/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) return res.status(400).json({ error: '内容ID不能为空' });
    try {
      const content = await updateAutoPostContent(id, req.body || {});
      if (!content) return res.status(404).json({ error: '内容不存在' });
      return res.json(content);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : '内容更新失败' });
    }
  }));
}
