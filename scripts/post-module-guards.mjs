#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/modules/post/post-contracts.ts',
  'server/modules/post/post-observability.ts',
  'server/modules/post/index.ts',
  'server/routes/post.routes.ts',
];

const REQUIRED_ROUTE_MARKERS = [
  "app.get('/api/posts'",
  'registerPostRoutes',
  'postRouteModule',
  'measurePostRouteStep',
  'PostService.listPosts',
  'PostService.maskContact',
  'getPublicFeedResultCache',
  'sendPublicFeedResult',
];

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readFile(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function main() {
  const missing = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!(await pathExists(relativePath))) missing.push(relativePath);
  }

  console.log('\n=== Post Module Guard ===');
  console.log('Required post module files:');
  REQUIRED_FILES.forEach((file) => console.log(`  - ${file}`));

  if (missing.length > 0) {
    console.log('\nMissing post module files:');
    missing.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const routeContent = await readFile('server/routes/post.routes.ts');
  const missingMarkers = REQUIRED_ROUTE_MARKERS.filter((marker) => !routeContent.includes(marker));
  if (missingMarkers.length > 0) {
    console.log('\nPost route module is missing required markers:');
    missingMarkers.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return;
  }

  console.log('\nPost module architecture scaffold is present.');
  console.log('Post route module exists and preserves expected /api/posts cache/performance/contact-mask markers.');
  console.log('Next target: register server/routes/post.routes.ts from server/bootstrap.ts, remove the old inline /api/posts block, then lower bootstrap baselines.');
}

main().catch((error) => {
  console.error('[post-module-guards] failed:', error);
  process.exitCode = 1;
});
