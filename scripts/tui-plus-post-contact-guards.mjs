import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const postCreateRoutes = read('server/routes/post-create.routes.ts');
const contactEligibilityService = read('server/services/post-contact-eligibility.service.ts');
const postCard = read('src/features/post/PostCard.tsx');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const feedCardShell = read('src/styles/components/feed-card-shell.css');
const feedFollowContract = read('src/styles/components/feed-follow-interaction.css');
const tuiPlusPage = read('src/pages/TuiPlusMobile.tsx');
const tuiPlusRequestFixes = read('src/styles/features/tui-plus-request-fixes.css');
const tuiPlusPremiumLayout = read('src/styles/features/tui-plus-premium-layout.css');

mustHave('post contact preflight route', postCreateRoutes, "/api/posts/contact-eligibility");
mustHave('post contact preflight route', postCreateRoutes, 'resolvePostContactEligibility');
mustHave('post contact eligibility service', contactEligibilityService, 'getContactPostUsageCount');
mustHave('post contact eligibility service', contactEligibilityService, 'POST_NON_MEMBER_CONTACT_LIMIT_MESSAGE');
mustHave('post contact eligibility service', contactEligibilityService, 'canShowContact');
mustHave('post contact publish guard still enforced', postCreateRoutes, 'await assertCanShowContactOnPost(tx, req.user.id, now)');

mustHave('post create contact click preflight', postCreatePage, "apiFetch('/api/posts/contact-eligibility')");
mustHave('post create contact click preflight', postCreatePage, "setTuiPlusPromptBenefit('postContact')");
mustHave('post create contact click preflight', postCreatePage, 'handleOpenContactEditor');
mustHave('post create contact click preflight', postCreatePage, 'void handleOpenContactEditor()');
mustNotHave('post create contact click preflight', postCreatePage, '非会员每天只能设置 1 次帖子联系方式，会员不限次数');

mustHave('feed contact author-lane action', feedCardShell, '.ins-post-card .feed-card-author-actions');
mustHave('feed contact author-lane action', feedCardShell, 'grid-area: actions');
mustHave('feed contact author-lane action', feedCardShell, 'justify-self: end');
mustHave('feed contact author-lane action', feedCardShell, 'gap: var(--ui-feed-inline-action-gap)');
mustHave('feed contact author-lane action', feedCardShell, '.ins-post-card .feed-card-inline-contact');
mustHave('feed contact author-lane action', feedCardShell, 'min-width: var(--feed-card-author-action-min-width)');
mustHave('feed contact menu lane', feedCardShell, '.ins-post-card .feed-card-options-menu');
mustNotHave('feed contact author-lane action', feedCardShell, 'margin-left: auto');
mustHave('feed follow/contact shared row contract', feedFollowContract, '.feed-card-inline-follow');
mustHave('feed follow/contact shared row contract', feedFollowContract, '.feed-card-inline-contact');
mustHave('feed follow/contact shared row contract', postCard, 'ins-post-card--with-contact-action');
mustHave('feed follow/contact shared row contract', feedCardShell, '.ins-post-card .feed-card-author-actions');
mustHave('feed follow/contact shared row contract', feedCardShell, '.ins-post-card .feed-card-options-menu');

mustHave('plan badge card-level DOM', tuiPlusPage, 'className="tui-plus-plan-card-badge"');
mustNotHave('plan badge must not live inside title row', tuiPlusPage, '<em>{getPlanBadge(plan)}</em>');
mustHave('plan card grid area contract', tuiPlusRequestFixes, "grid-template-areas:");
mustHave('plan card grid area contract', tuiPlusRequestFixes, "'body badge'");
mustHave('plan card grid area contract', tuiPlusRequestFixes, "'body radio'");
mustHave('plan card grid area contract', tuiPlusRequestFixes, '.tui-plus-plan-card-badge');
mustHave('plan badge hard-right contract', tuiPlusRequestFixes, 'grid-area: badge');
mustHave('plan badge hard-right contract', tuiPlusRequestFixes, 'justify-self: end');
mustHave('plan badge non-pill contract', tuiPlusRequestFixes, 'border-radius: var(--ui-radius-sm)');
mustHave('plan card premium grid area contract', tuiPlusPremiumLayout, "grid-template-areas:");
mustHave('plan card premium grid area contract', tuiPlusPremiumLayout, "'body badge'");
mustHave('plan card premium grid area contract', tuiPlusPremiumLayout, "'body radio'");
mustHave('plan card premium grid area contract', tuiPlusPremiumLayout, '.tui-plus-plan-card-badge');
mustHave('plan badge premium hard-right contract', tuiPlusPremiumLayout, 'grid-area: badge');
mustHave('plan badge premium hard-right contract', tuiPlusPremiumLayout, 'justify-self: end');
mustHave('plan badge premium non-pill contract', tuiPlusPremiumLayout, 'border-radius: var(--ui-radius-sm)');

console.log('[tui-plus-post-contact-guards] passed');
