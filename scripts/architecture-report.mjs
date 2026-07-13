#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts');
const OUT_FILE = path.join(OUT_DIR, 'architecture-report.md');

const AUDITS = [
  ['API Contract Audit', 'node', ['scripts/api-contract-audit.mjs']],
  ['Code Quality Audit', 'node', ['scripts/code-quality-audit.mjs']],
  ['Dead Code Audit', 'node', ['scripts/dead-code-audit.mjs']],
  ['Cache Policy Audit', 'node', ['scripts/cache-policy-audit.mjs']],
  ['Observability Audit', 'node', ['scripts/observability-audit.mjs']],
  ['Database Schema Audit', 'node', ['scripts/db-schema-audit.mjs']],
  ['Bootstrap Boundary Guard', 'node', ['scripts/bootstrap-boundary-guard.mjs']],
  ['Route Boundary Guard', 'node', ['scripts/route-boundary-guard.mjs']],
  ['Frontend API Boundary Guard', 'node', ['scripts/frontend-api-boundary-guard.mjs']],
];

function runCommand(command, args) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}\n${error.stack || error.message}`, durationMs: Date.now() - startedAt });
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr, durationMs: Date.now() - startedAt });
    });
  });
}

function fence(text) {
  const clean = String(text || '').trimEnd();
  return `\n\`\`\`txt\n${clean || '(no output)'}\n\`\`\`\n`;
}

function summarizeResult(result) {
  if (result.exitCode === 0) return 'PASS';
  return `CHECK EXIT ${result.exitCode}`;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const sections = [];
  let overallExitCode = 0;

  for (const [title, command, args] of AUDITS) {
    const result = await runCommand(command, args);
    if (result.exitCode !== 0) overallExitCode = result.exitCode;
    sections.push({ title, command: `${command} ${args.join(' ')}`, result });
  }

  const markdown = [
    '# Architecture Debt Report',
    '',
    `Generated at: ${generatedAt}`,
    '',
    'This report is generated from the project architecture audit scripts. It is intended to guide refactors and ratchet architecture baselines downward over time.',
    '',
    '## Summary',
    '',
    '| Audit | Status | Duration | Command |',
    '|---|---:|---:|---|',
    ...sections.map(({ title, command, result }) => `| ${title} | ${summarizeResult(result)} | ${result.durationMs}ms | \`${command}\` |`),
    '',
    '## Details',
    '',
    ...sections.flatMap(({ title, result }) => [
      `### ${title}`,
      '',
      `Status: **${summarizeResult(result)}**`,
      '',
      '#### stdout',
      fence(result.stdout),
      result.stderr.trim() ? '#### stderr' : '',
      result.stderr.trim() ? fence(result.stderr) : '',
    ]).filter(Boolean),
  ].join('\n');

  await fs.writeFile(OUT_FILE, markdown, 'utf8');
  console.log(`Architecture report written to ${path.relative(ROOT, OUT_FILE)}`);

  if (process.env.ARCHITECTURE_REPORT_STRICT === '1') {
    process.exitCode = overallExitCode;
  }
}

main().catch((error) => {
  console.error('[architecture-report] failed:', error);
  process.exitCode = 1;
});
