import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverRoot = path.join(root, 'server');
const ddlPattern = /\b(?:CREATE|ALTER|DROP)\s+(?:OR\s+REPLACE\s+)?(?:TABLE|INDEX|TYPE|FUNCTION|TRIGGER|EXTENSION)\b|ENABLE\s+ROW\s+LEVEL\s+SECURITY/i;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [target] : [];
  });
}

for (const file of sourceFiles(serverRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(
    source,
    ddlPattern,
    `${path.relative(root, file)} contains runtime DDL; move schema changes to prisma/migrations`,
  );
}

console.log('[runtime-ddl-guards] OK');
