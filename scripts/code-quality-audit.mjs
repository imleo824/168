#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STRICT = process.env.CODE_QUALITY_AUDIT_STRICT === '1';
const SOURCE_DIRS = ['src', 'server', 'shared', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.cache']);
const IGNORE_FILES = new Set([
  'code-quality-audit.mjs',
]);

const PATTERN_RULES = [
  {
    id: 'merge-conflict-marker',
    severity: 'error',
    description: 'Unresolved merge conflict marker',
    pattern: /^(<<<<<<<|=======|>>>>>>>)\b/gm,
  },
  {
    id: 'focused-test',
    severity: 'error',
    description: 'Focused test left in source',
    pattern: /\b(?:describe|it|test)\.only\s*\(/g,
  },
  {
    id: 'disabled-test',
    severity: 'warn',
    description: 'Skipped test left in source',
    pattern: /\b(?:describe|it|test)\.skip\s*\(/g,
  },
  {
    id: 'ts-ignore',
    severity: 'warn',
    description: 'TypeScript ignore directive',
    pattern: /@ts-ignore/g,
  },
  {
    id: 'eslint-disable',
    severity: 'warn',
    description: 'ESLint disable directive',
    pattern: /eslint-disable/g,
  },
  {
    id: 'debugger',
    severity: 'error',
    description: 'Debugger statement',
    pattern: /\bdebugger\s*;/g,
  },
  {
    id: 'dangerous-html',
    severity: 'error',
    description: 'React dangerouslySetInnerHTML usage',
    pattern: /dangerouslySetInnerHTML/g,
  },
  {
    id: 'eval',
    severity: 'error',
    description: 'Dynamic eval usage',
    pattern: /\beval\s*\(/g,
  },
  {
    id: 'new-function',
    severity: 'error',
    description: 'Dynamic Function constructor usage',
    pattern: /\bnew\s+Function\s*\(/g,
  },
  {
    id: 'console-log-app-code',
    severity: 'warn',
    description: 'console.log in app/server/shared code',
    pattern: /\bconsole\.log\s*\(/g,
    include: /^(src|server|shared)\//,
  },
  {
    id: 'todo-or-fixme',
    severity: 'info',
    description: 'TODO/FIXME marker',
    pattern: /\b(?:TODO|FIXME)\b/g,
  },
];

const FILE_RULES = [
  {
    id: 'large-source-file',
    severity: 'warn',
    description: 'Large source file that should be split or justified',
    thresholdLines: 900,
    include: /^(src|server|shared)\//,
  },
  {
    id: 'very-large-source-file',
    severity: 'warn',
    description: 'Very large source file requiring architecture review',
    thresholdLines: 2500,
    include: /^(src|server|shared)\//,
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
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output);
      continue;
    }
    if (IGNORE_FILES.has(entry.name)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
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

function countLines(content) {
  if (!content) return 0;
  return content.split('\n').length;
}

function shouldApplyRule(rule, relativePath) {
  return !rule.include || rule.include.test(relativePath);
}

function scanPatternRules(content, relativePath) {
  const findings = [];
  for (const rule of PATTERN_RULES) {
    if (!shouldApplyRule(rule, relativePath)) continue;
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content))) {
      findings.push({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        file: relativePath,
        line: lineNumberForIndex(content, match.index),
      });
    }
  }
  return findings;
}

function scanFileRules(content, relativePath) {
  const findings = [];
  const lines = countLines(content);
  for (const rule of FILE_RULES) {
    if (!shouldApplyRule(rule, relativePath)) continue;
    if (lines <= rule.thresholdLines) continue;
    findings.push({
      id: rule.id,
      severity: rule.severity,
      description: `${rule.description}: ${lines} lines > ${rule.thresholdLines}`,
      file: relativePath,
      line: 1,
    });
  }
  return findings;
}

function groupByRule(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.id}`;
    const group = groups.get(key) || { id: finding.id, severity: finding.severity, description: finding.description, findings: [] };
    group.findings.push(finding);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    const order = { error: 0, warn: 1, info: 2 };
    return order[a.severity] - order[b.severity] || b.findings.length - a.findings.length || a.id.localeCompare(b.id);
  });
}

async function main() {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    await walkFiles(path.join(ROOT, dir), files);
  }

  const findings = [];
  for (const filePath of [...new Set(files)].sort()) {
    const relativePath = toRelative(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    findings.push(...scanPatternRules(content, relativePath));
    findings.push(...scanFileRules(content, relativePath));
  }

  const errorCount = findings.filter((item) => item.severity === 'error').length;
  const warnCount = findings.filter((item) => item.severity === 'warn').length;
  const infoCount = findings.filter((item) => item.severity === 'info').length;
  const groups = groupByRule(findings);

  console.log('\n=== Code Quality Audit ===');
  console.log(`Files scanned: ${new Set(files).size}`);
  console.log(`Findings: errors=${errorCount} warnings=${warnCount} info=${infoCount}`);

  if (groups.length) {
    console.log('\nFindings by rule:');
    for (const group of groups) {
      console.log(`  [${group.severity}] ${group.id}: ${group.findings.length} — ${group.description}`);
      group.findings.slice(0, 12).forEach((finding) => {
        console.log(`    ${finding.file}:${finding.line}`);
      });
      if (group.findings.length > 12) console.log(`    ... ${group.findings.length - 12} more`);
    }
  } else {
    console.log('\nNo code quality findings detected.');
  }

  console.log('\nReview target: resolve error-level findings immediately, triage warning-level findings, and keep informational markers from becoming stale.');

  if (STRICT && errorCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[code-quality-audit] failed:', error);
  process.exitCode = 1;
});
