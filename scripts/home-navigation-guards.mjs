import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);

const appShell = read('src/app/AppShell.tsx');
const bottomNav = read('src/app/AppBottomNavigation.tsx');
const useIsMobile = read('src/hooks/useIsMobile.ts');
const wideScreenMobile = read('src/styles/system/wide-screen-mobile-adaptation.css');
const homePage = read('src/pages/Home.tsx');
const homeLayout = read('src/features/home/homeLayout.ts');
const homeFeedContent = read('src/features/home/HomeFeedContent.tsx');
const homeChrome = read('src/features/home/HomeChrome.tsx');
const homeTopbarCss = read('src/styles/components/topbar-system.css');
const postDetailPage = [
  read('src/pages/PostDetail.tsx'),
  read('src/pages/PostDetailLegacy.tsx'),
  read('src/features/post-detail/PostDetailLegacySections.tsx'),
].join('\n');
const postDetailActionbarShell = read('src/styles/features/post-detail-bottom-actions.css');

assert.doesNotMatch(
  bottomNav,
  /writeHomeTopicTabId|DEFAULT_HOME_TOPIC_TAB_ID|home-topic-tab-select/,
  'bottom navigation must not own or reset the active home topic tab; it should only navigate or refresh the active tab.',
);

assert.doesNotMatch(
  bottomNav,
  /createPortal\s*\(|ReactDOM\.createPortal|document\.body\.append/,
  'bottom navigation must live inside the user mobile canvas, not in a body portal.',
);

assert.match(
  bottomNav,
  /PRIMARY_TAB_PATHS = new Set\(\['\/', '\/chat', '\/sponsor', '\/profile'\]\)/,
  'bottom navigation must preserve the mobile primary-tab contract and must not appear on detail pages.',
);

assert.match(
  bottomNav,
  /if \(!shouldShowBottomNavigation\(pathname\)\) return null;/,
  'bottom navigation component must hide itself outside mobile primary tabs.',
);

assert.match(
  bottomNav,
  /function refreshActiveHomeTopicTab[\s\S]*home-topic-tab-refresh/,
  'bottom navigation double-tap refresh must dispatch the active home topic refresh event.',
);

assert.match(
  bottomNav,
  /if \(pathname === '\/'\) \{[\s\S]*options\.refreshIfActive[\s\S]*refreshActiveHomeTopicTab\(\)[\s\S]*scrollActivePageToTop\('smooth'\)[\s\S]*return;/,
  'active home bottom-nav taps must refresh the current topic instead of selecting the default topic.',
);

assert.match(
  useIsMobile,
  /if \(!isAdminRoute\(\)\) return true;/,
  'useIsMobile must force every user route into mobile rendering branches regardless of viewport.',
);

assert.match(
  useIsMobile,
  /return window\.innerWidth < breakpoint;/,
  'Only admin routes may use physical viewport width for mobile detection.',
);

assert.match(
  appShell,
  /const routeSurface = isAdminRoute \? 'admin' : 'user'/,
  'AppShell should classify only route surface, not user-route variants.',
);

assert.match(
  appShell,
  /<div[\s\S]*className=\{appClassName\}[\s\S]*data-route-surface=\{routeSurface\}[\s\S]*\{isUserSurface \? <Navigation \/> : null\}[\s\S]*<div[\s\S]*className="app-main app-shell-main"[\s\S]*\{isUserSurface \? <AppBottomNavigation \/> : null\}[\s\S]*<GlobalAuthOverlay \/>/,
  'Every user-surface chrome layer must live inside the single user app shell.',
);

assert.match(
  appShell,
  /const appShellWidth = isAdminRoute \? 'full' : 'bounded'[\s\S]*data-app-shell-width=\{appShellWidth\}/,
  'user PC shell must stay inside the same scaled mobile canvas instead of per-route full width exceptions.',
);

assert.doesNotMatch(
  appShell,
  /isFullBleedRoute|<GlobalAuthOverlay \/>\s*<Navigation \/>\s*\{isUserSurface \? <AppBottomNavigation \/> : null\}/,
  'AppShell must not use full-bleed user route exceptions or chrome outside the user canvas.',
);

assert.match(
  wideScreenMobile,
  /--app-mobile-canvas-target-width:[\s\S]*--app-mobile-canvas-width:\s*100vw[\s\S]*@media \(min-width: 768px\)[\s\S]*--app-mobile-canvas-width:\s*var\(--app-mobile-canvas-target-width\)/,
  'PC user shell must start from a fixed mobile design canvas target, not a widened desktop canvas.',
);

assert.match(
  wideScreenMobile,
  /\.app-shell\[data-route-surface='user'\] \.app-shell-main[\s\S]*width:\s*var\(--app-mobile-canvas-width\)[\s\S]*transform:\s*scale\(var\(--app-adaptive-scale\)\)[\s\S]*\.app-shell\[data-route-surface='user'\] \.app-bottom-nav[\s\S]*width:\s*var\(--app-mobile-canvas-width\)[\s\S]*transform:\s*translateX\(-50%\) scale\(var\(--app-adaptive-scale\)\)/,
  'PC user shell must scale main content and bottom navigation from the same mobile canvas contract.',
);

assert.match(
  wideScreenMobile,
  /\.app-shell\[data-route-surface='user'\][\s\S]*--app-adaptive-scale:[\s\S]*\.app-shell\[data-route-surface='user'\] \.app-shell-main/,
  'Main content must inherit the user shell scaling variables.',
);

assert.doesNotMatch(
  wideScreenMobile,
  /--app-adaptive-canvas-max:\s*5[0-9]{2}px|font-size:\s*calc\(1em \* var\(--app-adaptive-scale\)\)|app-user-mobile-canvas/,
  'PC user shell must not fake scaling by widening the canvas, only increasing font size, or restoring the stale wrapper.',
);

assert.match(
  homePage,
  /useState<HomeTopicTabId>\(readHomeTopicTabId\)/,
  'home page should initialize its topic tab from the persisted active tab, not always from the default hot tab.',
);

assert.match(
  homeTopbarCss,
  /\.home-topbar \.home-topbar-brand-lockup,[\s\S]*width:\s*var\(--ui-home-topbar-brand-vector-width\);[\s\S]*height:\s*var\(--ui-home-topbar-brand-vector-height\);[\s\S]*\.home-topbar \.home-topbar-brand-vector \{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/,
  'home brand must own stable non-zero dimensions so the centered TuiTui title cannot collapse.',
);

assert.match(
  homePage,
  /window\.addEventListener\('home-topic-tab-refresh', handleHomeTopicTabRefreshEvent\)/,
  'home page must keep the refresh event listener used by bottom navigation double-tap refresh.',
);

assert.match(
  homeLayout,
  /home-mobile-shell home-document-scroll-shell home-has-sticky-topic-tabs/,
  'home shell must use the mobile shell on every viewport; PC is a scaled mobile app.',
);

assert.doesNotMatch(
  homeLayout,
  /home-desktop-shell/,
  'home shell must not restore a desktop-only shell class.',
);

assert.match(
  homeFeedContent,
  /import FeedViewport from '@\/features\/feed\/FeedViewport'[\s\S]*<FeedViewport/,
  'home feed must render through the shared mobile feed viewport implementation.',
);

assert.doesNotMatch(
  homeFeedContent,
  /HomeDesktopFeedContent|HomeDesktopFeedSuspenseFallback/,
  'home feed must not import or lazy-load desktop-only implementations.',
);

assert.equal(
  exists('src/features/home/HomeDesktopFeedContent.tsx'),
  false,
  'legacy HomeDesktopFeedContent.tsx must not exist; desktop uses scaled mobile feed.',
);

assert.match(
  homeChrome,
  /<HomeAdBanner ads=\{homeAds\} compact \/>/,
  'home chrome must use compact mobile banner on every viewport.',
);

assert.match(
  postDetailPage,
  /<DetailBottomBar[\s\S]*isMobile=\{isMobile\}[\s\S]*heatCountText=\{heatCountText\}/,
  'post detail must force mobile action bar mode on every viewport.',
);

assert.match(
  postDetailActionbarShell,
  /bottom:\s*var\(--ui-keyboard-inset\)/,
  'post detail action bar must keep mobile bottom positioning and must not reserve space for bottom nav.',
);

assert.doesNotMatch(
  postDetailActionbarShell,
  /bottom-nav-reserved-space|app-mobile-canvas-width|app-adaptive-scale|@media \(min-width: 768px\)/,
  'post detail action bar must not reserve bottom-nav space or scale independently; it should inherit the complete user canvas scale.',
);

console.log('[home-navigation-guards] passed');
