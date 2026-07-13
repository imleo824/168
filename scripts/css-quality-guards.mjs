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
