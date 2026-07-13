import type { FeedPerformanceMark } from './feed-contracts';

const DEFAULT_SLOW_FEED_THRESHOLD_MS = 800;

function getSlowFeedThresholdMs() {
  const raw = Number.parseInt(process.env.FEED_SLOW_QUERY_THRESHOLD_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOW_FEED_THRESHOLD_MS;
}

export function recordFeedPerformance(mark: FeedPerformanceMark) {
  const thresholdMs = getSlowFeedThresholdMs();
  const payload = {
    name: mark.name,
    durationMs: Math.round(mark.durationMs),
    requestId: mark.requestId,
    kind: mark.kind,
    limit: mark.limit,
    thresholdMs,
  };

  if (mark.durationMs >= thresholdMs) {
    console.warn('[feed:slow]', payload);
    return;
  }

  if (process.env.FEED_PERFORMANCE_LOGS === '1') {
    console.info('[feed:perf]', payload);
  }
}

export async function measureFeedStep<T>(
  mark: Omit<FeedPerformanceMark, 'durationMs'>,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await task();
  } finally {
    recordFeedPerformance({ ...mark, durationMs: Date.now() - startedAt });
  }
}
