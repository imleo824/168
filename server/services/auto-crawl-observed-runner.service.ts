import {
  createAutoCrawlRun,
  finishAutoCrawlRun,
  getAutoCrawlConfig,
  runAutoCrawlOnce,
  type AutoCrawlRunRecord,
} from './auto-crawl.service';
import {
  reconcileInterruptedAutoCrawlState,
  runAutoCrawlRecoveryQueue,
} from './auto-crawl-recovery.service';
import { recordAutomationHeartbeat } from './automation-health.service';
import { withAutomationTaskLock, type AutomationTaskLockDetails } from './automation-task-lock.service';

type AutoCrawlObservedTrigger = AutoCrawlRunRecord['trigger'];

const AUTO_CRAWL_TASK_LOCK_NAME = 'auto_crawl';
const AUTO_CRAWL_TASK_LOCK_TTL_MS = 20 * 60_000;

function autoCrawlHeartbeatStatus(run: any) {
  const status = String(run?.status || '').toUpperCase();
  if (status === 'SUCCEEDED') return 'SUCCEEDED' as const;
  if (status === 'FAILED' || status === 'PARTIAL_FAILED') return 'FAILED' as const;
  return 'SKIPPED' as const;
}

function autoCrawlHeartbeatReason(run: any, error?: unknown) {
  if (error) return String(error instanceof Error ? error.message : error).slice(0, 300);
  return run?.skipReason || run?.errorMessage || run?.status || null;
}

async function createLockedRun(trigger: AutoCrawlObservedTrigger, lock: AutomationTaskLockDetails | null) {
  const owner = `LOCKED:${Date.now()}:${lock?.owner || 'unknown'}`;
  const id = await createAutoCrawlRun(trigger, owner);
  const run = await finishAutoCrawlRun(id, {
    status: 'SKIPPED',
    skipReason: 'another_instance_running',
    errorMessage: 'auto_crawl_already_running',
  });
  return { ...run, lock, configEnabled: null };
}

async function runRecoverySafely() {
  try {
    const reconciliation = await reconcileInterruptedAutoCrawlState();
    const retryQueue = await runAutoCrawlRecoveryQueue();
    return { reconciliation, retryQueue, error: null, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'recovery_failed');
    console.warn('[auto-crawl] recovery queue failed:', message);
    return { reconciliation: null, retryQueue: null, error: message.slice(0, 500), skipped: false };
  }
}

export async function runObservedAutoCrawl(input: {
  trigger: AutoCrawlObservedTrigger;
  force?: boolean;
  reason: string;
}) {
  const startedAt = new Date();
  let run: any = null;
  let error: unknown = null;
  try {
    const taskLock = await withAutomationTaskLock(
      AUTO_CRAWL_TASK_LOCK_NAME,
      {
        ttlMs: AUTO_CRAWL_TASK_LOCK_TTL_MS,
        metadata: { trigger: input.trigger, reason: input.reason, force: Boolean(input.force) },
        force: false,
      },
      async () => {
        const config = await getAutoCrawlConfig();
        const recovery = config.enabled || input.force
          ? await runRecoverySafely()
          : { reconciliation: null, retryQueue: null, error: null, skipped: true };
        const result = await runAutoCrawlOnce({ trigger: input.trigger, force: Boolean(input.force) });
        return { ...result, recovery, configEnabled: config.enabled };
      },
    );
    run = taskLock.acquired ? taskLock.result : await createLockedRun(input.trigger, taskLock.lock as AutomationTaskLockDetails | null);
    return run;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await recordAutomationHeartbeat({
      module: 'auto_crawl',
      trigger: input.trigger === 'MANUAL' ? 'MANUAL_DEBUG' : 'SCHEDULED_TICK',
      status: error ? 'FAILED' : autoCrawlHeartbeatStatus(run),
      enabled: typeof run?.configEnabled === 'boolean' ? run.configEnabled : null,
      reason: autoCrawlHeartbeatReason(run, error),
      runId: run?.id || null,
      startedAt,
      finishedAt: new Date(),
      details: {
        reason: input.reason,
        trigger: input.trigger,
        force: Boolean(input.force),
        run,
        recovery: run?.recovery || null,
        error: error ? String(error instanceof Error ? error.message : error) : null,
      },
    });
  }
}
