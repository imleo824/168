#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const POST_ROUTES_PATH = path.join(ROOT, 'server/routes/post.routes.ts');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const PROBE_SCRIPT = path.join(ROOT, 'scripts/migrate-post-detail-route-registration.mjs');

function fail(message) {
  console.log(`\n${message}`);
  process.exitCode = 1;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n=== Post Detail Route Probe Output Guard ===');

  if (!(await pathExists(PROBE_SCRIPT))) {
    fail('Missing scripts/migrate-post-detail-route-registration.mjs.');
  }

  const probeScript = await fs.readFile(PROBE_SCRIPT, 'utf8').catch(() => '');
  for (const marker of [
    'JSON_OUTPUT_PATH',
    'buildProbePayload',
    'schemaVersion: 1',
    'findRouteCallEnd',
    'formatLineRange',
    'blockSha',
    'behaviorFlags',
    'formatBehaviorTable',
    'This probe never deletes or rewrites',
    'artifacts/post-detail-route-probe.md',
    'artifacts/post-detail-route-probe.json',
  ]) {
    if (!probeScript.includes(marker)) fail(`Probe script missing marker: ${marker}`);
  }

  const packageJson = await fs.readFile(PACKAGE_PATH, 'utf8').catch(() => '');
  if (!packageJson.includes('"migrate:post-detail-route": "node scripts/migrate-post-detail-route-registration.mjs"')) {
    fail('package.json must expose migrate:post-detail-route for the workflow probe step.');
  }
  if (!packageJson.includes('"audit:post-detail-readiness": "node scripts/audit-post-detail-readiness.mjs"')) {
    fail('package.json must expose audit:post-detail-readiness for the workflow readiness step.');
  }

  const postRoutes = await fs.readFile(POST_ROUTES_PATH, 'utf8').catch(() => '');
  if (!postRoutes) {
    fail('Missing server/routes/post.routes.ts.');
  }
  if (!postRoutes.includes('registerPostRoutes')) {
    fail('Post route module must export/register registerPostRoutes.');
  }
  if (!postRoutes.includes("app.get('/api/posts'")) {
    fail('Post route module must own GET /api/posts.');
  }
  if (!postRoutes.includes('PostService.listPosts')) {
    fail('GET /api/posts must keep using PostService.listPosts.');
  }
  if (!postRoutes.includes('PostService.maskContact')) {
    fail('GET /api/posts must keep masking contact fields before response.');
  }

  if (process.exitCode) return;
  console.log('Post detail route probe guard passed: probe script, package commands, and post route ownership are present.');
}

main().catch((error) => {
  console.error('[post-detail-route-migration-closure-guard] failed:', error);
  process.exitCode = 1;
});
