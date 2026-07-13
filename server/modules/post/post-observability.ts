import type { PostRoutePerformanceMark } from './post-contracts';

const DEFAULT_SLOW_POST_ROUTE_THRESHOLD_MS = 800;

export function getSlowPostRouteThresholdMs() {
  const raw = Number.parseInt(process.env.POST_ROUTE_SLOW_QUERY_THRESHOLD_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOW_POST_ROUTE_THRESHOLD_MS;
}

export function recordPostRoutePerformance(mark: PostRoutePerformanceMark) {
  const thresholdMs = getSlowPostRouteThresholdMs();
  const payload = {
    name: mark.name,
    durationMs: Math.round(mark.durationMs),
    requestId: mark.requestId,
    limit: mark.limit,
    thresholdMs,
  };

  if (mark.durationMs >= thresholdMs) {
    console.warn('[post-route:slow]', payload);
    return;
  }

  if (process.env.POST_ROUTE_PERFORMANCE_LOGS === '1') {
    console.info('[post-route:perf]', payload);
  }
}

export async function measurePostRouteStep<T>(
  mark: Omit<PostRoutePerformanceMark, 'durationMs'>,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await task();
  } finally {
    recordPostRoutePerformance({ ...mark, durationMs: Date.now() - startedAt });
  }
}
