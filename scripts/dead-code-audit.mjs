#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['src', 'server', 'shared'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const EXTENSION_SET = new Set(EXTENSIONS);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.cache']);
const ENTRYPOINT_PATTERNS = [
  /^server\.ts$/,
  /^server\/bootstrap\.ts$/,
  /^src\/main\.(tsx|ts|jsx|js)$/,
  /^src\/App\.(tsx|ts|jsx|js)$/,
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
    if (!EXTENSION_SET.has(path.extname(entry.name))) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    output.push(fullPath);
  }
  return output;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function isEntrypoint(relativePath) {
  return ENTRYPOINT_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function extractImports(content) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"`]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+[^'"`]*?from\s*['"]([^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) imports.push(match[1]);
  }
  return imports;
}

function resolveLocalImport(fromFile, rawSpecifier, fileSet) {
  const basePath = rawSpecifier.startsWith('.')
    ? path.join(path.dirname(fromFile), rawSpecifier)
    : rawSpecifier.startsWith('@/')
      ? path.join('src', rawSpecifier.slice(2))
      : null;
  if (!basePath) return null;
  const base = path.normalize(basePath).split(path.sep).join('/');
  const candidates = [base];
  for (const extension of EXTENSIONS) candidates.push(`${base}${extension}`);
  for (const extension of EXTENSIONS) candidates.push(`${base}/index${extension}`);
  return candidates.find((candidate) => fileSet.has(candidate)) || null;
}

function extractNamedExports(content) {
  const exports = [];
  const patterns = [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+type\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+interface\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) exports.push(match[1]);
  }
  return exports;
}

function extractImportedNames(content) {
  const names = new Set();
  const namedImportPattern = /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = namedImportPattern.exec(content))) {
    match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const [name] = part.split(/\s+as\s+/i).map((item) => item.trim());
        if (name) names.add(name);
      });
  }
  const reExportPattern = /\bexport\s+\{([^}]+)\}\s+from\s*['"][^'"]+['"]/g;
  while ((match = reExportPattern.exec(content))) {
    match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const [name] = part.split(/\s+as\s+/i).map((item) => item.trim());
        if (name) names.add(name);
      });
  }
  return names;
}

function groupByBaseName(files) {
  const groups = new Map();
  for (const file of files) {
    const basename = path.basename(file).replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/, '');
    const group = groups.get(basename) || [];
    group.push(file);
    groups.set(basename, group);
  }
  return [...groups.entries()].filter(([, items]) => items.length > 1);
}

async function main() {
  const absoluteFiles = [];
  for (const dir of SOURCE_DIRS) await walkFiles(path.join(ROOT, dir), absoluteFiles);
  const files = [...new Set(absoluteFiles.map(toRelative))].sort();
  const fileSet = new Set(files);
  const contents = new Map();
  for (const file of files) {
    contents.set(file, await fs.readFile(path.join(ROOT, file), 'utf8'));
  }

  const inbound = new Map(files.map((file) => [file, new Set()]));
  const importedNames = new Set();
  for (const file of files) {
    const content = contents.get(file) || '';
    for (const name of extractImportedNames(content)) importedNames.add(name);
    for (const rawSpecifier of extractImports(content)) {
      const resolved = resolveLocalImport(file, rawSpecifier, fileSet);
      if (!resolved) continue;
      inbound.get(resolved)?.add(file);
    }
  }

  const orphanFiles = files.filter((file) => !isEntrypoint(file) && (inbound.get(file)?.size || 0) === 0);
  const duplicateBasenames = groupByBaseName(files);
  const unusedExports = [];
  for (const file of files) {
    const content = contents.get(file) || '';
    for (const name of extractNamedExports(content)) {
      if (importedNames.has(name)) continue;
      unusedExports.push({ file, name });
    }
  }

  console.log('\n=== Dead Code Audit ===');
  console.log(`Files scanned: ${files.length}`);
  console.log(`Potential orphan files: ${orphanFiles.length}`);
  console.log(`Duplicate basenames: ${duplicateBasenames.length}`);
  console.log(`Potential unused named exports: ${unusedExports.length}`);

  if (orphanFiles.length) {
    console.log('\nPotential orphan files requiring manual verification:');
    orphanFiles.slice(0, 80).forEach((file) => console.log(`  - ${file}`));
    if (orphanFiles.length > 80) console.log(`  ... ${orphanFiles.length - 80} more`);
  }

  if (duplicateBasenames.length) {
    console.log('\nDuplicate basenames that can confuse imports and ownership:');
    duplicateBasenames.slice(0, 40).forEach(([basename, items]) => {
      console.log(`  - ${basename}: ${items.join(', ')}`);
    });
    if (duplicateBasenames.length > 40) console.log(`  ... ${duplicateBasenames.length - 40} more`);
  }

  if (unusedExports.length) {
    console.log('\nPotential unused named exports requiring manual verification:');
    unusedExports.slice(0, 120).forEach(({ file, name }) => console.log(`  - ${file}: ${name}`));
    if (unusedExports.length > 120) console.log(`  ... ${unusedExports.length - 120} more`);
  }

  console.log('\nReview target: verify candidates before deletion. This audit is intentionally advisory because dynamic imports, route registration, and generated references can produce false positives.');
}

main().catch((error) => {
  console.error('[dead-code-audit] failed:', error);
  process.exitCode = 1;
});
