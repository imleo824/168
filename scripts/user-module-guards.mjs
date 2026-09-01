#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/routes/account.routes.ts',
  'server/routes/account-auth.routes.ts',
  'server/routes/account-profile.routes.ts',
  'server/routes/account-settings.routes.ts',
  'server/routes/account-engagement.routes.ts',
];

const REQUIRED_ACCOUNT_ROUTE_MARKERS = [
  'registerAccountRoutes',
  "app.get('/api/me'",
  "app.get('/api/session'",
  "app.get('/api/users/:id'",
  'userProfileCache',
  'userProfileInflight',
  'recordUserProfileView',
  'X-User-Profile-Cache',
  "app.get('/api/me/likes'",
  "app.get('/api/notifications/feed-counts'",
  "app.get('/api/notifications/home-summary'",
  'markUserDataChanged',
  'markInteractionDataChanged',
];

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readFile(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function main() {
  const missing = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!(await pathExists(relativePath))) missing.push(relativePath);
  }

  console.log('\n=== User Module Guard ===');
  console.log('Required user module files:');
  REQUIRED_FILES.forEach((file) => console.log(`  - ${file}`));

  if (missing.length > 0) {
    console.log('\nMissing user module files:');
    missing.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const accountRouteContent = [
    await readFile('server/routes/account.routes.ts'),
    await readFile('server/routes/account-auth.routes.ts'),
    await readFile('server/routes/account-profile.routes.ts'),
    await readFile('server/routes/account-settings.routes.ts'),
    await readFile('server/routes/account-engagement.routes.ts'),
  ].join('\n');
  const missingMarkers = REQUIRED_ACCOUNT_ROUTE_MARKERS.filter((marker) => !accountRouteContent.includes(marker));
  if (missingMarkers.length > 0) {
    console.log('\nAccount/User route module is missing required markers:');
    missingMarkers.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return;
  }

  console.log('\nUser/account route boundaries are present.');
  console.log('Existing account.routes.ts preserves session/profile/cache/view/notification markers.');
  console.log('Next target: split relationship/topic-specific routes only after preserving these markers.');
}

main().catch((error) => {
  console.error('[user-module-guards] failed:', error);
  process.exitCode = 1;
});
