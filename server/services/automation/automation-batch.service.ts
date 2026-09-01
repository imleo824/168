import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../../db';
import type { AutoPostAfterPostCreated } from '../auto-post.service';
import { runObservedAutoCrawl } from '../auto-crawl-observed-runner.service';
import { runObservedAutoPost } from '../auto-post-observed-runner.service';
import {
  runObservedAutoLike,
  runObservedCommentPublish,
  runObservedQuotePublish,
} from '../interaction-observed-runner.service';
import {
  withAutomationTaskLock,
} from '../automation-task-lock.service';
import type { QuotePublishAfterPostCreated } from '../quote-publish-v5.service';

export const AUTOMATION_BATCH_MODULES = [
  'auto_crawl',
  'auto_post',
  'auto_like',
  'quote_publish',
  'comment_publish',
] as const;

export type AutomationBatchModule = typeof AUTOMATION_BATCH_MODULES[number];
export type AutomationBatchStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'PARTIAL_FAILED' | 'FAILED';
export type AutomationBatchModuleStatus = 'SUCCEEDED' | 'SKIPPED' | 'FAILED';

type AutomationBatchHooks = {
  afterAutoPostCreated?: AutoPostAfterPostCreated;
  afterQuotePostCreated?: QuotePublishAfterPostCreated;
};

type BatchModuleResult = {
  module: AutomationBatchModule;
  status: AutomationBatchModuleStatus;
  reason: string | null;
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: Record<string, unknown>;
};

type AutomationBatchRow = Prisma.AutomationBatchRunGetPayload<{}>;
type TaskExecutionResult<T> =
  | { kind: 'completed'; value: T }
  | { kind: 'failed'; error: unknown };
type TaskTimeoutResult = { kind: 'timeout'; value: null };
type TaskRunResult<T> =
  | { timedOut: true; value: null }
  | { timedOut: false; value: T };

export type AutomationBatchSnapshot = {
  id: string;
  trigger: string;
  status: AutomationBatchStatus;
  modules: AutomationBatchModule[];
  results: BatchModuleResult[];
  currentModule: AutomationBatchModule | null;
  requestedById: string | null;
  totalModules: number;
  completedModules: number;
  succeededModules: number;
  skippedModules: number;
  failedModules: number;
  progressPercent: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  active: boolean;
};

export type StartAutomationBatchResult = {
  started: boolean;
  reused: boolean;
  batch: AutomationBatchSnapshot;
};

const AUTOMATION_BATCH_ACTIVE_KEY = 'automation_all';
const AUTOMATION_BATCH_LOCK_NAME = 'automation_batch';
const AUTOMATION_BATCH_LOCK_TTL_MS = 90 * 60_000;
// Keep stale recovery slightly longer than the distributed lock lease. The
// lock heartbeat protects a live process; this buffer only covers a crashed
// worker and avoids allowing a second batch while the previous lease can
// still be valid.
const AUTOMATION_BATCH_STALE_MS = AUTOMATION_BATCH_LOCK_TTL_MS + 10 * 60_000;
const MAX_RESULT_VALUE_LENGTH = 500;
const MODULE_TIMEOUT_MS: Record<AutomationBatchModule, number> = {
  auto_crawl: 25 * 60_000,
  auto_post: 12 * 60_000,
  auto_like: 8 * 60_000,
  quote_publish: 12 * 60_000,
  comment_publish: 12 * 60_000,
};

function safeText(value: unknown, maxLength = MAX_RESULT_VALUE_LENGTH) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? Array.from(text).slice(0, maxLength).join('') : null;
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asModuleList(value: unknown): AutomationBatchModule[] {
  if (!Array.isArray(value)) return [...AUTOMATION_BATCH_MODULES];
  return value.filter((item): item is AutomationBatchModule => AUTOMATION_BATCH_MODULES.includes(item as AutomationBatchModule));
}

function asResults(value: unknown): BatchModuleResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BatchModuleResult => {
    const row = asRecord(item);
    return typeof row.module === 'string' && AUTOMATION_BATCH_MODULES.includes(row.module as AutomationBatchModule);
  });
}

function toSnapshot(row: AutomationBatchRow): AutomationBatchSnapshot {
  const modules = asModuleList(row.modules);
  const results = asResults(row.results);
  const totalModules = Math.max(0, Number(row.totalModules || modules.length));
  const completedModules = Math.max(0, Math.min(totalModules, Number(row.completedModules || results.length)));
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status as AutomationBatchStatus,
    modules,
    results,
    currentModule: AUTOMATION_BATCH_MODULES.includes(row.currentModule as AutomationBatchModule)
      ? row.currentModule as AutomationBatchModule
      : null,
    requestedById: row.requestedById,
    totalModules,
    completedModules,
    succeededModules: Math.max(0, Number(row.succeededModules || 0)),
    skippedModules: Math.max(0, Number(row.skippedModules || 0)),
    failedModules: Math.max(0, Number(row.failedModules || 0)),
    progressPercent: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0,
    error: row.error,
    startedAt: isoOrNull(row.startedAt),
    finishedAt: isoOrNull(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    active: Boolean(row.activeKey),
  };
}

function isStale(row: AutomationBatchRow) {
  return Date.now() - row.updatedAt.getTime() > AUTOMATION_BATCH_STALE_MS;
}

function resultStatus(result: unknown, error: unknown): AutomationBatchModuleStatus {
  if (error) return 'FAILED';
  const record = asRecord(result);
  const nestedRun = asRecord(record.run);
  const status = String(record.status || nestedRun.status || '').toUpperCase();
  if (status === 'FAILED' || status === 'PARTIAL_FAILED') return 'FAILED';
  if (status === 'SUCCEEDED') return 'SUCCEEDED';
  const successCount = Number(record.created ?? record.liked ?? record.boosted ?? record.delivered ?? record.scanned ?? 0);
  const failedCount = Number(record.failed ?? record.error ?? 0);
  if (successCount > 0) return 'SUCCEEDED';
  if (failedCount > 0) return 'FAILED';
  return 'SKIPPED';
}

function resultReason(result: unknown, error: unknown) {
  if (error) return safeText(error instanceof Error ? error.message : error, 500);
  const record = asRecord(result);
  const nestedRun = asRecord(record.run);
  return safeText(
    record.errorMessage
      || record.skipReason
      || record.reason
      || record.error
      || nestedRun.error
      || nestedRun.skipReason
      || nestedRun.reason
      || record.status,
    500,
  );
}

function resultRunId(result: unknown) {
  const record = asRecord(result);
  const nestedRun = asRecord(record.run);
  return safeText(record.id || record.runId || nestedRun.id, 160);
}

function compactResult(result: unknown, error: unknown) {
  const record = asRecord(result);
  const selectedKeys = [
    'status', 'reason', 'skipReason', 'error', 'errorMessage', 'enabled',
    'scanned', 'delivered', 'filtered', 'duplicate', 'failed', 'errorCount',
    'created', 'liked', 'boosted', 'skipped', 'sourceCount', 'postId',
    'runId', 'id', 'contentId', 'topic', 'currentModule',
  ];
  const compact: Record<string, unknown> = {};
  for (const key of selectedKeys) {
    if (record[key] !== undefined && record[key] !== null) compact[key] = record[key];
  }
  if (error) compact.error = safeText(error instanceof Error ? error.message : error, 500);
  return compact;
}

function moduleTasks(hooks: AutomationBatchHooks) {
  return [
    {
      module: 'auto_crawl' as const,
      timeoutMs: MODULE_TIMEOUT_MS.auto_crawl,
      run: () => runObservedAutoCrawl({ trigger: 'MANUAL', force: false, reason: 'manual_run_all' }),
    },
    {
      module: 'auto_post' as const,
      timeoutMs: MODULE_TIMEOUT_MS.auto_post,
      run: () => runObservedAutoPost({
        trigger: 'MANUAL',
        force: false,
        reason: 'manual_run_all',
        afterPostCreated: hooks.afterAutoPostCreated,
      }),
    },
    {
      module: 'auto_like' as const,
      timeoutMs: MODULE_TIMEOUT_MS.auto_like,
      run: () => runObservedAutoLike({ trigger: 'MANUAL', force: false, reason: 'manual_run_all' }),
    },
    {
      module: 'quote_publish' as const,
      timeoutMs: MODULE_TIMEOUT_MS.quote_publish,
      run: () => runObservedQuotePublish({
        trigger: 'MANUAL',
        force: false,
        reason: 'manual_run_all',
        afterPostCreated: hooks.afterQuotePostCreated,
      }),
    },
    {
      module: 'comment_publish' as const,
      timeoutMs: MODULE_TIMEOUT_MS.comment_publish,
      run: () => runObservedCommentPublish({ trigger: 'MANUAL', force: false, reason: 'manual_run_all' }),
    },
  ];
}

async function runTaskWithTimeout<T>(task: { timeoutMs: number; run: () => Promise<T> }): Promise<TaskRunResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  // Always attach both fulfillment and rejection handlers before racing the
  // timeout. If the timeout wins, a late task rejection is still consumed and
  // cannot become an unhandled process-level rejection.
  const taskPromise: Promise<TaskExecutionResult<T>> = Promise.resolve().then(task.run).then(
    (value) => ({ kind: 'completed' as const, value }),
    (error) => ({ kind: 'failed' as const, error }),
  );
  const timeoutPromise = new Promise<TaskTimeoutResult>((resolve) => {
    timeout = setTimeout(() => resolve({ kind: 'timeout', value: null }), task.timeoutMs);
    timeout.unref?.();
  });
  try {
    const result: TaskExecutionResult<T> | TaskTimeoutResult = await Promise.race([
      taskPromise,
      timeoutPromise,
    ]);
    if (result.kind === 'failed') throw result.error;
    if (result.kind === 'timeout') return { timedOut: true as const, value: null };
    return { timedOut: false as const, value: result.value };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function findActiveBatch() {
  return prisma.automationBatchRun.findFirst({
    where: { activeKey: AUTOMATION_BATCH_ACTIVE_KEY },
    orderBy: { createdAt: 'desc' },
  });
}

async function findBatch(id: string) {
  return prisma.automationBatchRun.findUnique({ where: { id } });
}

async function markStaleBatch(row: AutomationBatchRow) {
  await prisma.automationBatchRun.updateMany({
    where: { id: row.id, activeKey: AUTOMATION_BATCH_ACTIVE_KEY },
    data: {
      status: 'FAILED',
      activeKey: null,
      currentModule: null,
      error: 'automation_batch_stale_recovered',
      finishedAt: new Date(),
    },
  });
}

async function createBatch(requestedById?: string | null) {
  return prisma.automationBatchRun.create({
    data: {
      id: `automation_batch_${randomUUID()}`,
      activeKey: AUTOMATION_BATCH_ACTIVE_KEY,
      trigger: 'MANUAL',
      status: 'PENDING',
      modules: [...AUTOMATION_BATCH_MODULES],
      requestedById: requestedById || null,
      totalModules: AUTOMATION_BATCH_MODULES.length,
    },
  });
}

export async function getAutomationBatch(id: string) {
  if (!isDbConfigured()) return null;
  const row = await findBatch(id);
  return row ? toSnapshot(row) : null;
}

export async function getAutomationBatchSnapshot() {
  if (!isDbConfigured()) return { active: null, latest: null };
  const [active, latest] = await Promise.all([
    findActiveBatch(),
    prisma.automationBatchRun.findFirst({ orderBy: { createdAt: 'desc' } }),
  ]);
  return {
    active: active ? toSnapshot(active) : null,
    latest: latest ? toSnapshot(latest) : null,
  };
}

async function updateProgress(
  batchId: string,
  data: {
    currentModule?: AutomationBatchModule | null;
    results?: BatchModuleResult[];
    completedModules?: number;
    succeededModules?: number;
    skippedModules?: number;
    failedModules?: number;
  },
) {
  await prisma.automationBatchRun.update({
    where: { id: batchId },
    data: {
      ...data,
      results: data.results as unknown as Prisma.InputJsonValue | undefined,
    },
  });
}

async function finishBatch(
  batchId: string,
  data: {
    status: AutomationBatchStatus;
    results?: BatchModuleResult[];
    completedModules?: number;
    succeededModules?: number;
    skippedModules?: number;
    failedModules?: number;
    error?: string | null;
  },
) {
  await prisma.automationBatchRun.update({
    where: { id: batchId },
    data: {
      status: data.status,
      activeKey: null,
      currentModule: null,
      completedModules: data.completedModules,
      succeededModules: data.succeededModules,
      skippedModules: data.skippedModules,
      failedModules: data.failedModules,
      results: data.results as unknown as Prisma.InputJsonValue | undefined,
      error: data.error ?? null,
      finishedAt: new Date(),
    },
  });
}

function overallStatus(succeeded: number, skipped: number, failed: number): AutomationBatchStatus {
  if (failed > 0 && succeeded > 0) return 'PARTIAL_FAILED';
  if (failed > 0) return 'FAILED';
  if (succeeded > 0) return 'SUCCEEDED';
  return skipped > 0 ? 'SKIPPED' : 'FAILED';
}

async function executeAutomationBatch(batchId: string, hooks: AutomationBatchHooks) {
  const taskLock = await withAutomationTaskLock(
    AUTOMATION_BATCH_LOCK_NAME,
    {
      ttlMs: AUTOMATION_BATCH_LOCK_TTL_MS,
      metadata: { batchId, modules: AUTOMATION_BATCH_MODULES },
      force: false,
    },
    async () => {
      await prisma.automationBatchRun.update({
        where: { id: batchId },
        data: { status: 'RUNNING', startedAt: new Date(), currentModule: null },
      });

      const results: BatchModuleResult[] = [];
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      const tasks = moduleTasks(hooks);
      let stopAfterTimeout = false;

      for (const [index, task] of tasks.entries()) {
        const startedAt = new Date();
        await updateProgress(batchId, { currentModule: task.module, results });
        let result: unknown = null;
        let error: unknown = null;
        let timedOut = false;
        try {
          const execution = await runTaskWithTimeout(task);
          result = execution.value;
          timedOut = execution.timedOut;
          if (timedOut) {
            error = new Error(`automation_${task.module}_timeout`);
            stopAfterTimeout = true;
          }
        } catch (caught) {
          error = caught;
          console.warn(`[automation-batch] ${task.module} failed:`, caught instanceof Error ? caught.message : caught);
        }
        const finishedAt = new Date();
        const status = resultStatus(result, error);
        if (status === 'SUCCEEDED') succeeded += 1;
        else if (status === 'FAILED') failed += 1;
        else skipped += 1;
        results.push({
          module: task.module,
          status,
          reason: resultReason(result, error),
          runId: resultRunId(result),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
          result: compactResult(result, error),
        });
        await updateProgress(batchId, {
          currentModule: index === tasks.length - 1 ? null : tasks[index + 1]?.module || null,
          results,
          completedModules: results.length,
          succeededModules: succeeded,
          skippedModules: skipped,
          failedModules: failed,
        });
        if (stopAfterTimeout) break;
      }

      if (stopAfterTimeout && results.length < tasks.length) {
        const finishedAt = new Date();
        for (const task of tasks.slice(results.length)) {
          results.push({
            module: task.module,
            status: 'SKIPPED',
            reason: 'previous_module_timeout',
            runId: null,
            startedAt: finishedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            durationMs: 0,
            result: {},
          });
          skipped += 1;
        }
        await updateProgress(batchId, {
          currentModule: null,
          results,
          completedModules: results.length,
          succeededModules: succeeded,
          skippedModules: skipped,
          failedModules: failed,
        });
      }

      await finishBatch(batchId, {
        status: overallStatus(succeeded, skipped, failed),
        results,
        completedModules: results.length,
        succeededModules: succeeded,
        skippedModules: skipped,
        failedModules: failed,
      });
    },
  );

  if (!taskLock.acquired) {
    await finishBatch(batchId, {
      status: 'SKIPPED',
      completedModules: 0,
      succeededModules: 0,
      skippedModules: AUTOMATION_BATCH_MODULES.length,
      failedModules: 0,
      error: 'automation_batch_already_running',
    });
  }
}

async function failBatchSafely(batchId: string, error: unknown) {
  try {
    await finishBatch(batchId, {
      status: 'FAILED',
      completedModules: 0,
      succeededModules: 0,
      skippedModules: 0,
      failedModules: 1,
      error: safeText(error instanceof Error ? error.message : error, 500) || 'automation_batch_failed',
    });
  } catch (finishError) {
    console.error('[automation-batch] failed to persist terminal state:', finishError);
  }
}

export async function startAutomationBatch(options: {
  requestedById?: string | null;
  afterAutoPostCreated?: AutoPostAfterPostCreated;
  afterQuotePostCreated?: QuotePublishAfterPostCreated;
} = {}): Promise<StartAutomationBatchResult> {
  if (!isDbConfigured()) throw new Error('Database is not configured');

  let active = await findActiveBatch();
  if (active && isStale(active)) {
    await markStaleBatch(active);
    active = null;
  }
  if (active) return { started: false, reused: true, batch: toSnapshot(active) };

  let batch: AutomationBatchRow;
  try {
    batch = await createBatch(options.requestedById);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'P2002') throw error;
    const concurrent = await findActiveBatch();
    if (!concurrent) throw error;
    return { started: false, reused: true, batch: toSnapshot(concurrent) };
  }

  void executeAutomationBatch(batch.id, options).catch((error) => {
    console.error('[automation-batch] execution failed:', error);
    return failBatchSafely(batch.id, error);
  });
  return { started: true, reused: false, batch: toSnapshot(batch) };
}
