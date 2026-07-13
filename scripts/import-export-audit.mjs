#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['src', 'server', 'shared'];
const ROOT_FILES = ['server.ts'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'artifacts']);
const IGNORED_IMPORT_EXTENSIONS = new Set([
  '.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.json', '.sql', '.md', '.txt', '.wasm',
]);

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.includes(path.extname(filePath));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && isSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectSourceFiles() {
  const files = [];
  for (const root of SOURCE_ROOTS) {
    const fullRoot = path.join(ROOT, root);
    if (await pathExists(fullRoot)) files.push(...await walk(fullRoot));
  }
  for (const rootFile of ROOT_FILES) {
    const fullPath = path.join(ROOT, rootFile);
    if (await pathExists(fullPath)) files.push(fullPath);
  }
  return Array.from(new Set(files)).sort();
}

function isLocalImport(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('~/');
}

function shouldSkipImport(specifier) {
  const extension = path.extname(specifier.split('?')[0]);
  return extension && IGNORED_IMPORT_EXTENSIONS.has(extension);
}

function toAbsoluteImportBase(importerFile, specifier) {
  if (specifier.startsWith('@/')) return path.join(ROOT, 'src', specifier.slice(2));
  if (specifier.startsWith('~/')) return path.join(ROOT, specifier.slice(2));
  return path.resolve(path.dirname(importerFile), specifier);
}

async function resolveImportTarget(importerFile, specifier) {
  if (!isLocalImport(specifier) || shouldSkipImport(specifier)) return null;
  const base = toAbsoluteImportBase(importerFile, specifier);
  const extension = path.extname(base);
  const candidates = [];

  if (extension && SOURCE_EXTENSIONS.includes(extension)) {
    candidates.push(base);
  } else {
    for (const ext of SOURCE_EXTENSIONS) candidates.push(`${base}${ext}`);
    for (const ext of SOURCE_EXTENSIONS) candidates.push(path.join(base, `index${ext}`));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

function parseNamedImports(content) {
  const imports = [];
  const importPattern = /import\s+(?:type\s+)?[\s\S]*?\{([\s\S]*?)\}[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(content))) {
    const rawNames = match[1];
    const specifier = match[2];
    const names = rawNames
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/^type\s+/, '').trim())
      .map((part) => part.split(/\s+as\s+/i)[0]?.trim())
      .filter((name) => name && name !== 'default');
    if (names.length > 0) imports.push({ specifier, names });
  }
  return imports;
}

function parseDirectExports(content) {
  const exports = new Set();
  const declarationPattern = /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  let match;
  while ((match = declarationPattern.exec(content))) exports.add(match[1]);

  const namedExportPattern = /export\s+(?:type\s+)?\{([\s\S]*?)\}(?:\s+from\s+['"][^'"]+['"])?\s*;?/g;
  while ((match = namedExportPattern.exec(content))) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const rawName of names) {
      const clean = rawName.replace(/^type\s+/, '').trim();
      const aliasMatch = clean.match(/\s+as\s+([A-Za-z_$][\w$]*)$/i);
      const exportedName = aliasMatch ? aliasMatch[1] : clean.split(/\s+/)[0];
      if (exportedName && exportedName !== 'default') exports.add(exportedName);
    }
  }

  return exports;
}

function parseStarReExports(content) {
  const specs = [];
  const starPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = starPattern.exec(content))) specs.push(match[1]);
  return specs;
}

const exportCache = new Map();

async function collectExports(filePath, seen = new Set()) {
  const cacheKey = path.normalize(filePath);
  if (exportCache.has(cacheKey)) return exportCache.get(cacheKey);
  if (seen.has(cacheKey)) return new Set();
  seen.add(cacheKey);

  const content = await fs.readFile(filePath, 'utf8');
  const exports = parseDirectExports(content);

  for (const specifier of parseStarReExports(content)) {
    const target = await resolveImportTarget(filePath, specifier);
    if (!target) continue;
    const reExports = await collectExports(target, seen);
    for (const name of reExports) exports.add(name);
  }

  exportCache.set(cacheKey, exports);
  return exports;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

async function main() {
  console.log('\n=== Import / Export Audit ===');
  const files = await collectSourceFiles();
  const failures = [];
  let checkedImports = 0;

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const namedImports = parseNamedImports(content).filter((entry) => isLocalImport(entry.specifier));
    for (const entry of namedImports) {
      if (shouldSkipImport(entry.specifier)) continue;
      const target = await resolveImportTarget(file, entry.specifier);
      if (!target) continue;
      const exports = await collectExports(target);
      for (const name of entry.names) {
        checkedImports += 1;
        if (!exports.has(name)) {
          failures.push({
            importer: toRelative(file),
            target: toRelative(target),
            specifier: entry.specifier,
            name,
          });
        }
      }
    }
  }

  console.log(`Checked named local imports: ${checkedImports}`);

  if (failures.length > 0) {
    console.log('\nMissing named exports detected:');
    for (const failure of failures) {
      console.log(`  - ${failure.importer} imports { ${failure.name} } from ${failure.specifier}`);
      console.log(`    resolved target: ${failure.target}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('All checked named local imports resolve to exported symbols.');
}

main().catch((error) => {
  console.error('[import-export-audit] failed:', error);
  process.exitCode = 1;
});
