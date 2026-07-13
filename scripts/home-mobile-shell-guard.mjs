#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

const FORBIDDEN_PATTERNS = [
  {
    name: 'home desktop shell class',
    pattern: /home-desktop-shell/g,
    why: '首页 PC 必须是移动端放大版，不能恢复桌面 shell。',
  },
  {
    name: 'active desktop home feed import',
    pattern: /from\s+['"].*HomeDesktopFeedContent['"]|import\(['"].*HomeDesktopFeedContent['"]\)/g,
    why: '首页 feed 只能走 HomeMobileFeedContent，PC 由外层画布放大。',
  },
  {
    name: 'desktop home feed fallback import',
    pattern: /HomeDesktopFeedSuspenseFallback/g,
    why: '首页 loading/empty/error 也不能走桌面专用 fallback。',
  },
];

const ALLOWED_LEGACY_FILES = new Set([
  'src/features/home/HomeDesktopFeedContent.tsx',
]);

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
    output.push(fullPath);
  }
  return output;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

async function main() {
  const files = await walkFiles(SRC_DIR);
  const violations = [];

  for (const filePath of files) {
    const relativePath = toRelative(filePath);
    if (ALLOWED_LEGACY_FILES.has(relativePath)) continue;
    const content = await fs.readFile(filePath, 'utf8');
    for (const rule of FORBIDDEN_PATTERNS) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(content))) {
        violations.push({
          file: relativePath,
          line: lineNumberForIndex(content, match.index),
          rule: rule.name,
          why: rule.why,
        });
      }
    }
  }

  console.log('\n=== Home Mobile Shell Guard ===');
  console.log('Contract: PC is the scaled mobile app. Home must not reintroduce desktop-only feed or shell paths.');
  console.log(`Files scanned: ${files.length}`);

  if (!violations.length) {
    console.log('No home desktop fork detected.');
    return;
  }

  console.log('\nViolations:');
  for (const item of violations) {
    console.log(`  - ${item.file}:${item.line} ${item.rule} — ${item.why}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[home-mobile-shell-guard] failed:', error);
  process.exitCode = 1;
});
