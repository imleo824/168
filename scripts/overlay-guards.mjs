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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function importsInOrder(css, imports) {
  let cursor = -1;
  return imports.every((entry) => {
    const index = css.indexOf(`@import "${entry}";`);
    if (index <= cursor) return false;
    cursor = index;
    return true;
  });
}

function walk(relativeEntry, predicate) {
  const absoluteEntry = path.join(root, relativeEntry);
  const stat = fs.statSync(absoluteEntry);

  if (stat.isFile()) return predicate(relativeEntry) ? [relativeEntry] : [];

  const files = [];
  for (const name of fs.readdirSync(absoluteEntry)) {
    files.push(...walk(path.join(relativeEntry, name), predicate));
  }
  return files;
}

function stylesheetImports(source) {
  return [...source.matchAll(/import\s+['"]([^'"]+\.css)['"];?/g)].map((match) => match[1]);
}

const app = read('src/app/AppShell.tsx');
const featureContractsCss = read('src/styles/tokens/feature-contracts.css');
const mobileAddressBarHook = read('src/hooks/useMobileAddressBar.ts');
const indexCss = read('src/index.css');
const systemCoreLayerCss = read('src/styles/layers/system-core.css');
const componentsLayerCss = read('src/styles/layers/components.css');
const featuresLayerCss = read('src/styles/layers/features.css');
const brandAboutRouteCss = read('src/features/brand/BrandAboutRoute.css');
const brandAboutPage = read('src/pages/BrandAbout.tsx');
const tuiPlusRouteCss = read('src/features/tui-plus/TuiPlusRoute.css');
const adminPage = read('src/features/admin/AdminPage.tsx');
const categoryFeedRouteCss = read('src/features/category/CategoryFeedRoute.css');
const categoryFeedPage = read('src/pages/CategoryFeedMobile.tsx');
const postDetailRouteCss = read('src/features/post-detail/PostDetailRoute.css');
const postDetailLegacyPage = read('src/pages/PostDetailLegacy.tsx');
const notificationsRouteCss = read('src/features/notifications/NotificationsRoute.css');
const messagesPage = read('src/pages/MessagesMobile.tsx');
const notificationSettingsPage = read('src/pages/NotificationSettings.tsx');
const profileRouteCss = read('src/features/profile/ProfileRoute.css');
const profileBioEditorRouteCss = read('src/features/profile/ProfileBioEditorRoute.css');
const profilePage = read('src/pages/ProfileMobile.tsx');
const userSpacePage = read('src/pages/UserSpace.tsx');
const profileBioEditorPage = read('src/pages/ProfileBioEditorMobile.tsx');
const postCreateRouteCss = read('src/features/post-create/PostCreateRoute.css');
const postCreateRoutePage = read('src/pages/PostCreate.tsx');
const promoteRouteCss = read('src/features/promote/PromoteRoute.css');
const sponsorRouteCss = read('src/features/sponsor/SponsorRoute.css');
const referralRouteCss = read('src/features/sponsor/ReferralRoute.css');
const rechargeRouteCss = read('src/features/recharge/RechargeRoute.css');
const promotePage = read('src/features/promote/PromoteMobilePage.tsx');
const promoteHistoryPage = read('src/pages/PromoteHistory.tsx');
const promotionEffectsHistoryPage = read('src/pages/PromotionEffectsHistory.tsx');
const sponsorPage = read('src/features/sponsor/SponsorMobilePage.tsx');
const referralInvitePage = read('src/pages/ReferralInviteMobile.tsx');
const referralInviteRecordsPage = read('src/pages/ReferralInviteRecordsMobile.tsx');
const rechargePage = read('src/pages/RechargeMobile.tsx');
const contractsLayerCss = read('src/styles/layers/contracts.css');
const mobileViewportContractCss = read('src/styles/system/mobile-viewport-contract.css');
const overlayCss = read('src/styles/utilities/mobile-overlay-stability.css');
const profileDialogCss = read('src/styles/components/profile-dialog.css');
const profileFeatureDialogCss = read('src/styles/features/profile-dialog.css');
const profileModernCss = read('src/styles/features/profile-modern.css');
const profileSecuritySheetCss = [
  read('src/styles/features/profile-security-sheet.css'),
  read('src/styles/features/profile-security-shell.css'),
  read('src/styles/features/profile-security-content.css'),
  read('src/styles/features/profile-security-motion.css'),
].join('\n');
const profileAvatarActionCss = read('src/styles/features/profile-avatar-action.css');
const uiArchitectureContractCss = read('src/styles/system/ui-architecture-contract.css');
const uiStickyTopbarContractCss = read('src/styles/system/ui-sticky-topbar-contract.css');
const promoteCheckoutCss = [
  read('src/styles/features/promote-layout-checkout.css'),
  read('src/styles/features/promote-layout-checkout-bar.css'),
  read('src/styles/features/promote-layout-picker-sheet.css'),
].join('\n');
const postDetailCss = [
  read('src/styles/system/ui-detail-topbar-identity-contract.css'),
  read('src/styles/features/post-detail.css'),
  read('src/styles/features/post-detail-shell.css'),
  read('src/styles/features/post-detail-topbar.css'),
  read('src/styles/features/post-detail-engagement.css'),
  read('src/styles/features/post-detail-bottom-actions.css'),
].join('\n');
const postDetailActionbarCss = read('src/styles/features/post-detail-bottom-actions.css');
const createPromoteSubmitCss = read('src/styles/features/create-promote-submit.css');
const secondaryPageActionsCss = read('src/styles/system/secondary-page-actions.css');
const uiPrimitivesFeedbackCss = read('src/styles/system/ui-primitives-feedback.css');
const feedScrollShellCss = read('src/styles/system/feed-scroll-shell.css');
const feedScrollUtils = read('src/utils/feedScroll.ts');
const scrollLock = read('src/utils/scrollLock.ts');
const listReturnScroll = read('src/utils/listReturnScroll.ts');
const listReturnScrollRestore = read('src/utils/listReturnScrollRestore.ts');
const homeFeatureCss = read('src/styles/features/home.css');
const homeLayout = read('src/features/home/homeLayout.ts');
const homeMobileLayoutCss = read('src/styles/features/home-mobile-layout.css');
const homeMobileFirstPaintCss = read('src/styles/system/home-mobile-first-paint-contract.css');
const homeFeedQueriesHook = read('src/hooks/useHomeFeedQueries.ts');
const dataHooks = read('src/hooks/useDataConfig.ts');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postDetailPage = read('src/pages/PostDetailLegacy.tsx');
const postDetailSections = read('src/features/post-detail/PostDetailLegacySections.tsx');
const scrollTargets = read('src/utils/scrollTargets.ts');
const homeBootstrapHook = dataHooks;
const profileDialog = read('src/features/profile/ProfileDialog.tsx');
const feedScrollShell = read('src/features/feed/FeedScrollShell.tsx');
const homeFeedContent = read('src/features/home/HomeFeedContent.tsx');

assert(
  /useScrollLock\(isRouteOverlay,\s*\{[\s\S]*?fixed:\s*true[\s\S]*?\}\);/.test(app),
  'Route overlays must freeze the background with useScrollLock(... fixed: true).',
);

assert(
  scrollLock.includes('.filter((element) => !isTargetAllowedByAnyLock(element))') &&
    scrollLock.includes('if (isTargetAllowedByAnyLock(element)) return;'),
  'Scroll lock must not snapshot or restore allowed foreground lanes such as route overlays; otherwise detail scrolling can jump back after touch/async scroll events.',
);

assert(
  scrollLock.includes('function findAllowedScrollableElement(target: EventTarget | null, deltaX = 0, deltaY = 0)') &&
    scrollLock.includes('isTargetAllowedByAnyLock(node)') &&
    scrollLock.includes('canScrollElement(node, deltaX, deltaY)') &&
    scrollLock.includes('findAllowedScrollableElement(target, deltaX, deltaY)'),
  'Scroll lock must climb to the first ancestor that can scroll for the current gesture so vertical detail scrolling is not blocked by nested horizontal media.',
);

assert(
  listReturnScroll.includes('function getActiveDetailOverlay()') &&
    listReturnScrollRestore.includes('function getActiveDetailOverlay()') &&
    listReturnScrollRestore.includes('/^\\/post(?:\\/|$)/.test(window.location.pathname)') &&
    listReturnScrollRestore.includes('function getVisibleListReturnTargets()') &&
    listReturnScrollRestore.includes('!isInsideElement(activeDetailOverlay, element)') &&
    listReturnScroll.includes('if (isInsideElement(activeDetailOverlay, element)) continue;') &&
    listReturnScroll.includes('activeOverlay && !activeDetailOverlay'),
  'List return scroll must ignore route-overlay and nested targets while a post detail overlay is active, so detail scroll cannot overwrite the saved list position.',
);

assert(
  (listReturnScrollRestore.match(/getVisibleElements\(LIST_SCROLL_ROOT_SELECTOR\)/g) || []).length === 1 &&
    listReturnScrollRestore.includes('getVisibleListReturnTargets().forEach((element) =>') &&
    listReturnScrollRestore.includes('...getVisibleListReturnTargets().map((element) => element.scrollTop || 0)'),
  'List return restore must write and measure only filtered list targets, not raw route-overlay targets.',
);

assert(
  scrollTargets.includes("export const ROUTE_OVERLAY_SELECTOR = '[data-route-overlay]';") &&
    scrollTargets.includes("export const ROUTE_OVERLAY_SCROLL_SELECTOR = '[data-route-overlay-scroll]';") &&
    scrollTargets.includes('ROUTE_OVERLAY_SCROLL_SELECTOR,') &&
    postDetailPage.includes("data-route-overlay={isOverlayDetail ? '' : undefined}") &&
    postDetailPage.includes("data-route-overlay-scroll={isOverlayDetail ? '' : undefined}") &&
    postDetailSections.includes("data-route-overlay={isOverlayDetail ? '' : undefined}") &&
    postDetailSections.includes("data-route-overlay-scroll={isOverlayDetail ? '' : undefined}"),
  'Post detail route overlays must expose the canonical overlay marker and scroll marker only while rendered as a route overlay.',
);

assert(
  postDetailCss.includes('.detail-page--mobile .detail-page-topbar.ui-topbar') &&
    postDetailCss.includes('position: relative;') &&
    postDetailCss.includes('inset: auto;') &&
    postDetailCss.includes('z-index: var(--ui-z-page-header);') &&
    postDetailCss.includes('padding-top: var(--ui-space-none);') &&
    postDetailCss.includes('.detail-page--mobile .detail-state-shell') &&
    postDetailCss.includes('padding-top: var(--ui-app-page-main-padding-y);'),
  'Mobile post detail must keep its topbar in page flow and reserve spacing inside the dedicated content scroll root.',
);

assert(
  scrollTargets.includes("'[data-detail-scroll-root]'") &&
    postDetailPage.includes('data-detail-scroll-root=""') &&
    postDetailSections.includes('data-detail-scroll-root=""') &&
    postDetailCss.includes('.detail-page[data-route-overlay] {\n    height: var(--app-layout-vh);') &&
    postDetailCss.includes('.detail-page--mobile {\n    display: flex;\n    height: var(--app-layout-vh);') &&
    postDetailCss.includes('.detail-page-main--mobile') &&
    postDetailCss.includes('overflow-y: auto;') &&
    postDetailCss.includes('touch-action: pan-y;') &&
    postDetailCss.includes('.detail-page-main--mobile > *') &&
    postDetailCss.includes('flex: 0 0 auto;'),
  'Mobile post detail pages must use the dedicated content scroll root and keep long content at natural height; route overlays only add the canonical lock-scroll allowance.',
);

assert(
  !mobileAddressBarHook.includes("visualViewport?.addEventListener('scroll'") &&
    !mobileAddressBarHook.includes('visualViewport?.addEventListener("scroll"'),
  'useMobileAddressBar must not listen to visualViewport.scroll because keyboard/address-bar movement must not rewrite layout scroll metrics.',
);

assert(
  mobileAddressBarHook.includes("document.addEventListener('pointerdown', handleTextEntryPointerDown") &&
    mobileAddressBarHook.includes('hasFocusedTextEntry = true;') &&
    mobileAddressBarHook.includes('layout: !textEntryActive') &&
    mobileAddressBarHook.includes('--app-keyboard-inset') &&
    mobileAddressBarHook.includes('lastKeyboardInset') &&
    mobileAddressBarHook.includes('keyboard: textEntryActive'),
  'useMobileAddressBar must mark text-entry intent before keyboard resize, preserve the stable layout viewport, and publish keyboard inset while text entry is active.',
);

assert(
  mobileAddressBarHook.includes('mobile-text-entry-active') &&
    mobileAddressBarHook.includes('confirmTextEntryIntent'),
  'useMobileAddressBar must expose and self-heal text-entry state instead of leaving global keyboard intent stuck after canceled focus.',
);

assert(
  mobileAddressBarHook.includes('data-contained-text-entry-surface') &&
    !featureContractsCss.includes(':root.mobile-text-entry-active'),
  'Contained text-entry surfaces must avoid pre-clearing keyboard clearance before the real visual viewport inset exists.',
);

assert(
  !/mobile-text-entry-active[\s\S]*?position:\s*fixed/.test(uiStickyTopbarContractCss),
  'Text-entry mode must not switch PageHeader/topbar from sticky to fixed; changing the containing/layout model on focus breaks cross-page sticky and bottom-fixed surfaces.',
);

assert(
  !postCreatePage.includes('post-create-scroll-shell'),
  'PostCreatePage must not write legacy post-create-scroll-shell state to html/body; focus viewport state is owned by useMobileAddressBar.',
);

assert(
  /--app-keyboard-inset:\s*(?:0px|var\(--ui-space-none\));/.test(mobileViewportContractCss) &&
    mobileViewportContractCss.includes('--ui-keyboard-inset: var(--app-keyboard-inset') &&
    mobileViewportContractCss.includes('--ui-visual-viewport-height: var(--app-visual-vh'),
  'Mobile viewport contract must expose visual viewport height and keyboard inset as shared component variables.',
);

assert(
  !feedScrollUtils.includes("classList.contains('mobile-addressbar-enabled')") &&
    feedScrollUtils.includes('data-feed-document-scroll="true"') &&
    feedScrollShell.includes('data-feed-document-scroll={documentScrollMode') &&
    homeFeedContent.includes('documentScrollMode'),
  'Feed document-scroll mode must be explicitly owned by the feed, not inferred from the global mobile-addressbar class.',
);

assert(
  importsInOrder(indexCss, [
    './styles/layers/foundation.css',
    './styles/layers/system-core.css',
    './styles/layers/components.css',
    './styles/layers/features.css',
    './styles/layers/contracts.css',
  ]),
  'src/index.css must load stable layers in this order: foundation, system-core, components, features, contracts.',
);

assert(
  systemCoreLayerCss.includes('@import "../system/mobile-viewport-contract.css";') &&
    systemCoreLayerCss.includes('@import "../system/feed-scroll-shell.css";'),
  'System core layer must own shared viewport and feed scroll contracts.',
);

assert(
  importsInOrder(componentsLayerCss, [
    '../components/buttons.css',
    '../components/telegram-contact-action.css',
    '../components/topbar.css',
    '../components/topbar-system.css',
    '../components/feed-card-system.css',
    '../components/feed-follow-interaction.css',
    '../components/media.css',
    '../components/profile-dialog.css',
  ]),
  'Shared component CSS must be registered through src/styles/layers/components.css.',
);

assert(
  importsInOrder(featuresLayerCss, [
    '../features/home.css',
    '../features/home-feed.css',
  ]),
  'Shared route feature CSS must be registered through src/styles/layers/features.css.',
);

assert(
  brandAboutPage.includes("import '@/features/brand/BrandAboutRoute.css';") &&
    brandAboutRouteCss.includes('@import "../../styles/features/brand.css";') &&
    !featuresLayerCss.includes('../features/brand.css'),
  'About page CSS must be loaded by the lazy about route, not by the global feature layer.',
);

assert(
  adminPage.includes("import './AdminDesktop.css';") &&
    !featuresLayerCss.includes('../../features/admin/AdminDesktop.css'),
  'Admin console CSS must be loaded by the lazy admin route, not by the global feature layer.',
);

assert(
  categoryFeedPage.includes("import '@/features/category/CategoryFeedRoute.css';") &&
    categoryFeedRouteCss.includes('@import "../../styles/features/category-feed.css";') &&
    !featuresLayerCss.includes('../features/category-feed.css'),
  'Category feed CSS must be loaded by the lazy category route, not by the global feature layer.',
);

assert(
  postDetailLegacyPage.includes("import '@/features/post-detail/PostDetailRoute.css';") &&
    postDetailRouteCss.includes('@import "../../styles/features/post-detail.css";') &&
    postDetailRouteCss.includes('@import "../../styles/features/post-detail-metadata.css";') &&
    !featuresLayerCss.includes('../features/post-detail.css') &&
    !featuresLayerCss.includes('../features/post-detail-metadata.css'),
  'Post detail CSS must be loaded by the lazy detail route, not by the global feature layer.',
);

assert(
  messagesPage.includes("import '@/features/notifications/NotificationsRoute.css';") &&
    notificationSettingsPage.includes("import '@/features/notifications/NotificationsRoute.css';") &&
    notificationsRouteCss.includes('@import "../../styles/features/messages.css";') &&
    !featuresLayerCss.includes('../features/messages.css'),
  'Notification/message CSS must be loaded by lazy notification routes, not by the global feature layer.',
);

assert(
  profilePage.includes("import '@/features/profile/ProfileRoute.css';") &&
    userSpacePage.includes("import '@/features/profile/ProfileRoute.css';") &&
    profileRouteCss.includes('@import "../../styles/features/settings.css";') &&
    profileRouteCss.includes('@import "../../styles/features/profile.css";') &&
    profileRouteCss.includes('@import "../../styles/features/user-space-next.css";') &&
    profileRouteCss.includes('@import "../../styles/features/profile-membership-performance.css";') &&
    profileRouteCss.includes('@import "../../styles/features/profile-plus-visual.css";') &&
    profileRouteCss.includes('@import "../../styles/features/profile-plus-link-contract.css";') &&
    profileBioEditorPage.includes("import '@/features/profile/ProfileBioEditorRoute.css';") &&
    profileBioEditorRouteCss.includes('@import "../../styles/features/profile-bio-editor.css";') &&
    !featuresLayerCss.includes('../features/settings.css') &&
    !featuresLayerCss.includes('../features/profile.css') &&
    !featuresLayerCss.includes('../features/profile-bio-editor.css') &&
    !featuresLayerCss.includes('../features/user-space-next.css') &&
    !featuresLayerCss.includes('../features/profile-membership-performance.css') &&
    !featuresLayerCss.includes('../features/profile-plus-visual.css') &&
    !featuresLayerCss.includes('../features/profile-plus-link-contract.css'),
  'Profile and user-space CSS must be loaded by lazy profile routes, not by the global feature layer.',
);

assert(
  postCreateRoutePage.includes("import '@/features/post-create/PostCreateRoute.css';") &&
    postCreateRouteCss.includes('@import "../../styles/features/create-promote.css";') &&
    !featuresLayerCss.includes('../features/create-promote.css'),
  'Post create CSS must be loaded by the lazy create route, not by the global feature layer.',
);

assert(
  tuiPlusRouteCss.includes('@import "../../styles/features/tui-plus-page.css";') &&
    !featuresLayerCss.includes('../features/tui-plus-page.css'),
  'Tui Plus membership page CSS must be loaded by the lazy Tui Plus route, not by the global feature layer.',
);

assert(
  promotePage.includes("import './PromoteRoute.css';") &&
    promoteHistoryPage.includes("import '@/features/promote/PromoteRoute.css';") &&
    promotionEffectsHistoryPage.includes("import '@/features/promote/PromoteRoute.css';") &&
    promoteRouteCss.includes('@import "../../styles/features/promote-page-foundation.css";') &&
    promoteRouteCss.includes('@import "../../styles/features/promote-layout.css";') &&
    !featuresLayerCss.includes('../features/promote-page-foundation.css') &&
    !featuresLayerCss.includes('../features/promote-layout.css') &&
    !featuresLayerCss.includes('../features/promote-history.css') &&
    !featuresLayerCss.includes('../features/promotion-effects-history.css') &&
    !featuresLayerCss.includes('../features/promote-history-edit.css'),
  'Promote workspace CSS must be loaded by the lazy promote routes, not by the global feature layer.',
);

assert(
  sponsorPage.includes("import './SponsorRoute.css';") &&
    sponsorRouteCss.includes('@import "../../styles/features/sponsor.css";') &&
    !featuresLayerCss.includes('../features/sponsor.css'),
  'Sponsor center CSS must be loaded by the lazy sponsor route, not by the global feature layer.',
);

assert(
  referralInvitePage.includes("import '@/features/sponsor/ReferralRoute.css';") &&
    referralInviteRecordsPage.includes("import '@/features/sponsor/ReferralRoute.css';") &&
    referralRouteCss.includes('@import "../../styles/features/referral-invite.css";') &&
    !featuresLayerCss.includes('../features/referral-invite.css'),
  'Referral invite CSS must be loaded by the lazy referral routes, not by the global feature layer.',
);

assert(
  rechargePage.includes("import '@/features/recharge/RechargeRoute.css';") &&
    rechargeRouteCss.includes('@import "../../styles/features/recharge.css";') &&
    !featuresLayerCss.includes('../features/recharge.css'),
  'Recharge CSS must be loaded by the lazy recharge route, not by the global feature layer.',
);

assert(
    contractsLayerCss.includes('@import "../utilities/mobile-overlay-stability.css";') &&
    contractsLayerCss.includes('@import "../system/secondary-page-shell.css";') &&
    !contractsLayerCss.includes('../features/') &&
    !contractsLayerCss.includes('ui-instagram-polish-contract.css') &&
    !contractsLayerCss.includes('ui-auth-feed-polish-contract.css') &&
    !contractsLayerCss.includes('ui-polish-corrections-contract.css') &&
    !contractsLayerCss.includes('ui-post-list-contract.css') &&
    !contractsLayerCss.includes('ui-action-input-final-contract.css') &&
    !contractsLayerCss.includes('ui-page-alignment-final-contract.css') &&
    !contractsLayerCss.includes('ui-home-recharge-contract.css') &&
    !contractsLayerCss.includes('ui-profile-create-badge-contract.css') &&
    !contractsLayerCss.includes('ui-home-country-ring-contract.css') &&
    !contractsLayerCss.includes('profile-header-contract.css') &&
    !contractsLayerCss.includes('profile-avatar-action.css') &&
    !contractsLayerCss.includes('profile-security-sheet.css') &&
    !contractsLayerCss.includes('ui-profile-tab-loading-contract.css') &&
    !contractsLayerCss.includes('ui-detail-topbar-action-contract.css') &&
    !contractsLayerCss.includes('ui-skeleton-avatar-contract.css') &&
    !contractsLayerCss.includes('ui-telegram-contact-action.css') &&
    !contractsLayerCss.includes('ui-post-create-topbar-contract.css') &&
    !contractsLayerCss.includes('home-scroll-top-action.css') &&
    !contractsLayerCss.includes('ui-post-contact-placement.css') &&
    contractsLayerCss.trimEnd().endsWith('@import "../system/ui-sticky-topbar-contract.css";'),
  'Contracts layer must remain the cross-page contract layer and must not import feature-owned or legacy cleanup CSS.',
);

for (const file of walk('src', (entry) => /\.(tsx|ts)$/.test(entry))) {
  const imports = stylesheetImports(read(file));
  if (file === 'src/main.tsx') {
    assert(
      imports.length === 1 && imports[0] === './index.css',
      'src/main.tsx must be the only TS module importing CSS and it may only import ./index.css.',
    );
    continue;
  }

  const routeOwnedCssImport = new Map([
    ['src/features/admin/AdminPage.tsx', './AdminDesktop.css'],
    ['src/pages/TuiPlusMobile.tsx', '@/features/tui-plus/TuiPlusRoute.css'],
    ['src/pages/TuiPlusLinkEditorMobile.tsx', '@/features/tui-plus/TuiPlusRoute.css'],
    ['src/pages/CategoryFeedMobile.tsx', '@/features/category/CategoryFeedRoute.css'],
    ['src/pages/PostDetailLegacy.tsx', '@/features/post-detail/PostDetailRoute.css'],
    ['src/pages/MessagesMobile.tsx', '@/features/notifications/NotificationsRoute.css'],
    ['src/pages/NotificationSettings.tsx', '@/features/notifications/NotificationsRoute.css'],
    ['src/pages/ProfileMobile.tsx', '@/features/profile/ProfileRoute.css'],
    ['src/pages/UserSpace.tsx', '@/features/profile/ProfileRoute.css'],
    ['src/pages/ProfileBioEditorMobile.tsx', '@/features/profile/ProfileBioEditorRoute.css'],
    ['src/pages/PostCreate.tsx', '@/features/post-create/PostCreateRoute.css'],
    ['src/features/promote/PromoteMobilePage.tsx', './PromoteRoute.css'],
    ['src/pages/PromoteHistory.tsx', '@/features/promote/PromoteRoute.css'],
    ['src/pages/PromotionEffectsHistory.tsx', '@/features/promote/PromoteRoute.css'],
    ['src/features/sponsor/SponsorMobilePage.tsx', './SponsorRoute.css'],
    ['src/pages/ReferralInviteMobile.tsx', '@/features/sponsor/ReferralRoute.css'],
    ['src/pages/ReferralInviteRecordsMobile.tsx', '@/features/sponsor/ReferralRoute.css'],
    ['src/pages/RechargeMobile.tsx', '@/features/recharge/RechargeRoute.css'],
    ['src/pages/BrandAbout.tsx', '@/features/brand/BrandAboutRoute.css'],
  ]);
  const allowedRouteOwnedCss = routeOwnedCssImport.get(file);
  if (allowedRouteOwnedCss) {
    assert(
      imports.length === 1 && imports[0] === allowedRouteOwnedCss,
      `${file} may only import the lazy route-owned ${allowedRouteOwnedCss}.`,
    );
    continue;
  }

  assert(
    imports.length === 0,
    `${file} must not import CSS directly; use src/index.css layer facades or an explicitly guarded route-owned CSS exception instead.`,
  );
}

assert(
  overlayCss.includes('.ui-route-overlay') &&
    overlayCss.includes('height: var(--app-layout-vh)') &&
    overlayCss.includes('max-height: var(--app-layout-vh)') &&
    overlayCss.includes('overscroll-behavior: none') &&
    overlayCss.includes('transform: none') &&
    !overlayCss.includes('.profile-dialog-overlay') &&
    !overlayCss.includes('.profile-dialog-panel') &&
    !overlayCss.includes('transform: none !important') &&
    !overlayCss.includes('transform: translateZ(0);'),
  'Route overlay CSS must be viewport-fixed, stop overscroll chaining, avoid transformed containing blocks, and not own component dialog rules.',
);


assert(
  !overlayCss.includes('.profile-dialog-overlay') &&
    profileDialogCss.includes('.profile-dialog-overlay') &&
    profileDialogCss.includes('position: fixed') &&
    profileDialogCss.includes('.profile-dialog-panel') &&
    profileDialogCss.includes('var(--ui-visual-viewport-height)') &&
    profileDialogCss.includes('var(--ui-dialog-mobile-available-height)') &&
    profileDialogCss.includes('@media (max-width: 1023px)') &&
    profileDialogCss.includes('padding-top: calc(env(safe-area-inset-top) + var(--ui-space-4))') &&
    !profileDialogCss.includes('align-items: flex-end;') &&
    !profileDialogCss.includes('330px') &&
    !profileDialogCss.includes('100dvh') &&
    !profileDialogCss.includes('var(--app-layout-vh)') &&
    profileFeatureDialogCss.includes('var(--ui-visual-viewport-height)') &&
    !profileFeatureDialogCss.includes('100svh') &&
    !profileFeatureDialogCss.includes('var(--app-layout-vh)') &&
    !uiPrimitivesFeedbackCss.includes('.profile-dialog-panel') &&
    !profileAvatarActionCss.includes('.profile-dialog-panel') &&
    !uiArchitectureContractCss.includes('.profile-dialog-panel') &&
    profileDialog.includes("import { createPortal } from 'react-dom';") &&
    profileDialog.includes('createPortal(dialog, root)'),
  'Profile dialogs must render through a portal and own their visual-viewport sizing in the component stylesheet.',
);

assert(
  profileSecuritySheetCss.includes('.profile-security-overlay .account-info-sheet') &&
    profileSecuritySheetCss.includes('var(--ui-visual-viewport-height)') &&
    profileSecuritySheetCss.includes('var(--ui-dialog-mobile-available-height)') &&
    profileSecuritySheetCss.includes('@media (max-width: 1023px)') &&
    profileSecuritySheetCss.includes('padding: var(--ui-dialog-mobile-top-offset) var(--ui-space-2) var(--ui-dialog-mobile-bottom-inset)') &&
    !profileSecuritySheetCss.includes('100dvh') &&
    !profileModernCss.includes('account-info-sheet') &&
    !profileModernCss.includes('profile-security-overlay') &&
    !uiArchitectureContractCss.includes('account-info-sheet') &&
    !uiArchitectureContractCss.includes('profile-security-overlay'),
  'Account information sheet CSS must be owned by features/profile-security-sheet.css and use the shared visual viewport contract.',
);

assert(
    secondaryPageActionsCss.includes(':is(.detail-bottom-bar, .promote-checkout-bar, .ui-checkout-bar)') &&
    secondaryPageActionsCss.includes('position: fixed') &&
    secondaryPageActionsCss.includes('bottom: var(--ui-keyboard-inset)') &&
    promoteCheckoutCss.includes('var(--ui-visual-viewport-height)') &&
    !promoteCheckoutCss.includes('position: fixed') &&
    !/(^|\n)\s*bottom\s*:\s*0\s*;/.test(promoteCheckoutCss) &&
    !postDetailActionbarCss.includes('position: fixed') &&
    !/(^|\n)\s*bottom\s*:\s*0\s*;/.test(postDetailActionbarCss) &&
    !uiPrimitivesFeedbackCss.includes('bottom: var(--ui-keyboard-inset)'),
  'Page-level fixed bottom bars must be owned by the shared action layer, consume the keyboard inset, and avoid business-page bottom: 0 anchoring.',
);

assert(
  !createPromoteSubmitCss.includes('.post-create-submit-bar') &&
    !/(^|\n)\s*bottom\s*:/.test(createPromoteSubmitCss),
  'Post create publish action must live in the header and must not reintroduce a fixed bottom submit bar.',
);

assert(
  !homeFeedQueriesHook.includes('keepPreviousData') &&
    !homeFeedQueriesHook.includes('placeholderData') &&
    !homeBootstrapHook.includes('placeholderData'),
  'Home first paint must not reuse previous home feed/bootstrap data as placeholder content.',
);

assert(
  feedScrollShellCss.includes('.feed-scroll-root') &&
    feedScrollShellCss.includes("[data-feed-scroll-translated='true']") &&
    feedScrollShell.includes('feed-scroll-root') &&
    feedScrollShell.includes('--feed-scroll-translate-y') &&
    !feedScrollShell.includes('overscrollBehaviorY') &&
    !feedScrollShell.includes('WebkitOverflowScrolling'),
  'Feed scroll static styles must live in CSS, while components only pass dynamic variables.',
);

assert(
  !homeFeatureCss.includes('home-mobile-addressbar.css') &&
    homeLayout.includes('home-document-scroll-shell') &&
    homeMobileFirstPaintCss.includes('.home-mobile-shell.home-document-scroll-shell') &&
    homeMobileFirstPaintCss.includes('.home-mobile-feed-panel [data-feed-frame]') &&
    homeMobileFirstPaintCss.includes('min-width: 0;') &&
    homeMobileFirstPaintCss.includes('.home-mobile-shell.home-document-scroll-shell .home-mobile-feed-panel [data-feed-scroll-root]') &&
    !/body\.mobile-addressbar-enabled\s+\./.test(homeMobileFirstPaintCss) &&
    homeMobileLayoutCss.includes('.home-mobile-shell .ui-topbar-inner') &&
    homeMobileLayoutCss.includes('.home-mobile-shell :is(') &&
    !homeMobileLayoutCss.includes('\n    .ui-topbar-inner {\n'),
  'Home mobile CSS must keep shell/document-scroll ownership explicit and avoid global topbar/root viewport rules.',
);

if (failures.length > 0) {
  console.error('[overlay-guards] failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[overlay-guards] passed');
