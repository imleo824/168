import type { Express } from 'express';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { normalizeStringParam } from '../http/params';
import type { AuthRequest } from '../middlewares/auth';

const RUM_METRIC_NAMES = new Set(['FCP', 'LCP', 'CLS', 'INP', 'TTFB']);
const RUM_MAX_METRICS_PER_REQUEST = 12;

export function registerRumRoutes(app: Express) {
  app.post('/api/rum/web-vitals', catchAsync(async (req, res) => {
    const metrics = Array.isArray(req.body?.metrics)
      ? req.body.metrics.slice(0, RUM_MAX_METRICS_PER_REQUEST)
      : [];

    const normalizedMetrics = metrics
      .map((metric: any) => ({
        name: normalizeStringParam(metric?.name, 20).toUpperCase(),
        value: Number(metric?.value),
        path: normalizeStringParam(metric?.path, 180),
        ts: Number(metric?.ts),
      }))
      .filter((metric: any) =>
        RUM_METRIC_NAMES.has(metric.name)
        && Number.isFinite(metric.value)
        && metric.value >= 0
        && metric.value < 120000,
      );

    if (normalizedMetrics.length && process.env.NODE_ENV === 'production' && process.env.RUM_LOGS === '1') {
      console.info('[rum:web-vitals]', {
        requestId: (req as AuthRequest).requestId,
        sessionId: normalizeStringParam(req.body?.sessionId, 64) || undefined,
        metrics: normalizedMetrics,
        connection: req.body?.connection,
      });
    }

    setNoStore(res);
    return res.status(204).end();
  }));
}
