#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STRICT = process.env.OBSERVABILITY_AUDIT_STRICT === '1';

const EXPECTATIONS = [
  {
    file: 'server/bootstrap.ts',
    tokens: ['X-Request-Id', 'requestId', '[request:error]'],
    reason: 'Server must attach request ids and log failing requests with that id.',
  },
  {
    file: 'scripts/smoke-production.mjs',
    tokens: ['assertRequestId', 'x-request-id'],
    reason: 'Production smoke must verify request ids so failures are traceable in Railway logs.',
  },
  {
    file: 'scripts/performance-budget-production.mjs',
    tokens: ['xRequestId', 'x-request-id', 'requestIds='],
    reason: 'Performance budget failures must print request ids for slow/error sample triage.',
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

async function main() {
  const findings = [];

  for (const expectation of EXPECTATIONS) {
    const filePath = path.join(ROOT, expectation.file);
    if (!(await pathExists(filePath))) {
      findings.push({ ...expectation, type: 'missing-file', detail: 'file not found' });
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    for (const token of expectation.tokens) {
      if (!content.includes(token)) {
        findings.push({ ...expectation, type: 'missing-token', detail: token });
      }
    }
  }

  console.log('\n=== Observability Audit ===');
  console.log(`Expectations checked: ${EXPECTATIONS.length}`);
  console.log(`Findings: ${findings.length}`);

  if (findings.length) {
    console.log('\nObservability findings:');
    findings.forEach((finding) => {
      console.log(`  - ${finding.file}: ${finding.type} — ${finding.detail}`);
      console.log(`    reason: ${finding.reason}`);
    });
  } else {
    console.log('\nNo request tracing drift detected.');
  }

  if (STRICT && findings.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[observability-audit] failed:', error);
  process.exitCode = 1;
});
