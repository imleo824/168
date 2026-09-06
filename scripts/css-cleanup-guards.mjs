import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const failures = [];
const removedStyleFiles = [
  'src/styles/components/feed-card.css',
  'src/styles/components/feed-card-footer.css',
  'src/styles/components/feed-card-footer-contact-actions.css',
  'src/styles/components/feed-card-actions-reaction-feedback.css',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  if (!fs.existsSync(absoluteEntry)) return [];
  const stat = fs.statSync(absoluteEntry);
  if (stat.isFile()) return predicate(relativeEntry) ? [relativeEntry] : [];
  return fs.readdirSync(absoluteEntry).flatMap((name) => walk(path.join(relativeEntry, name), predicate));
}

function importLinesFor(file) {
  return read(file)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@import'));
}

function assertImports(file, expected, message) {
  const actual = importLinesFor(file);
  if (actual.join('\n') !== expected.join('\n')) {
    failures.push(`${file} ${message}:\n${expected.join('\n')}`);
  }
}

function isUserSurfaceSource(file) {
  const normalized = file.replaceAll('\\', '/');
  if (!/\.(tsx?|jsx?)$/.test(normalized)) return false;
  if (!normalized.startsWith('src/pages/') && !normalized.startsWith('src/features/')) return false;
  return !normalized.startsWith('src/features/admin/');
}

assertImports('src/styles/layers/contracts.css', [
  '@import "../utilities/mobile-overlay-stability.css";',
  '@import "../system/secondary-page-shell.css";',
  '@import "../system/ui-post-tag-contract.css";',
  '@import "../system/ui-architecture-contract.css";',
  '@import "../system/ui-control-shape-contract.css";',
  '@import "../system/ui-error-boundary-contract.css";',
  '@import "../system/ui-input-focus-stability-contract.css";',
  '@import "../system/ui-sticky-topbar-contract.css";',
], 'must stay limited to last-load cross-page invariants');

assertImports('src/styles/system/ui-primitives.css', [
  '@import "./ui-primitives-layout.css";',
  '@import "./ui-primitives-auth.css";',
  '@import "./ui-primitives-feedback.css";',
  '@import "./ui-primitives-interactions.css";',
  '@import "./ui-interaction-performance.css";',
  '@import "./ui-touch-contract.css";',
  '@import "./ui-primitives-responsive.css";',
  '@import "./wide-screen-mobile-adaptation.css";',
], 'must keep only critical shared primitive, interaction, and responsive contracts in the global facade');

assertImports('src/styles/layers/components.css', [
  '@import "../components/buttons.css";',
  '@import "../components/avatar.css";',
  '@import "../components/telegram-contact-action.css";',
  '@import "../components/topbar.css";',
  '@import "../components/topbar-tactile.css";',
  '@import "../components/topbar-system.css";',
  '@import "../components/topbar-leading-contract.css";',
  '@import "../components/bottom-nav.css";',
  '@import "../components/segment-tabs.css";',
  '@import "../components/feed-card-system.css";',
  '@import "../components/feed-list-performance.css";',
  '@import "../components/feed-follow-interaction.css";',
  '@import "../components/media.css";',
  '@import "../components/state-contract.css";',
], 'must load only globally shared component owners in stable order');

assertImports('src/features/auth/AuthModal.css', [
  '@import "../../styles/system/ui-primitives-auth-modal.css";',
], 'must lazy-load modal-only authentication contracts');

assertImports('src/features/records/RecordsRoute.css', [
  '@import "../../styles/tokens/record-contracts.css";',
  '@import "../../styles/system/record-header-filter-contract.css";',
  '@import "../../styles/system/record-card-contract.css";',
  '@import "../../styles/components/record-more-link.css";',
], 'must lazy-load shared record presentation with record routes');

assertImports('src/styles/components/feed-card-system.css', [
  '@import "./feed-card-chrome.css";',
  '@import "./feed-card-shell.css";',
  '@import "./feed-card-options-menu.css";',
  '@import "./feed-card-avatar-activity.css";',
  '@import "./feed-card-content.css";',
  '@import "./feed-card-actions-layout-v2.css";',
  '@import "./feed-card-anonymous.css";',
  '@import "./post-quote.css";',
  '@import "./telegram-sync-confirm-sheet.css";',
  '@import "./feed-card-responsive.css";',
], 'must not load deprecated feed-card.css or feed-card-footer.css');

for (const file of walk('src/styles', (entry) => entry.endsWith('.css'))) {
  const normalized = file.replaceAll('\\', '/');
  if (/polish/i.test(path.basename(normalized))) {
    failures.push(`${normalized} must not use *polish*.css naming; move durable rules into an owner or contract file.`);
  }
}

for (const file of removedStyleFiles) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`${file} was removed from the active CSS architecture; keep durable rules in the current feed-card CSS owners.`);
  }
}

for (const file of walk('src', (entry) => /\.(css|tsx?|jsx?)$/.test(entry))) {
  const normalized = file.replaceAll('\\', '/');
  const source = read(file);
  if (source.includes(':has(')) {
    failures.push(`${file} must not use :has() to infer state from descendant markup.`);
  }
  if (source.includes('app-user-mobile-canvas')) {
    failures.push(`${file} must not restore the stale app-user-mobile-canvas selector; use .app-shell[data-route-surface='user'] instead.`);
  }
}

for (const file of walk('src', isUserSurfaceSource)) {
  const source = read(file);
  if (source.includes('document.querySelector')) {
    failures.push(`${file} must not use document.querySelector for user-surface UI coordination; expose explicit React state, props, refs, or a named intent instead.`);
  }
  if (source.includes('.classList.')) {
    failures.push(`${file} must not mutate classList for user-surface UI state; expose semantic className or data-* state through React instead.`);
  }
}

const actionButtonCssSource = read('src/styles/components/buttons.css');
if (!actionButtonCssSource.includes('box-shadow: var(--ui-shadow-brand-soft);')) {
  failures.push('src/styles/components/buttons.css must route brand/primary action shadows through --ui-shadow-brand-soft.');
}
if (/box-shadow:\s*0\s+\d/.test(actionButtonCssSource)) {
  failures.push('src/styles/components/buttons.css must not use raw numeric box-shadow values; add or reuse semantic shadow tokens instead.');
}

const bottomNavCssSource = read('src/styles/components/bottom-nav.css');
for (const snippet of [
  'box-shadow: var(--ui-bottom-nav-active-shell-shadow);',
  'box-shadow: var(--ui-bottom-nav-active-avatar-shadow);',
  'box-shadow: var(--ui-bottom-nav-avatar-placeholder-inset-shadow);',
]) {
  if (!bottomNavCssSource.includes(snippet)) {
    failures.push(`src/styles/components/bottom-nav.css must route bottom-nav shadows through token snippet: ${snippet}`);
  }
}
if (/box-shadow:\s*(?:inset\s+)?0\s+\d/.test(bottomNavCssSource)) {
  failures.push('src/styles/components/bottom-nav.css must not use raw numeric box-shadow values; add or reuse semantic bottom-nav shadow tokens instead.');
}

const segmentTabsCssSource = read('src/styles/components/segment-tabs.css');
for (const snippet of [
  'backdrop-filter: var(--ui-backdrop-filter-none);',
  '-webkit-backdrop-filter: var(--ui-backdrop-filter-none);',
]) {
  if (!segmentTabsCssSource.includes(snippet)) {
    failures.push(`src/styles/components/segment-tabs.css must route backdrop reset through token snippet: ${snippet}`);
  }
}
if (/backdrop-filter:\s*none/.test(segmentTabsCssSource)) {
  failures.push('src/styles/components/segment-tabs.css must not use raw backdrop-filter none; use --ui-backdrop-filter-none instead.');
}

const appShellSource = read('src/app/AppShell.tsx');
for (const snippet of [
  'className="app-main app-shell-main"',
  'data-route-surface={routeSurface}',
  'data-app-shell-width={appShellWidth}',
]) {
  if (!appShellSource.includes(snippet)) {
    failures.push(`src/app/AppShell.tsx must expose shell layout contract snippet: ${snippet}`);
  }
}

const feedListSource = read('src/features/feed/PostFeedList.tsx');
for (const snippet of [
  'function hasFeedPostMedia',
  "hasMedia ? 'feed-list-item--media' : ''",
  'data-feed-item-media={hasMedia ? \'true\' : undefined}',
]) {
  if (!feedListSource.includes(snippet)) {
    failures.push(`src/features/feed/PostFeedList.tsx must keep explicit feed media state snippet: ${snippet}`);
  }
}

const feedChromeSource = read('src/styles/components/feed-card-chrome.css');
if (!feedChromeSource.includes('.feed-list-item--deferred.feed-list-item--media')) {
  failures.push('src/styles/components/feed-card-chrome.css must keep media-specific deferred feed sizing owned by feed chrome.');
}
if (!feedChromeSource.includes('transform: scale(var(--ui-feed-status-ping-scale));')) {
  failures.push('src/styles/components/feed-card-chrome.css must route feed status ping scale through --ui-feed-status-ping-scale.');
}
if (/transform:\s*scale\(2\)/.test(feedChromeSource)) {
  failures.push('src/styles/components/feed-card-chrome.css must not use raw feed ping scale values; use --ui-feed-status-ping-scale instead.');
}

const feedShellSource = read('src/styles/components/feed-card-shell.css');
if (!feedShellSource.includes('box-shadow: var(--ui-feed-author-avatar-ring-shadow);')) {
  failures.push('src/styles/components/feed-card-shell.css must route author avatar ring through --ui-feed-author-avatar-ring-shadow.');
}
if (/box-shadow:\s*inset\s+0\s+0\s+0\s+var\(--ui-border-width-hairline\)\s+var\(--ui-social-line\)/.test(feedShellSource)) {
  failures.push('src/styles/components/feed-card-shell.css must not inline author avatar ring shadow; use --ui-feed-author-avatar-ring-shadow instead.');
}

const feedOptionsMenuSource = read('src/styles/components/feed-card-options-menu.css');
for (const snippet of [
  'gap: var(--ui-feed-options-sheet-actions-gap);',
  'padding: var(--ui-feed-options-sheet-body-padding);',
  'min-height: var(--ui-feed-options-sheet-button-height);',
  'padding: var(--ui-feed-options-sheet-button-padding-y) var(--ui-feed-options-sheet-button-padding-x);',
]) {
  if (!feedOptionsMenuSource.includes(snippet)) {
    failures.push(`src/styles/components/feed-card-options-menu.css must route options menu sizing through token snippet: ${snippet}`);
  }
}
if (/max-width:\s*390px/.test(feedOptionsMenuSource) || /@media\s*\(max-width:\s*390px\)/.test(feedOptionsMenuSource)) {
  failures.push('src/styles/components/feed-card-options-menu.css must not use a hardcoded 390px breakpoint; use tokenized base sheet sizing instead.');
}

const feedAvatarActivitySource = read('src/styles/components/feed-card-avatar-activity.css');
for (const snippet of [
  'background: var(--ui-feed-avatar-activity-ring-surface);',
  'inset: calc((var(--ui-feed-avatar-activity-ring-size) + var(--ui-feed-avatar-activity-ring-gap)) * -1);',
  'background: var(--ui-feed-avatar-activity-ring-color);',
  'inset: calc(var(--ui-feed-avatar-activity-ring-gap) * -1);',
  'box-shadow: var(--ui-shadow-none);',
]) {
  if (!feedAvatarActivitySource.includes(snippet)) {
    failures.push(`src/styles/components/feed-card-avatar-activity.css must route avatar activity styling through token snippet: ${snippet}`);
  }
}
if (/--feed-card-avatar-activity-ring-(?:size|gap):\s*(?:2px|1\.5px)/.test(feedAvatarActivitySource)) {
  failures.push('src/styles/components/feed-card-avatar-activity.css must not define raw avatar activity ring dimensions; use --ui-feed-avatar-activity-* tokens instead.');
}
if (/box-shadow:\s*none/.test(feedAvatarActivitySource)) {
  failures.push('src/styles/components/feed-card-avatar-activity.css must not use raw box-shadow none; use --ui-shadow-none instead.');
}

const postCardSource = read('src/features/post/PostCard.tsx');
for (const snippet of [
  'const hasBodyContent = Boolean(displayText || hasVisibleTags || post.quotedPost);',
  "hasBodyContent ? '' : 'x-card-body--empty'",
  "data-card-body-empty={hasBodyContent ? undefined : 'true'}",
  "canShowContact ? 'ins-post-card--with-contact-action' : ''",
]) {
  if (!postCardSource.includes(snippet)) {
    failures.push(`src/features/post/PostCard.tsx must expose explicit feed card body/contact state snippet: ${snippet}`);
  }
}

const feedContentSource = read('src/styles/components/feed-card-content.css');
for (const snippet of [
  '.ins-post-card .x-card-body--empty',
  '.ins-post-card--media .x-card-body--empty + .x-card-media-block',
]) {
  if (!feedContentSource.includes(snippet)) {
    failures.push(`src/styles/components/feed-card-content.css must consume explicit body state snippet: ${snippet}`);
  }
}

const feedActionLayoutSource = read('src/styles/components/feed-card-actions-layout-v2.css');
for (const snippet of [
  '.ins-post-card .x-card-action-row',
  '.ins-post-card .x-card-action-cell',
  '.ins-post-card .x-card-action-cell.x-card-action-stat--heat',
]) {
  if (!feedActionLayoutSource.includes(snippet)) {
    failures.push(`src/styles/components/feed-card-actions-layout-v2.css must own feed action layout snippet: ${snippet}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('CSS cleanup guards passed.');
