import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustMatch = (label, content, pattern) => assert.match(content, pattern, `${label} must match ${pattern}`);

const channelService = read('server/services/tui-plus-channel.service.ts');
const entitlementService = read('server/services/tui-plus-entitlements.service.ts');
const linkEditor = read('src/pages/TuiPlusLinkEditorMobile.tsx');
const coreService = read('server/services/tui-plus.service.ts');
const migration = read('prisma/migrations/20260715152000_tui_plus_channel_auto_post_toggle/migration.sql');

mustHave('channel auto post migration', migration, 'ADD COLUMN IF NOT EXISTS "autoPostEnabled" BOOLEAN NOT NULL DEFAULT false');
mustHave('channel auto post migration stops historical sources', migration, 'source."sourceScope" = \'USER_PLUS\'');
mustHave('channel status payload', coreService, 'COALESCE("autoPostEnabled", false) AS "autoPostEnabled"');
mustHave('channel auto post parser', channelService, 'function normalizeAutoPostEnabled');
mustHave('channel update compatibility', channelService, 'resolveAutoPostEnabled(input, current.autoPostEnabled)');
mustHave('unchecked add keeps link only', channelService, ': existingRows[0]?.sourceId || null');
mustHave('unchecked add pauses existing member source', channelService, 'if (!autoPostEnabled && existingRows[0]?.sourceId)');
mustMatch('add channel claim is gated by auto post', channelService, /const sourceId = autoPostEnabled\s*\?\s*await claimAutoCrawlSource/);
mustMatch('update channel claim is gated by auto post', channelService, /const sourceId = autoPostEnabled\s*\?\s*await claimAutoCrawlSource/);
mustHave('unchecked update pauses retained source', channelService, 'if (!autoPostEnabled && sourceId)');
mustHave('entitlement only reopens opted-in sources', entitlementService, 'AND COALESCE(channel."autoPostEnabled", false) = true');
mustHave('entitlement closes opted-out sources', entitlementService, 'AND COALESCE(channel."autoPostEnabled", false) = false');
mustHave('link editor sends auto post flag', linkEditor, 'autoPostEnabled: Boolean(row?.autoPostEnabled)');
mustHave('link editor renders auto post checkbox', linkEditor, '频道内容自动发帖');
mustHave('link editor tracks auto post dirty state', linkEditor, 'changedAutoPost');

console.log('[tui-plus-channel-auto-post-toggle-guards] passed');
