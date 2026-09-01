import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  const stat = fs.statSync(absoluteEntry);

  if (stat.isFile()) {
    return predicate(relativeEntry) ? [relativeEntry] : [];
  }

  const files = [];
  for (const name of fs.readdirSync(absoluteEntry)) {
    files.push(...walk(path.join(relativeEntry, name), predicate));
  }
  return files;
}

function compact(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
}

const cssFiles = walk('src/styles', (entry) => entry.endsWith('.css'));

for (const file of cssFiles) {
  const source = read(file);
  const flatSource = compact(source);

  if (/@media\s*[^{}]+\{\s*\}/.test(flatSource)) {
    failures.push(`${file} must not keep empty media queries; remove the dead responsive block or add an owned rule.`);
  }

  if (/\.home-topbar\.ui-topbar\s*\{[^}]*\b(position|top|z-index)\s*:/u.test(flatSource)) {
    failures.push(`${file} must not position Home topbar from a feature stylesheet; use data-ui-scrollaway-chrome and ui-sticky-layer-contract.css.`);
  }

  if (/\.profile-modern-topbar\.ui-topbar\s*\{[^}]*\b(position|top|z-index)\s*:/u.test(flatSource)) {
    failures.push(`${file} must not position Profile topbar from a feature stylesheet; use PageHeader topbarMode and ui-sticky-layer-contract.css.`);
  }
}

const skeletonChrome = read('src/styles/system/ui-skeleton-chrome-contract.css');
for (const forbidden of [':has(', 'nth-child(']) {
  if (!skeletonChrome.includes(forbidden)) continue;
  failures.push(`src/styles/system/ui-skeleton-chrome-contract.css must not infer loading state with ${forbidden}; consume explicit data-bootstrap-state instead.`);
}

const stickyContract = read('src/styles/system/ui-sticky-layer-contract.css');
if (!stickyContract.includes(".ui-topbar[data-ui-topbar-mode='static']")) {
  failures.push('src/styles/system/ui-sticky-layer-contract.css must support PageHeader topbarMode="static" through data-ui-topbar-mode.');
}

const pageHeaderSource = read('src/ui/PageHeader.tsx');
if (!pageHeaderSource.includes('data-ui-topbar-mode={resolvedTopbarMode || undefined}')) {
  failures.push('src/ui/PageHeader.tsx must expose topbarMode through data-ui-topbar-mode for CSS contracts.');
}

const profileRouteSource = read('src/pages/ProfileMobile.tsx');
if (!profileRouteSource.includes("topbarMode: 'static'")) {
  failures.push('src/pages/ProfileMobile.tsx must keep the Profile topbar mode explicit through PageHeaderPolicy, not feature CSS positioning overrides.');
}

const promoteComponentsSource = read('src/features/promote/promoteComponents.tsx');
for (const forbidden of ['PAYMENT_FOCUS_STABILIZE_DELAYS', 'schedulePaymentInputVisibility', 'preventScroll: true']) {
  if (!promoteComponentsSource.includes(forbidden)) continue;
  failures.push(`src/features/promote/promoteComponents.tsx must not restore payment focus patching (${forbidden}); the sheet should use stable text-entry CSS contracts.`);
}

const paymentActionSheetSource = read('src/styles/components/payment-action-sheet.css');
const featureContractsSource = read('src/styles/tokens/feature-contracts.css');
const foundationTokensSource = read('src/styles/tokens/foundation.css');
const postQuoteSource = read('src/styles/components/post-quote.css');
const wideScreenAdaptationSource = read('src/styles/system/wide-screen-mobile-adaptation.css');
if (!paymentActionSheetSource.includes('font-size: var(--ui-root-font-size);')) {
  failures.push('src/styles/components/payment-action-sheet.css must keep payment inputs at the root text-entry size to prevent mobile browser focus zoom.');
}
if (!paymentActionSheetSource.includes('var(--ui-keyboard-inset)')) {
  failures.push('src/styles/components/payment-action-sheet.css must consume --ui-keyboard-inset so the payment sheet is lifted above the keyboard.');
}
if (!paymentActionSheetSource.includes('padding-block-end: max(env(safe-area-inset-bottom), var(--ui-keyboard-inset));')) {
  failures.push('src/styles/components/payment-action-sheet.css must apply keyboard avoidance to the payment overlay bottom padding.');
}
if (paymentActionSheetSource.includes('var(--app-visual-vh')) {
  failures.push('src/styles/components/payment-action-sheet.css must not size the payment overlay from --app-visual-vh; visual viewport resizing during keyboard focus can resize the whole sheet.');
}
if (!paymentActionSheetSource.includes('--ui-payment-action-visual-sheet-max-height: calc(var(--ui-visual-viewport-height) - env(safe-area-inset-top) - var(--ui-space-3));')) {
  failures.push('src/styles/components/payment-action-sheet.css must keep a named visual viewport max-height contract for payment/referral sheets.');
}
if (!paymentActionSheetSource.includes('var(--ui-promote-payment-sheet-max-height, var(--ui-payment-action-visual-sheet-max-height))')) {
  failures.push('src/styles/components/payment-action-sheet.css must route payment sheet business overrides through the shared visual viewport fallback.');
}
if (!paymentActionSheetSource.includes('var(--app-layout-vh, var(--app-vh))')) {
  failures.push('src/styles/components/payment-action-sheet.css must keep the stable layout viewport cap so keyboard avoidance is not double-counted on mobile browsers.');
}
if (!featureContractsSource.includes('--ui-promote-payment-sheet-max-height: calc(var(--ui-visual-viewport-height) - env(safe-area-inset-top) - var(--ui-space-3));')) {
  failures.push('src/styles/tokens/feature-contracts.css must not hard-code promote/payment sheet height; derive it from the shared visual viewport contract.');
}
if (featureContractsSource.includes('--ui-promote-payment-sheet-max-height: 88dvh')) {
  failures.push('src/styles/tokens/feature-contracts.css must not restore the raw 88dvh payment sheet height.');
}
if (!featureContractsSource.includes('--ui-promote-picker-sheet-max-height: calc(var(--ui-visual-viewport-height) - var(--ui-space-4));')) {
  failures.push('src/styles/tokens/feature-contracts.css must derive promote picker sheet height from the shared visual viewport contract.');
}
if (featureContractsSource.includes('--ui-promote-picker-sheet-max-height: 86dvh')) {
  failures.push('src/styles/tokens/feature-contracts.css must not restore the raw 86dvh promote picker sheet height.');
}
if (!foundationTokensSource.includes('--ui-sheet-max-height: min(calc(var(--ui-visual-viewport-height) - var(--ui-space-4)), calc(var(--ui-space-8) * 22 + var(--ui-space-4)));')) {
  failures.push('src/styles/tokens/foundation.css must derive shared sheet max-height from the visual viewport contract.');
}
if (foundationTokensSource.includes('--ui-sheet-max-height: min(86dvh')) {
  failures.push('src/styles/tokens/foundation.css must not restore raw 86dvh in the shared sheet max-height token.');
}
if (!foundationTokensSource.includes('--ui-auth-panel-max-height: calc(var(--ui-visual-viewport-height) - var(--ui-space-8));')) {
  failures.push('src/styles/tokens/foundation.css must derive auth panel max-height from the shared visual viewport contract.');
}
if (!foundationTokensSource.includes('--ui-lightbox-image-max-height: var(--ui-visual-viewport-height);')) {
  failures.push('src/styles/tokens/foundation.css must derive lightbox image max-height from the shared visual viewport contract.');
}
for (const forbidden of ['--ui-auth-panel-max-height: 90vh', '--ui-lightbox-image-max-height: 100dvh']) {
  if (foundationTokensSource.includes(forbidden)) failures.push(`src/styles/tokens/foundation.css must not restore raw viewport sizing: ${forbidden}`);
}
for (const required of [
  '--ui-page-loader-min-height: clamp(calc(var(--ui-space-8) * 6), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 14)), calc(var(--ui-space-8) * 14));',
  '--ui-loading-block-min-height: clamp(calc(var(--ui-space-8) * 5), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 14)), calc(var(--ui-space-8) * 13));',
  '--ui-feed-footer-state-min-height: clamp(calc(var(--ui-space-8) * 6), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 16)), calc(var(--ui-space-8) * 10));',
]) {
  if (foundationTokensSource.includes(required)) continue;
  failures.push(`src/styles/tokens/foundation.css must keep shared state sizing token: ${required}`);
}
if (!read('src/styles/system/ui-primitives-layout.css').includes('min-height: var(--ui-page-loader-min-height);')) {
  failures.push('src/styles/system/ui-primitives-layout.css must use the shared page loader height token.');
}
if (!read('src/styles/02-core-controls.css').includes('min-height: var(--ui-loading-block-min-height);')) {
  failures.push('src/styles/02-core-controls.css must use the shared loading block height token.');
}
if (!read('src/styles/system/feed-scroll-shell.css').includes('min-height: var(--ui-feed-footer-state-min-height);')) {
  failures.push('src/styles/system/feed-scroll-shell.css must use the shared feed footer state height token.');
}
const authPrimitivesSource = read('src/styles/system/ui-primitives-auth.css');
if (!authPrimitivesSource.includes('--ui-auth-agreement-panel-max-height: clamp(calc(var(--ui-space-8) * 4), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 19)), calc(var(--ui-space-8) * 7));')) {
  failures.push('src/styles/system/ui-primitives-auth.css must derive the auth agreement panel height from the visual viewport contract.');
}
if (!authPrimitivesSource.includes('max-width: calc(var(--ui-viewport-width) - var(--ui-space-6));')) {
  failures.push('src/styles/system/ui-primitives-auth.css must use the shared viewport width token for compact auth panels.');
}
for (const forbidden of ['48svh', '46svh', '58svh', '34svh', 'calc(100vw - var(--ui-space-6))']) {
  if (authPrimitivesSource.includes(forbidden) || read('src/styles/system/ui-primitives-layout.css').includes(forbidden) || read('src/styles/system/feed-scroll-shell.css').includes(forbidden) || read('src/styles/02-core-controls.css').includes(forbidden)) {
    failures.push(`shared state/auth primitives must not restore raw viewport sizing: ${forbidden}`);
  }
}
for (const required of [
  '--app-shell-viewport-width: var(--ui-viewport-width);',
  '--app-shell-viewport-height: var(--app-layout-vh);',
  '--app-desktop-shell-content-height: calc(var(--app-shell-viewport-height) - (var(--app-desktop-shell-padding-y) * 2));',
  'height: var(--app-shell-viewport-height);',
  'height: var(--app-desktop-shell-content-height);',
  'max-height: var(--app-desktop-shell-content-height);',
]) {
  if (wideScreenAdaptationSource.includes(required)) continue;
  failures.push(`src/styles/system/wide-screen-mobile-adaptation.css must keep the shared desktop viewport/frame contract: ${required}`);
}
for (const forbidden of ['100svh', '100vw', 'calc(100vw']) {
  if (!wideScreenAdaptationSource.includes(forbidden)) continue;
  failures.push(`src/styles/system/wide-screen-mobile-adaptation.css must not restore raw viewport sizing: ${forbidden}`);
}
if (!postQuoteSource.includes('max-height: min(calc(var(--ui-visual-viewport-height) - var(--ui-space-4)), calc(var(--ui-space-8) * 18));')) {
  failures.push('src/styles/components/post-quote.css must derive quote sheet max-height from the shared visual viewport contract.');
}
if (postQuoteSource.includes('max-height: min(86dvh')) {
  failures.push('src/styles/components/post-quote.css must not restore raw 86dvh quote sheet sizing.');
}
if (!read('src/styles/components/state-contract.css').includes('calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 15))')) {
  failures.push('src/styles/components/state-contract.css must derive feed empty-state height from the visual viewport contract.');
}
if (read('src/styles/components/state-contract.css').includes('42svh')) {
  failures.push('src/styles/components/state-contract.css must not restore raw 42svh empty-state sizing.');
}

const promotionRecordRowContractSource = read('src/styles/system/record-card-contract.css');
for (const required of [
  '--record-card-line-min-height',
  '.record-card .record-card-line',
  '.record-id-copy',
  '.record-card .promotion-effect-stats.record-card-line',
]) {
  if (promotionRecordRowContractSource.includes(required)) continue;
  failures.push(`src/styles/system/record-card-contract.css must keep the record row rhythm rule: ${required}`);
}

const componentsLayerSource = read('src/styles/layers/components.css');
if (!componentsLayerSource.includes('@import "../components/segment-tabs.css";')) {
  failures.push('src/styles/layers/components.css must import the shared SegmentTabs contract before feature styles.');
}

const segmentTabsContractSource = read('src/styles/components/segment-tabs.css');
for (const required of [
  '.ui-page-tabs-section',
  '.ui-page-tabs-bar.ui-segment-tabs[data-segment-variant=\'underline\']',
  '.ui-page-tabs-bar .ui-segment-tab[aria-selected=\'true\']::after',
]) {
  if (segmentTabsContractSource.includes(required)) continue;
  failures.push(`src/styles/components/segment-tabs.css must keep shared page tab contract selector: ${required}`);
}

const messagesPageSource = read('src/pages/MessagesMobile.tsx');
for (const required of [
  'ui-page-tabs-section',
  'messages-tabbar ui-page-tabs-bar',
  'variant="underline"',
]) {
  if (messagesPageSource.includes(required)) continue;
  failures.push(`src/pages/MessagesMobile.tsx must consume the shared page tab contract: ${required}`);
}

const messagesStylesSource = read('src/styles/features/messages.css');
if (/messages-tabbar[\s\S]{0,600}(?:border-bottom|::after)/.test(messagesStylesSource)) {
  failures.push('src/styles/features/messages.css must not own tab underline chrome; shared segment-tabs.css owns page tab visuals.');
}

const postCardSource = read('src/features/post/PostCard.tsx');
for (const required of [
  'hasRecentAuthorPost',
  'post.user?.hasRecentPost',
  'hasRecentPost={hasRecentAuthorPost}',
]) {
  if (postCardSource.includes(required)) continue;
  failures.push(`src/features/post/PostCard.tsx must render recent author activity from the backend payload: ${required}`);
}

const feedCardFacadeSource = read('src/styles/components/feed-card-system.css');
if (!feedCardFacadeSource.includes('@import "./feed-card-avatar-activity.css";')) {
  failures.push('src/styles/components/feed-card-system.css must import feed-card-avatar-activity.css after the feed card shell.');
}

const feedCardAvatarActivitySource = read('src/styles/components/feed-card-avatar-activity.css');
if (!feedCardAvatarActivitySource.includes('.feed-card-author-avatar-link[data-recent-post="true"]')) {
  failures.push('src/styles/components/feed-card-avatar-activity.css must own the recent-post avatar ring selector.');
}

if (failures.length > 0) {
  console.error('CSS quality guard failures:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('CSS quality guards passed.');
