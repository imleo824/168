#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/modules/post/post-contracts.ts',
  'server/modules/post/post-observability.ts',
  'server/modules/post/index.ts',
  'server/routes/post.routes.ts',
  'server/routes/post-create.routes.ts',
  'server/routes/post-actions.routes.ts',
  'server/services/post/index.ts',
  'server/services/post/feed-dependency.ts',
  'server/services/post/post-engagement.ts',
  'server/services/post/post-identifiers.ts',
  'server/services/post/post-ranking-maintenance.ts',
  'server/services/post/post-selects.ts',
  'server/services/post/recommendation-context.ts',
  'scripts/post-main-chain-audit.mjs',
  'docs/architecture/POST_MAIN_CHAIN_AUDIT.md',
];

const REQUIRED_POST_ROUTE_MARKERS = [
  "app.get('/api/posts'",
  'registerPostRoutes',
  'postRouteModule',
  'measurePostRouteStep',
  'PostService.listPosts',
  'PostService.maskContact',
];

const REQUIRED_POST_CREATE_MARKERS = [
  "app.post('/api/posts'",
  'ConfigService.getConfigs()',
  'if (normalizedCategoryId) {',
  'normalizePublishCategoryMetaPayload',
  'prisma.category.upsert',
  '...(selectedCategory?.id ? { category: { connect: { id: selectedCategory.id } } } : {})',
  'categoryMetaSchemaVersion: categoryMetaSchemaVersion || null',
  'clientNonce: normalizedClientNonce || null',
  'PostService.schedulePostRankingRefresh',
];

const FORBIDDEN_POST_CREATE_MARKERS = [
  "return res.status(400).json({ error: '请选择分类' })",
  'category: { connect: { id: selectedCategory.id } },',
];

const REQUIRED_POST_MODULE_MARKERS = [
  'post-contracts',
  'post-observability',
];

const REQUIRED_POST_AUDIT_MARKERS = [
  'bootstrap post-like routes',
  'post.routes.ts post-like routes',
  'PostService Prisma model concentration',
  'Recommended migration order',
  'Move post detail read route',
  'Move view recording route',
  'Move like/share writes',
];

const REQUIRED_POST_SERVICE_MARKERS = [
  'schedulePostRankingRefresh',
  'bumpPostOnInteraction',
  'recordViews',
  'recordShare',
  'listPostQuotes',
];

const REQUIRED_POST_ENGAGEMENT_MARKERS = [
  'VIEW_DEDUPE_WINDOW_MS',
  'VIEW_DEDUPE_RETENTION_MS',
  'bumpPostOnInteraction',
  'recordViews',
  'recordShare',
  'schedulePostRankingRefresh',
  'PostEngagementAggregate',
];

const REQUIRED_POST_RANKING_MAINTENANCE_MARKERS = [
  'RANKING_REFRESH_BATCH_DELAY_MS',
  'RANKING_REFRESH_QUEUE_MAX_IDS',
  'refreshPostRankingScore',
  'refreshPostRankingScores',
  'schedulePostRankingRefresh',
  'postRankingScore.upsert',
];

const REQUIRED_RECOMMENDATION_CONTEXT_MARKERS = [
  'buildRecommendationContext',
  'clearRecommendationContextCache',
  'safeBuildRecommendationContext',
  'RECOMMENDATION_HIDDEN_POST_LIMIT',
  'userRecommendationFeedback',
];

const REQUIRED_POST_ACTION_MARKERS = [
  "app.post('/api/posts/:id/like'",
  "app.post('/api/posts/:id/share'",
  'PostService.schedulePostRankingRefresh',
  'PostService.bumpOnInteraction',
  'PostService.recordViews',
  'PostService.recordShare',
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

function assertForbiddenMarkers(label, content, markers) {
  const present = markers.filter((marker) => content.includes(marker));
  if (present.length > 0) {
    console.log(`\n${label} contains forbidden markers:`);
    present.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function main() {
  console.log('\n=== Post Main Chain Guard ===');

  const missingFiles = [];
  for (const file of REQUIRED_FILES) {
    if (!(await exists(file))) missingFiles.push(file);
  }

  if (missingFiles.length > 0) {
    console.log('\nMissing required post main-chain files:');
    missingFiles.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const postRoutes = await read('server/routes/post.routes.ts');
  const postCreateRoutes = await read('server/routes/post-create.routes.ts');
  const postActions = await read('server/routes/post-actions.routes.ts');
  const postModule = await read('server/modules/post/index.ts');
  const postAudit = await read('scripts/post-main-chain-audit.mjs');
  const postService = await read('server/services/post/index.ts');
  const postEngagement = await read('server/services/post/post-engagement.ts');
  const postRankingMaintenance = await read('server/services/post/post-ranking-maintenance.ts');
  const recommendationContext = await read('server/services/post/recommendation-context.ts');

  const ok = [
    assertMarkers('Post routes module', postRoutes, REQUIRED_POST_ROUTE_MARKERS),
    assertMarkers('Post create route module', postCreateRoutes, REQUIRED_POST_CREATE_MARKERS),
    assertForbiddenMarkers('Post create route module', postCreateRoutes, FORBIDDEN_POST_CREATE_MARKERS),
    assertMarkers('Post action routes module', postActions, REQUIRED_POST_ACTION_MARKERS),
    assertMarkers('Post module index', postModule, REQUIRED_POST_MODULE_MARKERS),
    assertMarkers('Post main-chain audit', postAudit, REQUIRED_POST_AUDIT_MARKERS),
    assertMarkers('PostService main-chain behavior anchors', postService, REQUIRED_POST_SERVICE_MARKERS),
    assertMarkers('Post engagement behavior anchors', postEngagement, REQUIRED_POST_ENGAGEMENT_MARKERS),
    assertMarkers('Post ranking maintenance anchors', postRankingMaintenance, REQUIRED_POST_RANKING_MAINTENANCE_MARKERS),
    assertMarkers('Post recommendation context anchors', recommendationContext, REQUIRED_RECOMMENDATION_CONTEXT_MARKERS),
  ].every(Boolean);

  if (!ok) return;

  console.log('Post main-chain guard passed.');
  console.log('Post list route module, post create route, post audit, and interaction/ranking/view anchors are present.');
  console.log('Manual publishing keeps category optional; automatic crawl meta extraction is guarded separately by auto-crawl-guards.');
}

main().catch((error) => {
  console.error('[post-main-chain-guards] failed:', error);
  process.exitCode = 1;
});
