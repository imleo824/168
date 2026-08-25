import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const extraOwnersByFacade = {
    'src/App.tsx': ['src/app/AppShell.tsx'],
    'src/features/promote/PromoteMobilePage.tsx': ['src/features/promote/promotePageSections.tsx'],
    'src/features/post-create/PostCreatePage.tsx': ['src/features/post-create/postCreatePageSections.tsx'],
    'src/features/post/AnchoredActionMenu.tsx': ['src/features/post/AnchoredActionMenuPanel.tsx'],
    'src/features/social/FollowButton.tsx': ['src/features/social/FollowButtonPanel.tsx'],
    'src/pages/PostDetailLegacy.tsx': [
      'src/features/post-detail/PostDetailLegacySections.tsx',
      'src/features/post-detail/PostDetailInteractionsSection.tsx',
      'src/features/post-detail/usePostDetailLikeWall.ts',
    ],
    'src/features/profile/ProfileMobilePage.tsx': [
      'src/features/profile/profilePageSections.tsx',
      'src/features/profile/useProfileMediaUploads.ts',
    ],
    'src/features/upload/imageUploadPipeline.ts': ['src/features/upload/imageUploadConfig.ts'],
    'src/features/upload/ImageUpload.tsx': ['src/features/upload/ImageUploadTile.tsx'],
  };
  const extraOwners = extraOwnersByFacade[relativePath] || [];
  return [source, ...extraOwners.map((owner) => fs.readFileSync(path.join(root, owner), 'utf8'))].join('\n');
}

function readCssWithImports(relativePath, seen = new Set()) {
  if (seen.has(relativePath)) return '';
  seen.add(relativePath);
  const source = read(relativePath);
  const imported = source
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^@import\s+"([^"]+)";/)?.[1])
    .filter(Boolean)
    .map((target) => readCssWithImports(path.normalize(path.join(path.dirname(relativePath), target)), seen))
    .join('\n');
  return `${source}\n${imported}`;
}

function assertIncludes(file, expected, message) {
  const source = file.endsWith('.css') ? readCssWithImports(file) : read(file);
  if (!source.includes(expected)) failures.push(`${file}: ${message}`);
}

function assertIncludesAny(file, expectedItems, message) {
  const source = read(file);
  if (!expectedItems.some((expected) => source.includes(expected))) failures.push(`${file}: ${message}`);
}

function assertNotIncludes(file, unexpected, message) {
  const source = file.endsWith('.css') ? readCssWithImports(file) : read(file);
  if (source.includes(unexpected)) failures.push(`${file}: ${message}`);
}

function assertMatches(file, pattern, message) {
  const source = file.endsWith('.css') ? readCssWithImports(file) : read(file);
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}

const profilePage = read('src/features/profile/ProfileMobilePage.tsx');
const profileHeaderCss = read('src/styles/features/profile-shared-header.css');
const profileDialogCss = read('src/styles/components/profile-dialog.css');
const sponsorPage = read('src/features/sponsor/SponsorMobilePage.tsx');
const promotionUtils = read('src/features/promote/promotionDisplayUtils.ts');
const homeAdBanner = read('src/features/feed/HomeAdBanner.tsx');
const homeAdCss = read('src/styles/features/home-floating-ads.css');
const homeFeedCss = read('src/styles/features/home-feed-foundation.css');
const homeTabsCss = read('src/styles/features/home-topic-tabs-shell.css');
const homeTabs = read('src/features/home/HomeTopicTabs.tsx');
const homeStructuredFilters = read('src/features/home/HomeStructuredFilterSheet.tsx');
const homePage = read('src/pages/Home.tsx');
const stickyCss = read('src/styles/system/ui-sticky-layer-contract.css');
const topbarCss = read('src/styles/components/topbar.css');
const postCard = read('src/features/post/PostCard.tsx');
const postDetail = read('src/pages/PostDetailLegacy.tsx');
const postDetailTopbarCss = read('src/styles/features/post-detail-topbar.css');
const detailTopbarIdentityCss = read('src/styles/system/ui-detail-topbar-identity-contract.css');
const feedCardCss = read('src/styles/components/feed-card-shell.css');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreateEditorCss = read('src/styles/features/create-promote-post-editor.css');
const dataHook = read('src/hooks/useDataConfig.ts');
const promoteHistory = read('src/pages/PromoteHistory.tsx');
const promoteRecordsCss = read('src/styles/features/promote-history-edit.css');
const promotePage = read('src/features/promote/PromoteMobilePage.tsx');
const promoteChoicesCss = read('src/styles/features/promote-layout-choices.css');
const bottomNavCss = read('src/styles/components/bottom-nav.css');

assertIncludes('src/styles/features/profile-shared-header.css', '.profile-header-cover', 'profile cover must stay on the shared profile header cover selector.');
assertIncludes('src/styles/features/profile-shared-header.css', 'border-bottom: 0;', 'profile cover must explicitly cancel hard separator borders.');
assertIncludes('src/styles/features/profile-shared-header.css', '.profile-header-cover::after', 'profile cover must use an overlay fade instead of a hard separator.');
assertIncludes('src/styles/features/profile-shared-header.css', 'color-mix(in srgb, var(--ui-surface-card-solid) 58%, transparent) 100%', 'profile cover fade must stay light enough to keep cover photos clear.');
assertIncludes('src/features/profile/ProfileHeaderCover.tsx', 'disableOptimization', 'profile cover must load the original source instead of a resized derivative.');
assertIncludes('src/styles/features/profile-shared-header.css', 'opacity: var(--ui-profile-cover-pattern-opacity);', 'profile cover texture overlay must use the shared subtle opacity token.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-profile-cover-pattern-opacity: 0.18;', 'profile cover texture overlay must stay subtle for photo clarity.');
assertIncludes('src/features/upload/imageUploadPipeline.ts', 'export const COVER_UPLOAD_RETRY_OPTIONS', 'cover uploads must use a shared retry strategy.');
assertIncludes('src/features/upload/imageUploadPipeline.ts', 'maxWidth: 2400,\n    maxHeight: 960,', 'cover uploads must pre-compress to a high-density display size.');
assertIncludes('src/pages/UserSpace.tsx', '...COVER_UPLOAD_RETRY_OPTIONS', 'user-space cover upload must use the shared cover retry strategy.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', '...COVER_UPLOAD_RETRY_OPTIONS', 'profile cover upload must use the shared cover retry strategy.');

assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '效果分析', 'sponsor record tabs must include effect analysis.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'getMyPromotionEffects', 'sponsor effect analysis must use the dedicated promotion effects API.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'SPONSOR_EFFECT_PREVIEW_DAYS = 5', 'sponsor effect preview must default to the latest five days.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LazyPromotionEffectStatsRow stats={item.metrics} className="sponsor-row-effect-stats" />', 'sponsor effect preview must render daily metrics rows without bundling inactive sponsor tabs.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '查看更多效果分析', 'sponsor effect preview must link to the full effect history.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LazyLedgerRecordCard', 'sponsor transaction preview must reuse the shared ledger record card without static route bundling.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LazyPromotionRecordCard', 'sponsor promotion preview must reuse the shared promotion record card without static route bundling.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-effect-filter', 'sponsor effect preview must not expose date filters.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-preview-row', 'sponsor previews must not render a second bespoke row structure.');
assertIncludes('src/pages/TransactionHistoryMobile.tsx', '<LazyLedgerRecordCard', 'transaction history must render the shared ledger record card without static route bundling.');
assertNotIncludes('src/pages/TransactionHistoryMobile.tsx', "import LedgerRecordCard from '@/features/records/LedgerRecordCard';", 'transaction history must not pull the shared ledger card into loading, error, or empty states.');
assertIncludes('src/pages/PromoteHistory.tsx', '<LazyPromotionRecordCard', 'promotion history must render the shared promotion record card without pulling it into empty/loading states.');
assertIncludes('src/features/promote/PromotionRecordCard.tsx', '<PromotionEffectStatsRow stats={effectStats} className="record-effect-stats" />', 'promotion record cards must show the shared effect metrics row.');
assertIncludes('src/app/routePaths.ts', "promotionEffects: '/promotion-effects'", 'promotion effect history canonical route must be registered.');
assertIncludes('src/app/routePaths.ts', "legacyPromotionEffects: '/promote/effects'", 'promotion effect history legacy route must be preserved.');
assertMatches('src/app/AppShell.tsx', /pathname === APP_ROUTES\.profileBioEditor[\s\S]*?return 'workspace';[\s\S]*?pathname === APP_ROUTES\.profile/, 'profile bio editor must resolve to the desktop workspace surface before the broad profile route.');
assertMatches('src/app/AppShell.tsx', /pathname\.startsWith\(`\$\{APP_ROUTES\.tuiPlusLinkEditor\}\/`\)[\s\S]*?return 'workspace';[\s\S]*?pathname === APP_ROUTES\.profile/, 'Tui Plus link editor targets must resolve to the desktop workspace surface before the broad profile route.');
assertIncludes('src/features/home/OnlinePresenceContext.tsx', 'OnlinePresenceProvider', 'desktop online count must come from one shared app-level presence provider.');
assertIncludes('src/app/AppShell.tsx', 'min: onlineConfig?.online_users_min', 'desktop online count must use the same configured minimum everywhere.');
assertIncludes('src/app/AppShell.tsx', 'max: onlineConfig?.online_users_max', 'desktop online count must use the same configured maximum everywhere.');
assertNotIncludes('src/pages/Home.tsx', 'useHomeOnlineCount({', 'home topbar must not generate a second online count.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '(var(--ui-app-shell-desktop-padding-x) * 2)', 'desktop detail frame width must include the shared outer frame padding.');
assertNotIncludes('src/styles/system/wide-screen-mobile-adaptation.css', "[data-desktop-surface='detail'] .app-shell-main {\n      padding-inline: var(--ui-space-none);", 'desktop detail pages must not remove the shared outer frame padding.');
assertIncludes('src/styles/features/post-detail-shell.css', 'min-height: var(--app-desktop-main-content-height);', 'desktop detail pages must size their internal height against the framed app shell content area.');
assertNotIncludes('src/styles/features/post-detail-shell.css', '100svh', 'desktop detail feature styles must consume the shared app shell content height instead of raw viewport formulas.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const isOverlayDetail = isDetailMobile && Boolean(routeState?.backgroundLocation?.pathname);', 'desktop detail pages must stay inside the framed app shell instead of using the mobile route overlay.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '--app-shell-viewport-width: var(--ui-viewport-width);', 'desktop shell width must consume the shared viewport width contract.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '--app-shell-viewport-height: var(--app-layout-vh);', 'desktop shell height must consume the shared layout viewport contract.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '--app-desktop-shell-content-height: calc(var(--app-shell-viewport-height) - (var(--app-desktop-shell-padding-y) * 2));', 'desktop frame content height must be derived once and shared by main, feed, and rails.');
assertNotIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '100svh', 'wide-screen adaptation must not restore raw small viewport sizing.');
assertNotIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '100vw', 'wide-screen adaptation must not restore raw viewport width sizing.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /\.app-shell\[data-route-surface='user'\]\s*\{[\s\S]*?height:\s*var\(--app-shell-viewport-height\);[\s\S]*?overflow:\s*hidden;/, 'desktop app shell must be viewport-bound so side navigation does not scroll away.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /\.app-shell\[data-route-surface='user'\] \.app-shell-main\s*\{[\s\S]*?height:\s*var\(--app-desktop-shell-content-height\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/, 'desktop secondary pages must scroll inside the framed main panel.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.app-shell-main\s*\{[\s\S]*?overflow:\s*hidden;/, 'desktop feed must reserve scrolling for the feed scroll root.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', 'calc(var(--app-desktop-main-active-width) - (var(--ui-app-shell-desktop-padding-x) * 2))', 'desktop secondary pages must use the framed app shell inner content width.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '--ui-topbar-content-max-width: var(--app-desktop-page-content-width);', 'desktop secondary page topbars must align to the framed content width.');
assertIncludes('src/styles/02-core-surfaces.css', '.ui-shell-narrow {\n      box-sizing: border-box;', 'narrow content shells must include padding inside their max width.');
assertIncludes('src/styles/system/ui-primitives-layout.css', '.ui-page-content-shell {\n    box-sizing: border-box;', 'PageContentShell must keep page padding inside its assigned width.');
assertIncludes('src/styles/features/recharge.css', '--ui-recharge-page-max: var(--app-desktop-page-content-width);', 'desktop recharge content must align to the framed content width.');
assertIncludes('src/styles/features/recharge.css', '.recharge-step--amount {\n      display: grid;\n      grid-template-columns:', 'desktop recharge amount entry must use a multi-column workspace layout.');
assertIncludes('src/styles/features/recharge.css', '.recharge-payment-panel {\n      display: grid;\n      grid-template-columns:', 'desktop recharge payment instructions must use a multi-column workspace layout.');
assertIncludes('src/styles/features/sponsor.css', 'max-width: var(--app-desktop-page-content-width);', 'desktop sponsor workbench must align to the framed workspace content width.');
assertIncludes('src/styles/features/sponsor.css', 'min-height: var(--app-desktop-main-content-height);', 'desktop sponsor and referral pages must consume the shared app shell content height.');
assertNotIncludes('src/styles/features/sponsor.css', '100svh', 'desktop sponsor and referral feature styles must not duplicate viewport height formulas.');
assertIncludes('src/styles/features/sponsor.css', '.sponsor-page .sponsor-workbench {\n      display: grid;\n      grid-template-columns:', 'desktop sponsor workbench must place balance actions and referral entry side by side.');
assertIncludes('src/styles/features/sponsor.css', '.sponsor-page .sponsor-record-list {\n      max-width: var(--app-desktop-page-content-width);\n      display: grid;', 'desktop sponsor record previews must use a multi-column list.');
assertIncludes('src/styles/features/referral-invite.css', '--ui-referral-page-content-max: var(--app-desktop-page-content-width);', 'desktop referral invite content must align to the framed workspace content width.');
assertIncludes('src/styles/features/referral-invite.css', '.referral-page-content {\n      grid-template-columns:', 'desktop referral invite overview and share cards must use a two-column layout.');
assertIncludes('src/styles/features/referral-invite.css', '.referral-record-list {\n      width: 100%;\n      max-width: var(--app-desktop-page-content-width);', 'desktop referral records must not remain constrained to the narrow mobile record list width.');
assertIncludes('src/styles/features/referral-invite.css', 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'desktop referral records must use a multi-column list.');
assertIncludes('src/pages/BrandAbout.tsx', "import '@/features/brand/BrandAboutRoute.css';", 'about page CSS must load with the lazy about route.');
assertIncludes('src/features/brand/BrandAboutRoute.css', '@import "../../styles/features/brand.css";', 'about route CSS facade must own brand.css.');
assertIncludes('src/styles/features/brand.css', "data-desktop-surface='content'] .brand-about-main", 'desktop about page content must align to the framed content width.');
assertIncludes('src/styles/features/brand.css', '.brand-about-main {\n      display: grid;\n      grid-template-columns: repeat(2, minmax(0, 1fr));', 'desktop about page sections must use a multi-column content layout.');
assertIncludes('src/styles/system/record-card-contract.css', '--ui-record-list-content-max: var(--app-desktop-page-content-width);', 'desktop record pages must align lists to the framed workspace content width.');
assertIncludes('src/styles/system/ui-primitives-auth.css', '--ui-auth-required-wrap-max: var(--app-desktop-page-content-width);', 'desktop auth-required states must align to the framed page content width.');
assertIncludes('src/styles/system/ui-primitives-auth.css', 'max-width: var(--ui-auth-required-wrap-max);', 'desktop auth-required states must override the default narrow content shell max width.');
assertIncludes('src/styles/features/tui-plus-page.css', '--ui-tui-plus-content-max: var(--app-desktop-page-content-width);', 'desktop Tui Plus content and CTA must align to the framed workspace content width.');
assertIncludes('src/styles/system/secondary-page-actions.css', 'z-index: var(--ui-z-page-header);', 'secondary fixed action bars must own their shared layer level.');
assertIncludes('src/styles/system/secondary-page-actions.css', 'transform: var(--ui-transform-none);', 'secondary fixed action bars must not force compositor transforms.');
assertIncludes('src/styles/system/secondary-page-actions.css', 'contain: var(--ui-contain-none);', 'secondary fixed action bars must not create containment contexts that destabilize fixed chrome.');
assertNotIncludes('src/styles/system/ui-primitives-feedback.css', 'transform: translate3d(var(--ui-space-none), var(--ui-space-none), var(--ui-space-none));', 'checkout bar primitives must not force a compositor layer.');
assertNotIncludes('src/styles/system/ui-primitives-feedback.css', 'contain: layout paint;', 'checkout bar primitives must not create a local layout containment context.');
assertNotIncludes('src/styles/features/post-detail-bottom-actions.css', 'position: fixed;', 'detail bottom bar positioning must be owned by the shared secondary action contract.');
assertNotIncludes('src/styles/features/tui-plus.css', '.tui-plus-sticky-cta', 'Tui Plus must not keep unused legacy fixed CTA styles beside the checkout-bar contract.');
assertNotIncludes('src/styles/features/tui-plus-mobile.css', '.tui-plus-sticky-cta', 'Tui Plus mobile must not keep unused legacy sticky CTA styles beside the checkout-bar contract.');
assertIncludes('src/styles/components/bottom-nav.css', 'transform: var(--ui-transform-none);', 'bottom nav must not force a compositor transform while the viewport chrome changes.');
assertIncludes('src/styles/components/bottom-nav.css', 'will-change: auto;', 'bottom nav must not keep a permanent will-change layer.');
assertIncludes('src/styles/components/bottom-nav.css', 'contain: var(--ui-contain-none);', 'bottom nav must not create a containment context that can destabilize fixed placement.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-plus-link-label-max-width:', 'plus and promotion link labels must use one semantic label width token.');
assertIncludes('src/styles/components/feed-card-content.css', 'max-width: min(100%, var(--ui-plus-link-label-max-width));', 'feed promotion link labels must use the shared plus-link label width.');
assertIncludes('src/styles/features/profile-plus-link-contract.css', 'max-width: min(100%, var(--ui-plus-link-label-max-width));', 'profile plus link labels must use the shared plus-link label width.');
assertIncludes('src/styles/features/user-space-actions.css', 'max-width: min(100%, var(--ui-plus-link-label-max-width));', 'user-space plus link labels must use the shared plus-link label width.');
assertNotIncludes('src/styles/components/feed-card-content.css', '220px', 'feed promotion link labels must not hardcode a pixel width.');
assertNotIncludes('src/styles/features/profile-plus-link-contract.css', '220px', 'profile plus link labels must not hardcode a pixel width.');
assertNotIncludes('src/styles/features/user-space-actions.css', '220px', 'user-space plus link labels must not hardcode a pixel width.');
assertNotIncludes('src/styles/features/user-space-actions.css', '13px', 'user-space plus icons must use the shared icon token without pixel fallbacks.');
assertNotIncludes('src/styles/features/messages.css', '0px', 'messages bottom spacing must use the shared zero token fallback.');
assertNotIncludes('src/styles/features/promote-history-edit.css', '0px', 'promote history sticky actions must use the shared zero token fallback.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-feed-list-item-intrinsic-inline-size:', 'feed list intrinsic sizing must expose a semantic inline token.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-feed-list-item-media-intrinsic-size:', 'feed list media intrinsic sizing must expose a foundation media token.');
assertIncludes('src/styles/components/feed-list-performance.css', 'contain-intrinsic-size: var(--ui-feed-list-item-intrinsic-inline-size) var(--ui-feed-list-item-intrinsic-size);', 'feed list performance fallback must use shared intrinsic size tokens.');
assertIncludes('src/styles/components/feed-list-performance.css', 'contain-intrinsic-size: var(--ui-feed-list-item-intrinsic-inline-size) var(--ui-feed-list-item-media-intrinsic-size);', 'feed media list performance fallback must use shared intrinsic size tokens.');
assertIncludes('src/styles/components/feed-card-chrome.css', 'contain-intrinsic-size: var(--ui-feed-list-item-intrinsic-inline-size) var(--ui-feed-list-item-intrinsic-size);', 'feed deferred card fallback must use shared intrinsic size tokens.');
assertIncludes('src/styles/components/feed-card-chrome.css', 'contain-intrinsic-size: var(--ui-feed-list-item-intrinsic-inline-size) var(--ui-feed-list-item-media-intrinsic-size);', 'feed deferred media card fallback must use shared intrinsic size tokens.');
assertNotIncludes('src/styles/components/feed-list-performance.css', '320px', 'feed list performance fallback must not hardcode card height.');
assertNotIncludes('src/styles/components/feed-list-performance.css', '520px', 'feed list media performance fallback must not hardcode card height.');
assertIncludes('src/styles/features/messages.css', '--ui-message-settings-content-max: var(--app-desktop-page-content-width);', 'desktop message and settings content must align to the framed content width.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', "--app-desktop-conversation-frame-padding: var(--ui-space-2);", 'desktop message pages must preserve a visible outer app frame gutter.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /data-desktop-surface='conversation'[\s\S]*?\.app-shell-main[\s\S]*?padding:\s*var\(--app-desktop-conversation-frame-padding\);/, 'desktop message pages must expose the shared outer frame instead of filling edge-to-edge.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /@media \(min-width: 1024px\) and \(max-width: 1179px\)[\s\S]*?\.app-shell\[data-route-surface='user'\] \{[\s\S]*?--app-desktop-main-width: var\(--app-desktop-workspace-main-width\);/, '1024-1179 desktop shell must keep a stable main frame width across sidebar navigation.');
assertIncludes('src/styles/features/promote-layout-shell.css', '--ui-promote-page-content-max: var(--app-desktop-page-content-width);', 'desktop promote booking content must use the framed workspace width instead of the home feed reading width.');
assertIncludes('src/styles/features/promote-layout-checkout-bar.css', 'max-width: min(100%, var(--ui-promote-page-content-max));', 'desktop promote checkout bar inner shell must align to the promote workspace content width.');
assertIncludes('src/styles/features/promote-layout-picker-sheet.css', 'max-width: min(100%, var(--ui-promote-page-content-max));', 'desktop promote picker sheets must align to the promote workspace content width.');
assertIncludes('src/styles/features/tui-plus-checkout.css', 'max-width: min(100%, var(--ui-tui-plus-content-max, var(--ui-page-content-max-width)));', 'desktop Tui Plus checkout shell must align to the Tui Plus content width.');
assertIncludes('src/styles/system/ui-design-contract-tokens.css', '--ui-profile-header-max-width: var(--ui-profile-content-max-width);', 'profile header width must depend on the profile content token instead of the home feed reading width.');
assertIncludes('src/styles/features/profile-modern.css', '--ui-profile-content-max-width: var(--app-desktop-page-content-width);', 'desktop profile and user-space content must align to the framed profile content width.');
assertNotIncludes('src/styles/system/ui-design-contract-tokens.css', '--ui-profile-header-max-width: var(--ui-home-desktop-feed-width);', 'profile header must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-shell.css', 'var(--ui-home-desktop-feed-width)', 'promote workspace content must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-checkout-bar.css', 'var(--ui-home-desktop-feed-width)', 'promote checkout must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/promote-layout-picker-sheet.css', 'var(--ui-home-desktop-feed-width)', 'promote picker sheets must not depend on the home feed reading width.');
assertNotIncludes('src/styles/features/tui-plus-checkout.css', 'var(--ui-home-desktop-feed-width)', 'Tui Plus checkout must not depend on the home feed reading width.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', 'EFFECT_HISTORY_DEFAULT_DAYS = 30', 'promotion effect history must default to the latest thirty days.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', 'promotion-effects-date-trigger', 'promotion effect history must expose a compact topbar date trigger.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', 'promotion-effects-date-panel', 'promotion effect history must move full date controls out of the topbar.');
assertIncludes('src/pages/PromotionEffectsHistory.tsx', '历史累计数据', 'promotion effect history must show selected-range cumulative metrics.');
assertNotIncludes('src/pages/PromotionEffectsHistory.tsx', '每日汇总', 'promotion effect history must not render redundant daily summary copy.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', '每日汇总', 'sponsor effect preview must not render redundant daily summary copy.');
assertIncludes('src/types.ts', 'dailyItems: PromotionEffectDailyItem[];', 'promotion effect analysis must expose daily metrics.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', "{ key: 'views', label: '浏览' }", 'promotion metrics must start with views.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', "{ key: 'likes', label: '点赞' }", 'promotion metrics must include likes.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', "{ key: 'comments', label: '评论' }", 'promotion metrics must include comments.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', "{ key: 'shares', label: '分享' }", 'promotion metrics must include shares.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', "{ key: 'quotes', label: '引用' }", 'promotion metrics must end with quotes.');

assertIncludes('src/styles/system/ui-sticky-layer-contract.css', 'transition: none;', 'sticky topbars must not animate while the page scrolls.');
assertIncludesAny('src/styles/system/ui-sticky-layer-contract.css', ['transform: none;', 'transform: var(--ui-transform-none);'], 'sticky topbars/tabs must not force compositor transforms that flicker on mobile scroll.');
assertIncludesAny('src/styles/system/ui-sticky-layer-contract.css', ['contain: none;', 'contain: var(--ui-contain-none);'], 'sticky topbars must not create containment that breaks sticky chrome.');
assertIncludes('src/styles/system/ui-sticky-layer-contract.css', 'will-change: auto;', 'sticky topbars must not keep a permanent will-change layer.');
assertIncludesAny('src/styles/components/topbar.css', ['transform: none;', 'transform: var(--ui-transform-none);'], 'base topbar must not create compositor transforms that flicker on mobile scroll.');
assertIncludesAny('src/styles/components/topbar.css', ['contain: none;', 'contain: var(--ui-contain-none);'], 'base topbar must not create containment that breaks sticky chrome.');
assertIncludes('src/styles/components/topbar.css', 'will-change: auto;', 'base topbar must not keep a permanent will-change layer.');
assertIncludes('src/styles/system/ui-detail-topbar-identity-contract.css', 'contain: var(--ui-contain-none);', 'detail topbar must use the shared sticky containment contract.');
assertNotIncludes('src/styles/system/ui-detail-topbar-identity-contract.css', 'contain: layout style;', 'detail topbar must not create a local layout containment context.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /\.app-desktop-sidebar\s*\{[\s\S]*?top:\s*var\(--app-desktop-shell-padding-y\);/, 'desktop sidebar must stay pinned to the app frame top padding.');
assertNotIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '.app-desktop-sidebar {\n      width: 100%;\n      align-self: stretch;\n      top: var(--ui-space-none);', 'desktop sidebar must not jump to the browser viewport edge during page scroll.');
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'mobileAddressBarScroll', 'promote page must not register a nested mobile addressbar scroll container.');
assertIncludes('src/features/promote/PromoteMobilePage.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promote auth state must share the same stable page contract.');
assertNotIncludes('src/pages/PromoteHistory.tsx', 'mobileAddressBarScroll', 'promotion history must not register a nested mobile addressbar scroll container.');
assertIncludes('src/pages/PromoteHistory.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promotion history must share the same stable promote page contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', '.promote-mobile-page > .ui-topbar', 'promote topbar must own a stable scroll contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: visible;', 'promote page root must not create a clipping context above the sticky topbar.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: clip;\n    padding: var(--ui-space-none) var(--ui-page-padding-x)', 'promote horizontal clipping must live in the content shell below the sticky topbar.');
assertNotIncludes('src/pages/UserSpace.tsx', 'mobileAddressBarScroll', 'user-space page must not register a nested mobile addressbar scroll container.');
assertIncludes('src/styles/features/user-space-next.css', '.user-space-page-next.ui-page-enter', 'user-space page must opt out of page enter transforms that destabilize sticky topbars.');

assertMatches('src/features/profile/ProfileMobilePage.tsx', /<PageHeader[\s\S]*?title=""[\s\S]*?className="profile-modern-topbar"/, 'profile topbar title must be removed.');
assertNotIncludes('src/features/profile/ProfileMobilePage.tsx', 'title="我的"', 'profile page must not restore the topbar 我的 title.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-name-row', 'edit-home action must live beside the nickname.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'profile-edit-home-button', 'edit-home action must be an icon button beside the nickname.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', '<Edit2 size={13}', 'edit-home action must use an edit icon, not a text topbar action.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'aria-label="编辑主页"', 'edit-home icon button must keep an accessible name.');
assertIncludes('src/styles/features/profile-shared-header.css', '.profile-name-row', 'nickname/edit layout must be owned by shared profile header CSS.');
assertIncludes('src/styles/features/profile-shared-header.css', '.profile-edit-home-button', 'edit-home icon styling must be owned by shared profile header CSS.');

assertIncludes('src/styles/features/home-feed-foundation.css', '--home-topic-rhythm-y: var(--ui-space-none);', 'home category tabs must sit directly under the topbar.');
assertIncludes('src/styles/features/home-feed-foundation.css', '--home-topic-tabs-top-gap: var(--ui-space-none);', 'home category tabs must not add top gap under the topbar.');
assertIncludes('src/styles/features/home-topic-tabs-shell.css', 'padding: 0;', 'home category tab list must not add extra left inset.');
assertIncludes('src/styles/features/home-topic-tabs-shell.css', 'var(--ui-topbar-edge-padding-x, var(--ui-page-padding-x))', 'home tab shell must align with the shared page/topbar edge.');
assertIncludes('src/features/home/HomeTopicTabs.tsx', 'centerHomeTopicTabIfNeeded', 'home topic tabs must center the selected tab with the shared visibility algorithm.');
assertNotIncludes('src/features/home/HomeTopicTabs.tsx', "inline: 'nearest'", 'home topic tabs must not rely on nearest scrollIntoView after selection.');
assertIncludes('src/features/home/homeStructuredFilterUtils.ts', 'findCategoryMetaSchema(selectedCategory.id, schemas, categories)', 'home structured filters must reuse the publish category schema matcher.');
assertIncludes('src/pages/Home.tsx', 'findHomeStructuredFilterSchema(activeHomeTopicTabId, publishCategorySchemas, homeTopicCategories)', 'home page must pass normalized schemas and categories into structured filter matching.');

assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'aspect-[3/1]', 'home ad visual ratio must be owned by CSS, not utility classes.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'aspect-[4/1]', 'home ad visual ratio must be owned by CSS, not utility classes.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'ui-media-frame home-ad-slide', 'home ads must not inherit the shared media frame muted placeholder background.');
assertIncludes('src/features/feed/HomeAdBanner.tsx', 'home-ad-banner-shell--compact', 'home ad spacing must use semantic shell variants.');
assertIncludes('src/styles/features/home-floating-ads.css', '.home-ad-slide::after', 'home ads must keep a translucent highlight layer.');
assertIncludes('src/styles/features/home-floating-ads.css', '.home-ad-stage {\n    position: relative;\n    background: transparent;', 'home ads must not render a gray backing behind the image.');
assertIncludes('src/styles/features/home-floating-ads.css', '.home-ad-slide {\n    position: relative;', 'home ad slide contract must own the image surface.');
assertIncludes('src/styles/features/home-floating-ads.css', 'box-shadow: none;', 'home ads must not add a gray drop shadow behind banner images.');
assertNotIncludes('src/styles/features/home-floating-ads.css', '0 var(--ui-space-1) var(--ui-space-3)', 'home ads must not restore the old gray banner shadow.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-banner-ratio: 3.95 / 1;', 'desktop home ads must use the slightly taller banner ratio token.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-banner-ratio-mobile: 3.82 / 1;', 'mobile home ads must use the balanced-height banner ratio token.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-progress-inset-inline: max(calc(var(--ui-space-8) * 2 + var(--ui-space-4)), 43%);', 'home ad progress must be short enough not to compete with ads.');
assertIncludes('src/styles/tokens/layout-components.css', '--ui-home-ad-progress-fill-surface: color-mix(in srgb, var(--ui-color-white) 8%, transparent);', 'home ad progress fill must be weak enough not to compete with ads.');
assertIncludes('src/styles/features/home-floating-ads.css', 'aspect-ratio: var(--ui-home-ad-banner-ratio-mobile);', 'mobile home ads must consume the reduced-height banner ratio token.');
assertIncludes('src/features/feed/HomeAdBanner.tsx', 'home-ad-progress__segment', 'multiple home ads must render a weak segmented carousel progress bar.');
assertIncludes('src/styles/features/home-motion.css', 'inset-inline: var(--ui-home-ad-progress-inset-inline);', 'home ad progress must use the weak progress width token.');
assertIncludes('src/styles/features/home-motion.css', 'height: var(--ui-border-width-hairline);', 'home ad progress must stay hairline-thin.');
assertIncludes('src/styles/features/home-motion.css', 'background: var(--ui-home-ad-progress-fill-surface);', 'home ad progress fill must stay subtle over the banner.');
assertNotIncludes('src/features/feed/HomeAdBanner.tsx', 'ui-ad-counter', 'home ads must not render a visually heavy numeric carousel counter.');
assertIncludes('src/features/upload/ImageUpload.tsx', 'className="ui-image-remove-btn pressable"', 'image upload remove action must use the shared readable overlay button.');
assertIncludes('src/styles/system/ui-primitives-upload.css', '.ui-image-remove-btn', 'shared image upload remove button style is required.');

assertIncludes('src/pages/PromoteHistory.tsx', 'promote-history-edit-stack', 'promotion edit mode must use the mobile editing stack.');
assertIncludes('src/pages/PromoteHistory.tsx', 'promote-history-edit-summary', 'promotion edit mode must show a summary and order number.');
assertIncludes('src/pages/PromoteHistory.tsx', 'promote-history-edit-section', 'promotion edit mode must split image and link sections.');
assertIncludes('src/pages/PromoteHistory.tsx', 'tileClassName="ad-upload-tile ad-upload-tile--desktop"', 'desktop ad upload ratio must use a semantic tile class.');
assertIncludes('src/pages/PromoteHistory.tsx', 'tileClassName="ad-upload-tile ad-upload-tile--mobile"', 'mobile ad upload ratio must use a semantic tile class.');
assertMatches('src/features/promote/PromotionRecordCard.tsx', /<span className="record-time(?: record-card-line)?">\{bookingDateText\(group\)\}<\/span>[\s\S]*?promote-history-related-post-link/, 'promotion related post detail must sit below the booking date.');
assertIncludes('src/styles/features/promote-history-edit.css', '.promote-history-actions', 'promotion edit actions must be owned by the records stylesheet.');
assertIncludes('src/styles/features/promote-history-edit.css', 'position: sticky;', 'promotion edit actions must stay reachable on mobile.');
assertIncludes('src/features/promote/PromoteMobilePage.tsx', 'tileClassName="ad-upload-tile ad-upload-tile--desktop"', 'ad creation must share the semantic desktop upload ratio class.');
assertIncludes('src/features/promote/PromoteMobilePage.tsx', 'tileClassName="ad-upload-tile ad-upload-tile--mobile"', 'ad creation must share the semantic mobile upload ratio class.');
assertIncludes('src/styles/features/promote-layout-choices.css', '.promote-mobile-page .ad-upload-tile--desktop', 'ad creation upload ratio must be owned by promote CSS.');

assertIncludes('src/styles/components/feed-card-shell.css', '.ins-post-card .feed-card-more-button::before', 'more button must have a larger reliable tap area.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'setInitialSurfaceStyle(getFeedMenuAnchorStyle(optionsTriggerRef.current));', 'more menu must prepare anchored surface geometry before first paint.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'createPortal(', 'card action sheets must render in a portal to avoid clipping.');
assertIncludes('src/styles/components/feed-card-shell.css', 'max-height: var(--ui-feed-options-sheet-max-height);', 'card action sheets must be viewport bounded.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'data-feed-card-options-menu={menuInstanceId}', 'card options trigger must carry a stable menu instance id.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'data-feed-card-options-surface={menuId}', 'card options portal surface must carry the same stable menu instance id.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'eventPathContainsFeedMenu(event, menuId)', 'card option action sheets must not close themselves when portal events fire.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'setInitialSurfaceStyle(getFeedMenuAnchorStyle(optionsTriggerRef.current));', 'card option action sheets must prepare anchored geometry before the first portal paint.');
assertIncludes('src/features/post/AnchoredActionMenu.tsx', 'onPointerDown={stopCardEvent}', 'more menu pointerdown must only stop card navigation, not toggle the menu.');
assertNotIncludes('src/features/post/PostCard.tsx', 'skipNextTriggerClickRef', 'more menu must not split touch and click toggles.');
assertNotIncludes('src/features/post/PostCard.tsx', 'handleTriggerPointerDown', 'more menu trigger must use click as the single toggle path.');
assertIncludes('src/styles/components/post-quote.css', '--quoted-post-preview-media-size:', 'quoted post preview media must use a shared square size token.');
assertIncludes('src/styles/components/post-quote.css', 'aspect-ratio: 1 / 1;', 'quoted post preview media must stay square.');
assertNotIncludes('src/styles/components/feed-card-shell.css', '.ins-post-card:hover {\n    background: var(--ui-state-hover);', 'feed card rows must not change background on touch/hover.');
assertNotIncludes('src/styles/components/feed-card-shell.css', 'background: color-mix(in srgb, var(--ui-color-black) 3%, var(--ui-color-white));', 'feed card rows must not flash a pressed background.');
assertNotIncludes('src/features/post/PostCard.tsx', 'feed-card-avatar-plus', 'feed avatar plus action must not return.');
assertNotIncludes('src/styles/components/feed-card-shell.css', 'feed-card-avatar-plus', 'feed avatar plus styles must not return.');
assertIncludes('src/features/post/PostCard.tsx', 'feed-card-inline-follow', 'feed card follow action must sit beside the more menu.');
assertIncludes('src/styles/components/feed-card-shell.css', '.ins-post-card .feed-card-author-actions', 'feed card author actions must own follow and more alignment.');
assertIncludes('src/styles/components/feed-card-shell.css', '--feed-card-author-row-height: max(var(--feed-card-author-avatar-size), var(--ui-feed-more-button-size));', 'feed card header must derive one shared vertical rhythm from avatar and action hit area.');
assertIncludes('src/styles/components/feed-card-shell.css', 'height: var(--feed-card-author-row-height);', 'feed card avatar column must share the author row height.');
assertIncludes('src/styles/components/feed-card-shell.css', 'min-height: var(--feed-card-author-row-height);', 'feed card author header must share the author row height.');
assertIncludes('src/styles/components/feed-card-shell.css', 'align-self: center;', 'feed card more menu must align to the shared author row center.');
assertIncludes('src/hooks/useLikeFeedback.ts', 'navigator.vibrate', 'like feedback must provide progressive haptic feedback.');
assertIncludes('src/features/post/PostCard.tsx', 'useLikeFeedback', 'feed cards must use shared like feedback.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'useLikeFeedback', 'post detail must use shared like feedback.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'detail-topbar-contact-button', 'detail topbar must expose the contact action beside follow when contact is visible.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', "from '@/hooks/useIsMobile'", 'post detail layout must use the real viewport width instead of the user-surface mobile-first shell hook.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const isDetailMobile = !isDesktopViewport;', 'post detail must derive its mobile/desktop layout from the actual viewport.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const shouldUseDetailPageScroll = false;', 'post detail must not register the old mobile document scroll target.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'data-detail-scroll-root=""', 'post detail content shell must expose the dedicated detail scroll root.');
assertIncludes('src/features/post-detail/PostDetailLegacySections.tsx', 'data-detail-scroll-root=""', 'post detail loading and state pages must expose the dedicated detail scroll root.');
assertIncludes('src/utils/scrollTargets.ts', "'[data-detail-scroll-root]'", 'shared scroll target discovery must include the detail content scroll root.');
assertIncludes('src/styles/features/post-detail-shell.css', 'overflow-y: auto;', 'mobile detail content must own vertical scrolling inside the detail page.');
assertIncludes('src/styles/features/post-detail-shell.css', 'touch-action: pan-y;', 'mobile detail content scroll root must keep touch panning enabled.');
assertIncludes('src/styles/features/post-detail-shell.css', '.detail-page-main--mobile > *', 'mobile detail content children must not be flex-shrunk into a clipped non-scrollable page.');
assertIncludes('src/styles/features/post-detail-shell.css', 'flex: 0 0 auto;', 'mobile detail content children must keep their natural height so long details can scroll.');
assertIncludes('src/styles/features/post-detail-topbar.css', 'position: relative;', 'mobile detail topbar must stay in page flow instead of fixed-covering content.');
assertNotIncludes('src/styles/features/post-detail-topbar.css', 'inset-block-start: var(--ui-space-none);', 'mobile detail topbar must not restore fixed viewport anchoring.');
assertIncludes('src/styles/system/ui-detail-topbar-identity-contract.css', ".app-shell[data-route-surface='user'][data-desktop-surface='detail'] .detail-page--desktop .detail-page-topbar.ui-topbar", 'desktop detail topbar must have a shell-scoped identity rule.');
assertMatches('src/styles/system/ui-detail-topbar-identity-contract.css', /data-desktop-surface='detail'[\s\S]*?\.detail-page--desktop \.detail-page-topbar\.ui-topbar[\s\S]*?top:\s*var\(--ui-space-none\);/, 'desktop detail topbar must stick to the top of the framed main scroll panel.');
assertIncludes('src/styles/features/post-detail-topbar.css', 'minmax(var(--ui-detail-topbar-action-slot-min-width), max-content)', 'desktop detail topbar actions must reserve a stable trailing column.');
assertIncludes('src/features/post/PostCard.tsx', "const isTelegramSyncDisabled = isTelegramSyncSubmitting;", 'sent telegram sync cards must stay clickable so they can explain the synced state.');
assertIncludes('src/features/post/PostCard.tsx', "showToast('已成功同步1次', 'success');", 'sent telegram sync cards must show a success reminder when tapped.');
assertNotIncludes('src/features/post/PostCard.tsx', 'CircleCheck', 'sent telegram sync cards must keep the original channel icon instead of a check icon.');
assertIncludes('src/features/post/PostCard.tsx', "const TelegramSyncIcon = telegramSyncStatus === 'PENDING'", 'only pending telegram sync cards should swap away from the channel icon.');
assertIncludes('src/styles/components/feed-card-content.css', 'color: var(--ui-post-chip-text);', 'feed expand control must match post chip text color.');
assertIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-border: color-mix(in srgb, var(--ui-line-hairline) 76%, transparent);', 'post chips must share one visible border token.');
assertIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-surface:', 'post chips must share one surface token across all semantic kinds.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-category-surface', 'post chip kinds must not restore separate category surfaces.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-location-surface', 'post chip kinds must not restore separate location surfaces.');
assertNotIncludes('src/styles/system/ui-post-tag-contract.css', '--ui-post-chip-price-surface', 'post chip kinds must not restore separate price surfaces.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '@/ui/Skeleton', 'detail page must not import skeleton UI; detail loading uses normal loading states.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '<Skeleton', 'detail page must not render skeleton placeholders.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailArticleSkeleton', 'detail initial entry must not define or render an article skeleton.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailBottomBarSkeleton', 'detail initial entry must not define or render a bottom skeleton bar.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const isInitialLoading = !hasLoadedInteractions', 'detail quotes must keep normal loading visible until the first interaction page has settled.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const canShowEmpty = !isInitialLoading && !interactionError && interactionCount > 0 && interactions.length === 0;', 'detail quotes empty state must wait until fetching has settled.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const visibleLikeWallTotal = Math.max(0, Number(likeCount || 0));', 'detail like wall count must use the immediate detail like count before stale liker totals.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'visibleLikeWallTotal', 'detail like wall total must not fall back to stale liker endpoint totals.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'text="正在加载点赞"', 'detail like wall must use normal loading while avatars arrive.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const remainingLikeCount = Math.max(0, safeTotal - likers.length);', 'detail like wall must show the remaining count after the capped avatar batch.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'className="detail-like-wall-more"', 'detail like wall remaining count must render as text.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'className="detail-like-wall-avatar-frame detail-like-wall-more"', 'detail like wall remaining count must not use avatar frame geometry.');
assertIncludes('src/styles/features/post-detail.css', '.detail-like-wall-more', 'detail like wall remaining count must have a dedicated muted text style.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', '引用已全部显示', 'detail quotes must not show a completion message when all quotes are already displayed.');
assertNotIncludes('src/features/post/PostQuoteSheet.tsx', '引用已全部显示', 'quote sheet must not show a completion message when all quotes are already displayed.');
assertIncludes('src/features/feed/FeedViewportStates.tsx', 'ui-feed-empty-plain-state', 'home feed empty states must use a dedicated empty-state layout class.');
assertNotIncludes('src/features/feed/FeedViewport.tsx', '<HomeFeedSkeleton />', 'mobile home empty state must not render fake feed skeleton context.');
assertIncludes('src/features/feed/FeedViewport.tsx', '<EmptyState', 'mobile home empty state must use the dedicated empty layout.');
assertIncludes('src/features/home/HomeFeedContent.tsx', '<FeedViewport', 'desktop and mobile home feeds must share the same stable feed content path.');
assertIncludes('src/styles/features/home-feed-state.css', '.ui-feed-empty-plain-state', 'home empty state must have a dedicated stable layout.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'DetailQuotesLoadingRows', 'detail quote loading must not render skeleton rows.');
assertNotIncludes('src/styles/features/post-detail.css', 'skeleton', 'detail CSS must not keep detail skeleton selectors.');
assertIncludes('src/pages/PostDetailLegacy.tsx', '<LoadingBlock text="正在加载帖子详情"', 'detail initial entry must render a normal loading block.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const shouldUseDetailPageScroll = false;', 'overlay detail must not register a nested mobile addressbar scroll target.');
assertIncludes('src/utils/postPresentation.ts', 'const LOCATION_SPLIT_PATTERN = /\\s+-\\s+|[·>＞、，,;；|/\\n]+/;', 'location display splitting must support the standard middle-dot hierarchy.');
assertIncludes('src/utils/postStructuredMeta.ts', "if (normalizeKey(key) === 'location') return selectFinestDisplayLocation(formatted) || formatted;", 'structured location meta must display the leaf node only.');

assertNotIncludes('src/features/post-create/PostCreatePage.tsx', 'post-create-selected-summary-chip', 'post create selected summaries must live inside their tool buttons.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'post-create-tool-summary', 'post create tool buttons must render inline summaries beside their icons.');
assertIncludes('src/styles/features/create-promote-post-editor.css', '.post-create-tool-summary', 'post create inline tool summaries must be styled by editor CSS.');
assertIncludes('src/styles/features/profile-shared-header.css', 'display: inline-flex;', 'profile edit-home icon must sit beside the full nickname.');
assertIncludes('src/styles/features/profile-shared-header.css', 'overflow-x: auto;', 'profile nickname row must preserve full long names without ellipsis.');
assertIncludes('src/styles/components/profile-dialog.css', 'width: calc(100% - (var(--ui-sheet-body-padding) * 2));', 'profile dialog content must fill the padded panel width.');
assertIncludes('src/styles/features/profile-shared-header.css', 'text-overflow: clip;', 'profile nickname must render fully without ellipsis.');
assertIncludes('src/features/social/FollowButton.tsx', 'followedInSessionRef', 'follow button must keep 已关注 visible after the current follow action until refresh.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-profile-cover-image-opacity: 1;', 'profile cover images must stay fully opaque for clarity.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', "export type ProfileTabType = 'POSTS' | 'COMMENTS' | 'QUOTES' | 'LIKED' | 'FOLLOWING' | 'FANS';", 'profile tabs must include a quotes tab.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', '{ key: "QUOTES", label: "引用" }', 'profile tabs must render the quotes tab label.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'quotedOnly: true,', 'profile quotes tab must request only quote posts.');
assertIncludes('src/features/profile/ProfileMobilePage.tsx', 'EmptyStateCard title="暂无引用内容"', 'profile quotes tab must have its own empty state.');
assertIncludes('src/services/api.ts', 'quotedOnly?: boolean', 'posts API client must support the quotedOnly filter.');
assertIncludes('server/routes/post.routes.ts', "quotedOnly: quotedOnly === 'true'", 'posts route must pass the quotedOnly filter to the service.');
assertIncludes('server/services/post/index.ts', 'whereClause.quotedPostId = { not: null };', 'post list service must filter quote posts at the source.');
assertIncludes('src/styles/features/profile-modern.css', '--ui-sticky-tab-top: var(--ui-profile-sticky-tab-top);', 'own profile tabs must stick through the shared profile sticky tab contract.');
assertIncludes('src/styles/features/profile-modern.css', 'z-index: var(--ui-z-page-header);', 'own profile tabs must stay above the shared page chrome while stuck.');
assertIncludes('src/styles/system/ui-topbar-compact-actions-contract.css', 'backdrop-filter: none;', 'topbar compact actions must not use blur while scrolling.');
assertIncludes('src/styles/system/ui-topbar-compact-actions-contract.css', 'transition: none;', 'topbar compact actions must not animate during mobile scroll.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "label: form.isAnonymous ? '匿名' : '公开',", 'post create privacy summary must use short public/anonymous labels.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "? '显示' : '隐藏'", 'post create contact summary must use show/hide labels.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "label: selectedTopicLabel || '分类',", 'post create category summary must show only the category name.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "label: locationDisplayLabel || '位置',", 'post create location summary must show only the location value.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'function isContactOptionalCategory', 'post create contact warning must have a category-level exemption helper.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "ref === 'exposure' || ref === '爆料' || ref === '曝光'", 'post create contact warning must exempt the exposure category.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'hasSelectedCategory && !isSelectedCategoryContactOptional && !isRobotUser', 'post create contact warning must skip contact-optional categories.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'const isPublishingLocked = isSubmitting;', 'post create must only lock the page during the actual publish request.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'usePublishingNavigationGuard(isPublishingLocked, notifyPublishingNavigationBlocked);', 'post create must block page navigation while publishing without data-router-only hooks.');
assertNotIncludes('src/features/post-create/PostCreatePage.tsx', 'useBlocker', 'post create must not use data-router-only blockers in the browser router.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "window.addEventListener('beforeunload', handleBeforeUnload)", 'post create must guard browser unload while publishing.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', "const submitLabel = isSubmitting ? '发表中' : isQuoteMode && isQuoteLoading ? '载入中' : '发表';", 'post create submit label must not switch to uploading while images are uploading.');
assertIncludes('src/features/post-create/PostCreatePage.tsx', 'className="post-create-publishing-lock"', 'post create must render a normal publishing lock overlay.');
assertIncludes('src/styles/features/create-promote-post-editor.css', '.post-create-publishing-lock', 'post create publishing lock must be styled in the post editor CSS.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-button-width:', 'post create tool buttons must reserve stable width for inline summaries.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-button-count: 5;', 'post create tool row must reserve one-line space for all five tools.');
assertIncludes('src/styles/features/create-promote-foundation.css', '--post-create-tool-row-gap: var(--ui-space-1);', 'post create tool row gap must stay compact enough for five inline summaries.');
assertIncludes('src/styles/features/create-promote-foundation.css', 'var(--post-create-tool-button-count) - 1', 'post create tool widths must be derived from the row gap and tool count.');
assertIncludes('src/styles/features/create-promote-post-editor.css', 'flex: 0 0 var(--post-create-tool-button-width);', 'post create tool buttons must not shift when summaries appear.');
assertIncludes('src/styles/features/create-promote-post-editor.css', '.image-upload-toolbar-trigger {\n    width: var(--post-create-tool-button-width);', 'post create image tool must share the same one-line slot width as the other tools.');
assertIncludes('src/styles/features/create-promote-post-editor.css', 'max-width: calc(100% - var(--post-create-tool-icon-size) - var(--ui-space-1));', 'post create tool summaries must not push icons onto a second line.');
assertIncludes('src/styles/features/create-promote-post-editor.css', 'color: var(--ui-brand-strong);', 'post create contact tool active state must be visually lit.');

assertIncludes('src/styles/components/profile-dialog.css', '.profile-dialog-actions', 'profile dialogs must use the shared action layout class.');
assertIncludes('src/styles/components/profile-dialog.css', 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'profile dialog actions must be mobile friendly.');
assertIncludes('src/styles/components/profile-dialog.css', '.profile-dialog-panel :is(input, textarea)', 'profile dialog inputs must be constrained by shared CSS.');
assertIncludes('src/styles/components/profile-dialog.css', 'box-sizing: border-box;', 'profile dialog inputs must not overflow their panel.');
assertIncludes('src/styles/components/profile-dialog.css', 'padding-top: calc(env(safe-area-inset-top) + var(--ui-space-4));', 'profile dialogs must use the optimized mobile top offset.');
assertIncludes('src/styles/features/profile-dialog.css', 'var(--ui-visual-viewport-height)', 'profile dialog feature chrome must consume the shared visual viewport contract.');
assertNotIncludes('src/styles/features/profile-dialog.css', '100svh', 'profile dialog feature chrome must not size panels from raw small viewport units.');
assertNotIncludes('src/styles/features/profile-dialog.css', 'var(--app-layout-vh)', 'profile dialog feature chrome must not bypass the visual viewport dialog contract.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-promote-payment-sheet-max-height: calc(var(--ui-visual-viewport-height) - env(safe-area-inset-top) - var(--ui-space-3));', 'promote/payment sheet height must derive from the shared visual viewport contract.');
assertNotIncludes('src/styles/tokens/feature-contracts.css', '--ui-promote-payment-sheet-max-height: 88dvh', 'promote/payment sheet height must not use raw dynamic viewport units.');
assertIncludes('src/styles/tokens/feature-contracts.css', '--ui-promote-picker-sheet-max-height: calc(var(--ui-visual-viewport-height) - var(--ui-space-4));', 'promote picker sheet height must derive from the shared visual viewport contract.');
assertNotIncludes('src/styles/tokens/feature-contracts.css', '--ui-promote-picker-sheet-max-height: 86dvh', 'promote picker sheet height must not use raw dynamic viewport units.');
assertIncludes('src/styles/components/payment-action-sheet.css', '--ui-payment-action-visual-sheet-max-height: calc(var(--ui-visual-viewport-height) - env(safe-area-inset-top) - var(--ui-space-3));', 'payment action sheets must name their shared visual viewport cap.');
assertIncludes('src/styles/components/payment-action-sheet.css', 'var(--ui-promote-payment-sheet-max-height, var(--ui-payment-action-visual-sheet-max-height))', 'payment action sheets must route business overrides through the shared viewport fallback.');
assertIncludes('src/styles/components/payment-action-sheet.css', 'var(--app-layout-vh, var(--app-vh))', 'payment action sheets must keep the stable layout viewport cap for keyboard avoidance.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-sheet-max-height: min(calc(var(--ui-visual-viewport-height) - var(--ui-space-4)), calc(var(--ui-space-8) * 22 + var(--ui-space-4)));', 'shared sheet max-height must derive from the visual viewport contract.');
assertNotIncludes('src/styles/tokens/foundation.css', '--ui-sheet-max-height: min(86dvh', 'shared sheet max-height must not use raw dynamic viewport units.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-auth-panel-max-height: calc(var(--ui-visual-viewport-height) - var(--ui-space-8));', 'auth panel max-height must derive from the visual viewport contract.');
assertNotIncludes('src/styles/tokens/foundation.css', '--ui-auth-panel-max-height: 90vh', 'auth panel max-height must not use raw viewport units.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-lightbox-image-max-height: var(--ui-visual-viewport-height);', 'lightbox max-height must derive from the visual viewport contract.');
assertNotIncludes('src/styles/tokens/foundation.css', '--ui-lightbox-image-max-height: 100dvh', 'lightbox max-height must not use raw dynamic viewport units.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-page-loader-min-height: clamp(calc(var(--ui-space-8) * 6), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 14)), calc(var(--ui-space-8) * 14));', 'page loader height must use a shared visual viewport token.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-loading-block-min-height: clamp(calc(var(--ui-space-8) * 5), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 14)), calc(var(--ui-space-8) * 13));', 'loading block height must use a shared visual viewport token.');
assertIncludes('src/styles/tokens/foundation.css', '--ui-feed-footer-state-min-height: clamp(calc(var(--ui-space-8) * 6), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 16)), calc(var(--ui-space-8) * 10));', 'feed footer empty/loading state height must use a shared visual viewport token.');
assertIncludes('src/styles/system/ui-primitives-layout.css', 'min-height: var(--ui-page-loader-min-height);', 'page loader primitive must consume the shared height token.');
assertNotIncludes('src/styles/system/ui-primitives-layout.css', '48svh', 'page loader primitive must not use raw small viewport sizing.');
assertIncludes('src/styles/02-core-controls.css', 'min-height: var(--ui-loading-block-min-height);', 'loading block primitive must consume the shared height token.');
assertNotIncludes('src/styles/02-core-controls.css', '46svh', 'loading block primitive must not use raw small viewport sizing.');
assertIncludes('src/styles/system/feed-scroll-shell.css', 'min-height: var(--ui-feed-footer-state-min-height);', 'feed footer state must consume the shared height token.');
assertNotIncludes('src/styles/system/feed-scroll-shell.css', '58svh', 'feed footer state must not use raw small viewport sizing.');
assertIncludes('src/styles/system/ui-primitives-auth.css', '--ui-auth-agreement-panel-max-height: clamp(calc(var(--ui-space-8) * 4), calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 19)), calc(var(--ui-space-8) * 7));', 'auth agreement panel height must derive from the visual viewport contract.');
assertNotIncludes('src/styles/system/ui-primitives-auth.css', '34svh', 'auth agreement panel height must not use raw small viewport sizing.');
assertIncludes('src/styles/system/ui-primitives-auth.css', 'max-width: calc(var(--ui-viewport-width) - var(--ui-space-6));', 'compact auth panel width must use the shared viewport width token.');
assertNotIncludes('src/styles/system/ui-primitives-auth.css', 'calc(100vw - var(--ui-space-6))', 'compact auth panel width must not use raw viewport width.');
assertIncludes('src/styles/components/post-quote.css', 'max-height: min(calc(var(--ui-visual-viewport-height) - var(--ui-space-4)), calc(var(--ui-space-8) * 18));', 'quote sheet max-height must derive from the visual viewport contract.');
assertNotIncludes('src/styles/components/post-quote.css', 'max-height: min(86dvh', 'quote sheet max-height must not use raw dynamic viewport units.');
assertIncludes('src/styles/components/state-contract.css', 'calc(var(--ui-visual-viewport-height) - (var(--ui-space-8) * 15))', 'feed empty states must derive compact height from the visual viewport contract.');
assertNotIncludes('src/styles/components/state-contract.css', '42svh', 'feed empty states must not use raw small viewport units.');

assertIncludes('src/features/post/PostCard.tsx', 'FlameKindling', 'feed heat action must use the flame-kindling icon.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'FlameKindling', 'detail heat action must use the flame-kindling icon.');
assertNotIncludes('src/features/post/PostCard.tsx', 'ChartNoAxesColumnIncreasing', 'feed heat action must not restore the old ranking icon.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'ChartNoAxesColumnIncreasing', 'detail heat action must not restore the old ranking icon.');

assertIncludes('src/hooks/useDataCache.ts', 'if (cachedPost.isFeedPreview) return;', 'detail cache must not seed truncated feed preview content.');
assertIncludes('src/hooks/useDataPosts.ts', 'return cachedPost?.isFeedPreview ? undefined : cachedPost;', 'detail placeholder data must skip truncated feed preview content.');

assertIncludes('src/features/promote/promotionDisplayUtils.ts', 'categoryName ? `${categoryName}置顶贴`', 'category pinned promotion titles must include the real category name.');
assertIncludes('src/features/promote/promotionDisplayUtils.ts', 'booking.campaign?.categoryName', 'category pinned title must use campaign category data when present.');
assertNotIncludes('src/features/promote/promotionDisplayUtils.ts', "if (booking.type === PromotionType.PIN_CATEGORY) return '分类置顶帖';", 'category pinned title must not always fall back to 分类置顶帖.');

assertNotIncludes('src/features/post/PostCard.tsx', "formatEngagementCount(quoteCount) || '0'", 'feed quote action must not display a default 0.');
assertIncludes('src/features/post/PostCard.tsx', '{quoteCountText ? <span className="feed-action-count">{quoteCountText}</span> : null}', 'feed quote action must hide the count when it is zero.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', "formatEngagementCount(quoteCount) || '0'", 'detail quote action must not display a default 0.');
assertIncludes('src/pages/PostDetailLegacy.tsx', '{quoteCountText ? <BottomActionCount value={quoteCountText} /> : null}', 'detail quote action must hide the count when it is zero.');

assertIncludes('src/styles/components/bottom-nav.css', '--ui-bottom-nav-height: calc(var(--ui-control-hit) + var(--ui-space-4));', 'bottom nav height must be increased through its own bottom-nav token.');
assertIncludes('src/styles/components/bottom-nav.css', '--ui-bottom-nav-reserved-space: calc(var(--ui-bottom-nav-height) + env(safe-area-inset-bottom) + var(--ui-bottom-nav-bottom-offset));', 'bottom nav reserved space must follow the bottom nav height token.');
assertIncludes('src/styles/components/bottom-nav.css', '--ui-bottom-nav-page-bottom-space: calc(var(--ui-bottom-nav-reserved-space) + var(--ui-bottom-nav-page-clearance));', 'bottom nav page clearance must follow the reserved space token.');
assertIncludes('src/styles/components/bottom-nav.css', 'transform: scale(var(--ui-bottom-nav-press-scale));', 'bottom nav press feedback must be owned by the icon shell.');
assertIncludes('src/styles/components/bottom-nav.css', '.app-bottom-nav-item:active .app-bottom-nav-icon-shell', 'bottom nav press interaction must target the icon shell, not the page topbar.');
assertIncludes('src/styles/components/bottom-nav.css', '@media (prefers-reduced-motion: reduce)', 'bottom nav motion must respect reduced-motion preferences.');
assertNotIncludes('src/styles/components/bottom-nav.css', '--ui-topbar', 'bottom nav must not depend on topbar tokens.');
assertNotIncludes('src/styles/components/bottom-nav.css', '--ui-floating-nav-height', 'bottom nav must not share a generic nav height token with the topbar.');
assertIncludes('src/app/AppBottomNavigation.tsx', 'home-topic-tab-refresh', 'bottom home double tap must dispatch the home refresh event.');
assertIncludes('src/pages/Home.tsx', "window.addEventListener('home-topic-tab-refresh'", 'home page must listen for bottom-nav refresh requests.');

for (const [name, source] of Object.entries({
  profilePage,
  profileHeaderCss,
  profileDialogCss,
  sponsorPage,
  promotionUtils,
  homeAdBanner,
  homeAdCss,
  homeFeedCss,
  homeTabsCss,
  homeTabs,
  homeStructuredFilters,
  homePage,
  stickyCss,
  topbarCss,
  postCard,
  postDetail,
  postDetailTopbarCss,
  feedCardCss,
  postCreatePage,
  postCreateEditorCss,
  dataHook,
  promoteHistory,
  promoteRecordsCss,
  promotePage,
  promoteChoicesCss,
  bottomNavCss,
})) {
  if (!source.trim()) failures.push(`${name}: source unexpectedly empty.`);
}

if (failures.length > 0) {
  console.error('Goal 168 UI guards failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Goal 168 UI guards passed.');
