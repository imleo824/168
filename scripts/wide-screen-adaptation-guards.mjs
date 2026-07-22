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
    'desktop-route-fallback',
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
  '<AppBottomNavigation />',
  '<Route path={APP_ROUTES.home} element={<Home />} />',
  '<Route path={APP_ROUTES.messages} element={<AppRequireAuthRoute><Messages /></AppRequireAuthRoute>} />',
  '<Route path={APP_ROUTES.sponsor} element={<AppRequireAuthRoute><Sponsor /></AppRequireAuthRoute>} />',
  '<Route path={APP_ROUTES.recharge} element={<AppRequireAuthRoute><Recharge /></AppRequireAuthRoute>} />',
  '<Route path={APP_ROUTES.invite} element={<AppRequireAuthRoute><ReferralInvite /></AppRequireAuthRoute>} />',
  '<Route path={APP_ROUTES.about} element={<BrandAbout />} />',
  '<AppDesktopSidebar />',
  '<AppDesktopContextRail onlineCountText={onlineCountText} />',
  'data-desktop-surface={desktopSurfaceKind}',
  '<Route path="/post/:id" element={<PostDetail />} />',
]) {
  if (appShellSource.includes(required)) continue;
  failures.push(`AppShell must keep one unified user app shell with first-class desktop chrome; missing ${required}`);
}

const routePathsSource = read('src/app/routePaths.ts');
for (const required of [
  "home: '/'",
  "messages: '/messages'",
  "create: '/create'",
  "profile: '/profile'",
  "about: '/about'",
  "sponsor: '/sponsor'",
  "invite: '/invite'",
  "recharge: '/recharge'",
  "notificationSettings: '/settings/notifications'",
]) {
  if (routePathsSource.includes(required)) continue;
  failures.push(`routePaths.ts must centralize high-traffic user routes; missing ${required}`);
}

const bottomNavigationSource = read('src/app/AppBottomNavigation.tsx');
for (const required of [
  'const PRIMARY_TAB_PATHS = new Set<string>([',
  'APP_ROUTES.home',
  'APP_ROUTES.messages',
  'APP_ROUTES.sponsor',
  'APP_ROUTES.profile',
  'navigate(APP_ROUTES.messages)',
  'navigate(APP_ROUTES.sponsor)',
  'navigate(APP_ROUTES.profile)',
]) {
  if (bottomNavigationSource.includes(required)) continue;
  failures.push(`AppBottomNavigation must use centralized primary routes without hardcoded tab paths; missing ${required}`);
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
  '@media (max-width: 1023px)',
  'overscroll-behavior-y: contain;',
  ".app-shell-main[data-bottom-nav-visible='true']",
]) {
  if (viewportContractSource.includes(required)) continue;
  failures.push(`mobile-viewport-contract.css must preserve native mobile scroll containment without desktop side effects; missing ${required}`);
}

const indexSource = read('src/index.css');
if (!indexSource.includes('@import "./styles/layers/system-core.css";')) {
  failures.push('src/index.css must import the system-core layer that owns viewport and wide-screen contracts.');
}

const systemCoreSource = read('src/styles/layers/system-core.css');
for (const required of [
  '@import "../system/ui-primitives.css";',
  '@import "../system/mobile-viewport-contract.css";',
]) {
  if (systemCoreSource.includes(required)) continue;
  failures.push(`system-core.css must keep shared viewport/layout contracts in the system layer; missing ${required}`);
}

const primitivesSource = read('src/styles/system/ui-primitives.css');
if (!primitivesSource.includes('@import "./wide-screen-mobile-adaptation.css";')) {
  failures.push('ui-primitives.css must import the wide-screen adaptation layer through the system primitive pipeline.');
}

const adaptationSource = read('src/styles/system/wide-screen-mobile-adaptation.css');
for (const required of [
  "--app-desktop-sidebar-width",
  "--app-desktop-feed-main-width",
  "--app-desktop-detail-main-width",
  "--app-desktop-conversation-main-width",
  "--app-desktop-workspace-main-width",
  "--app-shell-viewport-width: var(--ui-viewport-width);",
  "--app-shell-viewport-height: var(--app-layout-vh);",
  "--app-desktop-shell-content-height: calc(var(--app-shell-viewport-height) - (var(--app-desktop-shell-padding-y) * 2));",
  "--app-desktop-page-content-width",
  "--ui-topbar-content-max-width: var(--app-desktop-page-content-width);",
  "--ui-page-tabs-max-width: var(--app-desktop-page-content-width);",
  "@media (min-width: 1024px)",
  ".app-shell[data-route-surface='user'] {",
  "grid-template-columns:",
  "justify-content: center;",
  "height: var(--app-shell-viewport-height);",
  "overflow: hidden;",
  ".app-shell[data-route-surface='user'][data-desktop-surface='feed'] .app-shell-main {\n      overflow: hidden;",
  ".app-shell[data-route-surface='user'] .app-shell-main {\n      --app-desktop-page-content-width:",
  "overflow-y: auto;",
  "overscroll-behavior: contain;",
  "border: var(--ui-border-width-hairline) solid var(--ui-line-hairline);",
  "border-radius: var(--ui-radius-2xl);",
  "box-shadow: var(--ui-shadow-card);",
  ".app-shell[data-route-surface='user'] .app-shell-main > :is(.ui-app-page, .ui-page, .surface-page) > .ui-topbar",
  ".app-shell[data-route-surface='user'] .app-bottom-nav {\n      display: none;",
  "@media (min-width: 1024px) and (max-width: 1179px)",
  "--app-desktop-main-width: var(--app-desktop-workspace-main-width);",
  ".app-desktop-sidebar,\n    .app-desktop-context-rail {\n      position: sticky;",
  "top: var(--app-desktop-shell-padding-y);",
  ".app-shell[data-route-surface='user']:not([data-desktop-surface='feed']) .app-desktop-context-rail {\n      display: none;",
]) {
  if (adaptationSource.includes(required)) continue;
  failures.push(`wide-screen-mobile-adaptation.css missing current desktop shell contract: ${required}`);
}

if (!/@media \(min-width: 1024px\) and \(max-width: 1179px\)[\s\S]*?\.app-shell\[data-route-surface='user'\] \{[\s\S]*?--app-desktop-main-width: var\(--app-desktop-workspace-main-width\);/.test(adaptationSource)) {
  failures.push('1024-1179 desktop shell must keep one stable main frame width across sidebar navigation.');
}

if (/\.app-desktop-sidebar\s*\{[\s\S]*?top:\s*var\(--ui-space-none\);/.test(adaptationSource)) {
  failures.push('Desktop sidebar must stick to the framed shell top padding instead of jumping to the viewport edge.');
}

if (!/\.app-shell\[data-route-surface='user'\] \.app-shell-main\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/.test(adaptationSource)) {
  failures.push('Desktop user pages must scroll inside the framed main panel so side navigation and shell chrome stay fixed.');
}

if (!/\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.app-shell-main\s*\{[\s\S]*?overflow:\s*hidden;/.test(adaptationSource)) {
  failures.push('Desktop feed must keep the outer main panel fixed while the feed root owns scrolling.');
}

for (const forbidden of [
  'DesktopShell',
  '/desktop',
  'desktop-route-fallback',
  'grid-template-columns: repeat(',
  '100svh',
  '100vw',
  'position: fixed;',
  'left: 0;',
  'right: 0;',
]) {
  if (!adaptationSource.includes(forbidden)) continue;
  failures.push(`wide-screen-mobile-adaptation.css must not fall back to legacy/rigid desktop hacks: ${forbidden}`);
}

if (failures.length > 0) {
  console.error('Wide-screen adaptation guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Wide-screen adaptation guard passed.');
