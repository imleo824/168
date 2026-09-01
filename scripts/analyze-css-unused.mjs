import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = [join(ROOT, 'src')];
const CSS_DIRS = [join(ROOT, 'src', 'styles')];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const CSS_EXTENSION = '.css';

function walk(dir, filePredicate) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;

    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(filePath, filePredicate));
      continue;
    }
    if (!filePredicate(filePath)) continue;
    files.push(filePath);
  }

  return files;
}

function ext(file) {
  const idx = file.lastIndexOf('.');
  return idx === -1 ? '' : file.slice(idx);
}

function splitTemplatePieces(template) {
  const pieces = [];
  let cur = '';
  let i = 0;
  let depth = 0;

  while (i < template.length) {
    const ch = template[i];

    if (ch === '\\' && i + 1 < template.length) {
      cur += template.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (ch === '$' && template[i + 1] === '{' && depth === 0) {
      if (cur.trim()) {
        pieces.push(cur);
        cur = '';
      }
      depth = 1;
      i += 2;
      while (i < template.length && depth > 0) {
        if (template[i] === '{') depth += 1;
        else if (template[i] === '}') depth -= 1;
        i += 1;
      }
      continue;
    }

    if (depth > 0) {
      i += 1;
      continue;
    }

    cur += ch;
    i += 1;
  }

  if (cur.trim()) pieces.push(cur);
  return pieces;
}

function addClassTokensFromString(raw, acc, knownClasses = null) {
  if (!raw) return;
  const cleaned = raw
    .replace(/`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return;

  for (const token of cleaned.split(' ')) {
    const t = token.trim();
    if (!t || t.startsWith('{') || t.startsWith('}') || t.includes('${')) continue;
    if (knownClasses && !knownClasses.has(t)) continue;
    acc.add(t);
  }
}

function collectKnownClassTokensFromStringLiterals(content, acc, knownClasses) {
  const quotedStringPatterns = [
    /'((?:\\[\s\S]|[^'\\])*)'/g,
    /"((?:\\[\s\S]|[^"\\])*)"/g,
  ];

  for (const pattern of quotedStringPatterns) {
    for (const match of content.matchAll(pattern)) {
      addClassTokensFromString(match[1], acc, knownClasses);
    }
  }

  const templateStringRe = /`((?:\\[\s\S]|[^`\\])*)`/g;
  for (const match of content.matchAll(templateStringRe)) {
    for (const piece of splitTemplatePieces(match[1])) {
      addClassTokensFromString(piece, acc, knownClasses);
    }
  }
}

function collectUsedClassesFromSource(content, acc, knownClasses) {
  // className="..." or class='...'
  const staticAttrRe = /(?:className|class)\s*=\s*([\"'])(.*?)\1/gms;
  for (const match of content.matchAll(staticAttrRe)) {
    addClassTokensFromString(match[2], acc);
  }

  // className={`...`}
  const templateAttrRe = /(?:className|class)\s*=\s*\{\s*`([\s\S]*?)`\s*\}/g;
  for (const match of content.matchAll(templateAttrRe)) {
    for (const piece of splitTemplatePieces(match[1])) {
      addClassTokensFromString(piece, acc);
    }
  }

  // className={cn('a','b')} or className={foo('a','b')}
  const funcAttrRe = /(?:className|class)\s*=\s*\{([\s\S]*?)\}/g;
  for (const match of content.matchAll(funcAttrRe)) {
    const expr = match[1];
    const simpleRe = /[\"']([^\"']+)[\"']/g;
    for (const m of expr.matchAll(simpleRe)) {
      addClassTokensFromString(m[1], acc);
    }
  }

  // DOM API calls like el.classList.add('x', 'y')
  const domClassApiRe = /classList\.(?:add|remove|toggle|contains)\(([^)]*)\)/g;
  for (const match of content.matchAll(domClassApiRe)) {
    const args = match[1];
    for (const m of args.matchAll(/([\"'])(.*?)\1/g)) {
      addClassTokensFromString(m[2], acc);
    }
  }

  // Reusable class constants and component props often keep class names in
  // ordinary strings instead of directly inside className. Restrict this wider
  // scan to classes already defined by CSS so prose and API strings stay out.
  collectKnownClassTokensFromStringLiterals(content, acc, knownClasses);
}

function collectClassSelectors(cssText, fileRel, map) {
  const content = cssText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*@import\s+[^;]+;/gm, ' ');
  const classRe = /\.([_A-Za-z][_A-Za-z0-9-]*)/g;
  const selectorRe = /([^{}]+)\{/g;

  let match;
  while ((match = selectorRe.exec(content)) !== null) {
    const selectorChunk = match[1];
    const matchedText = match[0];
    const start = match.index;
    const selectorPart = selectorChunk.trim();
    if (!selectorPart.includes('.')) continue;

    const lineNo = content.slice(0, start).split('\n').length;

    for (const m of selectorPart.matchAll(classRe)) {
      const cls = m[1];
      if (!map.has(cls)) map.set(cls, []);
      map
        .get(cls)
        .push({ file: fileRel, line: lineNo, selector: selectorPart, raw: matchedText.slice(0, 180) });
    }
  }
}

const sourceFiles = walk(SOURCE_DIRS[0], (file) => SOURCE_EXTENSIONS.has(ext(file)));
const cssFiles = walk(CSS_DIRS[0], (file) => ext(file) === CSS_EXTENSION);

const definedClasses = new Map();
for (const file of cssFiles) {
  const fileRel = relative(ROOT, file);
  const cssText = readFileSync(file, 'utf8');
  collectClassSelectors(cssText, fileRel, definedClasses);
}

const knownClasses = new Set(definedClasses.keys());
const usedClasses = new Set();
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  collectUsedClassesFromSource(content, usedClasses, knownClasses);
}

const defined = [...definedClasses.keys()].sort();
const used = [...usedClasses].sort();
const unused = defined.filter((c) => !usedClasses.has(c));

const ignorePatterns = [
  /^swiper-/,
  /^ant-/,
  /^rc-/,
  /^rdx-/,
  /^toast/,
  /^modal$/, // plugin/runtime modal hooks
  /^hljs/,
  /^prism/,
  /^syntax/,
  /^is-/,
  /^has-/,
  /^show-/,
];

const highConfidenceUnused = unused.filter((cls) => !ignorePatterns.some((r) => r.test(cls)));
const duplicates = [...definedClasses.entries()].filter(([, refs]) => refs.length > 1);

const reportJson = {
  generatedAt: new Date().toISOString(),
  definedCount: defined.length,
  usedCount: used.length,
  unusedCount: unused.length,
  duplicateCount: duplicates.length,
  highConfidenceUnused,
  unused,
  duplicates: duplicates
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([className, refs]) => ({ className, count: refs.length, refs })),
};

mkdirSync(join(ROOT, 'tmp'), { recursive: true });
writeFileSync(join(ROOT, 'tmp', 'css-unused-report.json'), JSON.stringify(reportJson, null, 2));

console.log('CSS unused report generated:');
console.log('- JSON: tmp/css-unused-report.json');
console.log(`- defined: ${defined.length}`);
console.log(`- unused: ${unused.length}`);
console.log(`- highConfidence: ${highConfidenceUnused.length}`);
console.log(`- duplicates: ${duplicates.length}`);
