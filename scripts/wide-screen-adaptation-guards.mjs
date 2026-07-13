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

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  if (!fs.existsSync(absoluteEntry)) return [];
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

const forbiddenPaths = [
  'src/features/desktop',
  'src/pages/DesktopHomePreview.tsx',
  'src/pages/DesktopHomePreview.css',
  'scripts/desktop-css-architecture-guards.mjs',
  'scripts/desktop-route-context-guards.mjs',
  'docs/desktop-css-architecture.md',
  'docs/desktop-pc-pixel-review.md',
  'docs/desktop-route-context-review.md',
];

for (const forbiddenPath of forbiddenPaths) {
  if (!exists(forbiddenPath)) continue;
  failures.push(`Do not reintroduce the removed PC-only artifact: ${forbiddenPath}`);
}

for (const file of walk('src', (entry) => /\.(tsx?|jsx?|css)$/.test(entry))) {
  const source = read(file);
  for (const forbidden of [
    '/desktop',
    'DesktopShell',
    'DesktopHomePreview',
    'desktopRouteContext',
    '@/features/desktop',
  ]) {
    if (!source.includes(forbidden)) continue;
    failures.push(`${file} must not reintroduce PC-only routing or desktop-only structure: ${forbidden}`);
  }
}

const appShellSource = read('src/app/AppShell.tsx');
for (const forbidden of [
  'WIDE_SCREEN_ADAPTATION_QUERY',
  'useWideScreenAdaptation',
  'shouldUseAdaptiveUserChrome',
  'matchMedia(',
  'shouldShowBottomNavigation(pathname) ||',
]) {
  if (!appShellSource.includes(forbidden)) continue;
  failures.push(`AppShell must not change mobile chrome based on wide-screen state: ${forbidden}`);
}

for (const required of [
  'data-route-surface={routeSurface}',
  'const isUserSurface = routeSurface === \'user\';',
  '<div className="app-user-mobile-canvas" data-user-mobile-canvas>',
  '<AppBottomNavigation />',
  '<Route path="/" element={<Home />} />',
  '<Route path="/chat" element={<Chat />} />',
  '<Route path="/sponsor" element={<Sponsor />} />',
  '<Route path="/post/:id" element={<PostDetail />} />',
]) {
  if (appShellSource.includes(required)) continue;
  failures.push(`AppShell must keep one mobile canvas for the user app without PC-only routes; missing ${required}`);
}

const homeTopbarSource = read('src/features/home/HomeTopbar.tsx');
for (const forbidden of [
  'Plus',
  'HomeTopbarActionButton',
  'data-home-topbar-action',
  'onOpenCreate',
  '!canCreate',
]) {
  if (!homeTopbarSource.includes(forbidden)) continue;
  failures.push(`HomeTopbar must stay identical to mobile chrome on wide screens and must not show the removed top-right publish action: ${forbidden}`);
}

if (!homeTopbarSource.includes('right={<TopbarOnlineBadge countText={onlineCountText} />}')) {
  failures.push('HomeTopbar right slot must stay as the mobile online badge only.');
}

const layoutSource = read('src/styles/system/ui-primitives-layout.css');
for (const required of [
  '.app-shell-main[data-bottom-nav-visible=\'true\'] {',
  'padding-block-end: var(--ui-bottom-nav-page-bottom-space);',
  '.app-shell-main[data-route-surface=\'admin\'][data-bottom-nav-visible=\'true\'] {',
]) {
  if (layoutSource.includes(required)) continue;
  failures.push(`ui-primitives-layout.css must preserve user bottom-nav safe space across wide screens; missing ${required}`);
}

if (layoutSource.includes(".app-shell-main[data-bottom-nav-visible='true'] {\n      padding-block-end: var(--ui-space-none);")) {
  failures.push('User pages must not zero out bottom nav safe space at wide breakpoints.');
}

const viewportContractSource = read('src/styles/system/mobile-viewport-contract.css');
for (const required of [
  'overscroll-behavior-y: contain;',
  'body:has(.app-bottom-nav) {',
]) {
  if (viewportContractSource.includes(required)) continue;
  failures.push(`mobile-viewport-contract.css must contain overscroll when bottom nav is present; missing ${required}`);
}

const indexSource = read('src/index.css');
if (!indexSource.includes('@import "./styles/system/wide-screen-mobile-adaptation.css";')) {
  failures.push('src/index.css must import the wide-screen mobile adaptation layer.');
}

const adaptationSource = read('src/styles/system/wide-screen-mobile-adaptation.css');
for (const required of [
  '--app-mobile-canvas-width',
  '--app-adaptive-scale',
  '--app-adaptive-visual-width',
  '@media (min-width: 768px)',
  ':root:has(.app-shell[data-route-surface=\'user\'])',
  '.app-shell[data-route-surface=\'user\'] .app-user-mobile-canvas',
  'transform: scale(var(--app-adaptive-scale));',
  'body:has(.app-shell[data-route-surface=\'user\']) .app-bottom-nav',
  'width: var(--app-mobile-canvas-width);',
  'transform: translateX(-50%) scale(var(--app-adaptive-scale)) translateZ(var(--ui-space-none));',
]) {
  if (adaptationSource.includes(required)) continue;
  failures.push(`wide-screen-mobile-adaptation.css missing mobile-canvas scale contract: ${required}`);
}

for (const forbidden of [
  'grid-template-columns: repeat(',
  'DesktopShell',
  '/desktop',
  '.app-shell[data-route-surface=\'user\'] .app-bottom-nav',
  '.post-detail-action-bar.detail-bottom-bar,',
  '.promote-mobile-page .promote-checkout-bar',
  '.ui-topbar,',
  '.ui-layer-header,',
]) {
  if (!adaptationSource.includes(forbidden)) continue;
  failures.push(`wide-screen-mobile-adaptation.css must not change mobile structure or target portal chrome from inside the canvas: ${forbidden}`);
}

if (failures.length > 0) {
  console.error('Wide-screen adaptation guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Wide-screen adaptation guard passed.');
