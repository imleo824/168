import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));
const railway = JSON.parse(read('railway.json'));
const schemaVerify = read('scripts/railway-schema-verify.mjs');
const prismaMigrateDeploy = read('scripts/prisma-migrate-deploy.mjs');

assert.equal(
  pkg.scripts['railway:db-prepare'],
  'npm run railway:release && npm run railway:schema-verify',
  'Railway database preparation must run formal migrations and then schema verification.',
);

assert.equal(
  railway.deploy.preDeployCommand,
  'npm run railway:db-prepare',
  'Railway pre-deploy must prepare the database before traffic is shifted.',
);

assert.equal(
  railway.deploy.startCommand,
  'npm start',
  'Railway start command must not run migrations or schema patching on every boot.',
);

assert.equal(
  railway.deploy.healthcheckPath,
  '/health',
  'Railway healthcheck must stay process-level; database/schema readiness is enforced by pre-deploy verification.',
);

assert.ok(
  !Object.keys(pkg.scripts).some((scriptName) => /schema-repair/.test(scriptName)),
  'Deployment scripts must not expose schema repair commands; use migrations plus verification.',
);

assert.doesNotMatch(
  JSON.stringify(pkg.scripts),
  /schema-repair|railway-schema-repair/,
  'Deployment scripts must not call schema repair commands; use migrations plus verification.',
);

assert.doesNotMatch(
  schemaVerify,
  /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|TYPE|INDEX|FUNCTION|TRIGGER|EXTENSION)\b/i,
  'Schema verification must not mutate production database structure.',
);

assert.match(
  prismaMigrateDeploy,
  /P3005/,
  'Prisma deploy wrapper must recognize Prisma P3005 for existing non-empty production databases.',
);

assert.match(
  prismaMigrateDeploy,
  /migrate', 'resolve', '--applied'/,
  'Existing production databases must be baselined with Prisma migration history before migrate deploy can continue.',
);

assert.doesNotMatch(
  prismaMigrateDeploy,
  /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|TYPE|INDEX|FUNCTION|TRIGGER|EXTENSION)\b/i,
  'Prisma deploy wrapper must not patch production database structure directly.',
);

console.log('[deployment-contract-guards] passed');
