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
const postCreatePage = read('src/features/post-create/PostCreatePage.tsx');
const postCreatePageSections = read('src/features/post-create/postCreatePageSections.tsx');
const postCreateFocusBridge = read('src/utils/postCreateFocusBridge.ts');
const publishIconButton = read('src/ui/PublishIconButton.tsx');
const bottomNavigation = read('src/app/AppBottomNavigation.tsx');
const appShell = read('src/app/AppShell.tsx');
const authRoute = read('src/app/AppRequireAuthRoute.tsx');
const authRequiredState = read('src/ui/AuthRequiredState.tsx');
const pageHeader = read('src/ui/PageHeader.tsx');
const homeTopbar = read('src/features/home/HomeTopbar.tsx');
const homePage = read('src/pages/Home.tsx');
const brandAbout = read('src/pages/BrandAbout.tsx');
const notFound = read('src/pages/NotFound.tsx');
const homeRefresh = read('src/hooks/useHomeRefresh.ts');
const listLoadMoreState = read('src/ui/ListLoadMoreState.tsx');
const postDetail = read('src/pages/PostDetailLegacy.tsx');
const postCard = read('src/features/post/PostCard.tsx');
const categoryFeed = read('src/pages/CategoryFeedMobile.tsx');
const homePageSource = read('src/pages/Home.tsx');
const sponsorPage = read('src/features/sponsor/SponsorMobilePage.tsx');
const profileRoute = read('src/pages/ProfileMobile.tsx');
const messagesPage = read('src/pages/MessagesMobile.tsx');
const messagesStyles = read('src/styles/features/messages.css');
const tuiPlusLinkEditor = read('src/pages/TuiPlusLinkEditorMobile.tsx');
const profileBioEditor = read('src/pages/ProfileBioEditorMobile.tsx');
const notificationSettings = read('src/pages/NotificationSettings.tsx');
const rechargePage = read('src/pages/RechargeMobile.tsx');
const referralInvitePageContent = read('src/features/sponsor/ReferralInvitePageContent.tsx');
const transactionHistoryPage = read('src/pages/TransactionHistoryMobile.tsx');
const referralInviteRecordsPage = read('src/pages/ReferralInviteRecordsMobile.tsx');
const promotionEffectsHistoryPage = read('src/pages/PromotionEffectsHistory.tsx');
const userSpacePage = read('src/pages/UserSpace.tsx');
const promoteHistoryPage = read('src/pages/PromoteHistory.tsx');

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
  homePageSource.includes('const loadMoreRequestIdRef = useRef(0);') &&
    homePageSource.includes('loadMoreRequestIdRef.current === requestId') &&
    categoryFeed.includes('const requestGenerationRef = useRef(0);') &&
    categoryFeed.includes('requestGenerationRef.current === requestGeneration'),
  'Old load-more requests must not release locks or leak errors into a newly selected feed.',
);

assert(
  !homeRefresh.includes('scrollHomeFeedToTop();') &&
    homeRefresh.includes('await queryClient.cancelQueries({ queryKey: activeQueryKey });'),
  'Manual refresh must preserve the current reading position when the network request fails.',
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
  postCard.includes('setIsQuoteSheetOpen(false); setIsCommentSheetOpen(true);') &&
    postCard.includes('setIsCommentSheetOpen(false); setIsQuoteSheetOpen(true);'),
  'Post card comment and quote actions must close the competing sheet before opening a new one under rapid tapping.',
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
  postCreateFocusBridge.includes('export const POST_CREATE_FOCUS_TRIGGER_ATTR') &&
    postCreateFocusBridge.includes('export function markPostCreateComposerFocusIntent()') &&
    postCreateFocusBridge.includes('export function primePostCreateComposerFocus()') &&
    postCreateFocusBridge.includes('installPostCreateFocusIntentCapture'),
  'Create focus bridge must preserve click intent across route changes and multiple create entry points.',
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
    appShell.includes('guardedOpenCreate') &&
    appShell.includes('cooldownMs: 520'),
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
  profileRoute.includes('guardedOpenProfileSettings') &&
    profileRoute.includes('cooldownMs: 520') &&
    profileRoute.includes('mode: \'drop\''),
  'Profile settings topbar entry must be guarded so rapid taps do not repeatedly proxy-click the settings sheet trigger.',
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
    referralInvitePageContent.includes('await withdrawalMutation.mutateAsync().catch(() => undefined);') &&
    referralInvitePageContent.includes('await convertMutation.mutateAsync().catch(() => undefined);') &&
    referralInvitePageContent.includes('onConfirm={() => void guardedConfirmWithdrawal()}') &&
    referralInvitePageContent.includes('onConfirm={() => void guardedConfirmConversion()}') &&
    referralInvitePageContent.includes('onClick={() => void guardedRefetchReferralSummary()}') &&
    !referralInvitePageContent.includes('onClick={() => void summaryQuery.refetch()}'),
  'Referral withdrawal, conversion, and summary retry actions must use interaction guards across payment mutations and reloads.',
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
