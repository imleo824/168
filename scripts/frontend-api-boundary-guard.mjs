#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadArchitectureBoundaries, requireBoundarySection, requireNumber } from './lib/architecture-boundaries.mjs';

const ROOT = process.cwd();
const STRICT = process.env.FRONTEND_API_BOUNDARY_STRICT === '1';
const SRC_DIR = path.join(ROOT, 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

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

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function isAllowedApiLayer(relativePath) {
  return ALLOWED_API_LAYER_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function extractApiLiterals(content) {
  const literals = [];
  const pattern = /[`'"]((?:\/api\/)(?:\\.|(?![`'"]).)+?)[`'"]/g;
  let match;
  while ((match = pattern.exec(content))) {
    literals.push({ value: match[1], line: lineNumberForIndex(content, match.index) });
  }
  return literals;
}

function extractDirectFetches(content) {
  const fetches = [];
  const pattern = /\b(fetch|apiFetch|fetcher|pageFetcher)\s*\(\s*([`'"])(\/api\/[^`'"]*?)\2/g;
  let match;
  while ((match = pattern.exec(content))) {
    fetches.push({ fn: match[1], value: match[3], line: lineNumberForIndex(content, match.index) });
  }
  return fetches;
}

async function main() {
  const config = await loadArchitectureBoundaries(ROOT);
  const frontendApiBoundary = requireBoundarySection(config, 'frontendApi');
  const baseline = {
    maxDirectApiFilesOutsideAllowedApiLayers: requireNumber(frontendApiBoundary, 'maxDirectApiFilesOutsideAllowedApiLayers'),
    maxDirectApiLiteralsOutsideAllowedApiLayers: requireNumber(frontendApiBoundary, 'maxDirectApiLiteralsOutsideAllowedApiLayers'),
  };

  const files = await walkFiles(SRC_DIR);
  const reports = [];

  for (const filePath of files) {
    const relativePath = toRelative(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    const apiLiterals = extractApiLiterals(content);
    const directFetches = extractDirectFetches(content);
    if (apiLiterals.length === 0 && directFetches.length === 0) continue;
    reports.push({
      file: relativePath,
      allowedLayer: isAllowedApiLayer(relativePath),
      apiLiterals,
      directFetches,
    });
  }

  const outsideAllowedLayers = reports.filter((report) => !report.allowedLayer);
  const outsideLiteralCount = outsideAllowedLayers.reduce((sum, report) => sum + report.apiLiterals.length + report.directFetches.length, 0);
  const violations = [];

  if (outsideAllowedLayers.length > baseline.maxDirectApiFilesOutsideAllowedApiLayers) {
    violations.push(`frontend files with /api literals outside API layers=${outsideAllowedLayers.length}, baseline max=${baseline.maxDirectApiFilesOutsideAllowedApiLayers}`);
  }
  if (outsideLiteralCount > baseline.maxDirectApiLiteralsOutsideAllowedApiLayers) {
    violations.push(`frontend /api literals outside API layers=${outsideLiteralCount}, baseline max=${baseline.maxDirectApiLiteralsOutsideAllowedApiLayers}`);
  }

  console.log('\n=== Frontend API Boundary Guard ===');
  console.log('Boundary config: config/architecture-boundaries.json#frontendApi');
  console.log(`Files containing /api literals: ${reports.length}`);
  console.log(`Files outside allowed API layers: ${outsideAllowedLayers.length} / ${baseline.maxDirectApiFilesOutsideAllowedApiLayers}`);
  console.log(`API literals outside allowed API layers: ${outsideLiteralCount} / ${baseline.maxDirectApiLiteralsOutsideAllowedApiLayers}`);

  if (outsideAllowedLayers.length) {
    console.log('\nFrontend files to migrate toward src/services/api.ts or feature service layers:');
    outsideAllowedLayers
      .sort((a, b) => (b.apiLiterals.length + b.directFetches.length) - (a.apiLiterals.length + a.directFetches.length))
      .slice(0, 80)
      .forEach((report) => {
        console.log(`  ${report.file}`);
        [...report.apiLiterals, ...report.directFetches]
          .slice(0, 8)
          .forEach((item) => console.log(`    line ${String(item.line).padStart(4)} ${item.value}`));
      });
    if (outsideAllowedLayers.length > 80) console.log(`  ... ${outsideAllowedLayers.length - 80} more files`);
  }

  if (violations.length) {
    console.log('\nBoundary violations:');
    violations.forEach((violation) => console.log(`  - ${violation}`));
  } else {
    console.log('\nNo frontend API boundary growth detected.');
  }

  console.log('\nRefactor target: move raw API paths out of pages/components and lower config/architecture-boundaries.json#frontendApi.');

  if (STRICT && violations.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[frontend-api-boundary-guard] failed:', error);
  process.exitCode = 1;
});
