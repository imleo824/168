#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArchitectureBoundaries, requireBoundarySection, requireNumber } from './lib/architecture-boundaries.mjs';

const ROOT = process.cwd();
const BOOTSTRAP_PATH = path.join(ROOT, 'server/bootstrap.ts');
const STRICT = process.env.BOOTSTRAP_BOUNDARY_STRICT === '1';

const ALLOWED_TOP_LEVEL_BOOTSTRAP_CONCERNS = [
  'environment loading',
  'express app creation',
  'security middleware composition',
  'route module registration',
  'scheduler startup',
  'http server startup',
];

function countMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function findRouteCalls(content) {
  const pattern = /\bapp\.(get|post|put|patch|delete|use)\(\s*([`'"])(\/api\/[^`'"]*?)\2/g;
  const routes = [];
  let match;
  while ((match = pattern.exec(content))) {
    routes.push({ method: match[1].toUpperCase(), path: match[3], line: lineNumberForIndex(content, match.index) });
  }
  return routes;
}

async function main() {
  const config = await loadArchitectureBoundaries(ROOT);
  const bootstrapBoundary = requireBoundarySection(config, 'bootstrap');
  const baseline = {
    maxLines: requireNumber(bootstrapBoundary, 'maxLines'),
    maxRouteLiterals: requireNumber(bootstrapBoundary, 'maxRouteLiterals'),
    maxDirectAppRouteCalls: requireNumber(bootstrapBoundary, 'maxDirectAppRouteCalls'),
  };

  const content = await fs.readFile(BOOTSTRAP_PATH, 'utf8');
  const lineCount = content.split('\n').length;
  const routeCalls = findRouteCalls(content);
  const directAppRouteCalls = countMatches(content, /\bapp\.(get|post|put|patch|delete)\(/g);
  const inlineBusinessHints = countMatches(content, /\bprisma\.[a-zA-Z]+\.(findMany|findUnique|create|update|delete|count|aggregate|groupBy|upsert)\b/g);

  const violations = [];
  if (lineCount > baseline.maxLines) {
    violations.push(`server/bootstrap.ts has ${lineCount} lines, baseline max is ${baseline.maxLines}. Move new code into route/service modules.`);
  }
  if (routeCalls.length > baseline.maxRouteLiterals) {
    violations.push(`server/bootstrap.ts has ${routeCalls.length} /api route literals, baseline max is ${baseline.maxRouteLiterals}. New APIs must live in server/routes/*.routes.ts.`);
  }
  if (directAppRouteCalls > baseline.maxDirectAppRouteCalls) {
    violations.push(`server/bootstrap.ts has ${directAppRouteCalls} direct app route calls, baseline max is ${baseline.maxDirectAppRouteCalls}. Register route modules instead.`);
  }

  console.log('\n=== Bootstrap Boundary Guard ===');
  console.log('Boundary config: config/architecture-boundaries.json#bootstrap');
  console.log(`Allowed top-level concerns: ${ALLOWED_TOP_LEVEL_BOOTSTRAP_CONCERNS.join(', ')}`);
  console.log(`server/bootstrap.ts lines: ${lineCount} / ${baseline.maxLines}`);
  console.log(`server/bootstrap.ts /api route literals: ${routeCalls.length} / ${baseline.maxRouteLiterals}`);
  console.log(`server/bootstrap.ts direct app route calls: ${directAppRouteCalls} / ${baseline.maxDirectAppRouteCalls}`);
  console.log(`server/bootstrap.ts inline Prisma business-operation hints: ${inlineBusinessHints}`);

  if (routeCalls.length > 0) {
    console.log('\nCurrent bootstrap route inventory sample:');
    routeCalls.slice(0, 80).forEach((route) => {
      console.log(`  ${String(route.line).padStart(5)} ${route.method.padEnd(6)} ${route.path}`);
    });
    if (routeCalls.length > 80) console.log(`  ... ${routeCalls.length - 80} more`);
  }

  if (violations.length > 0) {
    console.log('\nBoundary violations:');
    violations.forEach((violation) => console.log(`  - ${violation}`));
  } else {
    console.log('\nNo bootstrap boundary growth detected.');
  }

  console.log('\nRefactor target: reduce config/architecture-boundaries.json#bootstrap after each route extraction until bootstrap only composes modules.');

  if (STRICT && violations.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[bootstrap-boundary-guard] failed:', error);
  process.exitCode = 1;
});
