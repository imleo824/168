#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/modules/post/post-contracts.ts',
  'server/modules/post/post-observability.ts',
  'server/modules/post/index.ts',
  'server/routes/post.routes.ts',
  'server/services/post/index.ts',
  'server/services/post/post-engagement.ts',
  'scripts/migrate-post-detail-route-registration.mjs',
  'scripts/post-detail-route-migration-guard.mjs',
  '.github/workflows/post-detail-route-probe.yml',
  'docs/architecture/POST_DETAIL_ROUTE_MIGRATION.md',
];

const REQUIRED_CONTRACT_MARKERS = [
  'PublicPostDetailQuery',
  'PublicPostDetailResult',
  'PublicPostDetailCacheContext',
  'postId: string',
  'currentUserRole',
  'includeViewRecord',
];

const REQUIRED_ROUTE_MARKERS = [
  "app.get('/api/posts'",
  'registerPostRoutes',
  'postRouteModule',
  'measurePostRouteStep',
];

const REQUIRED_SERVICE_ANCHORS = [
  'maskContact',
  'recordViews',
  'VIEW_DEDUPE_WINDOW_MS',
  'schedulePostRankingRefresh',
];

const REQUIRED_PROBE_MARKERS = [
  'node:crypto',
  'JSON_OUTPUT_PATH',
  'buildProbePayload',
  'schemaVersion: 1',
  'findRouteCallEnd',
  'formatLineRange',
  'blockSha',
  'behaviorFlags',
  'formatBehaviorTable',
  'handler block ranges',
  'block fingerprints',
  'This probe never deletes or rewrites',
  'artifacts/post-detail-route-probe.md',
  'artifacts/post-detail-route-probe.json',
];

const REQUIRED_WORKFLOW_MARKERS = [
  'Post Detail Route Probe',
  'npm run test:post-detail-route',
  'npm run migrate:post-detail-route',
  'artifacts/post-detail-route-probe.md',
  'artifacts/post-detail-route-probe.json',
];

const REQUIRED_DOC_MARKERS = [
  '不改 API 路径',
  '不改返回结构',
  '不改鉴权',
  '不改限流',
  '保留 maskContact',
  '保留 view dedupe',
  'Post detail read route',
];

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

function assertMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length > 0) {
    console.log(`\n${label} is missing required markers:`);
    missing.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  console.log('\n=== Post Detail Route Guard ===');

  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    if (!(await exists(file))) missingFiles.push(file);
  }

  if (missingFiles.length > 0) {
    console.log('\nMissing required post detail route migration files:');
    missingFiles.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const contracts = await read('server/modules/post/post-contracts.ts');
  const postRoutes = await read('server/routes/post.routes.ts');
  const postService = [
    await read('server/services/post/index.ts'),
    await read('server/services/post/post-engagement.ts'),
  ].join('\n');
  const probe = await read('scripts/migrate-post-detail-route-registration.mjs');
  const workflow = await read('.github/workflows/post-detail-route-probe.yml');
  const docs = [
    await read('docs/architecture/POST_DETAIL_ROUTE_MIGRATION.md'),
    await read('scripts/post-detail-route-migration-guard.mjs'),
  ].join('\n');

  const ok = [
    assertMarkers('Post detail contracts', contracts, REQUIRED_CONTRACT_MARKERS),
    assertMarkers('Post routes module baseline', postRoutes, REQUIRED_ROUTE_MARKERS),
    assertMarkers('PostService detail behavior anchors', postService, REQUIRED_SERVICE_ANCHORS),
    assertMarkers('Post detail route probe', probe, REQUIRED_PROBE_MARKERS),
    assertMarkers('Post detail probe workflow', workflow, REQUIRED_WORKFLOW_MARKERS),
    assertMarkers('Post detail migration docs', docs, REQUIRED_DOC_MARKERS),
  ].every(Boolean);

  if (!ok) return;

  console.log('Post detail route guard passed.');
  console.log('Detail contracts, route baseline, service anchors, block-range/fingerprint/json probe, workflow, and migration docs are present.');
  console.log('Next migration may move detail read route only if path/response/auth/rate-limit/maskContact/view-dedupe behavior stays unchanged.');
}

main().catch((error) => {
  console.error('[post-detail-route-guards] failed:', error);
  process.exitCode = 1;
});
