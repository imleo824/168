import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(file, 'utf8');

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return fullPath;
  });
}

const packageJson = read('package.json');
const server = read('server/bootstrap.ts');
const postRoutes = read('server/routes/post.routes.ts');
const postReadRoutes = read('server/routes/post-read.routes.ts');
const feedRoutes = read('server/routes/feed.routes.ts');
const configRoutes = read('server/routes/config.routes.ts');
const adminConfigRoutes = read('server/routes/admin-config.routes.ts');
const postService = read('server/services/post/index.ts');
const recommendationContext = read('server/services/post/recommendation-context.ts');
const rankingUtils = read('server/services/post/ranking-utils.ts');
const homeFeedService = read('server/services/home-feed.service.ts');
const feedReadCacheService = read('server/services/feed-read-cache.service.ts');
const feedRankingService = read('server/modules/feed/feed-ranking.service.ts');
const publicFeedCache = read('server/public-feed-cache.ts');
const publicPostDetailCache = read('server/public-post-detail-cache.ts');
const publicFeedWarmup = read('server/services/public-feed-warmup.service.ts');
const httpCache = read('server/http-cache.ts');
const performanceBudget = read('scripts/performance-budget-production.mjs');
const productionSmoke = read('scripts/smoke-production.mjs');
const rankingSyncSql = read('prisma/sql/sync_post_engagement_aggregates.sql');
const prismaSchema = read('prisma/schema.prisma');
const apiClient = read('src/services/api.ts');
const apiCore = read('src/services/apiCore.ts');
const homeStartupApi = read('src/services/homeStartupApi.ts');
const appShell = read('src/app/AppShell.tsx');
const mobileAddressBarController = read('src/app/MobileAddressBarController.tsx');
const appRequireTuiPlusRoute = read('src/app/AppRequireTuiPlusRoute.tsx');
const authContext = read('src/context/AuthContext.tsx');
const useDataConfig = read('src/hooks/useDataConfig.ts');
const useDataSocial = read('src/hooks/useDataSocial.ts');
const useDataPromotions = read('src/hooks/useDataPromotions.ts');
const useFeedExposureViews = read('src/hooks/useFeedExposureViews.ts');
const homeRefresh = read('src/hooks/useHomeRefresh.ts');
const useHomeNotificationSummary = read('src/hooks/useHomeNotificationSummary.ts');
const useHomeBootstrapPrefetch = read('src/app/useHomeBootstrapPrefetch.ts');
const browserPushResync = read('src/app/useBrowserPushResync.ts');
const pushNotification = read('src/services/pushNotification.ts');
const appBottomNavigation = read('src/app/AppBottomNavigation.tsx');
const usePostCreateFocusIntentCapture = read('src/app/usePostCreateFocusIntentCapture.ts');
const publishIconButton = read('src/ui/PublishIconButton.tsx');
const postCreateFocusPrime = read('src/utils/postCreateFocusPrime.ts');
const postCreateFocusRestore = read('src/utils/postCreateFocusRestore.ts');
const postCard = read('src/features/post/PostCard.tsx');
const homeChrome = read('src/features/home/HomeChrome.tsx');
const homeFeedQueries = read('src/hooks/useHomeFeedQueries.ts');
const homeFeedCacheKey = read('src/features/home/homeFeedCacheKey.ts');
const homeFeedSnapshotCache = read('src/features/home/homeFeedSnapshotCache.ts');
const homePage = read('src/pages/Home.tsx');
const homeTopicTabs = read('src/features/home/HomeTopicTabs.tsx');
const homeStructuredFilterSheet = read('src/features/home/HomeStructuredFilterSheet.tsx');
const homeStructuredFilterUtils = read('src/features/home/homeStructuredFilterUtils.ts');
const categoryMetaSchema = read('src/features/category/categoryMetaSchema.ts');
const listReturnScroll = read('src/utils/listReturnScroll.ts');
const listReturnScrollRestore = read('src/utils/listReturnScrollRestore.ts');
const listReturnScrollRestorer = read('src/utils/ListReturnScrollRestorer.tsx');
const storageUtils = read('src/utils/storage.ts');
const feedViewport = read('src/features/feed/FeedViewport.tsx');
const profileMobilePage = read('src/features/profile/ProfileMobilePage.tsx');
const categoryFeedPage = read('src/pages/CategoryFeedMobile.tsx');
const userSpacePage = read('src/pages/UserSpace.tsx');
const profileMediaUploads = read('src/features/profile/useProfileMediaUploads.ts');
const sponsorPage = read('src/features/sponsor/SponsorMobilePage.tsx');
const referralInvitePageContent = read('src/features/sponsor/ReferralInvitePageContent.tsx');
const referralInviteSheets = read('src/features/sponsor/ReferralInviteSheets.tsx');
const referralRulesSheet = read('src/features/sponsor/ReferralRulesSheet.tsx');
const transactionHistoryPage = read('src/pages/TransactionHistoryMobile.tsx');
const promoteHistoryPage = read('src/pages/PromoteHistory.tsx');
const promoteMobilePage = read('src/features/promote/PromoteMobilePage.tsx');
const promoteComponents = read('src/features/promote/promoteComponents.tsx');
const promotePageSections = read('src/features/promote/promotePageSections.tsx');
const promotePostPickerSheet = read('src/features/promote/PromotePostPickerSheet.tsx');
const promotePaymentSheet = read('src/features/promote/PromotePaymentSheet.tsx');
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreatePageSections = read('src/features/post-create/postCreatePageSections.tsx');
const postCreatePickerSheets = read('src/features/post-create/postCreatePickerSheets.tsx');
const postCreateSettingsSheets = read('src/features/post-create/postCreateSettingsSheets.tsx');
const tuiPlusLinkEditorPage = read('src/pages/TuiPlusLinkEditorMobile.tsx');
const dataBarrelConsumers = listSourceFiles('src').filter((file) => {
  if (file === path.join('src', 'hooks', 'useData.ts')) return false;
  return /from ['"]@\/hooks\/useData['"]/.test(read(file));
});
const staticPostFeedListConsumers = listSourceFiles('src').filter((file) => {
  if (file === path.join('src', 'features', 'feed', 'PostFeedList.tsx')) return false;
  return /import\s+PostFeedList\s+from ['"]@\/features\/feed\/PostFeedList['"]/.test(read(file));
});
const staticListReturnRestoreConsumers = listSourceFiles('src').filter((file) => {
  if (file === path.join('src', 'utils', 'listReturnScrollRestore.ts')) return false;
  if (file === path.join('src', 'utils', 'ListReturnScrollRestorer.tsx')) return false;
  return /from ['"]@\/utils\/listReturnScrollRestore['"]|from ['"]\.\/listReturnScrollRestore['"]/.test(read(file));
});

for (const path of [
  '/api/me',
  '/api/home/feed?feed=recommended&limit=20',
  '/api/posts?limit=20',
  '/api/notifications/home-summary',
  '/api/me/likes?limit=20',
  '/api/me/following?limit=30',
  '/api/me/fans?limit=30',
  '/api/me/transactions?limit=50',
  '/api/me/orders?limit=30',
  '/api/me/promotions',
]) {
  assert.ok(
    performanceBudget.includes(path),
    `production performance budget should cover logged-in endpoint ${path}`,
  );
}

assert.match(
  packageJson,
  /"test:feed-performance": "node scripts\/feed-performance-guards\.mjs"/,
  'feed performance guard should stay wired into npm test',
);

assert.deepEqual(
  dataBarrelConsumers,
  [],
  'frontend modules should import concrete useData* hook modules instead of the useData barrel to keep route chunks isolated',
);

assert.match(
  feedViewport,
  /const LazyPostFeedList = React\.lazy\(\(\) => import\('\.\/PostFeedList'\)\);[\s\S]*<React\.Suspense fallback=\{<LoadingState \/>\}>[\s\S]*<LazyPostFeedList/,
  'feed viewport should lazy-load the heavy post-card list only after posts exist, with a stable loading fallback',
);

assert.match(
  homeChrome,
  /const LazyHomeAdBanner = lazy\(\(\) => import\('@\/features\/feed\/HomeAdBanner'\)\);[\s\S]*hasHomeAdBanner \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyHomeAdBanner ads=\{homeAds\} compact \/>/,
  'home chrome should lazy-load the home ad banner implementation only when a visible ad exists',
);

assert.doesNotMatch(
  homeChrome,
  /import HomeAdBanner from ['"]@\/features\/feed\/HomeAdBanner['"]|ComponentProps<typeof HomeAdBanner>/,
  'home chrome must not statically import the ad banner implementation or derive props from it',
);

assert.doesNotMatch(
  feedViewport,
  /import PostFeedList from ['"]\.\/PostFeedList['"]/,
  'feed viewport must not statically import the heavy post-card list into empty/loading/error feed states',
);

assert.deepEqual(
  staticPostFeedListConsumers,
  [],
  'route and feature containers should lazy-load PostFeedList so non-feed, empty, and loading states do not pull the post-card tree into their initial chunks',
);

assert.match(
  profileMobilePage,
  /const LazyProfileEditDialogs = lazy\(\(\) => import\('\.\/ProfileEditDialogs'\)\);[\s\S]*const LazyProfileSecuritySheet = lazy\(\(\) => import\('\.\/ProfileSecuritySheet'\)\);[\s\S]*const \{ guarded: guardedOpenProfileSettings \} = useInteractionGuard\(openProfileSettings,[\s\S]*isEditDialogOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyProfileEditDialogs[\s\S]*isSecurityOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyProfileSecuritySheet/,
  'profile page should keep edit dialogs and security sheet out of the default profile route chunk while preserving the guarded cover settings action',
);

assert.doesNotMatch(
  profileMobilePage,
  /import (?:ProfileEditDialogs|ProfileSecuritySheet) from ['"]\.\/Profile/,
  'profile page must not statically import modal-only edit or security sheet UI',
);

assert.match(
  profileMediaUploads,
  /from ['"]@\/features\/upload\/imageUploadConfig['"][\s\S]*await import\('@\/features\/upload\/imageUploadPipeline'\)[\s\S]*await import\('@\/features\/upload\/imageUploadPipeline'\)/,
  'profile avatar and cover uploads should validate with lightweight config and load the compression/upload pipeline only after a file is selected',
);

assert.doesNotMatch(
  `${profileMobilePage}\n${profileMediaUploads}`,
  /from ['"]@\/features\/upload\/imageUploadPipeline['"]/,
  'profile route must not statically import the image upload pipeline into ordinary profile browsing',
);

assert.match(
  sponsorPage,
  /const LazyLedgerRecordCard = lazy\(\(\) => import\('@\/features\/records\/LedgerRecordCard'\)\);[\s\S]*const LazyPromotionEffectStatsRow = lazy\(\(\) => import\('@\/features\/promote\/PromotionEffectStatsRow'\)\);[\s\S]*const LazyPromotionRecordCard = lazy\(\(\) => import\('@\/features\/promote\/PromotionRecordCard'\)\);[\s\S]*const LazyTuiPlusBenefitPromptDialog = lazy\(\(\) => import\('@\/features\/tui-plus\/TuiPlusBenefitPromptDialog'\)\);/,
  'sponsor route should split inactive record tabs and the Tui Plus prompt out of the default sponsor chunk',
);

assert.doesNotMatch(
  sponsorPage,
  /import (?:LedgerRecordCard|PromotionEffectStatsRow|PromotionRecordCard|TuiPlusBenefitPromptDialog) from ['"]@\/features\//,
  'sponsor route must not statically import record cards or modal-only prompt UI',
);

assert.match(
  referralInvitePageContent,
  /const loadReferralRulesSheet = \(\) => import\('\.\/ReferralRulesSheet'\);[\s\S]*const loadReferralInviteSheets = \(\) => import\('\.\/ReferralInviteSheets'\);[\s\S]*const LazyReferralRulesSheet = lazy\(loadReferralRulesSheet\);[\s\S]*const LazyReferralConvertSheet = lazy[\s\S]*module\.ReferralConvertSheet[\s\S]*const LazyReferralWithdrawSheet = lazy[\s\S]*module\.ReferralWithdrawSheet[\s\S]*void loadReferralInviteSheets\(\);[\s\S]*isRulesOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyReferralRulesSheet[\s\S]*isConvertSheetOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyReferralConvertSheet[\s\S]*isWithdrawSheetOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyReferralWithdrawSheet/,
  'referral invite page should lazy-load rules, conversion, and withdrawal sheets instead of pulling sheet UI into the default invite chunk',
);

assert.doesNotMatch(
  referralInvitePageContent,
  /from ['"]\.\/ReferralInviteSheets['"]|from ['"]\.\/ReferralRulesSheet['"]|createPortal|PaymentActionSheet/,
  'referral invite page content must not statically import sheet modules, portals, or payment form UI',
);

assert.match(
  referralInviteSheets,
  /import PaymentActionSheet[\s\S]*from ['"]@\/ui\/PaymentActionSheet['"][\s\S]*export function ReferralConvertSheet[\s\S]*export function ReferralWithdrawSheet/,
  'referral invite payment sheets should own the payment form dependency inside their lazy-loaded module',
);

assert.doesNotMatch(
  referralInviteSheets,
  /ReferralRulesSheet|TopbarIconButton|ShieldCheck|CheckCircle2/,
  'referral invite payment sheets must not include the rules-only sheet UI',
);

assert.match(
  referralRulesSheet,
  /import \{ createPortal \} from ['"]react-dom['"][\s\S]*export default function ReferralRulesSheet/,
  'referral rules sheet should own its portal dependency inside its lazy-loaded module',
);

assert.doesNotMatch(
  referralRulesSheet,
  /PaymentActionSheet/,
  'referral rules sheet must not pull payment form UI into the rules-only sheet chunk',
);

assert.match(
  transactionHistoryPage,
  /const LazyLedgerRecordCard = lazy\(\(\) => import\('@\/features\/records\/LedgerRecordCard'\)\);[\s\S]*<Suspense fallback=\{<PageLoadingState text="正在加载交易记录" className="record-state-block" \/>\}>[\s\S]*<LazyLedgerRecordCard/,
  'transaction history should lazy-load record cards only after records exist',
);

assert.doesNotMatch(
  transactionHistoryPage,
  /import LedgerRecordCard from ['"]@\/features\/records\/LedgerRecordCard['"]/,
  'transaction history must not statically import ledger card UI into loading/error/empty states',
);

assert.match(
  promoteHistoryPage,
  /const LazyImageUpload = lazy\(\(\) => import\('@\/features\/upload\/ImageUpload'\)\);[\s\S]*const LazyPromotionRecordCard = lazy\(\(\) => import\('@\/features\/promote\/PromotionRecordCard'\)\);/,
  'promotion history should split edit-only upload tooling and non-empty record cards out of loading/auth/empty states',
);

assert.doesNotMatch(
  promoteHistoryPage,
  /import (?:ImageUpload|PromotionRecordCard) from ['"]@\/features\//,
  'promotion history must not statically import upload tooling or promotion cards into auth/loading/empty states',
);

assert.match(
  promotePageSections,
  /const LazyImageUpload = lazy\(\(\) => import\('@\/features\/upload\/ImageUpload'\)\);[\s\S]*<Suspense fallback=\{<PromoteAdImageUploadFallback variant="desktop" \/>\}>[\s\S]*<LazyImageUpload[\s\S]*purpose="ad-desktop"[\s\S]*<Suspense fallback=\{<PromoteAdImageUploadFallback variant="mobile" \/>\}>[\s\S]*<LazyImageUpload[\s\S]*purpose="ad-mobile"/,
  'promote ad creative should lazy-load upload tooling behind fixed-ratio placeholders for both desktop and mobile creatives',
);

assert.doesNotMatch(
  promotePageSections,
  /import ImageUpload from ['"]@\/features\/upload\/ImageUpload['"]/,
  'promote ad creative must not statically import upload tooling into the promote route chunk',
);

assert.match(
  promoteMobilePage,
  /const loadPromotePostPickerSheet = \(\) => import\('\.\/PromotePostPickerSheet'\);[\s\S]*const loadPromotePaymentSheet = \(\) => import\('\.\/PromotePaymentSheet'\);[\s\S]*const LazyPromotePostPickerSheet = lazy\(loadPromotePostPickerSheet\);[\s\S]*const LazyPromotePaymentSheet = lazy\(loadPromotePaymentSheet\);[\s\S]*void loadPromotePostPickerSheet\(\);[\s\S]*void loadPromotePaymentSheet\(\);[\s\S]*isPostPickerOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyPromotePostPickerSheet[\s\S]*isBookingModalOpen \? \([\s\S]*<Suspense fallback=\{null\}>[\s\S]*<LazyPromotePaymentSheet/,
  'promote route should lazy-load the post picker and payment sheets, with interaction warmups before the sheets mount',
);

assert.doesNotMatch(
  promoteMobilePage,
  /import\s+\{[\s\S]*(?:PromotePaymentSheet|PromotePostPickerSheet)[\s\S]*\}\s+from ['"]\.\/promoteComponents['"]/,
  'promote route must not import sheet-only UI from the startup promote components module',
);

assert.doesNotMatch(
  promoteComponents,
  /(?:PaymentActionSheet|BottomSheet|PromotePaymentSheet|PromotePostPickerSheet)/,
  'promote startup components must stay limited to shell UI and must not statically depend on sheet implementations',
);

assert.match(
  promotePostPickerSheet,
  /import BottomSheet from ['"]@\/ui\/BottomSheet['"][\s\S]*export default function PromotePostPickerSheet/,
  'promote post picker sheet should own the BottomSheet dependency inside its lazy-loaded module',
);

assert.match(
  promotePaymentSheet,
  /import PaymentActionSheet[\s\S]*from ['"]@\/ui\/PaymentActionSheet['"][\s\S]*export default function PromotePaymentSheet/,
  'promote payment sheet should own the payment form dependency inside its lazy-loaded module',
);

assert.match(
  appRequireTuiPlusRoute,
  /const LazyTuiPlusBenefitPromptDialog = lazy\(\(\) => import\('@\/features\/tui-plus\/TuiPlusBenefitPromptDialog'\)\);[\s\S]*<Suspense fallback=\{<PageLoader \/>\}>[\s\S]*<LazyTuiPlusBenefitPromptDialog/,
  'Tui Plus route guard should lazy-load its prompt dialog so the app shell does not pull modal UI into the main bundle',
);

assert.doesNotMatch(
  appRequireTuiPlusRoute,
  /import TuiPlusBenefitPromptDialog from ['"]@\/features\/tui-plus\/TuiPlusBenefitPromptDialog['"]/,
  'Tui Plus route guard must not statically import prompt dialog UI into the main app shell',
);

for (const [source, label] of [
  [postCreatePage, 'post create page'],
  [postCreatePageSections, 'post create page sections'],
  [tuiPlusLinkEditorPage, 'Tui Plus link editor'],
]) {
  assert.match(
    source,
    /const LazyTuiPlusBenefitPromptDialog = lazy\(\(\) => import\('@\/features\/tui-plus\/TuiPlusBenefitPromptDialog'\)\);[\s\S]*<LazyTuiPlusBenefitPromptDialog/,
    `${label} should lazy-load the Tui Plus prompt so normal editing flows do not bundle modal-only UI`,
  );
  assert.doesNotMatch(
    source,
    /import TuiPlusBenefitPromptDialog from ['"]@\/features\/tui-plus\/TuiPlusBenefitPromptDialog['"]/,
    `${label} must not statically import Tui Plus prompt dialog UI`,
  );
}

assert.match(
  postCreatePageSections,
  /const LazyImageUpload = lazy\(\(\) => import\('@\/features\/upload\/ImageUpload'\)\);[\s\S]*<Suspense fallback=\{<PostCreateImageUploadFallback \/>\}>[\s\S]*<LazyImageUpload/,
  'post create should lazy-load the upload surface behind a stable placeholder so typing can become interactive before upload tooling loads',
);

assert.doesNotMatch(
  postCreatePageSections,
  /import ImageUpload from ['"]@\/features\/upload\/ImageUpload['"]/,
  'post create sections must not statically import image upload tooling into the route chunk',
);

assert.match(
  postCreatePage,
  /const loadPostCreatePickerSheets = \(\) => import\('\.\/postCreatePickerSheets'\);[\s\S]*const loadPostCreateSettingsSheets = \(\) => import\('\.\/postCreateSettingsSheets'\);[\s\S]*LazyPostCreateCategoryMetaSheet[\s\S]*LazyPostCreateCategoryPickerSheet[\s\S]*LazyPostCreateCategorySelectSheet[\s\S]*LazyPostCreateLocationPickerSheet[\s\S]*LazyPostCreateContactEditorDialog[\s\S]*LazyPostCreatePrivacySettingsSheet[\s\S]*LazyPostCreatePromoteChoiceSheet[\s\S]*LazyPostCreateTelegramSettingsSheet[\s\S]*void loadPostCreatePickerSheets\(\);[\s\S]*void loadPostCreateSettingsSheets\(\);/,
  'post create route should lazy-load picker and settings sheets, with warmups before panel-heavy interactions',
);

assert.doesNotMatch(
  postCreatePage,
  /from ['"]\.\/postCreateSheets['"]|from ['"]\.\/postCreatePickerSheets['"]|from ['"]\.\/postCreateSettingsSheets['"]|<PostCreateCategoryPickerSheet|<PostCreateCategoryMetaSheet|<PostCreateCategorySelectSheet|<PostCreateLocationPickerSheet|<PostCreatePrivacySettingsSheet|<PostCreateTelegramSettingsSheet|<PostCreateContactEditorDialog|<PostCreatePromoteChoiceSheet/,
  'post create route must not statically import or render sheet-only UI components in the default composer chunk',
);

assert.match(
  postCreatePickerSheets,
  /export function PostCreateCategoryPickerSheet[\s\S]*export function PostCreateLocationPickerSheet[\s\S]*export function PostCreateCategorySelectSheet[\s\S]*export function PostCreateCategoryMetaSheet/,
  'post create picker sheets should remain isolated in the lazy-loaded picker module',
);

assert.match(
  postCreateSettingsSheets,
  /import BottomSheet from ['"]@\/ui\/BottomSheet['"][\s\S]*export function PostCreatePrivacySettingsSheet[\s\S]*export function PostCreateTelegramSettingsSheet[\s\S]*export function PostCreateContactEditorDialog[\s\S]*export function PostCreatePromoteChoiceSheet/,
  'post create settings sheets should own BottomSheet and editor-page dependencies inside the lazy-loaded settings module',
);

assert.match(
  useDataConfig,
  /const shouldEnableQuery = enabled && !isHomeShell;[\s\S]*const canUseBootstrapSnapshot = shouldEnableQuery && !options\.alwaysFresh;[\s\S]*\(\) => \(canUseBootstrapSnapshot \? readHomeBootstrapSnapshot\(\) : undefined\)/,
  'useConfig should avoid local bootstrap snapshot reads when the query is disabled or already on the home shell',
);

assert.match(
  useDataConfig,
  /export function useHomeBootstrap\(enabled: boolean = true\)[\s\S]*\(\) => \(enabled \? readHomeBootstrapSnapshot\(\) : undefined\)[\s\S]*enabled,/,
  'useHomeBootstrap should support disabled route contexts without reading the home snapshot',
);

assert.match(
  appShell,
  /const isHomePath = pathname === APP_ROUTES\.home;[\s\S]*const isAdminRoute = pathname\.startsWith\('\/168wc'\);[\s\S]*const isUserSurface = routeSurface === 'user';[\s\S]*useHomeBootstrap\(isUserSurface && isHomePath\)[\s\S]*useConfig\(isUserSurface && !isHomePath\)[\s\S]*const onlineConfig = isUserSurface \? \(isHomePath \? homeBootstrap\?\.config : routeConfig\) : undefined;[\s\S]*enabled: isUserSurface && Boolean\(onlineConfig\),/,
  'app shell online presence should use full home bootstrap only on user home, lightweight config on other user routes, and no config subscription on admin routes',
);

assert.match(
  postCard,
  /const canShowTelegramSync = Boolean\(isOwner && showStatus && onTelegramSync\);[\s\S]*const \{ data: config \} = useConfig\(canShowTelegramSync\);/,
  'post cards should only subscribe to config when owner Telegram sync controls can render',
);

assert.doesNotMatch(
  homeChrome,
  /useHomeBootstrap/,
  'home chrome should consume bootstrap-derived props from Home instead of adding a duplicate bootstrap query observer',
);

assert.match(
  postRoutes,
  /app\.get\('\/api\/posts'[\s\S]*?getPublicFeedResultCacheKey\(req, 'posts'/,
  'public feed should continue using the shared result cache',
);

assert.match(
  publicPostDetailCache,
  /currentUserId\) return null;[\s\S]*feedVersion=\$\{getPublicFeedCacheVersion\(\)\}\|kind=post-detail/,
  'anonymous post detail cache keys must be tied to the public feed cache version and bypass logged-in readers',
);

assert.match(
  postReadRoutes,
  /getPublicPostDetailCacheKey\(req, req\.params\.id, currentUserId\)[\s\S]*getPublicPostDetailCache\(publicCacheKey\)[\s\S]*X-Post-Detail-Cache'[\s\S]*measurePostRouteStep\(\{[\s\S]*name: 'posts\.detail'[\s\S]*setPublicPostDetailCache\(publicCacheKey, finalPost\)/,
  'post detail route should serve anonymous repeat reads from a versioned server cache and instrument cold DB reads',
);

assert.match(
  feedRoutes,
  /app\.get\('\/api\/home\/feed'[\s\S]*?getPublicFeedResultCacheKey\(req, 'home-feed'/,
  'dedicated home feed should use the shared result cache for anonymous recommended/category reads',
);

assert.match(
  server,
  /PUBLIC_FEED_RESPONSE_BUDGET_MS\s*=\s*200[\s\S]*registerPostRoutes\([\s\S]*PUBLIC_FEED_RESPONSE_BUDGET_MS[\s\S]*registerFeedRoutes\([\s\S]*PUBLIC_FEED_RESPONSE_BUDGET_MS/,
  'public feed requests should keep a server-side response budget below one second',
);

assert(
  publicFeedCache.includes('.then((result) => {') &&
    publicFeedCache.includes('setPublicFeedResultCache(key, result, result.items);'),
  'Timed-out public feed reads must populate the cache when their background work completes.',
);

assert.match(
  server,
  /PUBLIC_FEED_INITIAL_WARM_DELAY_MS\s*=\s*250[\s\S]*initialDelayMs: PUBLIC_FEED_INITIAL_WARM_DELAY_MS/,
  'public feed warmup should start almost immediately after the server begins listening',
);

assert.match(
  publicFeedWarmup,
  /setTimeout\(run, options\.initialDelayMs\)/,
  'public feed warmup service should honor the configured initial warm delay',
);

assert.match(
  configRoutes,
  /const CONFIGS_CACHE_TTL_MS\s*=\s*10 \* 1000/,
  'public config route should keep a short route-level config cache to reduce repeated clone work',
);

assert.match(
  configRoutes,
  /if \(configsCache && configsCache\.expiresAt > Date\.now\(\)\) \{[\s\S]*return structuredClone\(configsCache\.data\)/,
  'public config route cache hits should still return cloned config objects',
);

assert.match(
  configRoutes,
  /ConfigService\.getConfigs\(\)[\s\S]*configsCache = \{[\s\S]*expiresAt: Date\.now\(\) \+ CONFIGS_CACHE_TTL_MS/,
  'public config route should populate the short config cache from ConfigService',
);

assert.match(
  adminConfigRoutes,
  /ConfigService\.updateConfigs\(req\.body\)[\s\S]*clearCachedConfigs\(\)[\s\S]*clearCachedCategories\(\)/,
  'admin config saves should invalidate both route-level config and category caches immediately',
);

assert.match(
  [postRoutes, feedRoutes].join('\n'),
  /getPublicFeedFallbackCache\(publicCacheKey\)/,
  'public feed requests should be able to fall back to the last successful cached result under load',
);

assert.match(
  feedRoutes,
  /recommendedPostsFallbackKey[\s\S]*buildPublicFeedCacheKey\('posts'[\s\S]*getPublicFeedFallbackCache\(recommendedPostsFallbackKey\)/,
  'dedicated recommended home feed should reuse the legacy recommended feed last-good cache during cold starts',
);

assert.match(
  feedRoutes,
  /feedKind === 'recommended'[\s\S]*?PostService\.listPosts\(\{[\s\S]*?currentUserId[\s\S]*?limit[\s\S]*?cursor/,
  'dedicated recommended home feed should reuse the optimized PostService recommendation path',
);

assert.match(
  publicFeedCache,
  /feed[\s\S]*categorySlug[\s\S]*categoryMetaScope[\s\S]*categoryMetaFilters/,
  'public feed cache key should include home feed mode, category slug, and structured filters',
);

assert.match(
  homeFeedCacheKey,
  /export function stableHomeFeedParamsKey[\s\S]*JSON\.stringify\(stableHomeFeedParams\(params\)\)/,
  'home feed client cache keys should use stable sorted params for structured filters',
);

assert.match(
  homeFeedQueries,
  /const homeFeedRequestParams = useMemo<HomeFeedSnapshotParams>\([\s\S]*stableHomeFeedParams\([\s\S]*categoryMetaFilters[\s\S]*const homeFeedRequestParamsKey = useMemo\([\s\S]*JSON\.stringify\(homeFeedRequestParams\)[\s\S]*\['posts', 'home-feed', HOME_FEED_QUERY_VERSION, viewerId \|\| 'anonymous', homeFeedRequestParamsKey\]/,
  'home feed React Query key must use the stable params object/string pair instead of the raw filters object or stringify/parse roundtrip',
);

assert.doesNotMatch(
  homeFeedQueries,
  /JSON\.parse\(homeFeedRequestParamsKey\)/,
  'home feed request params must not parse the stable query key back into an object on tab/filter changes',
);

assert.match(
  publicFeedCache,
  /publicFeedLastGoodCache[\s\S]*cacheState: 'FALLBACK'/,
  'public feed cache should retain the last successful payload for response-budget fallback',
);

assert.match(
  publicFeedCache,
  /toVersionlessFeedCacheKey[\s\S]*!part\.startsWith\('feedVersion='\)[\s\S]*publicFeedLastGoodCache\.set\(stableKey/,
  'public feed fallback cache should survive feed cache version bumps for short response-budget fallback',
);

assert.match(
  publicFeedCache,
  /function touchPublicFeedResultCache\(key: string, cached: PublicFeedResultCacheEntry\)[\s\S]*publicFeedResultCache\.delete\(key\)[\s\S]*publicFeedResultCache\.set\(key, cached\)/,
  'public feed result cache should support LRU-style touch on cache hits',
);

assert.match(
  publicFeedCache,
  /if \(cached\.expiresAt > now\) \{[\s\S]*touchPublicFeedResultCache\(key, cached\)[\s\S]*cacheState: 'HIT'/,
  'fresh public feed result cache hits should refresh eviction order without extending TTL',
);

assert.match(
  publicFeedCache,
  /if \(cached\.staleExpiresAt > now\) \{[\s\S]*touchPublicFeedResultCache\(key, cached\)[\s\S]*cacheState: 'STALE'/,
  'stale public feed result cache hits should refresh eviction order while background refresh runs',
);

assert.match(
  publicFeedCache,
  /function touchPublicFeedLastGoodCache\(key: string, cached: PublicFeedLastGoodCacheEntry\)[\s\S]*publicFeedLastGoodCache\.delete\(key\)[\s\S]*publicFeedLastGoodCache\.set\(key, cached\)/,
  'public feed last-good fallback cache should support LRU-style touch on fallback hits',
);

assert.match(
  publicFeedCache,
  /const stableCached = publicFeedLastGoodCache\.get\(stableKey\)[\s\S]*touchPublicFeedLastGoodCache\(stableKey, stableCached\)/,
  'versionless public feed fallback hits should refresh last-good eviction order',
);

assert.match(
  publicFeedCache,
  /prunePublicFeedResultCache\(now\);[\s\S]*prunePublicFeedLastGoodCache\(\);/,
  'public feed result and last-good caches should be pruned independently after writes',
);

assert.match(
  httpCache,
  /return false;/,
  'public feed responses should remain eligible for HTTP compression to reduce concurrent transfer time',
);

assert.doesNotMatch(
  httpCache,
  /req\.path === '\/api\/posts'|req\.path === '\/api\/home\/feed'/,
  'public feed endpoints must not be excluded from HTTP compression',
);

assert.doesNotMatch(
  httpCache,
  /no-transform/,
  'public feed cache headers must not disable HTTP compression transforms',
);

assert.match(
  postService,
  /recommendationScore[\s\S]*rankedCandidateTake[\s\S]*sliceRankedPage/,
  'recommendation feed should keep ranked pagination',
);

assert.doesNotMatch(
  homeFeedService,
  /function buildVisiblePostWhere[\s\S]*?userType\s*:\s*['"]NORMAL['"][\s\S]*?function buildCategoryMetaWhereFilters/,
  'home feed recall must not filter by author type; human/non-human only affects ranking order',
);

assert.match(
  feedRankingService,
  /function getFeedAuthorDisplayPriority[\s\S]*user\?\.userType === 'NORMAL'/,
  'home feed should keep author type as a ranking-only display priority',
);

assert.match(
  homeFeedService,
  /HOME_FEED_READ_CACHE_VERSION\s*=\s*'v11-config-driven-category-refs'[\s\S]*home-feed:result:\$\{HOME_FEED_READ_CACHE_VERSION\}/,
  'home feed result cache should stay versioned after category reference and avatar activity payload changes',
);

assert.match(
  feedReadCacheService,
  /private touchEntry\(key: string, entry: CacheEntry<unknown>\)[\s\S]*this\.entries\.delete\(key\)[\s\S]*this\.entries\.set\(key, entry\)/,
  'feed read cache should support LRU-style touch on cache hits',
);

assert.match(
  feedReadCacheService,
  /if \(cached && cached\.expiresAt > now\) \{[\s\S]*this\.touchEntry\(key, cached\)[\s\S]*return cached\.value as T;/,
  'feed read cache getOrLoad hits should refresh eviction order without extending TTL',
);

assert.match(
  feedReadCacheService,
  /if \(cached\.expiresAt <= Date\.now\(\)\)[\s\S]*return null;[\s\S]*this\.touchEntry\(key, cached\)[\s\S]*return cached\.value as T;/,
  'feed read cache direct get hits should refresh eviction order without extending TTL',
);

assert.match(
  recommendationContext,
  /RECOMMENDATION_CONTEXT_SOFT_TIMEOUT_MS\s*=\s*140/,
  'logged-in recommendation context should keep a soft timeout so cold personalization cannot block first feed paint',
);

assert.match(
  recommendationContext,
  /RECOMMENDATION_SHARE_CONTEXT_TAKE[\s\S]*prisma\.postShare\.findMany[\s\S]*addPreferenceFromPost\(context, share\.post/,
  'logged-in recommendation context should use real share events as a strong positive preference signal',
);

assert.match(
  rankingUtils,
  /RECOMMENDATION_FIRST_PAGE_FAST_MAX\s*=\s*72/,
  'logged-in recommendation first page should keep a bounded fast-path candidate window',
);

assert.match(
  prismaSchema,
  /model PostRankingScore \{[\s\S]*recommendationScore\s+Float\s+@default\(0\)[\s\S]*@@index\(\[recommendationScore\(sort: Desc\), postId\]/,
  'PostRankingScore should only expose the active recommendation rank path',
);

assert.match(
  rankingSyncSql,
  /INSERT INTO "PostRankingScore"[\s\S]*"recommendationScore"/,
  'rank sync should still maintain recommendation scores',
);

assert.match(
  rankingSyncSql,
  /ON CONFLICT \("postId"\) DO UPDATE SET[\s\S]*"recommendationScore" = EXCLUDED\."recommendationScore"/,
  'rank sync should refresh existing recommendation scores when the scoring algorithm changes',
);

assert.match(
  performanceBudget,
  /ENDPOINT_TIERS[\s\S]*health:\s*\{[\s\S]*p99Ms:\s*250[\s\S]*reference:\s*\{[\s\S]*p99Ms:\s*400[\s\S]*feed:\s*\{[\s\S]*p99Ms:\s*800[\s\S]*detail:\s*\{[\s\S]*p99Ms:\s*700[\s\S]*private:\s*\{[\s\S]*p99Ms:\s*900/,
  'production API performance budget should keep all core p99 tiers below one second',
);

assert.match(
  performanceBudget,
  /\/api\/home\/feed\?feed=recommended&limit=20/,
  'feed concurrency performance should cover the dedicated recommended home feed',
);

assert.match(
  productionSmoke,
  /assertFeed\('\/api\/home\/feed\?feed=recommended&limit=1'\)/,
  'production smoke should cover the dedicated recommended home feed contract',
);

assert.match(
  apiClient,
  /getPostsPage[\s\S]*categoryMetaFilters/,
  'legacy client feed requests should keep structured filter support',
);

assert.match(
  apiClient,
  /getHomeFeedPage[\s\S]*\/api\/home\/feed\?[\s\S]*categoryMetaFilters/,
  'home feed requests should keep the dedicated structured filter endpoint',
);

assert.match(
  homeFeedQueries,
  /useInfiniteQuery[\s\S]*getHomeFeedPage[\s\S]*getNextPageParam/,
  'home feed should keep paginated dedicated feed fetching',
);

assert.equal(
  (homeFeedQueries.match(/readHomeFeedSnapshot\(/g) || []).length,
  1,
  'home feed initial state should read the local snapshot once per query key',
);

assert.match(
  homeFeedQueries,
  /function getSnapshotInitialState[\s\S]*initialDataUpdatedAt: snapshot\.updatedAt/,
  'home feed should derive initial data and timestamp from the same snapshot read',
);

assert.match(
  storageUtils,
  /export function getStorageKeysByPrefix[\s\S]*storage\.key\(index\)/,
  'safe storage should expose prefix key iteration for cache cleanup paths',
);

assert.doesNotMatch(
  homeFeedSnapshotCache,
  /window\.localStorage/,
  'home feed snapshot cleanup must use safe storage instead of raw localStorage',
);

assert.match(
  homeFeedSnapshotCache,
  /getStorageKeysByPrefix\(HOME_FEED_SNAPSHOT_PREFIX\)/,
  'home feed snapshot cleanup should work with the safe storage fallback',
);

assert.match(
  homePage,
  /DEFAULT_HOME_TOPIC_TAB_ID/,
  'home page should fall back to a valid public topic tab',
);

assert.match(
  homeTopicTabs,
  /DEFAULT_HOME_TOPIC_TAB_ID: HomeTopicTabId = 'hot'/,
  'public home default should stay on the recommended hot tab',
);

assert.match(
  homePage,
  /from ['"]@\/features\/home\/homeStructuredFilterUtils['"]/,
  'home page should import structured-filter pure helpers from the lightweight utility module, not the lazy sheet facade',
);

assert.doesNotMatch(
  `${homePage}\n${homeTopicTabs}`,
  /from ['"]@\/features\/home\/HomeStructuredFilterSheet['"]|from ['"]\.\/HomeStructuredFilterSheet['"]/,
  'home shell and topic tabs must not import pure helper types or functions from the structured-filter sheet facade',
);

assert.match(
  homeChrome,
  /import \{ HomeStructuredFilterSheet \} from ['"]\.\/HomeStructuredFilterSheet['"]/,
  'home chrome should keep the structured-filter sheet dependency limited to the sheet component itself',
);

assert.doesNotMatch(
  homeChrome,
  /import\s+\{[^}]*HomeStructuredFilterFieldItem[^}]*\}\s+from ['"]\.\/HomeStructuredFilterSheet['"]/,
  'home chrome must import structured-filter field-item types from the lightweight utility module',
);

assert.doesNotMatch(
  homeStructuredFilterSheet,
  /export\s+(?:type\s+)?\{[\s\S]*homeStructuredFilterUtils/,
  'structured-filter sheet facade must not re-export utility helpers or types into the first-paint import path',
);

assert.doesNotMatch(
  `${homePage}\n${homeStructuredFilterUtils}`,
  /@\/features\/post-create\/postCreateCategoryMeta/,
  'home startup code must not depend on post-create category-meta editing logic',
);

assert.match(
  `${homePage}\n${homeStructuredFilterUtils}`,
  /@\/features\/category\/categoryMetaSchema/,
  'home startup code should reuse the lightweight shared category-meta schema module',
);

assert.match(
  categoryMetaSchema,
  /export function normalizePublishCategorySchema[\s\S]*export function findCategoryMetaSchema/,
  'shared category-meta schema module should own schema normalization and category-schema matching',
);

assert.deepEqual(
  staticListReturnRestoreConsumers,
  [],
  'list pages must not statically import list-return restore implementation; use the lightweight lazy restorer boundary instead',
);

for (const [source, label] of [
  [homePage, 'home page'],
  [categoryFeedPage, 'category feed page'],
  [profileMobilePage, 'profile page'],
  [userSpacePage, 'user space page'],
]) {
  assert.match(
    source,
    /from ['"]@\/utils\/ListReturnScrollRestorer['"]/,
    `${label} should import the lightweight lazy list-return restorer boundary`,
  );
  assert.match(
    source,
    /<ListReturnScrollRestorer[\s\S]*scope=\{listReturnScope\}[\s\S]*ready=/,
    `${label} should mount list-return restoration through the lazy boundary with the route scope and ready gate`,
  );
}

assert.doesNotMatch(
  listReturnScroll,
  /useLayoutEffect|export function useListReturnScroll/,
  'list-return click recording should stay split from the route restore hook so card-only code does not inflate the home startup path',
);

assert.match(
  listReturnScrollRestore,
  /export function useListReturnScroll[\s\S]*LIST_RETURN_RESTORE_EVENT[\s\S]*export function ListReturnScrollRestorer/,
  'list-return restore hook should live in a route-owned module that can be imported without card click-recording helpers',
);

assert.match(
  listReturnScrollRestorer,
  /lazy\(\(\) =>[\s\S]*import\('\.\/listReturnScrollRestore'\)[\s\S]*LazyListReturnScrollRestorer/,
  'list-return restorer boundary should lazy-load the restore implementation after the first route render',
);

assert.doesNotMatch(
  [
    appShell,
    appBottomNavigation,
    authContext,
    useDataConfig,
    useFeedExposureViews,
    homeFeedQueries,
    homeRefresh,
    useHomeNotificationSummary,
    useHomeBootstrapPrefetch,
    browserPushResync,
    pushNotification,
  ].join('\n'),
  /@\/services\/api['"]|@\/services\/api["]|from ['"]\.\/api['"]|from ["']\.\/api["']/,
  'home startup hooks and app shell must use apiCore/homeStartupApi instead of the broad API endpoint facade',
);

assert.doesNotMatch(
  browserPushResync,
  /import\s+\{?\s*syncBrowserPushSubscription[\s\S]*from ['"]@\/services\/pushNotification['"]/,
  'browser push resync must not statically load the full push-notification client into app startup',
);

assert.match(
  browserPushResync,
  /await import\(['"]@\/services\/pushNotification['"]\)/,
  'browser push resync should load the push-notification client only after permission and service-worker checks pass',
);

assert.doesNotMatch(
  appShell,
  /from ['"]@\/hooks\/useMobileAddressBar['"]/,
  'desktop app startup must not statically load the mobile address-bar and keyboard viewport controller',
);

assert.match(
  appShell,
  /lazy\(\(\) => import\(['"]@\/app\/MobileAddressBarController['"]\)\)/,
  'mobile address-bar and keyboard viewport handling should be isolated behind a mobile-only controller chunk',
);

assert.match(
  mobileAddressBarController,
  /useMobileAddressBar\(pathname\)/,
  'mobile address-bar controller should preserve the pathname reset behavior owned by the original hook',
);

assert.match(
  apiClient,
  /from ['"]\.\/apiCore['"][\s\S]*export \{ ApiError, apiFetch \} from ['"]\.\/apiCore['"]/,
  'broad API facade should reuse apiCore so lazy-route errors share the same ApiError class',
);

assert.doesNotMatch(
  apiClient,
  /export class ApiError|export async function apiFetch|const inFlightGetRequests/,
  'broad API facade must not own request core state that would force endpoint helpers into startup chunks',
);

assert.match(
  apiCore,
  /export class ApiError[\s\S]*export async function apiFetch[\s\S]*export async function fetcher[\s\S]*export async function pageFetcher/,
  'apiCore should own request timeout, retry, dedupe, JSON parsing, and shared ApiError behavior',
);

assert.match(
  homeStartupApi,
  /getHomeBootstrap[\s\S]*getHomeFeedPage[\s\S]*getHomeNotificationSummary[\s\S]*recordPostViews/,
  'homeStartupApi should own the small set of endpoints required by home first paint and feed exposure',
);

assert.doesNotMatch(
  homeStartupApi,
  /\/api\/topics\/|\/api\/me\/following|\/api\/me\/fans|\/api\/me\/promotions|\/api\/promotion\/book-batch|\/api\/me\/orders/,
  'homeStartupApi must not include social, promotion, recharge, or profile-only endpoints',
);

assert.match(
  homePage,
  /from ['"]@\/hooks\/useHomeNotificationSummary['"]/,
  'home page should import the home notification summary hook directly instead of loading the broader social hooks module',
);

assert.doesNotMatch(
  homePage,
  /from ['"]@\/hooks\/useDataSocial['"]/,
  'home page must not import the social hooks module for home-only notification summary polling',
);

assert.doesNotMatch(
  useDataSocial,
  /useHomeNotificationSummary|FEED_SEEN_STORAGE_KEYS|LIVE_BADGE_STALE_TIME|getHomeNotificationSummary/,
  'social hooks module must not own home notification polling or seen-state storage',
);

assert.match(
  useHomeNotificationSummary,
  /export function useHomeNotificationSummary[\s\S]*getHomeNotificationSummary[\s\S]*markFeedSeen/,
  'home notification polling should live in its own lightweight startup hook',
);

assert.doesNotMatch(
  [
    appShell,
    appBottomNavigation,
    usePostCreateFocusIntentCapture,
    publishIconButton,
  ].join('\n'),
  /@\/utils\/postCreateFocusBridge|@\/utils\/postCreateFocusRestore/,
  'home startup and navigation surfaces must import create-focus trigger/prime helpers directly, not the compatibility bridge or create-page restore module',
);

assert.doesNotMatch(
  postCreateFocusPrime,
  /focusPostCreateComposer|shouldRestorePostCreateComposerFocus/,
  'post-create focus priming must not import create-page textarea restore logic into app startup',
);

assert.match(
  postCreateFocusRestore,
  /export function focusPostCreateComposer[\s\S]*schedulePostCreateBridgeRelease/,
  'post-create textarea restore should live in the create route module path only',
);

console.log('[feed-performance-guards] passed');
