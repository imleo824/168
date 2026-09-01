#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MARKDOWN_OUTPUT_PATH = path.join(ROOT, 'artifacts/post-detail-route-readiness.md');
const JSON_OUTPUT_PATH = path.join(ROOT, 'artifacts/post-detail-route-readiness.json');

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8').catch(() => '');
}

function hasAll(content, markers) {
  return markers.every((marker) => content.includes(marker));
}

async function main() {
  const [postRoutes, postServiceIndex, postEngagement, migrationGuard, probeScript] = await Promise.all([
    read('server/routes/post.routes.ts'),
    read('server/services/post/index.ts'),
    read('server/services/post/post-engagement.ts'),
    read('scripts/post-detail-route-migration-guard.mjs'),
    read('scripts/migrate-post-detail-route-registration.mjs'),
  ]);
  const postService = `${postServiceIndex}\n${postEngagement}`;

  const checks = [
    {
      name: 'route-module-baseline',
      ok: hasAll(postRoutes, ['registerPostRoutes', "app.get('/api/posts'", 'measurePostRouteStep']),
      detail: 'Post route module owns the public list route and route-step instrumentation.',
    },
    {
      name: 'detail-behavior-anchors',
      ok: hasAll(postService, ['maskContact', 'recordViews', 'VIEW_DEDUPE_WINDOW_MS', 'schedulePostRankingRefresh']),
      detail: 'Detail service keeps contact masking, view dedupe, view recording, and ranking refresh anchors.',
    },
    {
      name: 'migration-invariants',
      ok: hasAll(migrationGuard, ['Post detail read route', '不改 API 路径', '不改返回结构', '不改鉴权', '不改限流', '保留 maskContact', '保留 view dedupe']),
      detail: 'Machine-readable migration invariants are present.',
    },
    {
      name: 'probe-available',
      ok: hasAll(probeScript, ['buildProbePayload', 'formatBehaviorTable', 'blockSha', 'behaviorFlags']),
      detail: 'Probe can report handler ranges, fingerprints, and behavior flags.',
    },
  ];

  const payload = {
    schemaVersion: 1,
    generatedBy: 'scripts/audit-post-detail-readiness.mjs',
    ready: checks.every((check) => check.ok),
    checks,
  };

  const markdown = [
    '# Post Detail Route Migration Readiness',
    '',
    `Ready: ${payload.ready ? 'yes' : 'no'}`,
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |',
    ...checks.map((check) => `| ${check.name} | ${check.ok ? 'pass' : 'fail'} | ${check.detail} |`),
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(MARKDOWN_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(MARKDOWN_OUTPUT_PATH, markdown, 'utf8');
  await fs.writeFile(JSON_OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  if (!payload.ready) {
    console.error('[post-detail-readiness] failed');
    process.exitCode = 1;
    return;
  }

  console.log('[post-detail-readiness] OK');
}

main().catch((error) => {
  console.error('[post-detail-readiness] failed:', error);
  process.exitCode = 1;
});
