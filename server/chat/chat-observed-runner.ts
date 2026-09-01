import { recordAutomationHeartbeat, type AutomationHeartbeatStatus, type AutomationHeartbeatTrigger } from '../services/automation-health.service';

type ChatObservedTrigger = 'HUMAN_MESSAGE' | 'IDLE_WARMUP' | 'MAINTENANCE';

function heartbeatTrigger(trigger: ChatObservedTrigger): AutomationHeartbeatTrigger {
  if (trigger === 'HUMAN_MESSAGE') return 'MANUAL_DEBUG';
  if (trigger === 'MAINTENANCE') return 'MAINTENANCE';
  return 'SCHEDULED_TICK';
}

function heartbeatStatus(status: string): AutomationHeartbeatStatus {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCEEDED') return 'SUCCEEDED';
  if (normalized === 'FAILED') return 'FAILED';
  return 'SKIPPED';
}

export async function recordObservedChatBotRun(input: {
  trigger: ChatObservedTrigger;
  startedAt: Date;
  status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
  reason?: string | null;
  invocationId?: string | null;
  inputMessageId?: string | null;
  outputMessageId?: string | null;
  details?: unknown;
}) {
  await recordAutomationHeartbeat({
    module: 'chat_bot',
    trigger: heartbeatTrigger(input.trigger),
    status: heartbeatStatus(input.status),
    enabled: null,
    reason: input.reason || input.status,
    runId: input.invocationId || null,
    startedAt: input.startedAt,
    finishedAt: new Date(),
    details: {
      taskTrigger: input.trigger,
      inputMessageId: input.inputMessageId || null,
      outputMessageId: input.outputMessageId || null,
      ...(input.details && typeof input.details === 'object' ? input.details as Record<string, unknown> : {}),
    },
  });
}

export async function runObservedChatMaintenance(task: () => Promise<unknown>) {
  const startedAt = new Date();
  try {
    const result = await task();
    await recordObservedChatBotRun({ trigger: 'MAINTENANCE', startedAt, status: 'SUCCEEDED', reason: 'cleanup_succeeded', details: { result } });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordObservedChatBotRun({ trigger: 'MAINTENANCE', startedAt, status: 'FAILED', reason }).catch(() => {});
    throw error;
  }
}
