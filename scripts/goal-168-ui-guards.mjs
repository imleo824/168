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
    'src/features/home/HomeStructuredFilterSheet.tsx': ['src/features/home/homeStructuredFilterUtils.ts'],
    'src/features/promote/PromoteMobilePage.tsx': ['src/features/promote/promotePageSections.tsx'],
    'src/features/post-create/PostCreatePage.tsx': ['src/features/post-create/postCreatePageSections.tsx'],
    'src/features/post/AnchoredActionMenu.tsx': ['src/features/post/AnchoredActionMenuPanel.tsx'],
    'src/features/social/FollowButton.tsx': ['src/features/social/FollowButtonPanel.tsx'],
    'src/pages/PostDetailLegacy.tsx': [
      'src/features/post-detail/PostDetailLegacySections.tsx',
      'src/features/post-detail/PostDetailInteractionsSection.tsx',
      'src/features/post-detail/usePostDetailLikeWall.ts',
    ],
    'src/hooks/useData.ts': ['src/hooks/useDataPosts.ts', 'src/hooks/useDataCache.ts'],
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
const feedCardCss = read('src/styles/components/feed-card-shell.css');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreateEditorCss = read('src/styles/features/create-promote-post-editor.css');
const dataHook = read('src/hooks/useData.ts');
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
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<PromotionEffectStatsRow stats={item.metrics} className="sponsor-row-effect-stats" />', 'sponsor effect preview must render daily metrics rows.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '查看更多效果分析', 'sponsor effect preview must link to the full effect history.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<LedgerRecordCard', 'sponsor transaction preview must reuse the shared ledger record card.');
assertIncludes('src/features/sponsor/SponsorMobilePage.tsx', '<PromotionRecordCard', 'sponsor promotion preview must reuse the shared promotion record card.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-effect-filter', 'sponsor effect preview must not expose date filters.');
assertNotIncludes('src/features/sponsor/SponsorMobilePage.tsx', 'sponsor-preview-row', 'sponsor previews must not render a second bespoke row structure.');
assertIncludes('src/pages/TransactionHistoryMobile.tsx', '<LedgerRecordCard', 'transaction history must render the shared ledger record card.');
assertIncludes('src/pages/PromoteHistory.tsx', '<PromotionRecordCard', 'promotion history must render the shared promotion record card.');
assertIncludes('src/features/promote/PromotionRecordCard.tsx', '<PromotionEffectStatsRow stats={effectStats} className="record-effect-stats" />', 'promotion record cards must show the shared effect metrics row.');
assertIncludes('src/app/routePaths.ts', "promotionEffects: '/promotion-effects'", 'promotion effect history canonical route must be registered.');
assertIncludes('src/app/routePaths.ts', "legacyPromotionEffects: '/promote/effects'", 'promotion effect history legacy route must be preserved.');
assertMatches('src/app/AppShell.tsx', /pathname === APP_ROUTES\.profileBioEditor[\s\S]*?return 'workspace';[\s\S]*?pathname === '\/profile'/, 'profile bio editor must resolve to the desktop workspace surface before the broad profile route.');
assertMatches('src/app/AppShell.tsx', /pathname\.startsWith\(`\$\{APP_ROUTES\.tuiPlusLinkEditor\}\/`\)[\s\S]*?return 'workspace';[\s\S]*?pathname === '\/profile'/, 'Tui Plus link editor targets must resolve to the desktop workspace surface before the broad profile route.');
assertIncludes('src/features/home/OnlinePresenceContext.tsx', 'OnlinePresenceProvider', 'desktop online count must come from one shared app-level presence provider.');
assertIncludes('src/app/AppShell.tsx', 'min: onlineConfig?.online_users_min', 'desktop online count must use the same configured minimum everywhere.');
assertIncludes('src/app/AppShell.tsx', 'max: onlineConfig?.online_users_max', 'desktop online count must use the same configured maximum everywhere.');
assertNotIncludes('src/pages/Home.tsx', 'useHomeOnlineCount({', 'home topbar must not generate a second online count.');
assertNotIncludes('src/features/chat/ChatPage.tsx', 'useHomeOnlineCount({', 'chat topbar must not generate a second online count.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '(var(--ui-app-shell-desktop-padding-x) * 2)', 'desktop detail frame width must include the shared outer frame padding.');
assertNotIncludes('src/styles/system/wide-screen-mobile-adaptation.css', "[data-desktop-surface='detail'] .app-shell-main {\n      padding-inline: var(--ui-space-none);", 'desktop detail pages must not remove the shared outer frame padding.');
assertIncludes('src/styles/features/post-detail-shell.css', 'var(--ui-bottom-nav-page-bottom-space)', 'desktop detail pages must size their internal height against the framed app shell content area.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', "--app-desktop-conversation-frame-padding: var(--ui-space-2);", 'desktop conversation pages must preserve a visible outer app frame gutter.');
assertIncludes('src/styles/system/wide-screen-mobile-adaptation.css', '(var(--app-desktop-conversation-frame-padding) * 2)', 'desktop conversation height must account for the visible outer app frame gutter.');
assertMatches('src/styles/system/wide-screen-mobile-adaptation.css', /data-desktop-surface='conversation'[\s\S]*?\.app-shell-main[\s\S]*?padding:\s*var\(--app-desktop-conversation-frame-padding\);/, 'desktop conversation pages must expose the shared outer frame instead of filling edge-to-edge.');
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
assertNotIncludes('src/features/promote/PromoteMobilePage.tsx', 'mobileAddressBarScroll', 'promote page must not register a nested mobile addressbar scroll container.');
assertIncludes('src/features/promote/PromoteMobilePage.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promote auth state must share the same stable page contract.');
assertNotIncludes('src/pages/PromoteHistory.tsx', 'mobileAddressBarScroll', 'promotion history must not register a nested mobile addressbar scroll container.');
assertIncludes('src/pages/PromoteHistory.tsx', 'className="promote-mobile-page promote-page surface-page"', 'promotion history must share the same stable promote page contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', '.promote-mobile-page > .ui-topbar', 'promote topbar must own a stable scroll contract.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: visible;', 'promote page root must not create a clipping context above the sticky topbar.');
assertIncludes('src/styles/features/promote-layout-shell.css', 'overflow-x: clip;\n    padding: 0 var(--ui-page-padding-x)', 'promote horizontal clipping must live in the content shell below the sticky topbar.');
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
assertIncludes('src/features/home/HomeStructuredFilterSheet.tsx', 'findCategoryMetaSchema(selectedCategory.id, schemas, categories)', 'home structured filters must reuse the publish category schema matcher.');
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
assertNotIncludes('src/features/chat/ChatPage.tsx', 'capturePageScrollSnapshot', 'chat reply focus must not restore stale page scroll snapshots.');
assertNotIncludes('src/features/chat/ChatPage.tsx', 'restorePageScrollSnapshot', 'chat reply focus must not restore stale page scroll snapshots.');
assertIncludes('src/features/chat/ChatPage.tsx', 'replyDocumentScrollSnapshotRef.current = captureDocumentScrollSnapshot();', 'chat reply focus must capture the current document scroll before rendering the reply context.');
assertIncludes('src/features/chat/ChatPage.tsx', 'restoreDocumentScrollSnapshot(snapshot);', 'chat reply focus must restore document scroll while the keyboard opens.');
assertIncludes('src/features/chat/ChatPage.tsx', 'scrollChatToLatest();', 'chat reply focus must continue to scroll the chat stream instead of moving the page.');
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
assertIncludes('src/pages/PostDetailLegacy.tsx', 'const shouldUseDetailPageScroll = isMobile && !isOverlayDetail;', 'overlay detail must not register a nested mobile addressbar scroll target.');
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
assertIncludes('src/styles/features/profile-modern.css', '--ui-sticky-tab-top: var(--ui-space-none);', 'own profile tabs must stick to the top edge without leaving the titleless topbar gap.');
assertIncludes('src/styles/features/profile-modern.css', 'z-index: var(--ui-z-page-header);', 'own profile tabs must stay above the transparent reserved topbar while stuck.');
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

assertIncludes('src/features/post/PostCard.tsx', 'FlameKindling', 'feed heat action must use the flame-kindling icon.');
assertIncludes('src/pages/PostDetailLegacy.tsx', 'FlameKindling', 'detail heat action must use the flame-kindling icon.');
assertNotIncludes('src/features/post/PostCard.tsx', 'ChartNoAxesColumnIncreasing', 'feed heat action must not restore the old ranking icon.');
assertNotIncludes('src/pages/PostDetailLegacy.tsx', 'ChartNoAxesColumnIncreasing', 'detail heat action must not restore the old ranking icon.');

assertIncludes('src/hooks/useData.ts', 'if (cachedPost.isFeedPreview) return;', 'detail cache must not seed truncated feed preview content.');
assertIncludes('src/hooks/useData.ts', 'return cachedPost?.isFeedPreview ? undefined : cachedPost;', 'detail placeholder data must skip truncated feed preview content.');

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
