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

function assertOrder(source, snippets, message) {
  let cursor = -1;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet);
    if (index <= cursor) {
      failures.push(message);
      return;
    }
    cursor = index;
  }
}

function assertOrderAfter(source, anchor, snippets, message) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) {
    failures.push(message);
    return;
  }
  assertOrder(source.slice(anchorIndex), snippets, message);
}

const actionButton = read('src/ui/ActionButton.tsx');
const commentSheet = read('src/features/post/PostCommentSheetPanel.tsx');
const commentComposer = read('src/features/post/PostCommentComposerDialog.tsx');
const quoteSheet = read('src/features/post/PostQuoteSheetPanel.tsx');
const authModal = read('src/features/auth/AuthModal.tsx');
const postSheetOpenIntent = read('src/features/post/postSheetOpenIntent.ts');
const profileDialog = read('src/features/profile/ProfileDialog.tsx');
const postDetailInteractions = read('src/features/post-detail/PostDetailInteractionsSection.tsx');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreatePageSections = read('src/features/post-create/postCreatePageSections.tsx');
const postCreatePickerSheets = read('src/features/post-create/postCreatePickerSheets.tsx');
const postCreateSettingsSheets = read('src/features/post-create/postCreateSettingsSheets.tsx');
const postCreateFocusCore = read('src/utils/postCreateFocusCore.ts');
const postCreateFocusPrime = read('src/utils/postCreateFocusPrime.ts');
const postCreateFocusRestore = read('src/utils/postCreateFocusRestore.ts');
const publishIconButton = read('src/ui/PublishIconButton.tsx');
const bottomNavigation = read('src/app/AppBottomNavigation.tsx');
const desktopSidebar = read('src/app/AppDesktopSidebar.tsx');
const appShell = read('src/app/AppShell.tsx');
const authRoute = read('src/app/AppRequireAuthRoute.tsx');
const appRequireTuiPlusRoute = read('src/app/AppRequireTuiPlusRoute.tsx');
const authRequiredState = read('src/ui/AuthRequiredState.tsx');
const pageHeader = read('src/ui/PageHeader.tsx');
const homeTopbar = read('src/features/home/HomeTopbar.tsx');
const homePage = read('src/pages/Home.tsx');
const homeFeedFoundationCss = read('src/styles/features/home-feed-foundation.css');
const wideScreenAdaptationCss = read('src/styles/system/wide-screen-mobile-adaptation.css');
const homeStructuredFilterPanel = read('src/features/home/HomeStructuredFilterSheetPanel.tsx');
const brandAbout = read('src/pages/BrandAbout.tsx');
const notFound = read('src/pages/NotFound.tsx');
const homeRefresh = read('src/hooks/useHomeRefresh.ts');
const listLoadMoreState = read('src/ui/ListLoadMoreState.tsx');
const postDetail = read('src/pages/PostDetailLegacy.tsx');
const postCard = read('src/features/post/PostCard.tsx');
const followButton = read('src/features/social/FollowButton.tsx');
const anchoredActionMenuPanel = read('src/features/post/AnchoredActionMenuPanel.tsx');
const categoryFeed = read('src/pages/CategoryFeedMobile.tsx');
const homePageSource = read('src/pages/Home.tsx');
const sponsorPage = read('src/features/sponsor/SponsorMobilePage.tsx');
const profileRoute = read('src/pages/ProfileMobile.tsx');
const profileMobilePage = read('src/features/profile/ProfileMobilePage.tsx');
const profilePageSections = read('src/features/profile/profilePageSections.tsx');
const profileSecuritySheet = read('src/features/profile/ProfileSecuritySheet.tsx');
const profileMediaUploads = read('src/features/profile/useProfileMediaUploads.ts');
const messagesPage = read('src/pages/MessagesMobile.tsx');
const messagesStyles = read('src/styles/features/messages.css');
const tuiPlusLinkEditor = read('src/pages/TuiPlusLinkEditorMobile.tsx');
const profileBioEditor = read('src/pages/ProfileBioEditorMobile.tsx');
const notificationSettings = read('src/pages/NotificationSettings.tsx');
const rechargePage = read('src/pages/RechargeMobile.tsx');
const referralInvitePageContent = read('src/features/sponsor/ReferralInvitePageContent.tsx');
const referralInviteSheets = read('src/features/sponsor/ReferralInviteSheets.tsx');
const referralRulesSheet = read('src/features/sponsor/ReferralRulesSheet.tsx');
const transactionHistoryPage = read('src/pages/TransactionHistoryMobile.tsx');
const referralInviteRecordsPage = read('src/pages/ReferralInviteRecordsMobile.tsx');
const promotionEffectsHistoryPage = read('src/pages/PromotionEffectsHistory.tsx');
const userSpacePage = read('src/pages/UserSpace.tsx');
const userSpaceTuiPlusLinks = read('src/features/profile/UserSpaceTuiPlusLinks.tsx');
const promoteHistoryPage = read('src/pages/PromoteHistory.tsx');
const promoteMobilePage = read('src/features/promote/PromoteMobilePage.tsx');
const promoteComponents = read('src/features/promote/promoteComponents.tsx');
const promotePageSections = read('src/features/promote/promotePageSections.tsx');
const promotePostPickerSheet = read('src/features/promote/PromotePostPickerSheet.tsx');
const promotePaymentSheet = read('src/features/promote/PromotePaymentSheet.tsx');
const skeleton = read('src/ui/Skeleton.tsx');
const postFeedList = read('src/features/feed/PostFeedList.tsx');
const feedExposureViews = read('src/hooks/useFeedExposureViews.ts');
const feedViewport = read('src/features/feed/FeedViewport.tsx');

assert(
  /<div\s+className="app-main app-shell-main"/.test(appShell) &&
    !/<main\s+className="app-main app-shell-main"/.test(appShell) &&
    homePage.includes('<main className={homeShellClassName}>') &&
    authRoute.includes('<PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">') &&
    authRoute.includes('titleAs="h1"') &&
    authRequiredState.includes("titleAs?: 'h1' | 'h2';"),
  'Route shells must not nest a global main landmark around page-owned main content; auth fallbacks must own their main landmark.',
);

assert(
  appShell.includes('const AUTH_REQUIRED_WORKSPACE_PATHS = [') &&
    appShell.includes('APP_ROUTES.messages') &&
    appShell.includes('APP_ROUTES.profile') &&
    appShell.includes('APP_ROUTES.recharge') &&
    appShell.includes('APP_ROUTES.sponsor') &&
    appShell.includes('APP_ROUTES.invite') &&
    appShell.includes('const useAuthRequiredWorkspaceSurface =') &&
    appShell.includes('!authLoading && !user && isAuthRequiredWorkspacePath(pathname)') &&
    appShell.includes("useAuthRequiredWorkspaceSurface ? 'workspace' : getDesktopSurfaceKind(pathname)"),
  'Unauthenticated primary/workspace tabs must share the desktop workspace surface so left-nav taps do not shift the page width.',
);

assert(
  authRoute.includes('allowContextualGuestState?: boolean;') &&
    authRoute.includes('if (!user && !allowContextualGuestState)') &&
    appShell.includes('<AppRequireAuthRoute allowContextualGuestState><PostCreate /></AppRequireAuthRoute>') &&
    appShell.includes('<AppRequireAuthRoute allowContextualGuestState><Sponsor /></AppRequireAuthRoute>') &&
    appShell.includes('<AppRequireAuthRoute allowContextualGuestState><AppRequireTuiPlusRoute benefit="promotionBooking"><Promote /></AppRequireTuiPlusRoute></AppRequireAuthRoute>') &&
    appShell.includes('<AppRequireAuthRoute allowContextualGuestState><PromoteHistory /></AppRequireAuthRoute>') &&
    appShell.includes('<AppRequireAuthRoute allowContextualGuestState><Recharge /></AppRequireAuthRoute>') &&
    appRequireTuiPlusRoute.includes('if (!user) return <>{children}</>;'),
  'Task-specific guest states must stay reachable after auth resolves; membership gating applies only to signed-in accounts.',
);

assertOrder(
  appRequireTuiPlusRoute,
  ['if (loading) return <PageLoader />;', 'if (!user) return <>{children}</>;', 'if (isTuiPlusActive(user)) return <>{children}</>;'],
  'Tui Plus route protection must resolve loading, guest explanation, and signed-in entitlement checks in that order.',
);

assert(
  appShell.includes('const KNOWN_USER_ROUTE_EXACT_PATHS = [') &&
    appShell.includes('const KNOWN_USER_ROUTE_PREFIXES = [') &&
    appShell.includes("if (!isKnownUserRoutePath(pathname)) return 'content';") &&
    !appShell.includes("pathname.startsWith('/profile/') || pathname.startsWith('/user/')") &&
    notFound.includes('title="这个页面暂时不可用"'),
  'Unknown user routes must render as page-owned content surfaces without stacked mobile headers or narrow profile/utility widths.',
);

assert(
  homePageSource.includes('const loadMoreRequestIdRef = useRef(0);') &&
    homePageSource.includes('loadMoreRequestIdRef.current === requestId') &&
    categoryFeed.includes('const requestGenerationRef = useRef(0);') &&
    categoryFeed.includes('requestGenerationRef.current === requestGeneration'),
  'Old load-more requests must not release locks or leak errors into a newly selected feed.',
);

assert(
  feedViewport.includes("const LazyPostFeedList = React.lazy(() => import('./PostFeedList'));") &&
    !feedViewport.includes("import PostFeedList from './PostFeedList';") &&
    feedViewport.includes('<React.Suspense fallback={<LoadingState />}>') &&
    feedViewport.includes('<LazyPostFeedList'),
  'Feed viewport must defer the heavy post-card list until real posts exist, while preserving a stable loading fallback.',
);

assert(
  categoryFeed.includes("const LazyPostFeedList = React.lazy(() => import('@/features/feed/PostFeedList'));") &&
    categoryFeed.includes('<React.Suspense fallback={<LoadingState />}>') &&
    categoryFeed.includes('<LazyPostFeedList posts={posts} enableRecommendationControls />') &&
    !categoryFeed.includes("import PostFeedList from '@/features/feed/PostFeedList';"),
  'Category feeds must lazy-load the shared post list only after posts exist so loading/error/empty category states stay lightweight.',
);

assert(
  userSpacePage.includes("const LazyPostFeedList = lazy(() => import('@/features/feed/PostFeedList'));") &&
    userSpacePage.includes('<Suspense fallback={<HomeFeedSkeleton count={3} className="user-space-post-list-skeleton" />}>') &&
    userSpacePage.includes('<LazyPostFeedList posts={posts} enableRecommendationControls={currentUser?.id !== safeId} />') &&
    !userSpacePage.includes('import PostFeedList from "@/features/feed/PostFeedList";'),
  'User-space pages must lazy-load the post list only for non-empty post sections.',
);

assert(
  profilePageSections.includes("const LazyPostFeedList = lazy(() => import('@/features/feed/PostFeedList'));") &&
    profilePageSections.includes('const renderPostFeed = (postsToRender: any[], extraProps = {}) => (') &&
    profilePageSections.includes('<Suspense fallback={renderLoading(\'正在加载内容\')}>') &&
    profilePageSections.includes('<LazyPostFeedList') &&
    !profilePageSections.includes("import PostFeedList from '@/features/feed/PostFeedList';"),
  'Profile post tabs must lazy-load the shared post list without forcing comments, following, or fans tabs to load the post-card tree.',
);

assert(
  profileMobilePage.includes("const LazyProfileEditDialogs = lazy(() => import('./ProfileEditDialogs'));") &&
    profileMobilePage.includes("const LazyProfileSecuritySheet = lazy(() => import('./ProfileSecuritySheet'));") &&
    profileMobilePage.includes('const { guarded: guardedOpenProfileSettings } = useInteractionGuard(openProfileSettings, {') &&
    profileMobilePage.includes('onEditHome={() => void guardedOpenProfileSettings()}') &&
    profileMobilePage.includes('const isEditDialogOpen = isEditingLoginAccount || isEditingContact || isEditingPassword || isEditingPaymentPassword || isEditingDisplayName;') &&
    profileMobilePage.includes('<LazyProfileEditDialogs') &&
    profileMobilePage.includes('<LazyProfileSecuritySheet') &&
    !profileMobilePage.includes("import ProfileEditDialogs from './ProfileEditDialogs';") &&
    !profileMobilePage.includes("import ProfileSecuritySheet from './ProfileSecuritySheet';"),
  'Profile page must lazy-load edit dialogs and security sheet while keeping the cover settings action guarded at the page shell.',
);

assert(
  profileMobilePage.includes('ACCEPTED_IMAGE_TYPES') &&
    profileMobilePage.includes("} from \"@/features/upload/imageUploadConfig\";") &&
    profileMediaUploads.includes("} from '@/features/upload/imageUploadConfig';") &&
    profileMediaUploads.includes("const { uploadImageFile } = await import('@/features/upload/imageUploadPipeline');") &&
    profileMediaUploads.includes("purpose: 'avatar'") &&
    profileMediaUploads.includes("purpose: 'cover'") &&
    !profileMobilePage.includes('@/features/upload/imageUploadPipeline') &&
    !profileMediaUploads.includes("} from '@/features/upload/imageUploadPipeline';"),
  'Profile avatar and cover uploads must keep file validation lightweight and load the image pipeline only after the user selects a file.',
);

assert(
  sponsorPage.includes("const LazyLedgerRecordCard = lazy(() => import('@/features/records/LedgerRecordCard'));") &&
    sponsorPage.includes("const LazyPromotionEffectStatsRow = lazy(() => import('@/features/promote/PromotionEffectStatsRow'));") &&
    sponsorPage.includes("const LazyPromotionRecordCard = lazy(() => import('@/features/promote/PromotionRecordCard'));") &&
    sponsorPage.includes("const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));") &&
    sponsorPage.includes('<LazyPromotionEffectStatsRow stats={item.metrics} className="sponsor-row-effect-stats" />') &&
    sponsorPage.includes('<LazyPromotionRecordCard') &&
    sponsorPage.includes('<LazyLedgerRecordCard') &&
    sponsorPage.includes('isTuiPlusPromptOpen ? (\n        <Suspense fallback={null}>') &&
    sponsorPage.includes('<LazyTuiPlusBenefitPromptDialog') &&
    !sponsorPage.includes("import LedgerRecordCard from '@/features/records/LedgerRecordCard';") &&
    !sponsorPage.includes("import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';") &&
    !sponsorPage.includes("import PromotionRecordCard from '@/features/promote/PromotionRecordCard';") &&
    !sponsorPage.includes("import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';"),
  'Sponsor center must lazy-load inactive record tabs and the Tui Plus prompt instead of bundling every preview card into the default tab.',
);

assert(
  transactionHistoryPage.includes("const LazyLedgerRecordCard = lazy(() => import('@/features/records/LedgerRecordCard'));") &&
    transactionHistoryPage.includes('<Suspense fallback={<PageLoadingState text="正在加载交易记录" className="record-state-block" />}>') &&
    transactionHistoryPage.includes('<LazyLedgerRecordCard') &&
    !transactionHistoryPage.includes("import LedgerRecordCard from '@/features/records/LedgerRecordCard';"),
  'Transaction history must defer ledger cards until records exist so loading, error, empty, and filter transitions stay lightweight.',
);

assert(
  promoteHistoryPage.includes("const LazyImageUpload = lazy(() => import('@/features/upload/ImageUpload'));") &&
    promoteHistoryPage.includes("const LazyPromotionRecordCard = lazy(() => import('@/features/promote/PromotionRecordCard'));") &&
    promoteHistoryPage.includes('<LazyImageUpload') &&
    promoteHistoryPage.includes('<LazyPromotionRecordCard') &&
    !promoteHistoryPage.includes("import ImageUpload from '@/features/upload/ImageUpload';") &&
    !promoteHistoryPage.includes("import PromotionRecordCard from '@/features/promote/PromotionRecordCard';"),
  'Promotion history must defer upload tooling to edit mode and defer promotion cards to non-empty record states.',
);

assert(
  promotePageSections.includes("const LazyImageUpload = lazy(() => import('@/features/upload/ImageUpload'));") &&
    promotePageSections.includes('<Suspense fallback={<PromoteAdImageUploadFallback variant="desktop" />}>') &&
    promotePageSections.includes('<Suspense fallback={<PromoteAdImageUploadFallback variant="mobile" />}>') &&
    promotePageSections.includes('function PromoteAdImageUploadFallback') &&
    promotePageSections.includes('promote-ad-upload-placeholder') &&
    !promotePageSections.includes("import ImageUpload from '@/features/upload/ImageUpload';"),
  'Promote ad creative must reserve upload geometry while lazy-loading image upload tooling outside the route startup path.',
);

assert(
  promoteMobilePage.includes("const loadPromotePostPickerSheet = () => import('./PromotePostPickerSheet');") &&
    promoteMobilePage.includes("const loadPromotePaymentSheet = () => import('./PromotePaymentSheet');") &&
    promoteMobilePage.includes('const LazyPromotePostPickerSheet = lazy(loadPromotePostPickerSheet);') &&
    promoteMobilePage.includes('const LazyPromotePaymentSheet = lazy(loadPromotePaymentSheet);') &&
    promoteMobilePage.includes('void loadPromotePostPickerSheet();') &&
    promoteMobilePage.includes('void loadPromotePaymentSheet();') &&
    promoteMobilePage.includes('<LazyPromotePostPickerSheet') &&
    promoteMobilePage.includes('<LazyPromotePaymentSheet') &&
    promoteComponents.includes('onWarmPaymentSheet?: () => void;') &&
    promoteComponents.includes('onPointerEnter={onWarmPaymentSheet}') &&
    !promoteMobilePage.includes('PromotePaymentSheet,\n  PromotePostPickerSheet') &&
    !promoteComponents.includes('PaymentActionSheet') &&
    !promoteComponents.includes('BottomSheet') &&
    promotePostPickerSheet.includes("import BottomSheet from '@/ui/BottomSheet';") &&
    promotePaymentSheet.includes("} from '@/ui/PaymentActionSheet';"),
  'Promote payment and post picker sheets must remain lazy-loaded with warmups so ordinary booking-page browsing stays responsive.',
);

assert(
  appRequireTuiPlusRoute.includes("const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));") &&
    appRequireTuiPlusRoute.includes('<Suspense fallback={<PageLoader />}>') &&
    appRequireTuiPlusRoute.includes('<LazyTuiPlusBenefitPromptDialog') &&
    !appRequireTuiPlusRoute.includes("import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';"),
  'Tui Plus route guard must lazy-load prompt UI so global route protection does not inflate ordinary page startup.',
);

assert(
  postCreatePage.includes("const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));") &&
    postCreatePage.includes('<LazyTuiPlusBenefitPromptDialog') &&
    !postCreatePage.includes("import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';") &&
    postCreatePageSections.includes("const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));") &&
    postCreatePageSections.includes('<LazyTuiPlusBenefitPromptDialog') &&
    !postCreatePageSections.includes("import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';") &&
    tuiPlusLinkEditor.includes("const LazyTuiPlusBenefitPromptDialog = lazy(() => import('@/features/tui-plus/TuiPlusBenefitPromptDialog'));") &&
    tuiPlusLinkEditor.includes('<LazyTuiPlusBenefitPromptDialog') &&
    !tuiPlusLinkEditor.includes("import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';"),
  'Post create and Tui Plus link editing flows must defer Tui Plus prompt UI until the prompt is actually shown.',
);

assert(
  postCreatePage.includes("const loadPostCreatePickerSheets = () => import('./postCreatePickerSheets');") &&
    postCreatePage.includes("const loadPostCreateSettingsSheets = () => import('./postCreateSettingsSheets');") &&
    postCreatePage.includes('const LazyPostCreateCategoryMetaSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreateCategoryPickerSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreateCategorySelectSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreateLocationPickerSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreateContactEditorDialog = lazy') &&
    postCreatePage.includes('const LazyPostCreatePrivacySettingsSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreatePromoteChoiceSheet = lazy') &&
    postCreatePage.includes('const LazyPostCreateTelegramSettingsSheet = lazy') &&
    postCreatePage.includes('const warmPostCreatePickerSheets = useCallback(() => {') &&
    postCreatePage.includes('const warmPostCreateSettingsSheets = useCallback(() => {') &&
    postCreatePage.includes('void loadPostCreatePickerSheets();') &&
    postCreatePage.includes('void loadPostCreateSettingsSheets();') &&
    postCreatePage.includes('<LazyPostCreateCategoryPickerSheet') &&
    postCreatePage.includes('<LazyPostCreateCategoryMetaSheet') &&
    postCreatePage.includes('<LazyPostCreateLocationPickerSheet') &&
    postCreatePage.includes('<LazyPostCreatePrivacySettingsSheet') &&
    postCreatePage.includes('<LazyPostCreateTelegramSettingsSheet') &&
    postCreatePage.includes('<LazyPostCreateContactEditorDialog') &&
    postCreatePage.includes('<LazyPostCreatePromoteChoiceSheet') &&
    !postCreatePage.includes("} from './postCreateSheets';") &&
    !postCreatePage.includes("from './postCreatePickerSheets'") &&
    !postCreatePage.includes("from './postCreateSettingsSheets'") &&
    postCreatePickerSheets.includes('export function PostCreateCategoryPickerSheet') &&
    postCreatePickerSheets.includes('export function PostCreateCategoryMetaSheet') &&
    postCreateSettingsSheets.includes("import BottomSheet from '@/ui/BottomSheet';") &&
    postCreateSettingsSheets.includes('export function PostCreatePromoteChoiceSheet'),
  'Post create picker and settings sheets must remain lazy-loaded with warmups so ordinary composer typing stays responsive.',
);

assert(
  postCreatePageSections.includes("const LazyImageUpload = lazy(() => import('@/features/upload/ImageUpload'));") &&
    postCreatePageSections.includes('<Suspense fallback={<PostCreateImageUploadFallback />}>') &&
    postCreatePageSections.includes('<LazyImageUpload') &&
    postCreatePageSections.includes('function PostCreateImageUploadFallback()') &&
    !postCreatePageSections.includes("import ImageUpload from '@/features/upload/ImageUpload';"),
  'Post create composer must reserve upload geometry while lazy-loading upload tooling outside the initial editor chunk.',
);

assert(
  postFeedList.includes('const FEED_LIST_ITEM_STYLES = Array.from') &&
    postFeedList.includes('function getFeedRenderSignature(posts: FeedListPostLike[])') &&
    postFeedList.includes('const headCount = Math.min(length, FEED_INITIAL_RENDERED_ITEM_COUNT);') &&
    postFeedList.includes('index < headCount') &&
    postFeedList.includes('const penultimate = length > 2 ? getPostKey(posts[length - 2], length - 2)') &&
    postFeedList.includes('const visiblePosts = useMemo(') &&
    !postFeedList.includes('.map((post, index) => getPostKey(post, index)).join') &&
    !postFeedList.includes('function getFeedIdentity'),
  'Feed list deferred-tail rendering must use a bounded render signature and stable item styles instead of rebuilding an all-post id string every render.',
);

assert(
  feedExposureViews.includes('type FeedExposurePostLike = string | number | { id?: unknown } | null | undefined;') &&
    feedExposureViews.includes('function toActivePostIdSet(postItems: FeedExposurePostLike[])') &&
    feedExposureViews.includes('activePostIdsRef.current = toActivePostIdSet(postItems);') &&
    homePageSource.includes('useFeedExposureViews(\n    renderedFeedPosts,') &&
    categoryFeed.includes('useFeedExposureViews(posts, !isInitialLoading && posts.length > 0);') &&
    !feedExposureViews.includes('.filter(Boolean).join') &&
    !feedExposureViews.includes(".split('|')") &&
    !homePageSource.includes('const visiblePostIds = useMemo') &&
    !categoryFeed.includes('const postIds = useMemo'),
  'Feed exposure tracking must derive active post ids in one structured pass instead of mapping posts through a joined string key.',
);

assert(
  followButton.includes('function FollowButtonLoadingPlaceholder') &&
    followButton.includes('feed-follow-button--placeholder') &&
    followButton.includes('fallback={<FollowButtonLoadingPlaceholder') &&
    !followButton.includes('fallback={null}'),
  'Feed follow lazy loading should reserve a stable author-action slot instead of rendering a null fallback.',
);

assert(
  postCard.includes('hideWhenFollowing={false}'),
  'Feed card follow action should keep a stable in-row control when follow status resolves.',
);

assert(
  postCard.includes('const FEED_CONTENT_WITH_MEDIA_STYLE =') &&
    postCard.includes('const FEED_CONTENT_TEXT_ONLY_STYLE =') &&
    postCard.includes('function mayOverflowClampedText(text: string, clampLines: number)') &&
    postCard.includes('const shouldMeasureContentOverflow =') &&
    postCard.includes('mayOverflowClampedText(displayText, contentClampLines)') &&
    postCard.includes('if (!shouldMeasureContentOverflow)') &&
    postCard.includes('new ResizeObserver(measure)') &&
    postCard.includes('setIsContentOverflowing((current) => (current === next ? current : next))') &&
    !postCard.includes("const contentStyle = { '--x-card-content-clamp-lines': contentClampLines }"),
  'Feed cards should skip layout overflow measurement for obviously short text and reuse clamp style objects across renders.',
);

assert(
  !homeRefresh.includes('scrollHomeFeedToTop();') &&
    homeRefresh.includes('await queryClient.cancelQueries({ queryKey: activeQueryKey });'),
  'Manual refresh must preserve the current reading position when the network request fails.',
);

assert(
  homePageSource.includes(`if (isDesktopViewport) {
      pendingHomeFeedScrollTopRef.current = scrollTop;
      setIsHomeChromeCollapsed(false);
      return;
    }`),
  'Desktop home feed scroll must keep the top chrome open while only the feed viewport scrolls.',
);

assert(
  /\.app-shell\[data-route-surface='user'\]\s*\{[\s\S]*?height:\s*var\(--app-shell-viewport-height\);[\s\S]*?min-height:\s*var\(--app-shell-viewport-height\);[\s\S]*?overflow:\s*hidden;/.test(wideScreenAdaptationCss) &&
    /\.app-shell\[data-route-surface='user'\] \.app-shell-main\s*\{[\s\S]*?height:\s*var\(--app-desktop-shell-content-height\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/.test(wideScreenAdaptationCss) &&
    /\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.app-shell-main\s*\{[\s\S]*?overflow:\s*hidden;/.test(wideScreenAdaptationCss) &&
    wideScreenAdaptationCss.includes('--app-shell-viewport-height: var(--app-layout-vh);') &&
    wideScreenAdaptationCss.includes('--app-desktop-shell-content-height: calc(var(--app-shell-viewport-height) - (var(--app-desktop-shell-padding-y) * 2));') &&
    !wideScreenAdaptationCss.includes('100svh') &&
    !wideScreenAdaptationCss.includes('100vw'),
  'Desktop feed shell must lock document scrolling to the app frame instead of allowing the whole page to move.',
);

assert(
  /\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.home-mobile-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?height:\s*100%;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*hidden;/.test(homeFeedFoundationCss) &&
    /\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.home-scrollaway-chrome,[\s\S]*?\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.home-topic-tabs-sticky-shell\s*\{[\s\S]*?flex:\s*0 0 auto;/.test(homeFeedFoundationCss) &&
    /\.app-shell\[data-route-surface='user'\]\[data-desktop-surface='feed'\] \.home-mobile-feed-panel \[data-feed-scroll-root\]\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/.test(homeFeedFoundationCss),
  'Desktop feed scrolling must belong to the feed scroll root while the topbar and tabs stay outside the scroller.',
);

assert(
  homeFeedFoundationCss.includes('max-width: var(--ui-home-feed-reading-column-width);') &&
    /\.post-feed-list-panel\s*\{[\s\S]*?flex-direction:\s*column;/.test(homeFeedFoundationCss) &&
    !homeFeedFoundationCss.includes('column-count: 2;'),
  'Desktop feed must remain a single centered reading column instead of a two-column masonry layout.',
);

assert(
  listLoadMoreState.includes('const onClick = loading ? undefined') &&
    listLoadMoreState.includes('<InlineSpinner size="xs" className="ui-list-loadmore-spinner" />') &&
    listLoadMoreState.includes("role={error ? 'alert' : loading ? 'status' : undefined}"),
  'Shared load-more state must be non-interactive while loading and announce errors immediately.',
);

assert(
  pageHeader.includes("titleAs?: 'h1' | 'div';") &&
    homeTopbar.includes('titleAs="div"') &&
    brandAbout.includes('titleAs="div"') &&
    notFound.includes('titleAs="h2"'),
  'Content pages must expose one authoritative H1 instead of duplicating the page header and content heading.',
);

assert(
  actionButton.includes('instantPress?: boolean;') &&
    actionButton.includes('instantPress = true') &&
    actionButton.includes('const shouldUseInstantPress = instantPress && type === \'button\' && Boolean(onClick);'),
  'ActionButton must support instantPress={false} so layered CTAs can avoid pointerup/click-through under rapid tapping.',
);

assert(
  authModal.includes('useInteractionGuard(submitPasswordLogin') &&
    authModal.includes('useInteractionGuard(submitPasswordRegister') &&
    authModal.includes('const authBusy = isAuthenticating || loginSubmitPending || registerSubmitPending;') &&
    authModal.includes('if (authBusy) return;') &&
    authModal.includes('void guardedSubmitLogin();') &&
    authModal.includes('void guardedSubmitRegister();') &&
    authModal.includes("state={loginSubmitPending || isAuthenticating ? 'loading' : 'idle'}") &&
    authModal.includes("state={registerSubmitPending || isAuthenticating ? 'loading' : 'idle'}") &&
    !authModal.includes('const canSubmitLogin = !isAuthenticating') &&
    !authModal.includes('const canSubmitRegister =\n    !isAuthenticating'),
  'Auth modal login and register submits must use local interaction guards and shared busy state before auth context catches up.',
);

assert(
  commentSheet.includes('instantPress={false}') &&
    commentSheet.includes('event?.preventDefault();') &&
    commentSheet.includes('event?.stopPropagation();') &&
    commentSheet.includes('setIsComposerOpen(true);'),
  'Comment sheet CTA must disable instant press and stop propagation to avoid rapid-tap click-through into the feed/create entry.',
);

assertOrderAfter(
  commentSheet,
  'const handleOpenComposer = useCallback',
  [
    "setComposerError('');",
    'setIsComposerOpen(true);',
  ],
  'Comment CTA must open the composer directly without closing the parent comment sheet.',
);

assert(
  postSheetOpenIntent.includes('POST_CARD_SHEET_OPEN_EVENT') &&
    postSheetOpenIntent.includes('export function dispatchPostSheetOpen') &&
    postSheetOpenIntent.includes('export function subscribePostSheetOpen') &&
    postSheetOpenIntent.includes('window.addEventListener(POST_CARD_SHEET_OPEN_EVENT, handleEvent)') &&
    postSheetOpenIntent.includes('window.removeEventListener(POST_CARD_SHEET_OPEN_EVENT, handleEvent)'),
  'Post sheet open intent must own the shared sheet-open event and subscription cleanup.',
);

assert(
  commentSheet.includes('dispatchPostSheetOpen') &&
    commentSheet.includes('subscribePostSheetOpen') &&
    commentSheet.includes("dispatchPostSheetOpen({ postId, kind: 'comment' })") &&
    commentSheet.includes('onClose();'),
  'Comment sheets must publish/listen through shared postSheetOpenIntent so competing comment/quote sheets close instead of stacking.',
);

assert(
  commentSheet.includes('useInteractionGuard(refetchComments') &&
    commentSheet.includes('useInteractionGuard(fetchNextComments') &&
    commentSheet.includes('useInteractionGuard(submitComment') &&
    commentSheet.includes('const retryBusy = commentsQuery.isRefetching || refetchCommentsGuardPending;') &&
    commentSheet.includes('const loadMoreBusy = commentsQuery.isFetchingNextPage || fetchNextCommentsGuardPending;') &&
    commentSheet.includes('const submitBusy = createMutation.isPending || submitCommentGuardPending;') &&
    commentSheet.includes('onClick={() => void guardedRefetchComments()}') &&
    commentSheet.includes('onRetry={() => void guardedRefetchComments()}') &&
    commentSheet.includes('onLoadMore={() => void guardedFetchNextComments()}') &&
    commentSheet.includes('onSubmit={(content) => void guardedSubmitComment(content)}') &&
    !commentSheet.includes('onAction={() => void commentsQuery.refetch()}') &&
    !commentSheet.includes('onRetry={() => void commentsQuery.refetch()}') &&
    !commentSheet.includes('onLoadMore={() => void commentsQuery.fetchNextPage()}') &&
    !commentSheet.includes('onSubmit={(content) => createMutation.mutate(content)}'),
  'Comment sheet retry, load-more, and submit actions must use guarded handlers instead of direct query/mutation calls.',
);

assert(
  quoteSheet.includes('instantPress={false}') &&
    quoteSheet.includes('primePostCreateComposerFocus();') &&
    quoteSheet.includes('markPostCreateComposerFocusIntent();') &&
    quoteSheet.includes('scheduleAfterSheetHandoff') &&
    quoteSheet.includes('useInteractionGuard(createQuoteFromSheet') &&
    quoteSheet.includes('const createQuoteBusy = createQuoteGuardPending;') &&
    quoteSheet.includes('void guardedCreateQuoteFromSheet();') &&
    quoteSheet.includes('disabled={!canCreateQuote || createQuoteBusy}') &&
    quoteSheet.includes("state={!canCreateQuote ? 'disabled' : createQuoteBusy ? 'loading' : 'idle'}"),
  'Quote sheet CTA must avoid instant press, guard rapid navigation, close the sheet, and carry explicit create-page focus intent.',
);

assert(
  quoteSheet.includes('dispatchPostSheetOpen') &&
    quoteSheet.includes('subscribePostSheetOpen') &&
    quoteSheet.includes("dispatchPostSheetOpen({ postId: resolvedPostId, kind: 'quote' })") &&
    quoteSheet.includes('onClose();'),
  'Quote sheets must publish/listen through shared postSheetOpenIntent so competing comment/quote sheets close instead of stacking.',
);

assert(
  quoteSheet.includes('useInteractionGuard(refetchQuotes') &&
    quoteSheet.includes('useInteractionGuard(fetchNextQuotes') &&
    quoteSheet.includes('const retryBusy = isRefetching || refetchQuotesGuardPending;') &&
    quoteSheet.includes('const loadMoreBusy = isFetchingNextPage || fetchNextQuotesGuardPending;') &&
    quoteSheet.includes('onClick={() => void guardedRefetchQuotes()}') &&
    quoteSheet.includes('onRetry={() => void guardedRefetchQuotes()}') &&
    quoteSheet.includes('onLoadMore={() => void guardedFetchNextQuotes()}') &&
    !quoteSheet.includes('onAction={() => void refetch()}') &&
    !quoteSheet.includes('onRetry={() => void refetch()}') &&
    !quoteSheet.includes('onLoadMore={() => void fetchNextPage()}'),
  'Quote sheet retry and load-more actions must use guarded handlers instead of direct query calls.',
);

assert(
  postDetail.includes('setIsCommentSheetOpen(false);') &&
    postDetail.includes('setIsQuoteSheetOpen(false);') &&
    postDetail.includes('setIsQuoteSheetOpen(true);') &&
    postDetail.includes('setIsCommentSheetOpen(true);'),
  'Post detail must make comment and quote sheets mutually exclusive before opening a new sheet.',
);

assert(
  postCard.includes('useInteractionGuard(openCommentSheet') &&
    postCard.includes('useInteractionGuard(openQuoteSheet') &&
    postCard.includes('useInteractionGuard(openAuthorContact') &&
    postCard.includes('void guardedOpenCommentSheet();') &&
    postCard.includes('void guardedOpenQuoteSheet();') &&
    postCard.includes('void guardedOpenAuthorContact();') &&
    postCard.includes('setIsQuoteSheetOpen(false); setIsCommentSheetOpen(true);') &&
    postCard.includes('setIsCommentSheetOpen(false); setIsQuoteSheetOpen(true);'),
  'Post card comment, quote, and contact actions must be guarded while keeping sheets mutually exclusive under rapid tapping.',
);

assert(
  anchoredActionMenuPanel.includes('useInteractionGuard<[string]>(submitFeedback') &&
    anchoredActionMenuPanel.includes('useInteractionGuard(blockAuthor') &&
    anchoredActionMenuPanel.includes("void guardedSubmitFeedback('已减少相似内容出现');") &&
    anchoredActionMenuPanel.includes('void guardedBlockAuthor();') &&
    anchoredActionMenuPanel.includes('disabled={reduceRecommendation.isPending || feedbackGuardPending}') &&
    anchoredActionMenuPanel.includes('disabled={!authorId || blockUser.isPending || blockAuthorGuardPending}') &&
    !anchoredActionMenuPanel.includes("submitFeedback('已减少相似内容出现');") &&
    !anchoredActionMenuPanel.includes('blockAuthor();'),
  'Post options feedback and block-author actions must use critical guards before mutation pending state catches up.',
);

assert(
  postDetailInteractions.includes('useInteractionGuard(refetchInteractions') &&
    postDetailInteractions.includes('useInteractionGuard(loadMoreInteractions') &&
    postDetailInteractions.includes('const retryBusy = isQuotesFetching || isCommentsFetching || refetchInteractionsGuardPending;') &&
    postDetailInteractions.includes('const loadMoreBusy = isFetchingMoreInteractions || loadMoreInteractionsGuardPending;') &&
    postDetailInteractions.includes('onAction={() => void guardedRefetchInteractions()}') &&
    postDetailInteractions.includes('onLoadMore={() => void guardedLoadMoreInteractions()}') &&
    !postDetailInteractions.includes('onAction={handleRefetch}') &&
    !postDetailInteractions.includes('onLoadMore={handleLoadMore}'),
  'Post detail interaction retry and load-more actions must use guarded combined handlers instead of direct comment/quote requests.',
);

assert(
  profileDialog.includes("import { useScrollLock } from '@/utils/scrollLock';") &&
    profileDialog.includes('useScrollLock(open, {') &&
    profileDialog.includes('data-profile-dialog-scroll') &&
    profileDialog.includes("target.closest('[data-profile-dialog-scroll]')"),
  'Profile/comment dialogs must lock background scroll and allow touch movement only inside the foreground dialog panel.',
);

assert(
  commentComposer.includes('useLayoutEffect') &&
    commentComposer.includes('const setTextareaRef = useCallback') &&
    commentComposer.includes('focusCommentComposer(node);') &&
    commentComposer.includes('textarea.focus({ preventScroll: true });') &&
    commentComposer.includes('COMMENT_COMPOSER_FOCUS_MAX_ATTEMPTS'),
  'Comment composer must focus the real textarea on mount and retry after layout, without causing scroll jumps.',
);

assert(
  postCreatePage.includes('const textareaRef = useRef<HTMLTextAreaElement | null>(null);') &&
    postCreatePage.includes('focusPostCreateComposerElement(textareaRef.current)') &&
    postCreatePage.includes('focusedComposerLocationKeyRef.current = location.key') &&
    postCreatePage.includes('POST_CREATE_COMPOSER_FOCUS_MAX_ATTEMPTS'),
  'Create page must focus the real textarea ref after navigation, including quote-publish navigation.',
);

assert(
  postCreateFocusCore.includes('export const POST_CREATE_FOCUS_TRIGGER_ATTR') &&
    postCreateFocusPrime.includes('export function markPostCreateComposerFocusIntent()') &&
    postCreateFocusPrime.includes('export function primePostCreateComposerFocus()') &&
    postCreateFocusPrime.includes('installPostCreateFocusIntentCapture') &&
    postCreateFocusRestore.includes('export function focusPostCreateComposer'),
  'Create focus modules must preserve click intent across route changes and multiple create entry points.',
);

assert(
  publishIconButton.includes('POST_CREATE_FOCUS_TRIGGER_ATTR') &&
    publishIconButton.includes('POST_CREATE_FOCUS_TRIGGER_PROPS'),
  'Publish icon buttons must be marked as create-focus triggers for rapid navigation/focus handoff.',
);

assert(
  postCreatePageSections.includes('useInteractionGuard(savePromotionLink') &&
    postCreatePageSections.includes('const promotionLinkSaveDisabled = isPublishingLocked || savePromotionLinkPending || !draftLinkTitle.trim() || !draftLinkUrl.trim();') &&
    postCreatePageSections.includes('onClick={() => void guardedSavePromotionLink()}') &&
    postCreatePageSections.includes("state={savePromotionLinkPending ? 'loading' : 'idle'}") &&
    !postCreatePageSections.includes('onClick={savePromotionLink}'),
  'Post create promotion link editor save action must be guarded against rapid duplicate saves.',
);

assert(
  bottomNavigation.includes('guardedGoCreate') &&
    bottomNavigation.includes('cooldownMs: 520') &&
    desktopSidebar.includes('guardedHandleQuickPost') &&
    desktopSidebar.includes('cooldownMs: 520') &&
    desktopSidebar.includes('onClick={() => void guardedHandleQuickPost()}'),
  'Top and bottom publish entries must be guarded so rapid taps cannot repeat route navigation and focus retries.',
);

assert(
  categoryFeed.includes('guardedToggleTopicJoin') &&
    categoryFeed.includes('cooldownMs: 520') &&
    categoryFeed.includes('mode: \'drop\''),
  'Category join/leave must be guarded so rapid taps cannot submit overlapping follow mutations.',
);

assert(
  categoryFeed.includes('useInteractionGuard(refetchCategoryPosts') &&
    categoryFeed.includes('useInteractionGuard(requestNextPage') &&
    categoryFeed.includes('const retryBusy = postsQuery.isRefetching || refetchGuardPending;') &&
    categoryFeed.includes('const loadMoreBusy = postsQuery.isFetchingNextPage || loadMoreGuardPending;') &&
    categoryFeed.includes('onClick={() => void guardedRefetchCategoryPosts()}') &&
    categoryFeed.includes('onRetry={() => void guardedRequestNextPage()}') &&
    categoryFeed.includes('onLoadMore={() => void guardedRequestNextPage()}') &&
    !categoryFeed.includes('onClick={() => void postsQuery.refetch()}'),
  'Category feed retry and load-more actions must use guarded handlers instead of direct query calls.',
);

assert(
  homeStructuredFilterPanel.includes('useInteractionGuard(handleApply') &&
    homeStructuredFilterPanel.includes('useInteractionGuard(handleReset') &&
    homeStructuredFilterPanel.includes('const actionPending = applyPending || resetPending;') &&
    homeStructuredFilterPanel.includes('onClick={() => void guardedApply()}') &&
    homeStructuredFilterPanel.includes('onClick={() => void guardedReset()}') &&
    homeStructuredFilterPanel.includes('disabled={actionPending}') &&
    !homeStructuredFilterPanel.includes('onClick={handleApply}') &&
    !homeStructuredFilterPanel.includes('onClick={handleReset}'),
  'Home structured filter apply and reset actions must be guarded against rapid duplicate filter commits.',
);

assert(
  sponsorPage.includes('SPONSOR_NAV_GUARD') &&
    sponsorPage.includes('guardedGoRecharge') &&
    sponsorPage.includes('guardedGoPromote') &&
    sponsorPage.includes('guardedGoTransactions'),
  'Sponsor page navigation CTAs must be guarded so rapid taps do not repeat route changes and loading flashes.',
);

assert(
  sponsorPage.includes('useInteractionGuard(refetchActiveSponsorRecords') &&
    sponsorPage.includes('const retryRecordsBusy = activeRecordRefetching || refetchRecordsGuardPending;') &&
    sponsorPage.includes('disabled={retryRecordsBusy}') &&
    sponsorPage.includes('onClick={() => void guardedRefetchActiveSponsorRecords()}') &&
    !sponsorPage.includes('onClick={() => { void promotionEffectsQuery.refetch(); }}') &&
    !sponsorPage.includes('onClick={() => { void promotionsQuery.refetch(); }}') &&
    !sponsorPage.includes('onClick={() => { void transactionsQuery.refetch(); void rechargeOrdersQuery.refetch(); }}'),
  'Sponsor record retry actions must share a guarded active-tab refetch instead of direct query refetch handlers.',
);

assert(
  profileMobilePage.includes('guardedOpenProfileSettings') &&
    profileMobilePage.includes('cooldownMs: 520') &&
    profileMobilePage.includes('mode: \'drop\''),
  'Profile cover settings entry must be guarded so rapid taps do not repeatedly open the settings sheet.',
);

assert(
  profileSecuritySheet.includes('useInteractionGuard(handleAvatarClick') &&
    profileSecuritySheet.includes('useInteractionGuard(openDisplayNameEditor') &&
    profileSecuritySheet.includes('useInteractionGuard(openLoginAccountEditor') &&
    profileSecuritySheet.includes('useInteractionGuard(openPasswordEditor') &&
    profileSecuritySheet.includes('useInteractionGuard(openPaymentPasswordEditor') &&
    profileSecuritySheet.includes('useInteractionGuard(handleLogout') &&
    profileSecuritySheet.includes('onClick={() => void guardedAvatarClick()}') &&
    profileSecuritySheet.includes('onClick={() => void guardedOpenDisplayNameEditor()}') &&
    profileSecuritySheet.includes('onClick={() => void guardedOpenLoginAccountEditor()}') &&
    profileSecuritySheet.includes('onClick={() => void guardedOpenPasswordEditor()}') &&
    profileSecuritySheet.includes('onClick={() => void guardedOpenPaymentPasswordEditor()}') &&
    profileSecuritySheet.includes('onClick={() => void guardedLogout()}') &&
    !profileSecuritySheet.includes('onClick={handleLogout}') &&
    !profileSecuritySheet.includes('onClick={() => avatarInputRef.current?.click()}'),
  'Profile security sheet avatar, editor, and logout actions must be guarded against rapid duplicate opens.',
);

assert(
  profileMobilePage.includes('useInteractionGuard(fetchNextFollowingUsersPage') &&
    profileMobilePage.includes('useInteractionGuard(fetchNextFansPage') &&
    profileMobilePage.includes('useInteractionGuard<[string]>(openRelationUser') &&
    profileMobilePage.includes('if (isFetchingNextFollowingUsers || !hasMoreFollowingUsers) return;') &&
    profileMobilePage.includes('if (isFetchingNextFans || !hasMoreFans) return;') &&
    profileMobilePage.includes('onFetchNextFollowingUsers={() => void guardedFetchNextFollowingUsers()}') &&
    profileMobilePage.includes('onFetchNextFans={() => void guardedFetchNextFans()}') &&
    profileMobilePage.includes('onOpenUser={(targetUserId) => void guardedOpenRelationUser(targetUserId)}') &&
    !profileMobilePage.includes('onFetchNextFollowingUsers={() => void fetchNextFollowingUsers()}') &&
    !profileMobilePage.includes('onFetchNextFans={() => void fetchNextFans()}'),
  'Profile relation list pagination and user navigation must be guarded against rapid duplicate page requests and route changes.',
);

assert(
  messagesPage.includes('const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);') &&
    messagesPage.includes('if (isMarkingAllRead || unreadCount <= 0) return;') &&
    messagesPage.includes('markAllNotificationsReadInCache') &&
    messagesPage.includes('unreadCount: 0') &&
    messagesPage.includes('disabled={isMarkingAllRead}') &&
    messagesPage.includes('aria-busy={isMarkingAllRead}'),
  'Messages mark-all-read must lock rapid taps, update unread state optimistically, and expose a busy button state.',
);

assert(
  messagesPage.includes('useInteractionGuard<[NotificationItem, string]>(openNotification') &&
    messagesPage.includes('useInteractionGuard<[string]>(openActorSpace') &&
    messagesPage.includes('useInteractionGuard(goNotificationSettings') &&
    messagesPage.includes('navigate(APP_ROUTES.notificationSettings)') &&
    messagesPage.includes('void guardedOpenNotification(item, targetPath)') &&
    messagesPage.includes('void guardedOpenActorSpace(actor.id)') &&
    messagesPage.includes('void guardedGoNotificationSettings()') &&
    !messagesPage.includes('onClick={() => handleOpenNotification(item, targetPath)}') &&
    !messagesPage.includes("onClick={() => navigate('/settings/notifications')}"),
  'Messages item, actor, and settings navigations must be guarded against rapid duplicate route changes.',
);

assert(
  messagesStyles.includes(".messages-read-all-button[aria-busy='true']") &&
    messagesStyles.includes('opacity: var(--ui-opacity-disabled);') &&
    messagesStyles.includes('transform: var(--ui-transform-none);'),
  'Messages mark-all-read busy state must have a stable disabled visual treatment.',
);

assert(
  tuiPlusLinkEditor.includes('useInteractionGuard(saveAll') &&
    tuiPlusLinkEditor.includes("policy: 'critical'") &&
    tuiPlusLinkEditor.includes('mode: \'drop\'') &&
    tuiPlusLinkEditor.includes('const saveBusy = isSaving || saveGuardPending;') &&
    tuiPlusLinkEditor.includes('disabled={saveBusy}') &&
    tuiPlusLinkEditor.includes('onClick={() => void guardedSaveAll()}'),
  'Tui Plus link editor save must use a critical interaction guard and freeze editable controls while saving.',
);

assert(
  profileBioEditor.includes('useInteractionGuard(saveBio') &&
    profileBioEditor.includes("policy: 'critical'") &&
    profileBioEditor.includes('mode: \'drop\'') &&
    profileBioEditor.includes('const saveBusy = isSaving || saveGuardPending;') &&
    profileBioEditor.includes('disabled={saveBusy}') &&
    profileBioEditor.includes('onClick={() => void guardedSaveBio()}'),
  'Profile bio save must use a critical interaction guard and freeze editing while saving.',
);

assert(
  notificationSettings.includes('useInteractionGuard(handleMasterToggle') &&
    notificationSettings.includes('useInteractionGuard<[PreferenceKey]>(handlePreferenceToggle') &&
    notificationSettings.includes('const settingsBusy = isMutating || masterTogglePending || preferenceTogglePending;') &&
    notificationSettings.includes('disabled={!canUse || settingsBusy}') &&
    notificationSettings.includes('disabled={!displayedPreference || settingsBusy}') &&
    notificationSettings.includes('onClick={() => void guardedMasterToggle()}') &&
    notificationSettings.includes('onClick={() => void guardedPreferenceToggle(item.key)}'),
  'Notification settings toggles must use real disabled states and critical interaction guards during rapid tapping.',
);

assert(
  rechargePage.includes('const createOrderBusy = isCreatingOrder || loadingDeposit;') &&
    rechargePage.includes('if (currentFlowBusy || createOrderBusy) return;') &&
    rechargePage.includes('if (currentFlowBusy) return;') &&
    rechargePage.includes('disabled={createOrderBusy}') &&
    rechargePage.includes('disabled={currentFlowBusy || createOrderBusy}'),
  'Recharge order creation must freeze amount controls and block rapid submit while payment flow work is in progress.',
);

assert(
  referralInvitePageContent.includes('useInteractionGuard(handleConfirmWithdrawal') &&
    referralInvitePageContent.includes('useInteractionGuard(handleConfirmConversion') &&
    referralInvitePageContent.includes('useInteractionGuard(refetchReferralSummary') &&
    referralInvitePageContent.includes('const withdrawalBusy = baseWithdrawalBusy || withdrawalGuardPending;') &&
    referralInvitePageContent.includes('const conversionBusy = baseConversionBusy || conversionGuardPending;') &&
    referralInvitePageContent.includes('const summaryRetryBusy = summaryQuery.isRefetching || summaryRefetchGuardPending;') &&
    referralInvitePageContent.includes('await withdrawalMutation.mutateAsync().catch((): void => undefined);') &&
    referralInvitePageContent.includes('await convertMutation.mutateAsync().catch((): void => undefined);') &&
    referralInvitePageContent.includes('onConfirm={() => void guardedConfirmWithdrawal()}') &&
    referralInvitePageContent.includes('onConfirm={() => void guardedConfirmConversion()}') &&
    referralInvitePageContent.includes('onClick={() => void guardedRefetchReferralSummary()}') &&
    !referralInvitePageContent.includes('onClick={() => void summaryQuery.refetch()}'),
  'Referral withdrawal, conversion, and summary retry actions must use interaction guards across payment mutations and reloads.',
);

assert(
  referralInvitePageContent.includes("const loadReferralRulesSheet = () => import('./ReferralRulesSheet');") &&
    referralInvitePageContent.includes("const loadReferralInviteSheets = () => import('./ReferralInviteSheets');") &&
    referralInvitePageContent.includes('const LazyReferralRulesSheet = lazy(loadReferralRulesSheet);') &&
    referralInvitePageContent.includes('module.ReferralConvertSheet') &&
    referralInvitePageContent.includes('module.ReferralWithdrawSheet') &&
    referralInvitePageContent.includes('const warmReferralInviteSheets = () => { void loadReferralInviteSheets(); };') &&
    referralInvitePageContent.includes('onPointerEnter={warmReferralInviteSheets}') &&
    referralInvitePageContent.includes('<LazyReferralRulesSheet') &&
    referralInvitePageContent.includes('<LazyReferralConvertSheet') &&
    referralInvitePageContent.includes('<LazyReferralWithdrawSheet') &&
    !referralInvitePageContent.includes("} from './ReferralInviteSheets';") &&
    !referralInvitePageContent.includes("from './ReferralRulesSheet'") &&
    !referralInvitePageContent.includes('PaymentActionSheet') &&
    !referralInvitePageContent.includes('createPortal') &&
    referralInviteSheets.includes("} from '@/ui/PaymentActionSheet';") &&
    referralInviteSheets.includes('export function ReferralConvertSheet') &&
    referralInviteSheets.includes('export function ReferralWithdrawSheet') &&
    !referralInviteSheets.includes('ReferralRulesSheet') &&
    referralRulesSheet.includes("import { createPortal } from 'react-dom';") &&
    referralRulesSheet.includes('export default function ReferralRulesSheet') &&
    !referralRulesSheet.includes('PaymentActionSheet'),
  'Referral invite rules and payment sheets must remain lazy-loaded with payment-sheet warmups so ordinary invite-page browsing stays lightweight.',
);

assert(
  transactionHistoryPage.includes('useInteractionGuard(fetchNextPage') &&
    transactionHistoryPage.includes('useInteractionGuard(refetchCurrentPage') &&
    transactionHistoryPage.includes('const loadMoreBusy = isFetchingNextPage || fetchNextPageGuardPending;') &&
    transactionHistoryPage.includes('const retryBusy = refetchGuardPending;') &&
    transactionHistoryPage.includes('onClick={() => void guardedRefetchCurrentPage()}') &&
    transactionHistoryPage.includes('onLoadMore={() => void guardedFetchNextPage()}'),
  'Transaction history retry and load-more actions must be guarded against rapid duplicate page requests.',
);

assert(
  promotionEffectsHistoryPage.includes('useInteractionGuard(refetchPromotionEffects') &&
    promotionEffectsHistoryPage.includes('const retryBusy = promotionEffectsQuery.isRefetching || refetchGuardPending;') &&
    promotionEffectsHistoryPage.includes('disabled={retryBusy}') &&
    promotionEffectsHistoryPage.includes('onClick={() => void guardedRefetchPromotionEffects()}') &&
    !promotionEffectsHistoryPage.includes('void promotionEffectsQuery.refetch();'),
  'Promotion effects history retry action must use a guarded refetch instead of direct query refetch.',
);

assert(
  promoteHistoryPage.includes('useInteractionGuard(saveEdit') &&
    promoteHistoryPage.includes('useInteractionGuard(refetchPromotionHistory') &&
    promoteHistoryPage.includes('useInteractionGuard(goPromote') &&
    promoteHistoryPage.includes('const saveBusy = isSaving || saveEditGuardPending;') &&
    promoteHistoryPage.includes('const retryBusy = isPromotionsRefetching || refetchPromotionsGuardPending;') &&
    promoteHistoryPage.includes('onClick={() => void guardedSaveEdit()}') &&
    promoteHistoryPage.includes('onClick={() => void guardedRefetchPromotions()}') &&
    promoteHistoryPage.includes('onClick={() => void guardedGoPromote()}') &&
    !promoteHistoryPage.includes('onClick={saveEdit}') &&
    !promoteHistoryPage.includes('onClick={() => refetchPromotions()}') &&
    !promoteHistoryPage.includes("onClick={() => navigate('/promote')}"),
  'Promotion history save, retry, and empty-state promote actions must use guarded handlers instead of direct calls.',
);

assert(
  userSpacePage.includes('useInteractionGuard(refetchUserSpace') &&
    userSpacePage.includes('useInteractionGuard(refetchUserPosts') &&
    userSpacePage.includes('useInteractionGuard(requestMorePosts') &&
    userSpacePage.includes('const userSpaceRetryBusy = isUserRefetching || isPostsRefetching || userSpaceRefetchGuardPending;') &&
    userSpacePage.includes('const postsRetryBusy = isPostsRefetching || postsRefetchGuardPending;') &&
    userSpacePage.includes('const loadMoreBusy = isLoadingMorePosts || loadMoreGuardPending;') &&
    userSpacePage.includes('onClick={() => void guardedRefetchUserSpace()}') &&
    userSpacePage.includes('onClick={() => void guardedRefetchUserPosts()}') &&
    userSpacePage.includes('onRetry={() => void guardedRequestMorePosts()}') &&
    userSpacePage.includes('onLoadMore={() => void guardedRequestMorePosts()}') &&
    !userSpacePage.includes('onClick={() => void refetchPosts()}') &&
    !userSpacePage.includes('onRetry={requestMorePosts}') &&
    !userSpacePage.includes('onLoadMore={requestMorePosts}'),
  'User space profile, posts retry, and load-more actions must use guarded handlers instead of direct query calls.',
);

assert(
  userSpacePage.includes("} from '@/features/upload/imageUploadConfig';") &&
    userSpacePage.includes("await import('@/features/upload/imageUploadPipeline')") &&
    !userSpacePage.includes("} from '@/features/upload/imageUploadPipeline';"),
  'User space should defer the heavy image upload pipeline until the owner selects a cover image.',
);

assert(
  userSpacePage.includes('useInteractionGuard(handleContact') &&
    userSpacePage.includes('const { guarded: guardedContactUser }') &&
    userSpacePage.includes('onContact={() => void guardedContactUser()}') &&
    !userSpacePage.includes('onContact={handleContact}') &&
    userSpaceTuiPlusLinks.includes('useInteractionGuard(openEditor') &&
    userSpaceTuiPlusLinks.includes('const { guarded: guardedOpenEditor }') &&
    userSpaceTuiPlusLinks.includes('onClick={() => void guardedOpenEditor()}') &&
    !userSpaceTuiPlusLinks.includes('onClick={openEditor}'),
  'User space contact and own profile link editor entries must be guarded against rapid duplicate external opens and route changes.',
);

assert(
  skeleton.includes('<div className="profile-bio-button profile-bio-inline user-space-bio-mobile user-space-bio-desktop">') &&
    !skeleton.includes('<p className="profile-bio-button profile-bio-inline user-space-bio-mobile user-space-bio-desktop">'),
  'User space skeleton bio placeholder must not render a block Skeleton inside a paragraph.',
);

assert(
  referralInviteRecordsPage.includes('useInteractionGuard(refetchActiveRecords') &&
    referralInviteRecordsPage.includes('const retryBusy = activeQuery.isRefetching || refetchGuardPending;') &&
    referralInviteRecordsPage.includes('disabled={retryBusy}') &&
    referralInviteRecordsPage.includes('onClick={() => void guardedRefetchActiveRecords()}') &&
    !referralInviteRecordsPage.includes('onClick={() => void commissionsQuery.refetch()}') &&
    !referralInviteRecordsPage.includes('onClick={() => void withdrawalsQuery.refetch()}') &&
    !referralInviteRecordsPage.includes('onClick={() => void relationsQuery.refetch()}'),
  'Referral record retry actions must share a guarded active-tab refetch instead of direct query refetch handlers.',
);

if (failures.length > 0) {
  console.error('[frontend-interaction-stress-guards] failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[frontend-interaction-stress-guards] passed');
