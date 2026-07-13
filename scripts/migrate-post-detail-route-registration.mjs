#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BOOTSTRAP_PATH = path.join(ROOT, 'server/bootstrap.ts');
const POST_ROUTES_PATH = path.join(ROOT, 'server/routes/post.routes.ts');
const MARKDOWN_OUTPUT_PATH = path.join(ROOT, 'artifacts/post-detail-route-probe.md');
const JSON_OUTPUT_PATH = path.join(ROOT, 'artifacts/post-detail-route-probe.json');

const POST_DETAIL_ROUTE_CANDIDATES = [
  "app.get('/api/posts/:id'",
  "app.get('/api/posts/:postId'",
  "app.get('/api/post/:id'",
  "app.get('/api/post/:postId'",
];

const DETAIL_ROUTE_PATTERNS = [
  /^\/api\/posts\/:[A-Za-z_$][\w$]*$/,
  /^\/api\/post\/:[A-Za-z_$][\w$]*$/,
];
const ROUTE_PATTERN = /app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
const POST_LIKE_ROUTE_PATTERN = /^\/api\/(posts|post|comments|quotes)(?:\/|$)/;

const ROUTE_BLOCK_BEHAVIOR_MARKERS = [
  ['limiter', 'publicReadLimiter'],
  ['auth', 'authMiddleware'],
  ['catchAsync', 'catchAsync'],
  ['dbGuard', 'isDbConfigured'],
  ['PostService', 'PostService'],
  ['maskContact', 'maskContact'],
  ['recordViews', 'recordViews'],
  ['rankingRefresh', 'schedulePostRankingRefresh'],
  ['cache', 'Cache'],
  ['pagination', 'throwOnInvalidPagination'],
];

function getLineNumber(content, index) {
  return content.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function getShortSha(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function findRouteCallEnd(content, startIndex) {
  const openParenIndex = content.indexOf('(', startIndex);
  if (openParenIndex === -1) return null;

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openParenIndex; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        let endIndex = index + 1;
        while (/\s/.test(content[endIndex] || '')) endIndex += 1;
        if (content[endIndex] === ';') endIndex += 1;
        return endIndex;
      }
    }
  }

  return null;
}

function getBehaviorFlags(block) {
  return Object.fromEntries(
    ROUTE_BLOCK_BEHAVIOR_MARKERS.map(([name, marker]) => [name, block.includes(marker)]),
  );
}

function formatLineRange(route) {
  if (!route.endLine) return `server/bootstrap.ts:${route.line}`;
  return `server/bootstrap.ts:${route.line}-${route.endLine}`;
}

function buildRouteRecord(content, method, route, index) {
  const endIndex = findRouteCallEnd(content, index);
  const line = getLineNumber(content, index);
  const endLine = endIndex ? getLineNumber(content, endIndex) : null;
  const block = endIndex ? content.slice(index, endIndex) : '';
  return {
    method: method.toUpperCase(),
    route,
    file: 'server/bootstrap.ts',
    index,
    endIndex,
    line,
    endLine,
    lineCount: endLine ? endLine - line + 1 : null,
    blockSha: block ? getShortSha(block) : null,
    behaviorFlags: block ? getBehaviorFlags(block) : {},
  };
}

function collectPostLikeRoutes(content) {
  const routes = [];
  let match;
  while ((match = ROUTE_PATTERN.exec(content))) {
    const route = match[2];
    if (POST_LIKE_ROUTE_PATTERN.test(route)) routes.push(buildRouteRecord(content, match[1], route, match.index));
  }
  return routes;
}

function findSupportedDetailRoute(content) {
  return POST_DETAIL_ROUTE_CANDIDATES
    .map((marker) => ({ marker, index: content.indexOf(marker) }))
    .filter((candidate) => candidate.index !== -1)
    .map((candidate) => buildRouteRecord(content, 'get', candidate.marker.match(/['"]([^'"]+)['"]/)?.[1] || candidate.marker, candidate.index))
    .sort((a, b) => a.index - b.index)[0] || null;
}

function detectLikelyDetailRoutes(routes) {
  return routes.filter((route) => route.method === 'GET' && DETAIL_ROUTE_PATTERNS.some((pattern) => pattern.test(route.route)));
}

function ensurePostRoutesCanAcceptDetail(postRoutesContent) {
  const missing = ['registerPostRoutes', 'PostRoutesDeps', 'measurePostRouteStep', 'PostService']
    .filter((marker) => !postRoutesContent.includes(marker));
  if (missing.length > 0) throw new Error(`post.routes.ts missing route module markers: ${missing.join(', ')}`);
}

function formatFlag(value) {
  return value ? 'yes' : 'no';
}

function formatRouteTable(routes) {
  if (routes.length === 0) return '| Method | Route | Start line | End line | Lines | Block sha |\n| --- | --- | ---: | ---: | ---: | --- |\n| - | none detected | - | - | - | - |';
  return [
    '| Method | Route | Start line | End line | Lines | Block sha |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...routes.map((route) => `| ${route.method} | \`${route.route}\` | ${route.line} | ${route.endLine || '-'} | ${route.lineCount || '-'} | \`${route.blockSha || '-'}\` |`),
  ].join('\n');
}

function formatBehaviorTable(routes) {
  if (routes.length === 0) return '| Route | Auth | Limiter | Catch | DB guard | PostService | Mask | View | Ranking | Cache | Pagination |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| none detected | - | - | - | - | - | - | - | - | - | - |';
  return [
    '| Route | Auth | Limiter | Catch | DB guard | PostService | Mask | View | Ranking | Cache | Pagination |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...routes.map((route) => {
      const flags = route.behaviorFlags || {};
      return `| \`${route.method} ${route.route}\` | ${formatFlag(flags.auth)} | ${formatFlag(flags.limiter)} | ${formatFlag(flags.catchAsync)} | ${formatFlag(flags.dbGuard)} | ${formatFlag(flags.PostService)} | ${formatFlag(flags.maskContact)} | ${formatFlag(flags.recordViews)} | ${formatFlag(flags.rankingRefresh)} | ${formatFlag(flags.cache)} | ${formatFlag(flags.pagination)} |`;
    }),
  ].join('\n');
}

function buildProbePayload({ postLikeRoutes, likelyDetailRoutes, supported }) {
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/migrate-post-detail-route-registration.mjs',
    sourceFile: 'server/bootstrap.ts',
    summary: {
      postLikeRouteCount: postLikeRoutes.length,
      likelyDetailRouteCount: likelyDetailRoutes.length,
      supportedExactDetailMarkerFound: Boolean(supported),
      supportedExactDetailMarker: supported?.route || null,
      supportedExactDetailMarkerLineRange: supported ? formatLineRange(supported) : null,
      supportedExactDetailMarkerBlockSha: supported?.blockSha || null,
    },
    supportedExactMarkers: POST_DETAIL_ROUTE_CANDIDATES,
    likelyDetailRoutes,
    postLikeRoutes,
    safety: {
      mutatesBootstrap: false,
      mutatesPostRoutes: false,
      purpose: 'Report handler block ranges, block fingerprints, and behavior flags before any route extraction.',
    },
  };
}

async function writeProbeReport(payload) {
  const { postLikeRoutes, likelyDetailRoutes, supported } = payload;
  const markdown = `# Post Detail Route Probe

Generated by \`scripts/migrate-post-detail-route-registration.mjs\`.

## Summary

| Area | Value |
| --- | ---: |
| post-like routes still in bootstrap.ts | ${postLikeRoutes.length} |
| likely detail GET routes | ${likelyDetailRoutes.length} |
| supported exact detail marker found | ${supported ? 'yes' : 'no'} |
| supported exact detail marker line range | ${supported ? formatLineRange(supported) : '-'} |
| supported exact detail marker block sha | ${supported?.blockSha || '-'} |
| machine-readable report | \`artifacts/post-detail-route-probe.json\` |

## Handler Block Ranges

${formatRouteTable(postLikeRoutes)}

## Behavior Flags

${formatBehaviorTable(postLikeRoutes)}

## Likely Detail GET Routes

${formatRouteTable(likelyDetailRoutes)}

## Safety Rule

This probe never deletes or rewrites \`server/bootstrap.ts\`. It only reports route candidates, handler block ranges, block fingerprints, and behavior flags.
`;

  await fs.mkdir(path.dirname(MARKDOWN_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(MARKDOWN_OUTPUT_PATH, markdown, 'utf8');
  await fs.writeFile(JSON_OUTPUT_PATH, `${JSON.stringify(buildProbePayload(payload), null, 2)}\n`, 'utf8');
}

async function main() {
  const bootstrap = await fs.readFile(BOOTSTRAP_PATH, 'utf8');
  const postRoutesContent = await fs.readFile(POST_ROUTES_PATH, 'utf8');
  ensurePostRoutesCanAcceptDetail(postRoutesContent);

  const postLikeRoutes = collectPostLikeRoutes(bootstrap);
  const likelyDetailRoutes = detectLikelyDetailRoutes(postLikeRoutes);
  const supported = findSupportedDetailRoute(bootstrap);
  await writeProbeReport({ postLikeRoutes, likelyDetailRoutes, supported });

  console.log('\n=== Post Detail Route Migration Probe ===');
  console.log(`Post-like routes: ${postLikeRoutes.length}`);
  console.log(`Likely detail routes: ${likelyDetailRoutes.length}`);
  console.log(`Probe reports written to ${path.relative(ROOT, MARKDOWN_OUTPUT_PATH)} and ${path.relative(ROOT, JSON_OUTPUT_PATH)}`);
}

main().catch((error) => {
  console.error('[migrate-post-detail-route-registration] failed:', error);
  process.exitCode = 1;
});
