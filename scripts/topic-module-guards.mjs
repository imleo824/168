#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/routes/config.routes.ts',
];

const REQUIRED_CONFIG_ROUTE_MARKERS = [
  'registerConfigRoutes',
  'clearCachedCategories',
  'getCachedCategories',
  'categoriesCache',
  'categoriesCachePromise',
  'normalizePublicCategories',
  'mergePublishSchemaCategories',
  'normalizePublicPublishCategorySchema',
  'isExposurePublicCategoryRef',
  "app.get('/api/home/bootstrap'",
  "app.get('/api/categories'",
  'PromotionService.getActiveHomeAds',
  'setPublicCache(res, 30, 120, 300)',
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

  console.log('\n=== Topic/Category Module Guard ===');
  console.log('Required topic/category module files:');
  REQUIRED_FILES.forEach((file) => console.log(`  - ${file}`));

  if (missing.length > 0) {
    console.log('\nMissing topic/category module files:');
    missing.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const configRouteContent = await readFile('server/routes/config.routes.ts');
  const missingMarkers = REQUIRED_CONFIG_ROUTE_MARKERS.filter((marker) => !configRouteContent.includes(marker));
  if (missingMarkers.length > 0) {
    console.log('\nConfig/topic route module is missing required markers:');
    missingMarkers.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return;
  }

  console.log('\nTopic/category module architecture scaffold is present.');
  console.log('Existing config.routes.ts preserves bootstrap/categories/cache/publish-schema markers.');
  console.log('Next target: split topic/category helpers only after preserving home bootstrap response shape.');
}

main().catch((error) => {
  console.error('[topic-module-guards] failed:', error);
  process.exitCode = 1;
});
