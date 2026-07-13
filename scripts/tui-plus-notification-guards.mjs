import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const pushExtraEvents = read('server/services/pwa-push-extra-events.service.ts');
const publicProfile = read('server/services/public-user-profile.service.ts');
const profileLinks = read('src/features/profile/UserSpaceTuiPlusLinks.tsx');
const profileLinkStyles = read('src/styles/features/profile-plus-link-contract.css');
const notificationSettings = read('src/pages/NotificationSettings.tsx');
const tuiPlusPage = read('src/pages/TuiPlusMobile.tsx');

mustHave('Tui Plus expiry push', pushExtraEvents, 'processTuiPlusExpiryReminderEvents');
mustHave('Tui Plus expiry push', pushExtraEvents, 'TUI_PLUS_EXPIRY_REMINDER_WINDOW_MS');
mustHave('Tui Plus expiry push', pushExtraEvents, 'tui-plus-expiring:${row.id}:${expiresAt.getTime()}');
mustHave('Tui Plus expiry push includes trial', pushExtraEvents, "String(row.plusStatus || '').toUpperCase() === 'TRIALING'");
mustHave('Tui Plus expiry push target', pushExtraEvents, "targetUrl: '/tui-plus'");
mustHave('Referral invite push', pushExtraEvents, 'processReferralInvitePushEvents');
mustHave('Referral invite push', pushExtraEvents, 'referral-invite:${row.id}');
mustHave('Referral invite push target', pushExtraEvents, "targetUrl: '/invite/records'");
mustHave('Referral commission push', pushExtraEvents, 'processReferralCommissionAvailablePushEvents');
mustHave('Referral commission push', pushExtraEvents, "SET \"status\" = 'AVAILABLE'");
mustHave('Referral commission push', pushExtraEvents, 'referral-commission-available:${row.id}');
mustHave('Referral commission push copy', pushExtraEvents, '佣金已到账');
mustHave('Push poller runs new events', pushExtraEvents, 'await processTuiPlusExpiryReminderEvents()');
mustHave('Push poller runs new events', pushExtraEvents, 'await processReferralInvitePushEvents()');
mustHave('Push poller runs new events', pushExtraEvents, 'await processReferralCommissionAvailablePushEvents()');
mustNotHave('Push poller must queue delivery without VAPID config gate', pushExtraEvents, 'hasWebPushConfig');

mustHave('Public expired Tui Plus links hidden', publicProfile, 'const status = await getTuiPlusStatus(userId)');
mustHave('Public expired Tui Plus links hidden', publicProfile, 'if (!status.active) return { isTuiPlus: false, tuiPlusChannels: [], tuiPlusWebsites: [], tuiPlusContacts: [] }');

mustHave('Own expired profile link state', profileLinks, 'isTuiPlus: Boolean(payload.active)');
mustHave('Own expired profile link state', profileLinks, "data-tui-plus-state={ownLinkState}");
mustHave('Own expired profile link state', profileLinks, "displayLinksUser?.isTuiPlus === false ? 'expired' : 'active'");
mustHave('Own expired profile muted style', profileLinkStyles, "data-tui-plus-state='expired'");
mustHave('Own expired profile muted style', profileLinkStyles, '--profile-plus-link-color: var(--ui-text-muted)');
mustHave('Own expired profile muted style', profileLinkStyles, 'filter: grayscale(.18)');

mustHave('Notification settings master copy', notificationSettings, '开启后，重要消息会收到系统提醒。');
mustNotHave('Notification settings old master copy', notificationSettings, '有人关注或评论你时会收到系统提醒');
mustNotHave('Notification settings old master title', notificationSettings, '不错过评论和关注');

mustHave('Tui Plus loading checkout contract', tuiPlusPage, 'const shouldShowCheckout = !isLoading && Boolean(status)');
mustHave('Tui Plus loading checkout contract', tuiPlusPage, '{shouldShowCheckout ? (');
mustHave('Tui Plus loading checkout contract', tuiPlusPage, '正在加载会员信息');

console.log('[tui-plus-notification-guards] passed');
