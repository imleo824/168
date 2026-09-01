#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArchitectureBoundaries, requireBoundarySection, requireNumber } from './lib/architecture-boundaries.mjs';

const ROOT = process.cwd();
const STRICT = process.env.ROUTE_BOUNDARY_STRICT === '1';
const ROUTES_DIR = path.join(ROOT, 'server/routes');
const ACCOUNT_ROUTE_AGGREGATOR_FILE = path.join(ROOT, 'server/routes/account.routes.ts');
const ADDITIONAL_ROUTE_FILES = [
  path.join(ROOT, 'server/chat/chat.routes.ts'),
  path.join(ROOT, 'server/chat/chat.admin.routes.ts'),
];
const EXTENSIONS = new Set(['.ts', '.js', '.mjs']);
const IGNORE_FILES = new Set(['route-module.ts']);
const LOCAL_HTTP_HELPER_PATTERN = /\bfunction\s+(?:setPaginationHeaders|parse[A-Za-z]*(?:Limit|Cursor)|normalize(?:Boolean|String|Int|OptionalBoolean))\s*\(/g;
const SCHEDULER_STARTUP_PATTERN = /\b(?:start[A-Za-z]*(?:Scheduler|Observer|Supervisor|Scanner|Maintenance|Warmup)|schedulePublicFeedWarmup)\s*\(/g;
const ACCOUNT_ROUTE_MODULE_PATTERN = /^server\/routes\/account(?:-[a-z]+)?\.routes\.ts$/;
const ACCOUNT_ROUTE_IMPLEMENTATION_PATTERNS = [
  {
    name: 'bcrypt import/use',
    pattern: /\bfrom\s+['"]bcrypt['"]|\bbcrypt\./g,
  },
  {
    name: 'direct Prisma client usage',
    pattern: /\bprisma\.(?:[a-zA-Z]+|\$transaction)\b/g,
  },
];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, output = []) {
  if (!(await pathExists(dir))) return output;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    if (IGNORE_FILES.has(entry.name)) continue;
    output.push(fullPath);
  }
  return output;
}

async function getRouteFiles() {
  const files = await walkFiles(ROUTES_DIR);
  for (const filePath of ADDITIONAL_ROUTE_FILES) {
    if (await pathExists(filePath)) files.push(filePath);
  }
  return [...new Set(files)].sort();
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function countMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function getRoutePathSample(content) {
  const routePattern = /\b(?:app|router)\.(get|post|put|patch|delete|use)\(\s*([`'"])(\/api\/[^`'"]*?)\2/g;
  const routes = [];
  let match;
  while ((match = routePattern.exec(content))) {
    routes.push(`${match[1].toUpperCase()} ${match[3]}`);
  }
  return routes.slice(0, 12);
}

function findLargeHandlers(content, maxLongHandlerLines) {
  const routePattern = /\b(?:app|router)\.(get|post|put|patch|delete)\(/g;
  const starts = [];
  let match;
  while ((match = routePattern.exec(content))) starts.push(match.index);
  const handlers = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? content.length;
    const snippet = content.slice(start, end);
    const lines = snippet.split('\n').length;
    if (lines > maxLongHandlerLines) {
      handlers.push({ line: lineNumberForIndex(content, start), lines });
    }
  }
  return handlers;
}

function findLocalHttpHelpers(content) {
  const helpers = [];
  let match;
  while ((match = LOCAL_HTTP_HELPER_PATTERN.exec(content))) {
    helpers.push({ line: lineNumberForIndex(content, match.index), name: match[0].replace(/^function\s+/, '').replace(/\s*\($/, '') });
  }
  return helpers;
}

function findSchedulerStartups(content) {
  const startups = [];
  let match;
  while ((match = SCHEDULER_STARTUP_PATTERN.exec(content))) {
    startups.push({ line: lineNumberForIndex(content, match.index), call: match[0].replace(/\s*\($/, '') });
  }
  return startups;
}

function findNamedPatternMatches(content, patterns) {
  const matches = [];
  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      matches.push({ line: lineNumberForIndex(content, match.index), name });
    }
  }
  return matches;
}

async function main() {
  const config = await loadArchitectureBoundaries(ROOT);
  const routeBoundary = requireBoundarySection(config, 'routes');
  const baseline = {
    maxRouteFilesWithPrismaBusinessQueries: requireNumber(routeBoundary, 'maxRouteFilesWithPrismaBusinessQueries'),
    maxRouteFilesWithLargeHandlers: requireNumber(routeBoundary, 'maxRouteFilesWithLargeHandlers'),
    maxLongHandlerLines: requireNumber(routeBoundary, 'maxLongHandlerLines'),
    maxRouteFilesWithLocalHttpHelpers: requireNumber(routeBoundary, 'maxRouteFilesWithLocalHttpHelpers'),
    maxRouteFilesWithSchedulerStartup: requireNumber(routeBoundary, 'maxRouteFilesWithSchedulerStartup'),
    maxAccountRouteImplementationLeaks: requireNumber(routeBoundary, 'maxAccountRouteImplementationLeaks'),
    maxAccountAggregatorRouteRegistrations: requireNumber(routeBoundary, 'maxAccountAggregatorRouteRegistrations'),
  };

  const routeFiles = await getRouteFiles();
  const reports = [];

  for (const filePath of routeFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const relativePath = toRelative(filePath);
    const isAccountAggregatorFile = filePath === ACCOUNT_ROUTE_AGGREGATOR_FILE;
    const isAccountRouteModule = ACCOUNT_ROUTE_MODULE_PATTERN.test(relativePath);
    const prismaBusinessQueries = countMatches(content, /\bprisma\.[a-zA-Z]+\.(findMany|findUnique|findFirst|create|update|delete|count|aggregate|groupBy|upsert)\b/g);
    const transactionBlocks = countMatches(content, /\bprisma\.\$transaction\b/g);
    const routeCount = countMatches(content, /\b(?:app|router)\.(get|post|put|patch|delete|use)\(/g);
    const largeHandlers = findLargeHandlers(content, baseline.maxLongHandlerLines);
    const localHttpHelpers = findLocalHttpHelpers(content);
    const schedulerStartups = findSchedulerStartups(content);
    const accountRouteImplementationLeaks = isAccountRouteModule ? findNamedPatternMatches(content, ACCOUNT_ROUTE_IMPLEMENTATION_PATTERNS) : [];
    const accountAggregatorRouteRegistrations = isAccountAggregatorFile ? routeCount : 0;
    reports.push({
      file: relativePath,
      routeCount,
      prismaBusinessQueries,
      transactionBlocks,
      largeHandlers,
      localHttpHelpers,
      schedulerStartups,
      accountRouteImplementationLeaks,
      accountAggregatorRouteRegistrations,
      routeSamples: getRoutePathSample(content),
    });
  }

  const filesWithPrismaQueries = reports.filter((report) => report.prismaBusinessQueries > 0);
  const filesWithLargeHandlers = reports.filter((report) => report.largeHandlers.length > 0);
  const filesWithLocalHttpHelpers = reports.filter((report) => report.localHttpHelpers.length > 0);
  const filesWithSchedulerStartup = reports.filter((report) => report.schedulerStartups.length > 0);
  const accountRouteImplementationLeaks = reports.flatMap((report) => report.accountRouteImplementationLeaks.map((leak) => ({ ...leak, file: report.file })));
  const accountAggregatorRouteRegistrations = reports.reduce((total, report) => total + report.accountAggregatorRouteRegistrations, 0);
  const violations = [];

  if (filesWithPrismaQueries.length > baseline.maxRouteFilesWithPrismaBusinessQueries) {
    violations.push(`route files with direct Prisma business queries=${filesWithPrismaQueries.length}, baseline max=${baseline.maxRouteFilesWithPrismaBusinessQueries}`);
  }
  if (filesWithLargeHandlers.length > baseline.maxRouteFilesWithLargeHandlers) {
    violations.push(`route files with large handlers=${filesWithLargeHandlers.length}, baseline max=${baseline.maxRouteFilesWithLargeHandlers}`);
  }
  if (filesWithLocalHttpHelpers.length > baseline.maxRouteFilesWithLocalHttpHelpers) {
    violations.push(`route files with local HTTP helper redefinitions=${filesWithLocalHttpHelpers.length}, baseline max=${baseline.maxRouteFilesWithLocalHttpHelpers}`);
  }
  if (filesWithSchedulerStartup.length > baseline.maxRouteFilesWithSchedulerStartup) {
    violations.push(`route files starting background schedulers=${filesWithSchedulerStartup.length}, baseline max=${baseline.maxRouteFilesWithSchedulerStartup}`);
  }
  if (accountRouteImplementationLeaks.length > baseline.maxAccountRouteImplementationLeaks) {
    violations.push(`account route implementation leaks=${accountRouteImplementationLeaks.length}, baseline max=${baseline.maxAccountRouteImplementationLeaks}`);
  }
  if (accountAggregatorRouteRegistrations > baseline.maxAccountAggregatorRouteRegistrations) {
    violations.push(`account aggregator direct route registrations=${accountAggregatorRouteRegistrations}, baseline max=${baseline.maxAccountAggregatorRouteRegistrations}`);
  }

  console.log('\n=== Route Boundary Guard ===');
  console.log('Boundary config: config/architecture-boundaries.json#routes');
  console.log(`Route files scanned: ${reports.length}`);
  console.log(`Route files with direct Prisma business queries: ${filesWithPrismaQueries.length} / ${baseline.maxRouteFilesWithPrismaBusinessQueries}`);
  console.log(`Route files with large handlers: ${filesWithLargeHandlers.length} / ${baseline.maxRouteFilesWithLargeHandlers}`);
  console.log(`Route files with local HTTP helper redefinitions: ${filesWithLocalHttpHelpers.length} / ${baseline.maxRouteFilesWithLocalHttpHelpers}`);
  console.log(`Route files starting background schedulers: ${filesWithSchedulerStartup.length} / ${baseline.maxRouteFilesWithSchedulerStartup}`);
  console.log(`Account route implementation leaks: ${accountRouteImplementationLeaks.length} / ${baseline.maxAccountRouteImplementationLeaks}`);
  console.log(`Account aggregator direct route registrations: ${accountAggregatorRouteRegistrations} / ${baseline.maxAccountAggregatorRouteRegistrations}`);
  console.log(`Long handler threshold: ${baseline.maxLongHandlerLines} lines`);

  console.log('\nRoute file inventory:');
  reports
    .sort((a, b) => b.schedulerStartups.length - a.schedulerStartups.length || b.accountAggregatorRouteRegistrations - a.accountAggregatorRouteRegistrations || b.accountRouteImplementationLeaks.length - a.accountRouteImplementationLeaks.length || b.localHttpHelpers.length - a.localHttpHelpers.length || b.prismaBusinessQueries - a.prismaBusinessQueries || b.routeCount - a.routeCount)
    .forEach((report) => {
      console.log(`  ${report.file}`);
      console.log(`    routes=${report.routeCount} prismaOps=${report.prismaBusinessQueries} transactions=${report.transactionBlocks} localHttpHelpers=${report.localHttpHelpers.length} schedulerStartups=${report.schedulerStartups.length} accountImplementationLeaks=${report.accountRouteImplementationLeaks.length} accountAggregatorRoutes=${report.accountAggregatorRouteRegistrations}`);
      if (report.routeSamples.length) console.log(`    sample=${report.routeSamples.join(' | ')}`);
      if (report.schedulerStartups.length) {
        console.log(`    schedulerStartups=${report.schedulerStartups.map((startup) => `${startup.call}@${startup.line}`).join(', ')}`);
      }
      if (report.localHttpHelpers.length) {
        console.log(`    localHttpHelpers=${report.localHttpHelpers.map((helper) => `${helper.name}@${helper.line}`).join(', ')}`);
      }
      if (report.accountRouteImplementationLeaks.length) {
        console.log(`    accountImplementationLeaks=${report.accountRouteImplementationLeaks.map((leak) => `${leak.name}@${leak.line}`).join(', ')}`);
      }
      if (report.largeHandlers.length) {
        console.log(`    largeHandlers=${report.largeHandlers.map((handler) => `line ${handler.line}: ${handler.lines} lines`).join(', ')}`);
      }
    });

  if (violations.length) {
    console.log('\nBoundary violations:');
    violations.forEach((violation) => console.log(`  - ${violation}`));
  } else {
    console.log('\nNo route boundary growth detected.');
  }

  console.log('\nRefactor target: move route-level Prisma work into server/services or server/repositories, keep HTTP params/pagination in server/http helpers, keep background schedulers in startup modules, then lower config/architecture-boundaries.json#routes. Keep persistence and crypto implementation out of all server/routes/account*.routes.ts modules, and keep account.routes.ts as a submodule aggregator only.');

  if (STRICT && violations.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[route-boundary-guard] failed:', error);
  process.exitCode = 1;
});
