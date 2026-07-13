#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STRICT = process.env.CACHE_POLICY_AUDIT_STRICT === '1';

const ROUTE_EXPECTATIONS = [
  {
    file: 'server/routes/config.routes.ts',
    route: "/api/admin/config",
    required: 'setNoStore(res)',
    forbidden: ['setPublicCache(res', 'setPrivateCache(res'],
    reason: 'Admin config can contain sensitive operational fields and must never be public cached.',
  },
  {
    file: 'server/routes/config.routes.ts',
    route: "/api/config",
    required: 'setPublicCache(res',
    forbidden: ['setNoStore(res)'],
    reason: 'Public redacted config is reference data and should use short public cache.',
  },
  {
    file: 'server/routes/config.routes.ts',
    route: "/api/home/bootstrap",
    required: 'setPublicCache(res',
    forbidden: ['setNoStore(res)'],
    reason: 'Home bootstrap is public reference data and should use short public cache.',
  },
  {
    file: 'server/routes/config.routes.ts',
    route: "/api/categories",
    required: 'setPublicCache(res',
    forbidden: ['setNoStore(res)'],
    reason: 'Categories are public reference data and should be public cached.',
  },
  {
    file: 'server/routes/account-profile.routes.ts',
    route: "/api/me",
    required: 'setNoStore(res)',
    forbidden: ['setPublicCache(res'],
    reason: 'Authenticated self profile contains private session-bound user state and must not be shared cached.',
  },
  {
    file: 'server/routes/account-profile.routes.ts',
    route: "/api/session",
    required: 'setNoStore(res)',
    forbidden: ['setPublicCache(res'],
    reason: 'Session endpoint is cookie-bound and must not be stored by shared caches.',
  },
  {
    file: 'server/routes/account-profile.routes.ts',
    route: "/api/users/:id",
    required: 'setPublicCache(res',
    forbidden: ['setNoStore(res)'],
    reason: 'Public user profile is public-facing reference data and may use short public cache.',
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

function findRouteBlock(content, route) {
  const routeIndex = content.indexOf(route);
  if (routeIndex === -1) return null;
  const nextRouteMatch = content.slice(routeIndex + route.length).match(/\n\s*app\.(?:get|post|put|patch|delete)\(/);
  const endIndex = nextRouteMatch
    ? routeIndex + route.length + nextRouteMatch.index
    : content.length;
  return content.slice(routeIndex, endIndex);
}

async function main() {
  const findings = [];

  for (const expectation of ROUTE_EXPECTATIONS) {
    const filePath = path.join(ROOT, expectation.file);
    if (!(await pathExists(filePath))) {
      findings.push({ ...expectation, type: 'missing-file', detail: 'route file not found' });
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const block = findRouteBlock(content, expectation.route);
    if (!block) {
      findings.push({ ...expectation, type: 'missing-route', detail: 'route literal not found' });
      continue;
    }

    if (!block.includes(expectation.required)) {
      findings.push({ ...expectation, type: 'missing-required-cache-policy', detail: `expected ${expectation.required}` });
    }

    for (const forbidden of expectation.forbidden) {
      if (block.includes(forbidden)) {
        findings.push({ ...expectation, type: 'forbidden-cache-policy', detail: `found ${forbidden}` });
      }
    }
  }

  console.log('\n=== Cache Policy Audit ===');
  console.log(`Route expectations checked: ${ROUTE_EXPECTATIONS.length}`);
  console.log(`Findings: ${findings.length}`);

  if (findings.length) {
    console.log('\nCache policy findings:');
    findings.forEach((finding) => {
      console.log(`  - ${finding.file} ${finding.route}: ${finding.type} — ${finding.detail}`);
      console.log(`    reason: ${finding.reason}`);
    });
  } else {
    console.log('\nNo cache policy drift detected.');
  }

  if (STRICT && findings.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[cache-policy-audit] failed:', error);
  process.exitCode = 1;
});
