import type { Request } from 'express';

import { runAutoLikeOnce } from './auto-like.service';
import { runCommentPublishOnce } from './comment-publish-v8.service';
import { runQuotePublishOnce, type QuotePublishAfterPostCreated } from './quote-publish-v5.service';
import { recordAutomationHeartbeat, type AutomationHeartbeatStatus } from './automation-health.service';

type InteractionTrigger = 'MANUAL' | 'SCHEDULED';

type ObservedBaseInput = {
  trigger: InteractionTrigger;
  reason: string;
  force?: boolean;
  req?: Request;
};

type ObservedQuoteInput = ObservedBaseInput & {
  afterPostCreated?: QuotePublishAfterPostCreated;
};

function heartbeatTrigger(trigger: InteractionTrigger) {
  return trigger === 'MANUAL' ? 'MANUAL_DEBUG' : 'SCHEDULED_TICK';
}

function quoteStatus(result: any): AutomationHeartbeatStatus {
  const status = String(result?.status || '').toUpperCase();
  if (status === 'SUCCEEDED') return 'SUCCEEDED';
  if (status === 'FAILED') return 'FAILED';
  return 'SKIPPED';
}

function commentStatus(result: any): AutomationHeartbeatStatus {
  if (String(result?.status || '').toUpperCase() === 'SUCCEEDED') return 'SUCCEEDED';
  if (String(result?.status || '').toUpperCase() === 'FAILED') return 'FAILED';
  if (Number(result?.created || 0) > 0) return 'SUCCEEDED';
  if (Number(result?.failed || 0) > 0 && Number(result?.created || 0) === 0) return 'FAILED';
  return 'SKIPPED';
}

function autoLikeStatus(result: any): AutomationHeartbeatStatus {
  if (String(result?.status || '').toUpperCase() === 'SUCCEEDED') return 'SUCCEEDED';
  if (String(result?.status || '').toUpperCase() === 'FAILED') return 'FAILED';
  if (Number(result?.liked || result?.boosted || 0) > 0) return 'SUCCEEDED';
  if (Number(result?.failed || 0) > 0 && Number(result?.liked || result?.boosted || 0) === 0) return 'FAILED';
  return 'SKIPPED';
}

function reasonFromResult(result: any, error?: unknown) {
  if (error) return String(error instanceof Error ? error.message : error).slice(0, 300);
  return result?.skipReason || result?.reason || result?.error || result?.status || null;
}

async function recordObservedInteraction(input: {
  module: 'quote_publish' | 'comment_publish' | 'auto_like';
  trigger: InteractionTrigger;
  startedAt: Date;
  reason: string;
  result: any;
  error?: unknown;
  status: AutomationHeartbeatStatus;
  force?: boolean;
}) {
  await recordAutomationHeartbeat({
    module: input.module,
    trigger: heartbeatTrigger(input.trigger),
    status: input.error ? 'FAILED' : input.status,
    enabled: null,
    reason: reasonFromResult(input.result, input.error),
    runId: input.result?.id || input.result?.runId || null,
    startedAt: input.startedAt,
    finishedAt: new Date(),
    details: {
      reason: input.reason,
      trigger: input.trigger,
      force: Boolean(input.force),
      result: input.result || null,
      error: input.error ? String(input.error instanceof Error ? input.error.message : input.error) : null,
    },
  });
}

export async function runObservedQuotePublish(input: ObservedQuoteInput) {
  const startedAt = new Date();
  let result: any = null;
  let error: unknown = null;
  try {
    result = await runQuotePublishOnce({
      trigger: input.trigger,
      req: input.req,
      force: Boolean(input.force),
      afterPostCreated: input.afterPostCreated,
    });
    return result;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await recordObservedInteraction({
      module: 'quote_publish',
      trigger: input.trigger,
      startedAt,
      reason: input.reason,
      result,
      error,
      status: quoteStatus(result),
      force: input.force,
    });
  }
}

export async function runObservedCommentPublish(input: ObservedBaseInput) {
  const startedAt = new Date();
  let result: any = null;
  let error: unknown = null;
  try {
    result = await runCommentPublishOnce(undefined, {
      trigger: input.trigger,
      force: Boolean(input.force),
    });
    return result;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await recordObservedInteraction({
      module: 'comment_publish',
      trigger: input.trigger,
      startedAt,
      reason: input.reason,
      result,
      error,
      status: commentStatus(result),
      force: input.force,
    });
  }
}

export async function runObservedAutoLike(input: ObservedBaseInput) {
  const startedAt = new Date();
  let result: any = null;
  let error: unknown = null;
  try {
    result = await runAutoLikeOnce({
      trigger: input.trigger,
      enabled: input.trigger === 'MANUAL' ? true : undefined,
      force: Boolean(input.force),
    });
    return result;
  } catch (caught) {
    error = caught;
    throw caught;
  } finally {
    await recordObservedInteraction({
      module: 'auto_like',
      trigger: input.trigger,
      startedAt,
      reason: input.reason,
      result,
      error,
      status: autoLikeStatus(result),
      force: input.force,
    });
  }
}
