import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const jsonOutput = process.argv.includes('--json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  const stat = fs.statSync(absoluteEntry);
  if (stat.isFile()) return predicate(relativeEntry) ? [relativeEntry] : [];

  const files = [];
  for (const name of fs.readdirSync(absoluteEntry)) {
    files.push(...walk(path.join(relativeEntry, name), predicate));
  }
  return files;
}

function normalizeImportTarget(fromFile, rawTarget) {
  if (!rawTarget.startsWith('.')) return rawTarget;
  const withExtension = rawTarget.endsWith('.css') ? rawTarget : `${rawTarget}.css`;
  return path.normalize(path.join(path.dirname(fromFile), withExtension));
}

function collectFlatCssRules(file) {
  const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let selectorStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      const selector = source.slice(selectorStart, index).trim();
      stack.push({ selector, bodyStart: index + 1 });
      selectorStart = index + 1;
      continue;
    }

    if (char !== '}') continue;

    const rule = stack.pop();
    if (!rule) {
      selectorStart = index + 1;
      continue;
    }

    const declarations = source.slice(rule.bodyStart, index);
    if (!declarations.includes('{')) {
      rules.push({
        selector: rule.selector.replace(/\s+/g, ' '),
        declarations,
      });
    }
    selectorStart = index + 1;
  }

  return rules;
}

function declarationProperties(declarations) {
  const props = [];
  for (const line of declarations.split(/;|\r?\n/)) {
    const match = line.match(/^\s*([-\w]+)\s*:/);
    if (match) props.push(match[1]);
  }
  return props;
}

const cssFiles = ['src/index.css', ...walk('src/styles', (entry) => entry.endsWith('.css'))].sort();
const styleFiles = cssFiles.filter((file) => file !== 'src/index.css');
const importGraph = [];
const tokenDefinitions = new Map();
const selectorProperties = new Map();
const selectorRisk = [];
const fileStats = [];

for (const file of cssFiles) {
  const source = read(file);
  const imports = [...source.matchAll(/@import\s+["']([^"']+)/g)].map((match) =>
    normalizeImportTarget(file, match[1]),
  );
  importGraph.push({ file, imports });
}

for (const file of styleFiles) {
  const source = read(file);
  const rules = collectFlatCssRules(file);
  const lines = source.split(/\r?\n/).length;

  fileStats.push({
    file,
    lines,
    selectors: rules.length,
    hasSelectors: (source.match(/:has\(/g) || []).length,
    broadClassSelectors: (source.match(/\[class\*=/g) || []).length,
  });

  for (const rule of rules) {
    if (rule.selector.includes(':has(') || rule.selector.includes('[class*=')) {
      selectorRisk.push({
        file,
        selector: rule.selector,
        has: rule.selector.includes(':has('),
        broadClass: rule.selector.includes('[class*='),
      });
    }

    for (const match of rule.declarations.matchAll(/(--ui-[a-zA-Z0-9-_]+)\s*:/g)) {
      const definitions = tokenDefinitions.get(match[1]) || [];
      definitions.push({
        file,
        selector: rule.selector,
        root: rule.selector.includes(':root'),
      });
      tokenDefinitions.set(match[1], definitions);
    }

    for (const prop of declarationProperties(rule.declarations)) {
      const key = `${rule.selector}|||${prop}`;
      const owners = selectorProperties.get(key) || new Set();
      owners.add(file);
      selectorProperties.set(key, owners);
    }
  }
}

const duplicateRootTokens = [];
const duplicateScopedTokens = [];
for (const [token, definitions] of tokenDefinitions.entries()) {
  const rootDefinitions = definitions.filter((definition) => definition.root);
  const rootFiles = [...new Set(rootDefinitions.map((definition) => definition.file))].sort();
  const allFiles = [...new Set(definitions.map((definition) => definition.file))].sort();

  if (rootFiles.length > 1) {
    duplicateRootTokens.push({ token, files: rootFiles });
  } else if (allFiles.length > 1) {
    duplicateScopedTokens.push({ token, files: allFiles });
  }
}

const selectorPropertyOverlaps = [...selectorProperties.entries()]
  .map(([key, owners]) => {
    const [selector, property] = key.split('|||');
    return { selector, property, files: [...owners].sort() };
  })
  .filter((entry) => entry.files.length > 1)
  .sort((a, b) => b.files.length - a.files.length || a.selector.localeCompare(b.selector));

const report = {
  summary: {
    cssFiles: styleFiles.length,
    cssLines: fileStats.reduce((sum, item) => sum + item.lines, 0),
    duplicateRootTokens: duplicateRootTokens.length,
    duplicateScopedTokens: duplicateScopedTokens.length,
    selectorPropertyOverlaps: selectorPropertyOverlaps.length,
    broadClassSelectors: selectorRisk.filter((item) => item.broadClass).length,
    hasSelectors: selectorRisk.filter((item) => item.has).length,
  },
  largestFiles: [...fileStats].sort((a, b) => b.lines - a.lines).slice(0, 20),
  importGraph,
  duplicateRootTokens,
  duplicateScopedTokens,
  selectorPropertyOverlaps,
  selectorRisk,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('[css-architecture-audit]');
  console.log(`CSS files: ${report.summary.cssFiles}`);
  console.log(`CSS lines: ${report.summary.cssLines}`);
  console.log(`Duplicate root tokens: ${report.summary.duplicateRootTokens}`);
  console.log(`Duplicate scoped tokens: ${report.summary.duplicateScopedTokens}`);
  console.log(`Selector/property overlaps: ${report.summary.selectorPropertyOverlaps}`);
  console.log(`Broad [class*=] selectors: ${report.summary.broadClassSelectors}`);
  console.log(`:has selectors: ${report.summary.hasSelectors}`);
  console.log('');
  console.log('Largest CSS owners:');
  for (const item of report.largestFiles.slice(0, 10)) {
    console.log(`- ${item.file}: ${item.lines} lines, ${item.selectors} selectors`);
  }
}
