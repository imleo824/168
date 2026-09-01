import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const cssRoots = ['src/index.css', 'src/styles'];
const failures = [];

function walk(entry) {
  const absolute = path.join(root, entry);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return entry.endsWith('.css') ? [entry] : [];

  const files = [];
  for (const name of fs.readdirSync(absolute)) {
    files.push(...walk(path.join(entry, name)));
  }
  return files;
}

function scanCss(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const stack = [];
  let line = 1;
  let column = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '\n') {
      line += 1;
      column = 0;
      continue;
    }
    column += 1;

    if (char === '/' && next === '*') {
      index += 2;
      column += 1;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') {
          line += 1;
          column = 0;
        } else {
          column += 1;
        }
        index += 1;
      }
      if (index >= source.length) {
        return `unterminated comment starting before line ${line}`;
      }
      index += 1;
      column += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      while (index + 1 < source.length) {
        index += 1;
        const quoted = source[index];
        if (quoted === '\\') {
          index += 1;
          column += 2;
          continue;
        }
        if (quoted === quote) {
          column += 1;
          break;
        }
        if (quoted === '\n') {
          line += 1;
          column = 0;
        } else {
          column += 1;
        }
      }
      continue;
    }

    if (char === '{') {
      stack.push({ line, column });
      continue;
    }

    if (char === '}') {
      const opening = stack.pop();
      if (!opening) {
        return `extra closing brace at line ${line}, column ${column}`;
      }
    }
  }

  const opening = stack.pop();
  if (opening) {
    return `unclosed opening brace from line ${opening.line}, column ${opening.column}`;
  }
  return null;
}

for (const cssRoot of cssRoots) {
  for (const file of walk(cssRoot)) {
    const failure = scanCss(file);
    if (failure) failures.push(`${file}: ${failure}`);
  }
}

if (failures.length > 0) {
  console.error('[css-syntax-guards] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[css-syntax-guards] passed');
