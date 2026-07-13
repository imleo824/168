import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pkg = JSON.parse(read('package.json'));
const railway = JSON.parse(read('railway.json'));
const schemaVerify = read('scripts/railway-schema-verify.mjs');

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
  '/api/readyz',
  'Railway healthcheck must use readiness, not the shallow process-only health endpoint.',
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

console.log('[deployment-contract-guards] passed');
