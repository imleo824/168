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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(source, expected, message) {
  assert(source.includes(expected), message);
}

function assertNotIncludes(source, unexpected, message) {
  assert(!source.includes(unexpected), message);
}

function assertMatches(source, pattern, message) {
  assert(pattern.test(source), message);
}

const appShell = read('src/app/AppShell.tsx');
const routePaths = read('src/app/routePaths.ts');
const bottomNav = read('src/app/AppBottomNavigation.tsx');
const useIsMobile = read('src/hooks/useIsMobile.ts');
const wideScreenAdaptation = read('src/styles/system/wide-screen-mobile-adaptation.css');
const homePage = read('src/pages/Home.tsx');
const homeLayout = read('src/features/home/homeLayout.ts');
const homeFeedContent = read('src/features/home/HomeFeedContent.tsx');
const homeChrome = read('src/features/home/HomeChrome.tsx');
const homeTopbarCss = read('src/styles/components/topbar-system.css');
const homeFeedFoundationCss = read('src/styles/features/home-feed-foundation.css');
const postDetailPage = [
  read('src/pages/PostDetail.tsx'),
  read('src/pages/PostDetailLegacy.tsx'),
  read('src/features/post-detail/PostDetailLegacySections.tsx'),
].join('\n');
const postDetailActionbarShell = read('src/styles/features/post-detail-bottom-actions.css');
const secondaryPageActions = read('src/styles/system/secondary-page-actions.css');

for (const required of [
  "home: '/'",
  "messages: '/messages'",
  "sponsor: '/sponsor'",
  "profile: '/profile'",
  "promotionEffects: '/promotion-effects'",
]) {
  assertIncludes(routePaths, required, `routePaths.ts must own primary navigation routes; missing ${required}`);
}

assertNotIncludes(
  bottomNav,
  'writeHomeTopicTabId',
  'Bottom navigation must not own or reset the active home topic tab; it should only navigate or refresh the active tab.',
);
assertNotIncludes(
  bottomNav,
  'DEFAULT_HOME_TOPIC_TAB_ID',
  'Bottom navigation must not select the default topic tab when returning home.',
);
assertNotIncludes(
  bottomNav,
  'createPortal(',
  'Bottom navigation must live inside the unified app shell instead of a body portal.',
);
assertIncludes(
  bottomNav,
  'const PRIMARY_TAB_PATHS = new Set<string>([',
  'Bottom navigation must keep an explicit primary-tab allowlist.',
);
for (const requiredRoute of [
  'APP_ROUTES.home',
  'APP_ROUTES.messages',
  'APP_ROUTES.sponsor',
  'APP_ROUTES.profile',
]) {
  assertIncludes(bottomNav, requiredRoute, `Bottom navigation primary-tab allowlist must use ${requiredRoute}.`);
}
assertIncludes(
  bottomNav,
  'if (!shouldShowBottomNavigation(pathname)) return null;',
  'Bottom navigation component must hide itself outside mobile primary tabs, including detail pages.',
);
assertIncludes(
  bottomNav,
  "window.dispatchEvent(new CustomEvent('home-topic-tab-refresh'))",
  'Bottom navigation double-tap refresh must dispatch the active home topic refresh event.',
);
assertMatches(
  bottomNav,
  /if \(pathname === APP_ROUTES\.home\) \{[\s\S]*options\.refreshIfActive[\s\S]*refreshActiveHomeTopicTab\(\)[\s\S]*scrollActivePageToTop\('smooth'\)[\s\S]*return;/,
  'Active home bottom-nav taps must refresh the current topic instead of selecting the default topic.',
);

assertMatches(
  useIsMobile,
  /if \(!isAdminRoute\(\)\) return true;/,
  'User routes may still render mobile-first page branches; desktop adaptation must be owned by AppShell and CSS.',
);
assertMatches(
  useIsMobile,
  /return window\.innerWidth < breakpoint;/,
  'Only admin routes should use physical viewport width for legacy mobile branching.',
);

assertIncludes(
  appShell,
  "const routeSurface = isAdminRoute ? 'admin' : 'user';",
  'AppShell should classify route surface once instead of adding per-route shell exceptions.',
);
assertIncludes(
  appShell,
  'data-route-surface={routeSurface}',
  'AppShell must expose route surface for system layout contracts.',
);
assertIncludes(
  appShell,
  'data-desktop-surface={desktopSurfaceKind}',
  'AppShell must expose desktop surface kind so desktop geometry is route-aware without extra routes.',
);
assertIncludes(
  appShell,
  '<AppDesktopSidebar />',
  'Desktop user routes must render a first-class persistent sidebar.',
);
assertIncludes(
  appShell,
  '<AppDesktopContextRail onlineCountText={onlineCountText} />',
  'Desktop feed routes must share the app-level context rail and online count.',
);
assertIncludes(
  appShell,
  '<AppBottomNavigation />',
  'Mobile bottom navigation must stay inside the same unified user app shell.',
);
assertIncludes(
  appShell,
  "if (pathname === APP_ROUTES.home || pathname.startsWith('/category/')) return 'feed';",
  'Home and category routes must share the desktop feed surface.',
);
assertIncludes(
  appShell,
  "if (pathname.startsWith('/post/')) return 'detail';",
  'Post detail routes must use the desktop detail surface instead of a full-width exception.',
);
assertNotIncludes(
  appShell,
  'isFullBleedRoute',
  'AppShell must not restore full-bleed user route exceptions.',
);
assertNotIncludes(
  appShell,
  '/desktop',
  'AppShell must not restore desktop-only routes.',
);

for (const required of [
  '--app-desktop-sidebar-width',
  '--app-desktop-feed-main-width',
  '--app-desktop-detail-main-width',
  '--app-desktop-workspace-main-width',
  '--app-shell-viewport-width: var(--ui-viewport-width);',
  '--app-shell-viewport-height: var(--app-layout-vh);',
  '--app-desktop-shell-content-height: calc(var(--app-shell-viewport-height) - (var(--app-desktop-shell-padding-y) * 2));',
  "--ui-topbar-content-max-width: var(--app-desktop-page-content-width);",
  "@media (min-width: 1024px)",
  "height: var(--app-shell-viewport-height);",
  "overflow: hidden;",
  "height: var(--app-desktop-shell-content-height);",
  "overflow-y: auto;",
  "overscroll-behavior: contain;",
  ".app-shell[data-route-surface='user'][data-desktop-surface='feed'] .app-shell-main {\n      overflow: hidden;",
  ".app-shell[data-route-surface='user'] .app-bottom-nav {\n      display: none;",
  ".app-desktop-sidebar,\n    .app-desktop-context-rail {\n      position: sticky;",
]) {
  assertIncludes(wideScreenAdaptation, required, `Wide-screen adaptation must preserve the desktop shell contract; missing ${required}`);
}
for (const forbidden of [
  'app-user-mobile-canvas',
  'DesktopShell',
  'desktop-route-fallback',
  'font-size: calc(1em * var(--app-adaptive-scale))',
  '100svh',
  '100vw',
]) {
  assertNotIncludes(wideScreenAdaptation, forbidden, `Wide-screen adaptation must not restore legacy desktop hacks: ${forbidden}`);
}

assertIncludes(
  homePage,
  'useState<HomeTopicTabId>(readHomeTopicTabId)',
  'Home page should initialize its topic tab from the persisted active tab, not always from the default hot tab.',
);
assertIncludes(
  homePage,
  "window.addEventListener('home-topic-tab-refresh', handleHomeTopicTabRefreshEvent)",
  'Home page must keep the refresh event listener used by bottom navigation double-tap refresh.',
);
assertIncludes(
  homePage,
  'if (isDesktopViewport) {\n      pendingHomeFeedScrollTopRef.current = scrollTop;\n      setIsHomeChromeCollapsed(false);\n      return;\n    }',
  'Desktop home feed scroll must keep top chrome open while only the feed viewport scrolls.',
);
assertIncludes(
  homeLayout,
  'home-mobile-shell home-document-scroll-shell home-has-sticky-topic-tabs',
  'Home should keep one mobile-first content branch while the outer AppShell provides desktop framing.',
);
assertNotIncludes(
  homeLayout,
  'home-desktop-shell',
  'Home layout helper must not restore a second desktop-only shell branch.',
);
assertIncludes(
  homeFeedContent,
  "import FeedViewport from '@/features/feed/FeedViewport'",
  'Home feed must render through the shared feed viewport implementation.',
);
assertIncludes(
  homeFeedContent,
  '<FeedViewport',
  'Home feed content must keep the shared feed viewport component.',
);
assertNotIncludes(
  homeFeedContent,
  'HomeDesktopFeedSuspenseFallback',
  'Home feed content must not lazy-load desktop-only feed fallbacks.',
);
assert(
  !exists('src/features/home/HomeDesktopFeedContent.tsx'),
  'HomeDesktopFeedContent.tsx must not return; the active home route uses HomeFeedContent inside the desktop app frame.',
);
assertIncludes(
  homeChrome,
  '<HomeAdBanner ads={homeAds} compact />',
  'Home chrome should use the compact banner contract inside the shared scrollaway chrome.',
);
assertMatches(
  homeTopbarCss,
  /\.home-topbar \.home-topbar-brand-lockup,[\s\S]*width:\s*var\(--ui-home-topbar-brand-vector-width\);[\s\S]*height:\s*var\(--ui-home-topbar-brand-vector-height\);[\s\S]*\.home-topbar \.home-topbar-brand-vector \{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/,
  'Home brand must own stable non-zero dimensions so the centered title cannot collapse.',
);
for (const required of [
  ".app-shell[data-route-surface='user'][data-desktop-surface='feed'] .home-mobile-shell",
  '--ui-home-desktop-feed-width: var(--app-desktop-page-content-width);',
  '--ui-home-feed-reading-column-width: min(100%, calc(var(--app-desktop-reading-main-width) - (var(--ui-app-shell-desktop-padding-x) * 2)));',
  '--ui-social-feed-list-max-width: var(--ui-home-feed-reading-column-width);',
  ".app-shell[data-route-surface='user'][data-desktop-surface='feed'] .home-scrollaway-chrome,\n    .app-shell[data-route-surface='user'][data-desktop-surface='feed'] .home-topic-tabs-sticky-shell",
  ".app-shell[data-route-surface='user'][data-desktop-surface='feed'] .home-mobile-feed-panel [data-feed-scroll-root]",
  'overflow-y: auto;',
  'overscroll-behavior: contain;',
  'column-count: var(--ui-home-feed-column-count);',
  'max-width: var(--ui-home-feed-reading-column-width);',
]) {
  assertIncludes(homeFeedFoundationCss, required, `Desktop feed must keep chrome outside the feed scroller and use the current desktop feed contract; missing ${required}`);
}

assert(
  !homeFeedFoundationCss.includes('column-count: 2;'),
  'Desktop feed must stay as one centered reading column, not a two-column masonry feed.',
);

assertIncludes(
  postDetailPage,
  'const isDetailMobile = !isDesktopViewport;',
  'Post detail layout must derive mobile/desktop mode from the actual viewport.',
);
assertIncludes(
  postDetailPage,
  'const isOverlayDetail = isDetailMobile && Boolean(routeState?.backgroundLocation?.pathname);',
  'Desktop detail must stay inside the framed app shell instead of using the mobile route overlay.',
);
assertMatches(
  postDetailPage,
  /<DetailBottomBar[\s\S]*isMobile=\{isMobile\}[\s\S]*heatCountText=\{heatCountText\}/,
  'Post detail bottom actions must receive the viewport-derived mobile flag.',
);
assertIncludes(
  secondaryPageActions,
  'bottom: var(--ui-keyboard-inset);',
  'Shared secondary action bars must consume the keyboard inset on mobile.',
);
assertIncludes(
  postDetailActionbarShell,
  '.detail-bottom-bar-desktop',
  'Post detail action bar must keep a desktop variant inside the framed app shell.',
);

if (failures.length > 0) {
  console.error('[home-navigation-guards] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[home-navigation-guards] passed');
