import type { Express } from 'express';
import prisma from '../db';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import {
  deleteAutoCrawlSource,
  ensureAutoCrawlStorage,
  getAutoCrawlConfig,
  reprocessAutoCrawlItems,
  updateAutoCrawlConfig,
  updateAutoCrawlSource,
  upsertAutoCrawlSource,
  type AutoCrawlConfig,
  type AutoCrawlSourceConfig,
} from '../services/auto-crawl.service';
import { toBool } from '../services/auto-crawl-normalize';
import { getAutoCrawlRuntimeStatus } from '../services/auto-crawl-runtime-status.service';
import { getAutoCrawlExecutionLog, listAutoCrawlExecutionLogDetails, listAutoCrawlExecutionLogs } from '../services/auto-crawl-execution-log.service';
import { runObservedAutoCrawl } from '../services/auto-crawl-observed-runner.service';

let registered = false;
let kickTimer: NodeJS.Timeout | null = null;

function intValue(raw: unknown, fallback: number, min: number, max: number) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function bodyObject(raw: unknown) {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

function patchConfig(raw: unknown): Partial<AutoCrawlConfig> {
  const body = bodyObject(raw);
  const patch: Partial<AutoCrawlConfig> = {};
  if ('enabled' in body) patch.enabled = toBool(body.enabled, false);
  if ('checkIntervalMinutes' in body) patch.checkIntervalMinutes = intValue(body.checkIntervalMinutes, 30, 5, 240);
  if ('maxItemsPerSource' in body) patch.maxItemsPerSource = intValue(body.maxItemsPerSource, 20, 1, 50);
  if ('maxSourcesPerRun' in body) patch.maxSourcesPerRun = intValue(body.maxSourcesPerRun, 20, 1, 50);
  return patch;
}

function statusValue(raw: unknown) {
  const value = String(raw || '').trim().toUpperCase();
  return ['RAW', 'RETRYABLE', 'REJECTED', 'PUBLISHED', 'FAILED', 'DUPLICATE'].includes(value) ? value : '';
}

function routeError(error: unknown) {
  const source = error as any;
  const status = Number(source?.status || source?.statusCode || 400);
  return {
    status: Number.isInteger(status) && status >= 400 && status < 500 ? status : 400,
    body: {
      error: error instanceof Error ? error.message : String(error || '请求失败'),
      code: source?.code || 'AUTO_CRAWL_REQUEST_FAILED',
    },
  };
}

async function guarded(res: any, action: () => Promise<any>, status = 200) {
  try {
    await ensureAutoCrawlStorage();
    return res.status(status).json(await action());
  } catch (error) {
    const mapped = routeError(error);
    return res.status(mapped.status).json(mapped.body);
  }
}

async function normalizeSourcePayload(raw: unknown): Promise<Partial<AutoCrawlSourceConfig>> {
  const body = bodyObject(raw);
  const categoryId = String(body.categoryId || '').trim();
  if (!categoryId) throw new Error('请选择数据库分类');
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true },
  });
  if (!category) throw new Error('所选数据库分类不存在');

  const disabled = 'disabled' in body ? toBool(body.disabled, false) : false;
  const authorUserId = String(body.authorUserId || '').trim();
  if (!disabled && !authorUserId) throw new Error('启用的数据源必须绑定发布账号');

  return {
    ...body,
    categoryId: category.id,
    categoryName: category.name,
    authorUserId,
    disabled,
    showContact: 'showContact' in body ? toBool(body.showContact, true) : true,
    pollIntervalMinutes: intValue(body.pollIntervalMinutes, 30, 5, 240),
  };
}

function scheduleRun(reason: string) {
  if (kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void runObservedAutoCrawl({ trigger: 'SCHEDULED', force: false, reason })
      .catch((error) => console.warn('[auto-crawl] scheduled wakeup failed:', error instanceof Error ? error.message : error));
  }, 1_000);
  kickTimer.unref?.();
}

async function sourceSaveResult(payload: Partial<AutoCrawlSourceConfig>) {
  const config = await getAutoCrawlConfig();
  if (!config.enabled || payload.disabled === true) {
    return {
      ...config,
      sourceEffectDiagnosis: {
        runTriggered: false,
        message: payload.disabled === true
          ? '数据源已保存并保持停用。'
          : '数据源已保存；自动抓取总开关关闭，未立即运行。',
      },
    };
  }

  const run = await runObservedAutoCrawl({
    trigger: 'MANUAL',
    force: true,
    reason: 'source_saved_run_now',
  });
  const [nextConfig, runtimeStatus] = await Promise.all([
    getAutoCrawlConfig(),
    getAutoCrawlRuntimeStatus(),
  ]);
  return {
    ...nextConfig,
    runtimeStatus,
    run,
    sourceEffectDiagnosis: {
      runTriggered: true,
      message: `已运行：发布 ${run.delivered || 0} 条，过滤 ${run.filtered || 0} 条，失败 ${run.error || 0} 条。`,
    },
  };
}

export function registerAutoCrawlRoutes(app: Express) {
  if (registered) return;
  registered = true;

  app.get('/api/admin/auto-crawl/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return guarded(res, () => getAutoCrawlConfig());
  }));

  app.get('/api/admin/auto-crawl/status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return guarded(res, () => getAutoCrawlRuntimeStatus());
  }));

  app.patch('/api/admin/auto-crawl/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, async () => {
      const config = await updateAutoCrawlConfig(patchConfig(req.body));
      if (config.enabled) scheduleRun('config_enabled_or_updated');
      return { ...config, kickScheduled: config.enabled };
    });
  }));

  app.post('/api/admin/auto-crawl/sources', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const payload = await normalizeSourcePayload(req.body);
    return guarded(res, async () => {
      await upsertAutoCrawlSource(payload);
      return sourceSaveResult(payload);
    }, 201);
  }));

  app.patch('/api/admin/auto-crawl/sources/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const payload = await normalizeSourcePayload({ ...bodyObject(req.body), id: req.params.id });
    return guarded(res, async () => {
      await updateAutoCrawlSource(payload);
      return sourceSaveResult(payload);
    });
  }));

  app.delete('/api/admin/auto-crawl/sources/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, () => deleteAutoCrawlSource(String(req.params.id || '')));
  }));

  app.post('/api/admin/auto-crawl/run-now', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return guarded(res, async () => {
      const run = await runObservedAutoCrawl({ trigger: 'MANUAL', force: true, reason: 'manual_run_now' });
      return { run, runtimeStatus: await getAutoCrawlRuntimeStatus() };
    });
  }));

  app.post('/api/admin/auto-crawl/reprocess', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const body = bodyObject(req.body);
    return guarded(res, () => reprocessAutoCrawlItems({
      status: statusValue(body.status) || 'FAILED',
      sourceId: String(body.sourceId || '').trim() || undefined,
      limit: intValue(body.limit, 50, 1, 100),
    }));
  }));

  app.get('/api/admin/auto-crawl/execution-logs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, () => listAutoCrawlExecutionLogs(intValue(req.query.limit, 20, 1, 100)));
  }));

  app.get('/api/admin/auto-crawl/execution-logs/details', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, () => listAutoCrawlExecutionLogDetails(intValue(req.query.limit, 20, 1, 100)));
  }));

  app.get('/api/admin/auto-crawl/execution-logs/:runId', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, () => getAutoCrawlExecutionLog(String(req.params.runId || ''), {
      sourceId: String(req.query.sourceId || '').trim() || undefined,
    }));
  }));

  app.get('/api/admin/auto-crawl/runs', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return guarded(res, async () => (await getAutoCrawlConfig()).recentRuns);
  }));

  app.get('/api/admin/auto-crawl/items', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    return guarded(res, async () => {
      const status = statusValue(req.query.status);
      const sourceId = String(req.query.sourceId || '').trim();
      const limit = intValue(req.query.limit, 50, 1, 100);
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (status) { params.push(status); conditions.push(`"status"=$${params.length}`); }
      if (sourceId) { params.push(sourceId); conditions.push(`"sourceId"=$${params.length}`); }
      params.push(limit);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return (prisma as any).$queryRawUnsafe(
        `SELECT "id","sourceId","runId","sourceType","sourceName","sourcePostId","sourceUrl","rawTitle","cleanTitle","cleanContent","status","filterReason","errorMessage","postId","retryCount","metadata","createdAt","updatedAt","lastSeenAt"
         FROM "AutoCrawlItem" ${where}
         ORDER BY "updatedAt" DESC,"id" DESC LIMIT $${params.length}`,
        ...params,
      );
    });
  }));
}
