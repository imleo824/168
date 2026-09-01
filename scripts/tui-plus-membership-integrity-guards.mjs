import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const sourceClaim = read('server/services/tui-plus-source-claim.service.ts');
const channelService = read('server/services/tui-plus-channel.service.ts');
const entitlements = read('server/services/tui-plus-entitlements.service.ts');
const contactMethods = read('server/services/tui-plus-contact-methods.service.ts');
const contactPolicy = read('server/services/tui-plus-contact-policy.service.ts');
const routes = read('server/routes/tui-plus.routes.ts');
const coreService = read('server/services/tui-plus.service.ts');

mustHave('source claim helper', sourceClaim, 'claimedFromAuthorUserId');
mustHave('source claim helper', sourceClaim, 'claimedFromSourceName');
mustHave('source claim helper', sourceClaim, 'claimedFromCategoryName');
mustNotHave('source claim helper', sourceClaim, '"categoryName"');
mustHave('source claim helper', sourceClaim, 'releaseOrDeleteTuiPlusSource');
mustHave('source claim helper', sourceClaim, 'pauseOrReleaseTuiPlusSource');
mustHave('source claim helper', sourceClaim, 'releaseClaimedPlatformSource');
mustHave('source claim helper pause sync', sourceClaim, 'SET "disabled" = true');
mustHave('source claim helper pause sync', sourceClaim, '"ownerUserId" = ${params.userId}');
mustHave('source claim helper pause sync', sourceClaim, 'return { disabled: Number(disabled || 0), released: 0 }');
mustHave('source claim helper delete release only', sourceClaim, 'releaseClaimedPlatformSource(tx, { sourceId, userId: params.userId })');
mustHave('source claim helper', sourceClaim, 'isTuiPlusGeneratedSourceId');
mustHave('source claim helper', sourceClaim, 'startsWith(TUI_PLUS_GENERATED_SOURCE_PREFIX)');

mustHave('channel claim source snapshot', channelService, 'pauseOrReleaseTuiPlusSource');
mustHave('channel claim source snapshot', channelService, 'releaseOrDeleteTuiPlusSource');
mustHave('channel claim source snapshot', channelService, 'const sourceId = await claimAutoCrawlSource');
mustHave('channel claim source snapshot', channelService, 'await pauseOrReleaseTuiPlusSource(tx, { sourceId: channel.sourceId, userId })');
mustHave('channel claim source snapshot', channelService, 'The original platform fields are snapshotted');
mustHave('channel claim source snapshot', channelService, 'claimedFromAuthorUserId');
mustHave('channel claim source snapshot', channelService, 'Existing posts are intentionally not updated');
mustHave('channel claim source database category', channelService, 'async function resolveCategory');
mustHave('channel claim source database category', channelService, '"categoryId"');
mustNotHave('channel claim source removed columns', channelService, '"trustLevel"');
mustNotHave('channel claim source removed columns', channelService, '"categoryName"');
mustNotHave('channel claim source snapshot', channelService, 'DELETE FROM "AutoCrawlSource" WHERE "id" = ${current.sourceId}');
mustNotHave('channel claim source snapshot', channelService, 'DELETE FROM "AutoCrawlSource" WHERE "id" = ${row.sourceId}');
mustNotHave('channel pause must not release ownership', channelService, 'pause can release the source back to PLATFORM');

mustNotHave('core service channel boundary', coreService, 'export async function addTuiPlusTelegramChannel');
mustNotHave('core service channel boundary', coreService, 'export async function updateTuiPlusTelegramChannel');
mustNotHave('core service channel boundary', coreService, 'export async function deleteTuiPlusTelegramChannel');
mustNotHave('core service channel boundary', coreService, 'createOrTakeOverAutoCrawlSource');
mustHave('trial eligibility history', coreService, 'AS "hasTuiPlusHistory"');
mustHave('trial eligibility history', coreService, 'if (user.plusTrialUsed || user.hasTuiPlusHistory)');
mustHave('trial eligibility history', coreService, '"plusTrialUsed" = true');
mustHave('trial eligibility history', coreService, 'plusTrialUsed: true');

mustHave('entitlement sync toggle', entitlements, 'enableActiveTuiPlusSourcesForUser');
mustHave('entitlement sync toggle', entitlements, 'disableTuiPlusSourcesForUser');
mustHave('entitlement sync toggle', entitlements, 'expireActiveSubscriptionsForUser');
mustHave('entitlement sync toggle', entitlements, 'changedSubscriptions');
mustHave('entitlement sync toggle', entitlements, 'releasedPlatformSources: 0');
mustHave('entitlement expiry only stops sync', entitlements, 'SET "disabled" = true');
mustHave('entitlement renewal only opens sync', entitlements, 'SET "disabled" = false');
mustHave('entitlement expiry only stops sync', entitlements, 'source."ownerUserId" = owner."id"');
mustHave('entitlement expiry only stops sync', entitlements, 'source."sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}');
mustNotHave('entitlement expiry must not move ownership', entitlements, 'releasePlatformClaimedSourcesForUser');
mustNotHave('entitlement expiry must not move ownership', entitlements, '"ownerUserId" = NULL');
mustNotHave('entitlement expiry must not move ownership', entitlements, '"sourceScope" = ${PLATFORM_SOURCE_SCOPE}');
mustNotHave('entitlement expiry must not move author', entitlements, '"authorUserId" = COALESCE');

mustHave('contact methods WhatsApp URL', contactMethods, 'https://wa.me/${contact.replace(/[^0-9]/g, \'\')}');
mustHave('contact methods WhatsApp URL', contactMethods, 'wa\\.me');
mustHave('contact policy cleanup count', contactPolicy, 'return Number(result || 0)');

mustHave('Tui Plus route cache sync', routes, 'syncTuiPlusAndMark');
mustHave('Tui Plus route cache sync', routes, 'cleanupLegacyContactsAndMark');
mustHave('Tui Plus route cache sync', routes, 'result.changedSubscriptions');
mustHave('Tui Plus route cache sync', routes, 'markTuiPlusSourceChanged');
mustHave('Tui Plus contact patch id', routes, 'upsertTuiPlusTypedContact(req.user.id, normalizeContactPayload(req.body), req.params.id)');
mustNotHave('Tui Plus contact patch id', routes, '{ ...normalizeContactPayload(req.body), id: req.params.id }');

console.log('[tui-plus-membership-integrity-guards] passed');
