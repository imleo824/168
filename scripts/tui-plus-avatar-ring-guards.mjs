import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const avatarStyles = read('src/styles/components/avatar.css');
const finalRingContract = read('src/styles/features/tui-plus-avatar-ring-contract.css');
const featureStyles = read('src/styles/layers/features.css');
const profileIconButton = read('src/ui/ProfileIconButton.tsx');
const profileSections = read('src/features/profile/profilePageSections.tsx');
const userSpace = read('src/pages/UserSpace.tsx');
const postCard = read('src/features/post/PostCard.tsx');
const bottomNav = read('src/app/AppBottomNavigation.tsx');

mustHave('shared avatar ring variables', avatarStyles, '--ui-avatar-tui-plus-ring-gradient');
mustHave('shared avatar ring variables', avatarStyles, '--ui-avatar-tui-plus-ring-gap');
mustHave('shared avatar ring variables', avatarStyles, '--ui-avatar-tui-plus-ring-size');
mustHave('shared avatar ring variables', avatarStyles, '.user-space-avatar-next[data-tui-plus=\'true\']');
mustHave('shared avatar ring variables', avatarStyles, '.feed-card-author-avatar-link[data-tui-plus=\'true\']');
mustHave('shared avatar ring variables', avatarStyles, '.app-bottom-nav-avatar-shell[data-tui-plus=\'true\']');
mustNotHave('shared avatar ring variables', avatarStyles, ':has(.user-space-plus-link)');

mustHave('final avatar ring contract', finalRingContract, 'one full-ring system across profile, user space, feed, messages, and nav');
mustHave('final avatar ring contract', finalRingContract, '.profile-avatar-button[data-tui-plus=\'true\']::before');
mustHave('final avatar ring contract', finalRingContract, '.profile-avatar-button[data-tui-plus=\'true\']::after');
mustHave('final avatar ring contract', finalRingContract, '.user-space-avatar-next[data-tui-plus=\'true\']::before');
mustHave('final avatar ring contract', finalRingContract, '.ins-post-card .feed-card-author-avatar-link[data-tui-plus=\'true\']::before');
mustHave('final avatar ring contract', finalRingContract, '.ui-profile-icon-button[data-tui-plus=\'true\']::before');
mustHave('final avatar ring contract', finalRingContract, '.app-bottom-nav-avatar-shell[data-tui-plus=\'true\']::before');
mustHave('final avatar ring contract', finalRingContract, 'inset: calc((var(--ui-avatar-tui-plus-ring-gap) + var(--ui-avatar-tui-plus-ring-size)) * -1)');
mustHave('final avatar ring contract', finalRingContract, 'background: var(--ui-avatar-tui-plus-ring-gradient)');
mustHave('final avatar ring contract', finalRingContract, 'overflow: visible');

mustHave('feature style import order', featureStyles, '../features/tui-plus-avatar-ring-contract.css');
mustHave('top profile avatar ring data source', profileIconButton, 'data-tui-plus={isTuiPlus ? \'true\' : undefined}');
mustHave('my profile avatar ring data source', profileSections, 'data-tui-plus={tuiPlusActive ? \'true\' : undefined}');
mustHave('my profile avatar ring data source', profileSections, 'isTuiPlus={tuiPlusActive}');
mustHave('user space avatar ring data source', userSpace, 'const tuiPlusActive = isTuiPlusActive(displayUser)');
mustHave('user space avatar ring data source', userSpace, 'data-tui-plus={tuiPlusActive ? \'true\' : undefined}');
mustHave('user space avatar ring data source', userSpace, 'isTuiPlus={tuiPlusActive}');
mustHave('feed avatar ring data source', postCard, 'data-tui-plus={isTuiPlus ? \'true\' : undefined}');
mustHave('feed avatar ring data source', postCard, 'isTuiPlus={isTuiPlus}');
mustHave('bottom nav avatar ring data source', bottomNav, 'data-tui-plus={profileIsTuiPlus ? \'true\' : undefined}');

console.log('[tui-plus-avatar-ring-guards] passed');
