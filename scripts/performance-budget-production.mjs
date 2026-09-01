import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const baseUrl = (process.env.BASE_URL || 'https://168-production.up.railway.app').replace(/\/+$/, '');
const sampleCount = Math.max(1, Math.min(10, Number(process.env.PERF_SAMPLE_COUNT || 3)));
const timeoutMs = Math.max(1500, Number(process.env.PERF_TIMEOUT_MS || 2000));
const authToken = (process.env.AUTH_TOKEN || '').trim();
const budgetMultiplier = Math.max(0.5, Math.min(3, Number(process.env.PERF_BUDGET_MULTIPLIER || 1)));
const payloadBudgetMultiplier = Math.max(0.5, Math.min(3, Number(process.env.PERF_PAYLOAD_BUDGET_MULTIPLIER || 1)));

const ENDPOINT_TIERS = {
  health: { p50Ms: 80, p95Ms: 150, p99Ms: 250, maxBytes: 16_384 },
  reference: { p50Ms: 120, p95Ms: 250, p99Ms: 400, maxBytes: 180_000 },
  feed: { p50Ms: 200, p95Ms: 450, p99Ms: 800, maxBytes: 650_000 },
  detail: { p50Ms: 180, p95Ms: 400, p99Ms: 700, maxBytes: 260_000 },
  private: { p50Ms: 250, p95Ms: 600, p99Ms: 900, maxBytes: 500_000 },
};

const publicEndpoints = [
  { name: 'health', path: '/api/health', tier: 'health' },
  { name: 'home bootstrap', path: '/api/home/bootstrap', tier: 'reference' },
  { name: 'config', path: '/api/config', tier: 'reference' },
  { name: 'categories', path: '/api/categories', tier: 'reference' },
  { name: 'home ads', path: '/api/promotions/home-ads', tier: 'reference' },
  { name: 'home feed', path: '/api/home/feed?feed=recommended&limit=20', tier: 'feed' },
  { name: 'recommend feed', path: '/api/posts?limit=20', tier: 'feed', captureFeed: true },
  { name: 'jobs feed', path: '/api/posts?limit=20&query=%E6%8B%9B%E8%81%98', tier: 'feed' },
  { name: 'housing feed', path: '/api/posts?limit=20&query=%E7%A7%9F%E6%88%BF', tier: 'feed' },
];

const privateEndpoints = [
  { name: 'me profile', path: '/api/me', tier: 'private', auth: true },
  { name: 'home feed auth', path: '/api/home/feed?feed=recommended&limit=20', tier: 'private', auth: true },
  { name: 'recommend feed auth', path: '/api/posts?limit=20', tier: 'private', auth: true },
  { name: 'home notices', path: '/api/notifications/home-summary', tier: 'private', auth: true },
  { name: 'my likes', path: '/api/me/likes?limit=20', tier: 'private', auth: true },
  { name: 'my following', path: '/api/me/following?limit=30', tier: 'private', auth: true },
  { name: 'my fans', path: '/api/me/fans?limit=30', tier: 'private', auth: true },
  { name: 'transactions', path: '/api/me/transactions?limit=50', tier: 'private', auth: true },
  { name: 'recharge orders', path: '/api/me/orders?limit=30', tier: 'private', auth: true },
  { name: 'my promotions', path: '/api/me/promotions', tier: 'private', auth: true },
];

function url(path) {
  return `${baseUrl}${path}`;
}

function formatMs(durationMs) {
  return `${durationMs.toFixed(1)}ms`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function tierBudget(endpoint) {
  const baseBudget = ENDPOINT_TIERS[endpoint.tier] || ENDPOINT_TIERS.feed;
  return {
    p50Ms: Math.ceil(baseBudget.p50Ms * budgetMultiplier),
    p95Ms: Math.ceil(baseBudget.p95Ms * budgetMultiplier),
    p99Ms: Math.ceil(baseBudget.p99Ms * budgetMultiplier),
    maxBytes: Math.ceil(baseBudget.maxBytes * payloadBudgetMultiplier),
  };
}

function percentile(values, percentileValue) {
  if (!values.length) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function lastTruthy(values, selector) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = selector(values[index]);
    if (value) return value;
  }
  return '';
}

function requestIdsFor(results) {
  return results
    .map((result) => result.xRequestId)
    .filter(Boolean)
    .join(',') || 'none';
}

async function timedFetch(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url(endpoint.path), {
      headers: {
        Accept: 'application/json',
        ...(endpoint.auth && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      signal: controller.signal,
    });
    const body = await response.text();
    const durationMs = performance.now() - startedAt;
    const contentType = response.headers.get('content-type') || '';
    const json = body && contentType.includes('application/json') ? JSON.parse(body) : null;

    return {
      ...endpoint,
      body,
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      cacheControl: response.headers.get('cache-control') || '',
      durationMs,
      json,
      ok: response.ok,
      response,
      status: response.status,
      xFeedResultCache: response.headers.get('x-feed-result-cache') || '',
      xRequestId: response.headers.get('x-request-id') || '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function warmEndpoint(endpoint) {
  try {
    await timedFetch(endpoint);
  } catch {
    // The measured pass below reports the actionable failure with endpoint context.
  }
}

function printEndpointSummary(summary) {
  const cachePart = summary.lastFeedCache ? ` feed-cache=${summary.lastFeedCache}` : '';
  const requestIdPart = summary.lastRequestId ? ` request-id=${summary.lastRequestId}` : '';
  console.log(
    `${summary.name.padEnd(18)} tier=${summary.tier.padEnd(9)} ok=${String(summary.successRatePct.toFixed(1)).padStart(5)}% p50=${formatMs(summary.p50).padStart(8)} p95=${formatMs(summary.p95).padStart(8)} p99=${formatMs(summary.p99).padStart(8)} bytes(p95=${formatBytes(summary.p95Bytes)},max=${formatBytes(summary.maxBytes)},budget<=${formatBytes(summary.budget.maxBytes)}) budget(p95<=${summary.budget.p95Ms}ms,p99<=${summary.budget.p99Ms}ms) ${summary.path}${cachePart}${requestIdPart}`,
  );
}

async function measureEndpoint(endpoint) {
  await warmEndpoint(endpoint);
  const results = [];
  for (let index = 0; index < sampleCount; index += 1) {
    try {
      results.push(await timedFetch(endpoint));
    } catch (error) {
      results.push({
        ...endpoint,
        body: String(error?.message || error),
        bodyBytes: 0,
        durationMs: timeoutMs,
        ok: false,
        response: { status: 0 },
        status: 0,
        xFeedResultCache: '',
        xRequestId: '',
      });
    }
  }

  const durations = results.map((result) => result.durationMs);
  const bodyBytes = results.map((result) => result.bodyBytes || 0);
  const okResults = results.filter((result) => result.ok);
  const missingRequestIdCount = results.filter((result) => result.ok && !result.xRequestId).length;
  const budget = tierBudget(endpoint);
  const summary = {
    ...endpoint,
    budget,
    errorCount: results.length - okResults.length,
    lastFeedCache: lastTruthy(results, (result) => result.xFeedResultCache),
    lastRequestId: lastTruthy(results, (result) => result.xRequestId),
    maxBytes: Math.max(...bodyBytes),
    missingRequestIdCount,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p95Bytes: percentile(bodyBytes, 95),
    p99: percentile(durations, 99),
    results,
    successRatePct: (okResults.length / results.length) * 100,
  };

  printEndpointSummary(summary);
  assert.equal(summary.errorCount, 0, `${endpoint.path} had ${summary.errorCount}/${results.length} failed samples; requestIds=${requestIdsFor(results)}`);
  assert.equal(summary.missingRequestIdCount, 0, `${endpoint.path} had ${summary.missingRequestIdCount}/${results.length} successful samples without X-Request-Id`);
  assert.ok(summary.p95 <= budget.p95Ms, `${endpoint.path} p95 exceeded ${budget.p95Ms}ms: ${formatMs(summary.p95)}; requestIds=${requestIdsFor(results)}`);
  assert.ok(summary.p99 <= budget.p99Ms, `${endpoint.path} p99 exceeded ${budget.p99Ms}ms: ${formatMs(summary.p99)}; requestIds=${requestIdsFor(results)}`);
  assert.ok(summary.maxBytes <= budget.maxBytes, `${endpoint.path} payload exceeded ${formatBytes(budget.maxBytes)}: max=${formatBytes(summary.maxBytes)}; requestIds=${requestIdsFor(results)}`);
  return summary;
}

const summaries = [];
for (const endpoint of publicEndpoints) {
  summaries.push(await measureEndpoint(endpoint));
}

const feed = summaries.find((result) => result.captureFeed);
const feedResponse = feed?.results?.find((result) => Array.isArray(result.json));
const postId = Array.isArray(feedResponse?.json) ? feedResponse.json.find((post) => post?.id)?.id : null;

if (postId) {
  summaries.push(await measureEndpoint({ name: 'post detail', path: `/api/posts/${postId}`, tier: 'detail' }));
} else {
  console.log('post detail skipped: feed returned no post id');
}

if (authToken) {
  for (const endpoint of privateEndpoints) {
    summaries.push(await measureEndpoint(endpoint));
  }
} else {
  console.log('private endpoint budget skipped: set AUTH_TOKEN to cover logged-in pages');
}

const allSamples = summaries.flatMap((summary) => summary.results);
const availabilityPct = (allSamples.filter((sample) => sample.ok).length / allSamples.length) * 100;
const globalP95 = percentile(allSamples.map((sample) => sample.durationMs), 95);
const globalP99 = percentile(allSamples.map((sample) => sample.durationMs), 99);
const globalMaxBytes = Math.max(...allSamples.map((sample) => sample.bodyBytes || 0));

assert.ok(availabilityPct === 100, `sample availability must be 100%, got ${availabilityPct.toFixed(2)}%; requestIds=${requestIdsFor(allSamples)}`);
console.log(`production API budget passed: ${baseUrl}, samples=${sampleCount}, availability=${availabilityPct.toFixed(2)}%, globalP95=${formatMs(globalP95)}, globalP99=${formatMs(globalP99)}, globalMaxPayload=${formatBytes(globalMaxBytes)}`);
