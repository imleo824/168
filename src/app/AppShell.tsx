import { BrowserRouter as Router, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { CirclePlus, House, Info, MessagesSquare, ShieldCheck, TrendingUp, UserRound } from 'lucide-react';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import Home from '@/pages/Home';
import { useMobileAddressBar } from '@/hooks/useMobileAddressBar';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { useScrollLock } from '@/utils/scrollLock';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusBridge';
import * as api from '@/services/api';
import PageHeader from '@/ui/PageHeader';
import ProfileIconButton from '@/ui/ProfileIconButton';
import PublishIconButton from '@/ui/PublishIconButton';
import { PageLoader } from '@/ui/PageLoader';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { HomePageSkeleton, Skeleton } from '@/ui/Skeleton';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageContentShell from '@/ui/PageContentShell';
import { warmupNavigationIntent } from '@/utils/routeWarmups';
import AppBottomNavigation from '@/app/AppBottomNavigation';
import AppRequireAuthRoute from '@/app/AppRequireAuthRoute';
import AppRequireTuiPlusRoute from '@/app/AppRequireTuiPlusRoute';
import { APP_ROUTES } from '@/app/routePaths';
import { useBrowserPushResync } from '@/app/useBrowserPushResync';
import { useHomeBootstrapPrefetch } from '@/app/useHomeBootstrapPrefetch';
import { usePostCreateFocusIntentCapture } from '@/app/usePostCreateFocusIntentCapture';
import { useReferralInviteAttributionCapture } from '@/app/useReferralInviteAttributionCapture';
import { isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import { useHomeOnlineCount } from '@/features/home/useHomeOnlineCount';
import { formatOptionalOnlineCount } from '@/features/home/onlinePresence';

const AuthModal = lazy(() => import('@/features/auth/AuthModal'));
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
const Chat = lazy(() => import('@/pages/Chat'));
const Messages = lazy(() => import('@/pages/MessagesMobile'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const UserSpace = lazy(() => import('@/pages/UserSpace'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const CategoryFeed = lazy(() => import('@/pages/CategoryFeedMobile'));
const BrandAbout = lazy(() => import('@/pages/BrandAbout'));

const DESKTOP_NAV_ITEMS = [
  { to: '/', label: '首页', icon: House, end: true },
  { to: '/chat', label: '聊天', icon: MessagesSquare, end: false },
  { to: '/create', label: '发推', icon: CirclePlus, end: false },
  { to: APP_ROUTES.sponsor, label: '买曝光', icon: TrendingUp, end: false },
  { to: '/profile', label: '我的', icon: UserRound, end: false },
  { to: '/about', label: '关于推推', icon: Info, end: false },
] as const;

const PAGE_OWNED_HEADER_PREFIXES = [
  '/post/',
  '/category/',
  '/user/',
  '/profile',
  '/messages',
  '/settings',
  APP_ROUTES.sponsor,
  APP_ROUTES.invite,
  '/create',
  '/chat',
  APP_ROUTES.promote,
  APP_ROUTES.promotions,
  APP_ROUTES.promotionEffects,
  APP_ROUTES.recharge,
  APP_ROUTES.tuiPlus,
  APP_ROUTES.transactions,
  '/168wc',
  '/about',
  '/404',
];

function hasPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function isPageOwnedHeaderPath(pathname: string) {
  return pathname === '/' || hasPrefix(pathname, PAGE_OWNED_HEADER_PREFIXES);
}

function getDesktopSurfaceKind(pathname: string) {
  if (pathname === '/chat' || pathname === '/messages') return 'conversation';
  if (pathname.startsWith('/post/')) return 'detail';
  if (pathname === '/create') return 'compose';
  if (
    pathname === APP_ROUTES.sponsor ||
    pathname === APP_ROUTES.invite ||
    pathname === APP_ROUTES.inviteRecords ||
    pathname === APP_ROUTES.promote ||
    pathname === APP_ROUTES.promotions ||
    pathname === APP_ROUTES.promotionEffects ||
    pathname === APP_ROUTES.recharge ||
    pathname === APP_ROUTES.transactions ||
    pathname === APP_ROUTES.tuiPlus ||
    pathname === APP_ROUTES.profileBioEditor ||
    pathname === APP_ROUTES.tuiPlusLinkEditor ||
    pathname.startsWith(`${APP_ROUTES.tuiPlusLinkEditor}/`) ||
    pathname.startsWith('/settings/')
  ) return 'workspace';
  if (pathname === '/profile' || pathname.startsWith('/profile/') || pathname.startsWith('/user/')) return 'profile';
  if (pathname === '/about') return 'content';
  if (pathname === '/' || pathname.startsWith('/category/')) return 'feed';
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
        if (error instanceof api.ApiError) {
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

function Navigation() {
  const { user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const openProfile = () => {
    warmupNavigationIntent('profile');
    navigate('/profile');
  };

  const openCreate = () => {
    if (location.pathname === '/create') return;
    warmupNavigationIntent('create');
    requireAuth(() => {
      primePostCreateComposerFocus();
      navigate('/create');
    });
  };

  const { guarded: guardedOpenCreate } = useInteractionGuard(openCreate, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });

  if (isPageOwnedHeaderPath(location.pathname)) return null;

  return (
    <PageHeader
      title=" "
      showBack={false}
      className="ui-layer-header"
      titleClassName="sr-only"
      left={
        <ProfileIconButton
          onClick={openProfile}
          photoUrl={user?.photoUrl}
          displayName={user?.displayName}
          userId={user?.id}
          isTuiPlus={isTuiPlusActive(user)}
        />
      }
      right={
        <PublishIconButton
          onClick={() => void guardedOpenCreate()}
          ariaLabel="发布内容"
          title="发布内容"
          variant="top"
        />
      }
    />
  );
}

function AuthModalFallback() {
  useScrollLock(true, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-auth-scroll]')),
  });

  return (
    <div className="ui-auth-fallback-shell" data-auth-scroll>
      <div className="ui-auth-fallback-panel" role="status" aria-label="正在加载登录面板">
        <div className="ui-auth-fallback-header">
          <Skeleton className="ui-auth-fallback-logo" />
          <Skeleton className="ui-auth-fallback-title" />
        </div>
        <div className="ui-auth-fallback-body">
          <div className="ui-auth-fallback-tabs">
            <Skeleton className="ui-auth-fallback-tab" />
            <Skeleton className="ui-auth-fallback-tab" />
          </div>
          <div className="ui-auth-fallback-form">
            <Skeleton className="ui-auth-fallback-field" />
            <Skeleton className="ui-auth-fallback-field" />
            <Skeleton className="ui-auth-fallback-submit" />
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
    <ErrorBoundary resetKeys={[showAuthModal]}>
      <Suspense fallback={<AuthModalFallback />}>
        <AuthModal isOpen={showAuthModal} onClose={closeAuthModal} isAuthenticating={isAuthenticating} />
      </Suspense>
    </ErrorBoundary>
  );
}

function AppDesktopSidebar() {
  return (
    <aside className="app-desktop-sidebar" aria-label="桌面主导航">
      <NavLink className="app-desktop-brand" to="/" aria-label="返回首页">
        <span className="app-desktop-brand-mark">T</span>
        <span className="app-desktop-brand-copy">
          <span className="app-desktop-brand-name">推推</span>
          <span className="app-desktop-brand-subtitle">匿名分类信息网</span>
        </span>
      </NavLink>
      <nav className="app-desktop-nav" aria-label="桌面导航">
        {DESKTOP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (
                `app-desktop-nav-item${isActive ? ' app-desktop-nav-item--active' : ''}`
              )}
            >
              <Icon className="app-desktop-nav-icon" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

function AppDesktopContextRail({ onlineCountText }: { onlineCountText: string }) {
  return (
    <aside className="app-desktop-context-rail" aria-label="桌面快捷入口">
      <section className="app-desktop-context-card">
        <div className="app-desktop-context-kicker">当前在线</div>
        <div className="app-desktop-context-metric">
          <span className="app-desktop-context-dot" aria-hidden="true" />
          <span>{onlineCountText || '实时更新'}</span>
        </div>
      </section>
      <section className="app-desktop-context-card">
        <h2 className="app-desktop-context-title">快速操作</h2>
        <div className="app-desktop-context-actions">
          <NavLink className="app-desktop-context-action app-desktop-context-action--primary" to="/create">
            发布分类信息
          </NavLink>
          <NavLink className="app-desktop-context-action" to={APP_ROUTES.sponsor}>
            购买曝光
          </NavLink>
          <NavLink className="app-desktop-context-action" to="/about">
            了解推推
          </NavLink>
        </div>
      </section>
    </aside>
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
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;
  const onlineCount = useHomeOnlineCount({ enabled: true });
  const onlineCountText = formatOptionalOnlineCount(onlineCount);
  const isAdminRoute = pathname.startsWith('/168wc');
  const routeSurface = isAdminRoute ? 'admin' : 'user';
  const isUserSurface = routeSurface === 'user';
  const isChatRoute = isUserSurface && pathname === '/chat';
  const desktopSurfaceKind = isUserSurface ? getDesktopSurfaceKind(pathname) : 'admin';

  useMobileAddressBar(pathname);
  useBrowserPushResync(user?.id);
  useHomeBootstrapPrefetch(pathname === '/');
  usePostCreateFocusIntentCapture(Boolean(user));
  useReferralInviteAttributionCapture(location.search);

  const isRouteOverlay = isUserSurface && pathname.startsWith('/post/') && hasOverlayBackgroundLocation(location.state);
  useScrollLock(isRouteOverlay, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-route-overlay-scroll]')),
  });

  const appClassName = ['app-shell', isRouteOverlay ? 'app-shell--route-overlay' : ''].filter(Boolean).join(' ');
  const appShellWidth = isAdminRoute ? 'full' : 'bounded';

  return (
    <div
      className={appClassName}
      data-route-surface={routeSurface}
      data-desktop-surface={desktopSurfaceKind}
      data-chat-route-active={isChatRoute ? 'true' : undefined}
    >
      {isUserSurface ? <Navigation /> : null}
      {isUserSurface ? <AppDesktopSidebar /> : null}
      <div
        className="app-main app-shell-main"
        data-route-surface={routeSurface}
        data-desktop-surface={desktopSurfaceKind}
        data-app-shell-width={appShellWidth}
        data-bottom-nav-visible={isUserSurface ? 'true' : undefined}
        data-route-overlay-active={isRouteOverlay ? 'true' : undefined}
      >
        <ErrorBoundary resetKeys={[location.key, location.pathname]}>
          <Suspense fallback={location.pathname === '/' ? <HomePageSkeleton /> : <PageLoader />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/post/:id" element={<PostDetail />} />
              <Route path="/category/:id" element={<CategoryFeed />} />
              <Route path="/user/:id" element={<UserSpace />} />
              <Route path="/create" element={<AppRequireAuthRoute><PostCreate /></AppRequireAuthRoute>} />
              <Route path="/chat" element={<AppRequireAuthRoute><Chat /></AppRequireAuthRoute>} />
              <Route path="/messages" element={<AppRequireAuthRoute><Messages /></AppRequireAuthRoute>} />
              <Route path="/profile" element={<Profile />} />
              <Route path={APP_ROUTES.profileBioEditor} element={<AppRequireAuthRoute><ProfileBioEditor /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.tuiPlusLinkEditor} element={<AppRequireAuthRoute><AppRequireTuiPlusRoute benefit="profileLinks"><TuiPlusLinkEditor /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
              <Route path={`${APP_ROUTES.tuiPlusLinkEditor}/:target`} element={<AppRequireAuthRoute><AppRequireTuiPlusRoute benefit="profileLinks"><TuiPlusLinkEditor /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.tuiPlus} element={<AppRequireAuthRoute><TuiPlus /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.sponsor} element={<AppRequireAuthRoute><Sponsor /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.invite} element={<AppRequireAuthRoute><ReferralInvite /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.inviteRecords} element={<AppRequireAuthRoute><ReferralInviteRecords /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.promote} element={<AppRequireAuthRoute><AppRequireTuiPlusRoute benefit="promotionBooking"><Promote /></AppRequireTuiPlusRoute></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.promotions} element={<AppRequireAuthRoute><PromoteHistory /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.legacyPromoteHistory} element={<Navigate to={APP_ROUTES.promotions} replace state={location.state} />} />
              <Route path={APP_ROUTES.promotionEffects} element={<AppRequireAuthRoute><PromotionEffectsHistory /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.legacyPromotionEffects} element={<Navigate to={APP_ROUTES.promotionEffects} replace state={location.state} />} />
              <Route path={APP_ROUTES.recharge} element={<AppRequireAuthRoute><Recharge /></AppRequireAuthRoute>} />
              <Route path={APP_ROUTES.transactions} element={<AppRequireAuthRoute><TransactionHistory /></AppRequireAuthRoute>} />
              <Route path="/settings/notifications" element={<AppRequireAuthRoute><NotificationSettings /></AppRequireAuthRoute>} />
              <Route path="/168wc" element={<AdminRouteGate><Admin /></AdminRouteGate>} />
              <Route path="/about" element={<BrandAbout />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      {isUserSurface ? <AppDesktopContextRail onlineCountText={onlineCountText} /> : null}
      {isUserSurface ? <AppBottomNavigation /> : null}
      <GlobalAuthOverlay />
    </div>
  );
}

export default function AppShell() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        </Router>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
