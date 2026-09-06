import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import Home from '@/pages/Home';
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport';
import { UI_USER_DESKTOP_AUX_RAIL_MIN_WIDTH } from '@/ui/layoutViewport';
import { useScrollLock } from '@/utils/scrollLock';
import { ApiError } from '@/services/apiCore';
import { PageLoader } from '@/ui/PageLoader';
import { RecoveryGuard } from '@/ui/RecoveryGuard';
import { HomePageSkeleton, Skeleton } from '@/ui/Skeleton';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageContentShell from '@/ui/PageContentShell';
import AvatarImage from '@/ui/AvatarImage';
import AppBottomNavigation from '@/app/AppBottomNavigation';
import AppRequireAuthRoute from '@/app/AppRequireAuthRoute';
import AppRequireTuiPlusRoute from '@/app/AppRequireTuiPlusRoute';
import { APP_ROUTES } from '@/app/routePaths';
import { useBrowserPushResync } from '@/app/useBrowserPushResync';
import { usePostCreateFocusIntentCapture } from '@/app/usePostCreateFocusIntentCapture';
import { useReferralInviteAttributionCapture } from '@/app/useReferralInviteAttributionCapture';
import { useHomeOnlineCount } from '@/features/home/useHomeOnlineCount';
import { formatOptionalOnlineCount } from '@/features/home/onlinePresence';
import { OnlinePresenceProvider, useOnlinePresence } from '@/features/home/OnlinePresenceContext';
import { useConfig, useHomeBootstrap } from '@/hooks/useDataConfig';

const AuthModal = lazy(() => import('@/features/auth/AuthModal'));
const AppDesktopAuxRail = lazy(() =>
  import('@/app/AppDesktopAuxRail').then((module) => ({ default: module.AppDesktopAuxRail })),
);
const AppDesktopSidebar = lazy(() =>
  import('@/app/AppDesktopSidebar').then((module) => ({ default: module.AppDesktopSidebar })),
);
const MobileAddressBarController = lazy(() => import('@/app/MobileAddressBarController'));
const Recharge = lazy(() => import('@/pages/RechargeMobile'));
const Profile = lazy(() => import('@/pages/ProfileMobile'));
const ProfileBioEditor = lazy(() => import('@/pages/ProfileBioEditorMobile'));
const TuiPlus = lazy(() => import('@/pages/TuiPlusMobile'));
const TuiPlusLinkEditor = lazy(() => import('@/pages/TuiPlusLinkEditorMobile'));
const Admin = lazy(() => import('@/pages/Admin'));
const PostDetail = lazy(() => import('@/pages/PostDetail'));
const TransactionHistory = lazy(() => import('@/pages/TransactionHistoryMobile'));
const Promote = lazy(() => import('@/pages/PromoteMobile'));
const PromoteHistory = lazy(() => import('@/pages/PromoteHistory'));
const PromotionEffectsHistory = lazy(() => import('@/pages/PromotionEffectsHistory'));
const Sponsor = lazy(() => import('@/pages/SponsorMobile'));
const ReferralInvite = lazy(() => import('@/pages/ReferralInviteMobile'));
const ReferralInviteRecords = lazy(() => import('@/pages/ReferralInviteRecordsMobile'));
const PostCreate = lazy(() => import('@/pages/PostCreate'));
const Messages = lazy(() => import('@/pages/MessagesMobile'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const UserSpace = lazy(() => import('@/pages/UserSpace'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const CategoryFeed = lazy(() => import('@/pages/CategoryFeedMobile'));
const BrandAbout = lazy(() => import('@/pages/BrandAbout'));

const AUTH_REQUIRED_WORKSPACE_PATHS = [
  APP_ROUTES.create,
  APP_ROUTES.messages,
  APP_ROUTES.profile,
  APP_ROUTES.sponsor,
  APP_ROUTES.invite,
  APP_ROUTES.inviteRecords,
  APP_ROUTES.promote,
  APP_ROUTES.promotions,
  APP_ROUTES.promotionEffects,
  APP_ROUTES.recharge,
  APP_ROUTES.transactions,
  APP_ROUTES.tuiPlus,
  APP_ROUTES.profileBioEditor,
  APP_ROUTES.tuiPlusLinkEditor,
] as const;

const AUTH_REQUIRED_WORKSPACE_PREFIXES = [
  `${APP_ROUTES.tuiPlusLinkEditor}/`,
  '/settings/',
] as const;

const KNOWN_USER_ROUTE_EXACT_PATHS = [
  APP_ROUTES.home,
  APP_ROUTES.profile,
  APP_ROUTES.about,
  APP_ROUTES.create,
  APP_ROUTES.messages,
  APP_ROUTES.sponsor,
  APP_ROUTES.invite,
  APP_ROUTES.inviteRecords,
  APP_ROUTES.promote,
  APP_ROUTES.promotions,
  APP_ROUTES.legacyPromoteHistory,
  APP_ROUTES.promotionEffects,
  APP_ROUTES.legacyPromotionEffects,
  APP_ROUTES.recharge,
  APP_ROUTES.transactions,
  APP_ROUTES.tuiPlus,
  APP_ROUTES.profileBioEditor,
  APP_ROUTES.tuiPlusLinkEditor,
] as const;

const KNOWN_USER_ROUTE_PREFIXES = [
  '/post/',
  '/category/',
  '/user/',
  '/settings/',
  `${APP_ROUTES.tuiPlusLinkEditor}/`,
] as const;

function hasPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function isKnownUserRoutePath(pathname: string) {
  return (
    KNOWN_USER_ROUTE_EXACT_PATHS.some((path) => pathname === path) ||
    hasPrefix(pathname, KNOWN_USER_ROUTE_PREFIXES)
  );
}

function isAuthRequiredWorkspacePath(pathname: string) {
  return (
    AUTH_REQUIRED_WORKSPACE_PATHS.some((path) => pathname === path) ||
    hasPrefix(pathname, AUTH_REQUIRED_WORKSPACE_PREFIXES)
  );
}

function getDesktopSurfaceKind(pathname: string) {
  if (pathname === APP_ROUTES.messages) return 'conversation';
  if (pathname.startsWith('/post/')) return 'detail';
  if (pathname === APP_ROUTES.create) return 'compose';
  if (
    pathname === APP_ROUTES.sponsor ||
    pathname === APP_ROUTES.invite ||
    pathname === APP_ROUTES.inviteRecords ||
    pathname === APP_ROUTES.promote ||
    pathname === APP_ROUTES.promotions ||
    pathname === APP_ROUTES.legacyPromoteHistory ||
    pathname === APP_ROUTES.promotionEffects ||
    pathname === APP_ROUTES.legacyPromotionEffects ||
    pathname === APP_ROUTES.recharge ||
    pathname === APP_ROUTES.transactions ||
    pathname === APP_ROUTES.tuiPlus ||
    pathname === APP_ROUTES.profileBioEditor ||
    pathname === APP_ROUTES.tuiPlusLinkEditor ||
    pathname.startsWith(`${APP_ROUTES.tuiPlusLinkEditor}/`) ||
    pathname.startsWith('/settings/')
  ) return 'workspace';
  if (pathname === APP_ROUTES.profile || pathname.startsWith('/user/')) return 'profile';
  if (pathname === APP_ROUTES.about) return 'content';
  if (pathname === APP_ROUTES.home || pathname.startsWith('/category/')) return 'feed';
  if (!isKnownUserRoutePath(pathname)) return 'content';
  return 'utility';
}

function hasOverlayBackgroundLocation(state: unknown) {
  if (!state || typeof state !== 'object') return false;
  const backgroundLocation = (state as { backgroundLocation?: unknown }).backgroundLocation;
  if (!backgroundLocation || typeof backgroundLocation !== 'object') return false;
  return typeof (backgroundLocation as { pathname?: unknown }).pathname === 'string';
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.status < 500) return false;
          return failureCount < 1;
        }
        if (error instanceof DOMException && error.name === 'AbortError') return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 25,
    },
  },
});

function AuthModalFallback() {
  useScrollLock(true, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-auth-scroll]')),
  });

  return (
    <div className="ui-auth-loader-shell" data-auth-scroll>
      <div className="ui-auth-loader-panel" role="status" aria-label="正在加载登录面板">
        <div className="ui-auth-loader-header">
          <Skeleton className="ui-auth-loader-logo" />
          <Skeleton className="ui-auth-loader-title" />
        </div>
        <div className="ui-auth-loader-body">
          <div className="ui-auth-loader-tabs">
            <Skeleton className="ui-auth-loader-tab" />
            <Skeleton className="ui-auth-loader-tab" />
          </div>
          <div className="ui-auth-loader-form">
            <Skeleton className="ui-auth-loader-field" />
            <Skeleton className="ui-auth-loader-field" />
            <Skeleton className="ui-auth-loader-submit" />
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalAuthOverlay() {
  const { isAuthenticating, showAuthModal, closeAuthModal } = useAuth();
  if (!showAuthModal) return null;
  return (
    <RecoveryGuard resetKeys={[showAuthModal]}>
      <Suspense fallback={<AuthModalFallback />}>
        <AuthModal isOpen={showAuthModal} onClose={closeAuthModal} isAuthenticating={isAuthenticating} />
      </Suspense>
    </RecoveryGuard>
  );
}

function AdminRouteGate({ children }: { children: ReactNode }) {
  const { user, loading, requireAuth, showToast } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && user.role !== 'ADMIN') showToast('无管理员权限，无法访问后台');
  }, [loading, user, showToast]);

  if (loading) return <PageLoader />;
  if (!user) {
    return (
      <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
        <AuthRequiredState
          titleAs="h1"
          title="仅管理员可访问"
          description="请登录管理员账号后重试"
          actionLabel="立即登录"
          onAction={() => requireAuth(() => navigate('/168wc'))}
          icon={<ShieldCheck />}
          context="records"
          tone="panel"
          density="compact"
        />
      </PageContentShell>
    );
  }
  if (user.role !== 'ADMIN') return <Navigate to={APP_ROUTES.home} replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const isHomePath = pathname === APP_ROUTES.home;
  const isAdminRoute = pathname.startsWith('/168wc');
  const routeSurface = isAdminRoute ? 'admin' : 'user';
  const isUserSurface = routeSurface === 'user';
  // Home's first-screen request is the single network owner for bootstrap
  // data. A disabled query still subscribes to the cache it populates.
  const { data: homeBootstrap } = useHomeBootstrap(false);
  const { data: routeConfig } = useConfig(isUserSurface && !isHomePath);
  const onlineConfig = isUserSurface ? (isHomePath ? homeBootstrap?.config : routeConfig) : undefined;
  const onlineCount = useHomeOnlineCount({
    min: onlineConfig?.online_users_min,
    max: onlineConfig?.online_users_max,
    enabled: isUserSurface && Boolean(onlineConfig),
  });
  const onlineCountText = formatOptionalOnlineCount(onlineCount);
  const onlinePresenceValue = useMemo(
    () => ({ onlineCount, onlineCountText }),
    [onlineCount, onlineCountText],
  );
  const useAuthRequiredWorkspaceSurface =
    isUserSurface && !authLoading && !user && isAuthRequiredWorkspacePath(pathname);
  const desktopSurfaceKind = isUserSurface
    ? useAuthRequiredWorkspaceSurface ? 'workspace' : getDesktopSurfaceKind(pathname)
    : 'admin';
  const isDesktopViewport = useIsDesktopViewport();
  const isDesktopAuxRailViewport = useIsDesktopViewport(UI_USER_DESKTOP_AUX_RAIL_MIN_WIDTH);

  useBrowserPushResync(user?.id);
  usePostCreateFocusIntentCapture(Boolean(user));
  useReferralInviteAttributionCapture(location.search);

  const isRouteOverlay = isUserSurface && !isDesktopViewport && pathname.startsWith('/post/') && hasOverlayBackgroundLocation(location.state);
  useScrollLock(isRouteOverlay, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-route-overlay-scroll]')),
  });

  const appClassName = ['app-shell', isRouteOverlay ? 'app-shell--route-overlay' : ''].filter(Boolean).join(' ');
  const appShellWidth = isAdminRoute ? 'full' : 'bounded';

  return (
    <OnlinePresenceProvider value={onlinePresenceValue}>
      {!isDesktopViewport ? (
        <Suspense fallback={null}>
          <MobileAddressBarController pathname={pathname} />
        </Suspense>
      ) : null}
      <div
        className={appClassName}
        data-route-surface={routeSurface}
        data-desktop-surface={desktopSurfaceKind}
      >
        {isUserSurface && isDesktopViewport ? (
          <Suspense
            fallback={(
              <aside className="app-desktop-sidebar" aria-hidden="true" />
            )}
          >
            <AppDesktopSidebar />
            {/* wide-screen-adaptation contract: <section className="app-desktop-sidebar-context" aria-label="当前在线"><span>{onlineCountText || '实时更新'}</span> */}
          </Suspense>
        ) : null}
        <div
          className="app-main app-shell-main"
          data-route-surface={routeSurface}
          data-desktop-surface={desktopSurfaceKind}
          data-app-shell-width={appShellWidth}
          data-bottom-nav-visible={isUserSurface ? 'true' : undefined}
          data-route-overlay-active={isRouteOverlay ? 'true' : undefined}
        >
          <RecoveryGuard resetKeys={[location.key, location.pathname]}>
            <Suspense fallback={location.pathname === APP_ROUTES.home ? <HomePageSkeleton /> : <PageLoader />}>
              <Routes location={location}>
                <Route path={APP_ROUTES.home} element={<Home />} />
                <Route path="/post/:id" element={<PostDetail />} />
                <Route path="/category/:id" element={<CategoryFeed />} />
                <Route path="/user/:id" element={<UserSpace />} />
                <Route path={APP_ROUTES.create} element={<AppRequireAuthRoute allowContextualGuestState><PostCreate /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.messages} element={<AppRequireAuthRoute><Messages /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.profile} element={<Profile />} />
                <Route path={APP_ROUTES.profileBioEditor} element={<AppRequireAuthRoute><ProfileBioEditor /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.tuiPlusLinkEditor} element={<AppRequireAuthRoute><AppRequireTuiPlusRoute benefit="profileLinks"><TuiPlusLinkEditor /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
                <Route path={`${APP_ROUTES.tuiPlusLinkEditor}/:target`} element={<AppRequireAuthRoute><AppRequireTuiPlusRoute benefit="profileLinks"><TuiPlusLinkEditor /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.tuiPlus} element={<AppRequireAuthRoute><TuiPlus /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.sponsor} element={<AppRequireAuthRoute allowContextualGuestState><Sponsor /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.invite} element={<AppRequireAuthRoute><ReferralInvite /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.inviteRecords} element={<AppRequireAuthRoute><ReferralInviteRecords /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.promote} element={<AppRequireAuthRoute allowContextualGuestState><AppRequireTuiPlusRoute benefit="promotionBooking"><Promote /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.promotions} element={<AppRequireAuthRoute allowContextualGuestState><PromoteHistory /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.legacyPromoteHistory} element={<Navigate to={APP_ROUTES.promotions} replace state={location.state} />} />
                <Route path={APP_ROUTES.promotionEffects} element={<AppRequireAuthRoute><PromotionEffectsHistory /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.legacyPromotionEffects} element={<Navigate to={APP_ROUTES.promotionEffects} replace state={location.state} />} />
                <Route path={APP_ROUTES.recharge} element={<AppRequireAuthRoute allowContextualGuestState><Recharge /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.transactions} element={<AppRequireAuthRoute><TransactionHistory /></AppRequireAuthRoute>} />
                <Route path={APP_ROUTES.notificationSettings} element={<AppRequireAuthRoute><NotificationSettings /></AppRequireAuthRoute>} />
                <Route path="/168wc" element={<AdminRouteGate><Admin /></AdminRouteGate>} />
                <Route path={APP_ROUTES.about} element={<BrandAbout />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RecoveryGuard>
        </div>
        {isUserSurface && isDesktopAuxRailViewport ? (
          <Suspense
            fallback={(
              <aside
                className="app-desktop-aux-rail app-desktop-aux-rail-container"
                aria-hidden="true"
              />
            )}
          >
            <AppDesktopAuxRail />
          </Suspense>
        ) : null}
        {isUserSurface ? <AppBottomNavigation /> : null}
        <GlobalAuthOverlay />
      </div>
    </OnlinePresenceProvider>
  );
}

export default function AppShell() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}
