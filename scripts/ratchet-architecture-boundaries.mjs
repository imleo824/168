#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArchitectureBoundaries } from './lib/architecture-boundaries.mjs';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'config/architecture-boundaries.json');
const BOOTSTRAP_PATH = path.join(ROOT, 'server/bootstrap.ts');
const ROUTES_DIR = path.join(ROOT, 'server/routes');
const SRC_DIR = path.join(ROOT, 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const ROUTE_EXTENSIONS = new Set(['.ts', '.js', '.mjs']);
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);
const IGNORE_ROUTE_FILES = new Set(['route-module.ts']);

const ALLOWED_API_LAYER_PATTERNS = [
  /^src\/services\/api\.ts$/,
  /^src\/services\/.+\.(ts|tsx|js|jsx)$/,
  /^src\/features\/[^/]+\/services\/.+\.(ts|tsx|js|jsx)$/,
  /^src\/features\/[^/]+\/api\/.+\.(ts|tsx|js|jsx)$/,
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
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }
  return output;
}

async function walkRouteFiles(dir, output = []) {
  if (!(await pathExists(dir))) return output;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkRouteFiles(fullPath, output);
      continue;
    }
    if (!ROUTE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (IGNORE_ROUTE_FILES.has(entry.name)) continue;
    output.push(fullPath);
  }
  return output;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function countMatches(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function isAllowedApiLayer(relativePath) {
  return ALLOWED_API_LAYER_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function extractApiLiterals(content) {
  const literals = [];
  const pattern = /[`'"]((?:\/api\/)(?:\\.|(?![`'"]).)+?)[`'"]/g;
  let match;
  while ((match = pattern.exec(content))) literals.push(match[1]);
  return literals;
}

function extractDirectFetches(content) {
  const fetches = [];
  const pattern = /\b(fetch|apiFetch|fetcher|pageFetcher)\s*\(\s*([`'"])(\/api\/[^`'"]*?)\2/g;
  let match;
  while ((match = pattern.exec(content))) fetches.push(match[3]);
  return fetches;
}

function findLargeHandlers(content, maxLongHandlerLines) {
  const routePattern = /\b(?:app|router)\.(get|post|put|patch|delete)\(/g;
  const starts = [];
  let match;
  while ((match = routePattern.exec(content))) starts.push(match.index);
  let largeHandlers = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    const end = starts[index + 1] ?? content.length;
    const lines = content.slice(start, end).split('\n').length;
    if (lines > maxLongHandlerLines) largeHandlers += 1;
  }
  return largeHandlers;
}

function ratchetNumber(section, key, observed) {
  const before = section[key];
  if (!Number.isFinite(before)) throw new Error(`Invalid architecture boundary: ${key}`);
  const after = Math.min(before, observed);
  section[key] = after;
  return { key, before, after, observed, changed: after !== before };
}

async function collectBootstrapMetrics() {
  const content = await fs.readFile(BOOTSTRAP_PATH, 'utf8');
  return {
    maxLines: content.split('\n').length,
    maxRouteLiterals: countMatches(content, /\bapp\.(get|post|put|patch|delete|use)\(\s*([`'"])(\/api\/[^`'"]*?)\2/g),
    maxDirectAppRouteCalls: countMatches(content, /\bapp\.(get|post|put|patch|delete)\(/g),
  };
}

async function collectRouteMetrics(config) {
  const routeFiles = await walkRouteFiles(ROUTES_DIR);
  let filesWithPrisma = 0;
  let filesWithLargeHandlers = 0;
  for (const filePath of routeFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const prismaOps = countMatches(content, /\bprisma\.[a-zA-Z]+\.(findMany|findUnique|findFirst|create|update|delete|count|aggregate|groupBy|upsert)\b/g);
    if (prismaOps > 0) filesWithPrisma += 1;
    const largeHandlers = findLargeHandlers(content, config.routes.maxLongHandlerLines);
    if (largeHandlers > 0) filesWithLargeHandlers += 1;
  }
  return {
    maxRouteFilesWithPrismaBusinessQueries: filesWithPrisma,
    maxRouteFilesWithLargeHandlers: filesWithLargeHandlers,
    maxLongHandlerLines: config.routes.maxLongHandlerLines,
  };
}

async function collectFrontendApiMetrics() {
  const files = await walkFiles(SRC_DIR);
  let outsideFiles = 0;
  let outsideLiterals = 0;
  for (const filePath of files) {
    const relativePath = toRelative(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    const apiLiterals = extractApiLiterals(content);
    const directFetches = extractDirectFetches(content);
    if (apiLiterals.length === 0 && directFetches.length === 0) continue;
    if (!isAllowedApiLayer(relativePath)) {
      outsideFiles += 1;
      outsideLiterals += apiLiterals.length + directFetches.length;
    }
  }
  return {
    maxDirectApiFilesOutsideAllowedApiLayers: outsideFiles,
    maxDirectApiLiteralsOutsideAllowedApiLayers: outsideLiterals,
  };
}

async function main() {
  const config = await loadArchitectureBoundaries(ROOT);
  const changes = [];

  const bootstrap = await collectBootstrapMetrics();
  changes.push(ratchetNumber(config.bootstrap, 'maxLines', bootstrap.maxLines));
  changes.push(ratchetNumber(config.bootstrap, 'maxRouteLiterals', bootstrap.maxRouteLiterals));
  changes.push(ratchetNumber(config.bootstrap, 'maxDirectAppRouteCalls', bootstrap.maxDirectAppRouteCalls));

  const routes = await collectRouteMetrics(config);
  changes.push(ratchetNumber(config.routes, 'maxRouteFilesWithPrismaBusinessQueries', routes.maxRouteFilesWithPrismaBusinessQueries));
  changes.push(ratchetNumber(config.routes, 'maxRouteFilesWithLargeHandlers', routes.maxRouteFilesWithLargeHandlers));

  const frontendApi = await collectFrontendApiMetrics();
  changes.push(ratchetNumber(config.frontendApi, 'maxDirectApiFilesOutsideAllowedApiLayers', frontendApi.maxDirectApiFilesOutsideAllowedApiLayers));
  changes.push(ratchetNumber(config.frontendApi, 'maxDirectApiLiteralsOutsideAllowedApiLayers', frontendApi.maxDirectApiLiteralsOutsideAllowedApiLayers));

  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  console.log('\n=== Architecture Boundary Ratchet ===');
  changes.forEach((change) => {
    const status = change.changed ? 'lowered' : 'kept';
    console.log(`  ${status.padEnd(7)} ${change.key}: ${change.before} -> ${change.after} (observed ${change.observed})`);
  });
  console.log('\nUpdated config/architecture-boundaries.json without increasing any boundary.');
}

main().catch((error) => {
  console.error('[ratchet-architecture-boundaries] failed:', error);
  process.exitCode = 1;
});
