import assert from 'node:assert/strict';

import {
  attachInteractionAutomationExecutionEvents,
  buildInteractionAutomationFallbackEvents,
  logInteractionAutomationEvent,
} from '../server/services/interaction-automation-execution-log.service';

const runId = `interaction_log_fallback_guard_${Date.now()}`;
const run = {
  id: runId,
  status: 'SKIPPED',
  reason: 'disabled',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  updatedAt: new Date('2026-01-02T03:04:06.000Z'),
  postId: 'post_guard_1',
  robotUserId: 'robot_guard_1',
};

const fallbackEvents = buildInteractionAutomationFallbackEvents('comment_publish', run);
assert.equal(fallbackEvents.length, 2, 'database fallback must expose start and finish process events.');
assert.equal(fallbackEvents[0].phase, 'run_started', 'database fallback must expose the run start phase.');
assert.equal(fallbackEvents[1].phase, 'run_finished', 'database fallback must expose the run finish phase.');
assert.equal(fallbackEvents[1].reason, 'disabled', 'database fallback must preserve the real skip reason.');
assert.equal(fallbackEvents[1].postId, 'post_guard_1', 'database fallback must preserve the target post id.');
assert.equal(fallbackEvents[1].robotUserId, 'robot_guard_1', 'database fallback must preserve the robot id.');
assert.equal((fallbackEvents[1].details as any).databaseFallback, true, 'database fallback events must be auditable as fallback events.');

const [attached] = await attachInteractionAutomationExecutionEvents('comment_publish', [run]);
assert.ok(Array.isArray((attached as any).processEvents), 'run list attachment must always expose processEvents.');
assert.equal((attached as any).processEvents.length, 2, 'missing filesystem logs must fall back to database process events.');
assert.equal((attached as any).processEvents[1].reason, 'disabled', 'attached fallback events must preserve the terminal reason.');

const partialRunId = `interaction_log_partial_guard_${Date.now()}`;
const partialRun = {
  id: partialRunId,
  status: 'FAILED',
  error: 'like_failed',
  createdAt: new Date('2026-01-02T03:05:05.000Z'),
  finishedAt: new Date('2026-01-02T03:05:06.000Z'),
};
await logInteractionAutomationEvent({
  module: 'auto_like',
  runId: partialRunId,
  phase: 'run_finished',
  message: '自动点赞失败',
  status: 'FAILED',
  reason: 'like_failed',
});
const [partialAttached] = await attachInteractionAutomationExecutionEvents('auto_like', [partialRun]);
assert.deepEqual(
  (partialAttached as any).processEvents.map((event: any) => event.phase),
  ['run_started', 'run_finished'],
  'partial filesystem logs must be completed with database fallback start events.',
);
assert.equal((partialAttached as any).processEvents[1].reason, 'like_failed', 'real filesystem finish reason must be preserved when start is backfilled.');

console.log('[interaction-automation-log-fallback-guards] passed');
