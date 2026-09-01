type RumMetricName = 'FCP' | 'LCP' | 'CLS' | 'INP' | 'TTFB';

interface RumMetric {
  name: RumMetricName;
  value: number;
  path: string;
  ts: number;
}

const RUM_ENDPOINT = '/api/rum/web-vitals';
const RUM_SESSION_KEY = 'rum_session_id';
const RUM_SAMPLE_RATE = 0.2;
const MAX_QUEUE_SIZE = 12;
const ignoreRumError = () => {};

let started = false;
let sampled = false;
let sessionId = '';
const queue: RumMetric[] = [];

function safeSessionId() {
  try {
    const existing = window.sessionStorage.getItem(RUM_SESSION_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(RUM_SESSION_KEY, next);
    return next;
  } catch {
    return `rum-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function queueMetric(name: RumMetricName, value: number) {
  if (!sampled || !Number.isFinite(value) || value < 0) return;
  queue.push({
    name,
    value: Math.round(value * 100) / 100,
    path: currentPath(),
    ts: Date.now(),
  });

  if (queue.length >= MAX_QUEUE_SIZE) flushRum();
}

function flushRum() {
  if (!sampled || !queue.length) return;
  const metrics = queue.splice(0, queue.length);
  const payload = JSON.stringify({
    sessionId,
    metrics,
    userAgent: navigator.userAgent,
    connection: (navigator as any).connection
      ? {
          effectiveType: (navigator as any).connection.effectiveType,
          saveData: Boolean((navigator as any).connection.saveData),
          downlink: Number((navigator as any).connection.downlink || 0),
        }
      : undefined,
  });

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(RUM_ENDPOINT, new Blob([payload], { type: 'application/json' }));
    if (ok) return;
  }

  fetch(RUM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(ignoreRumError);
}

function observePaint() {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          queueMetric('FCP', entry.startTime);
          observer.disconnect();
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // Browser does not support Paint Timing.
  }
}

function observeLcpAndCls() {
  let lcp = 0;
  let cls = 0;

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) lcp = last.startTime;
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Browser does not support LCP.
  }

  try {
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput) cls += Number(entry.value || 0);
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Browser does not support Layout Instability.
  }

  const reportFinal = () => {
    if (lcp > 0) queueMetric('LCP', lcp);
    if (cls > 0) queueMetric('CLS', cls);
    flushRum();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reportFinal();
  });
  window.addEventListener('pagehide', reportFinal, { once: true });
}

function observeInpApproximation() {
  let maxInteraction = 0;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        const duration = Number(entry.duration || 0);
        if (duration > maxInteraction) maxInteraction = duration;
      }
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
  } catch {
    return;
  }

  const reportFinal = () => {
    if (maxInteraction > 0) queueMetric('INP', maxInteraction);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reportFinal();
  });
  window.addEventListener('pagehide', reportFinal, { once: true });
}

function reportTtfb() {
  const report = () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;
    queueMetric('TTFB', Math.max(0, nav.responseStart - nav.requestStart));
  };

  if (document.readyState === 'complete') {
    report();
    return;
  }
  window.addEventListener('load', report, { once: true });
}

export function initRum() {
  if (started || typeof window === 'undefined' || !import.meta.env.PROD) return;
  started = true;
  sampled = Math.random() < RUM_SAMPLE_RATE;
  if (!sampled) return;

  sessionId = safeSessionId();
  observePaint();
  observeLcpAndCls();
  observeInpApproximation();
  reportTtfb();
  window.addEventListener('pagehide', flushRum);
}
