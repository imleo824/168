import type { Request } from 'express';

import {
  runAutoPostOnce,
  type AutoPostAfterPostCreated,
  type AutoPostTrigger,
} from './auto-post.service';
import { recordAutomationHeartbeat, type AutomationHeartbeatStatus } from './automation-health.service';

type RunObservedAutoPostInput = {
  trigger: AutoPostTrigger;
  reason: string;
  req?: Request;
  force?: boolean;
  afterPostCreated?: AutoPostAfterPostCreated;
};

function heartbeatTrigger(trigger: AutoPostTrigger) {
  return trigger === 'MANUAL' ? 'MANUAL_DEBUG' : 'SCHEDULED_TICK';
}

function heartbeatStatus(run: any): AutomationHeartbeatStatus {
  const status = String(run?.status || '').toUpperCase();
  if (status === 'SUCCEEDED') return 'SUCCEEDED';
  if (status === 'FAILED') return 'FAILED';
  return 'SKIPPED';
}

function heartbeatReason(run: any, error?: unknown) {
  if (error) return String(error instanceof Error ? error.message : error).slice(0, 300);
  return run?.skipReason || run?.error || run?.status || null;
}

export async function runObservedAutoPost(input: RunObservedAutoPostInput) {
  const startedAt = new Date();
  let run: any = null;
  let error: unknown = null;
  try {
    run = await runAutoPostOnce({
      trigger: input.trigger,
      req: input.req,
      force: Boolean(input.force),
      afterPostCreated: input.afterPostCreated,
    });
    return run;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await recordAutomationHeartbeat({
      module: 'auto_post',
      trigger: heartbeatTrigger(input.trigger),
      status: error ? 'FAILED' : heartbeatStatus(run),
      enabled: null,
      reason: heartbeatReason(run, error),
      runId: run?.id || null,
      startedAt,
      finishedAt: new Date(),
      details: {
        reason: input.reason,
        trigger: input.trigger,
        force: Boolean(input.force),
        run,
        error: error ? String(error instanceof Error ? error.message : error) : null,
      },
    });
  }
}
