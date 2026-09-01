import assert from 'node:assert/strict';

const baseUrl = (process.env.BASE_URL || 'https://168-production.up.railway.app').replace(/\/+$/, '');

function url(path) {
  return `${baseUrl}${path}`;
}

function includesCacheControl(response, expected) {
  const cacheControl = response.headers.get('cache-control') || '';
  assert.match(cacheControl, expected, `${response.url} Cache-Control mismatch: ${cacheControl}`);
}

function assertRequestId(response) {
  const requestId = response.headers.get('x-request-id') || '';
  assert.match(requestId, /^[a-f0-9-]{16,64}$/i, `${response.url} should include X-Request-Id, got: ${requestId || '(missing)'}`);
}

function assertVaryDoesNotIncludePrivateAuth(response) {
  const vary = response.headers.get('vary') || '';
  assert.doesNotMatch(vary, /(?:^|,\s*)(?:Authorization|Cookie)(?:\s*,|$)/i, `${response.url} should not vary on Authorization/Cookie`);
}

async function fetchJson(path) {
  const response = await fetch(url(path), {
    headers: { Accept: 'application/json' },
  });
  assertRequestId(response);
  const body = await response.text();
  let json;
  try {
    json = body ? JSON.parse(body) : null;
  } catch (error) {
    throw new Error(`${path} did not return valid JSON: ${body.slice(0, 160)}`);
  }
  return { response, json };
}

async function assertHealth() {
  const { response, json } = await fetchJson('/api/health');
  assert.equal(response.status, 200, '/api/health should be 200');
  assert.equal(json?.status, 'ok', '/api/health should return status ok');
  assert.ok('database' in json, '/api/health should include database status');
  includesCacheControl(response, /no-store/);
}

function assertPublicReferenceCache(response) {
  includesCacheControl(response, /public,\s*max-age=/);
  includesCacheControl(response, /stale-while-revalidate=/);
  assertVaryDoesNotIncludePrivateAuth(response);
}

async function assertConfigReference() {
  const { response, json } = await fetchJson('/api/config');
  assert.equal(response.status, 200, '/api/config should be 200');
  assert.ok(json && typeof json === 'object', '/api/config should return an object');
  assertPublicReferenceCache(response);
}

async function assertCategoriesReference() {
  const { response, json } = await fetchJson('/api/categories');
  assert.equal(response.status, 200, '/api/categories should be 200');
  assert.ok(Array.isArray(json), '/api/categories should return an array');
  assertPublicReferenceCache(response);
}

async function assertHomeBootstrap() {
  const { response, json } = await fetchJson('/api/home/bootstrap');
  assert.equal(response.status, 200, '/api/home/bootstrap should be 200');
  assert.ok(json?.config && typeof json.config === 'object', 'home bootstrap should include config');
  assert.ok(Array.isArray(json?.categories), 'home bootstrap should include categories');
  assert.ok(Array.isArray(json?.homeAds), 'home bootstrap should include homeAds');
  assertPublicReferenceCache(response);
}

async function assertFeed(path) {
  const { response, json } = await fetchJson(path);
  assert.equal(response.status, 200, `${path} should be 200`);
  assert.ok(Array.isArray(json), `${path} should return an array`);
  assert.ok(response.headers.has('x-has-more'), `${path} should include X-Has-More`);
  includesCacheControl(response, /public,\s*max-age=/);
  assertVaryDoesNotIncludePrivateAuth(response);
}

async function assertFavicon() {
  const response = await fetch(url('/favicon.ico'), {
    method: 'HEAD',
    redirect: 'manual',
  });
  assert.equal(response.status, 308, '/favicon.ico should redirect permanently');
  assert.equal(response.headers.get('location'), '/favicon-32.png', '/favicon.ico should point at favicon-32.png');
  includesCacheControl(response, /public,\s*max-age=604800/);
}

async function assertUnknownApiNoStore() {
  const response = await fetch(url('/api/__smoke_missing__'), {
    headers: { Accept: 'application/json' },
  });
  assertRequestId(response);
  assert.equal(response.status, 404, 'unknown /api route should be 404');
  includesCacheControl(response, /no-store/);
}

await assertHealth();
await assertConfigReference();
await assertCategoriesReference();
await assertHomeBootstrap();
await assertFeed('/api/home/feed?feed=recommended&limit=1');
await assertFeed('/api/posts?limit=1');
await assertFavicon();
await assertUnknownApiNoStore();

console.log(`production smoke passed: ${baseUrl}`);
