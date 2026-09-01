type RouteSurfaceWarmupKey =
  | 'authModal'
  | 'profile'
  | 'sponsor'
  | 'postCreate'
  | 'postDetail'
  | 'userSpace'
  | 'categoryFeed'
  | 'messages'
  | 'promote'
  | 'recharge'
  | 'transactions'
  | 'tuiPlus'
  | 'referral'
  | 'notificationSettings'
  | 'about';

type NavigationIntent = 'auth' | 'profile' | 'sponsor' | 'create';

const ignoreRouteWarmupError = () => {};

const routeSurfaceWarmups: Record<RouteSurfaceWarmupKey, () => Promise<unknown>> = {
  authModal: () => import('@/features/auth/AuthModal'),
  profile: () => import('@/pages/ProfileMobile'),
  sponsor: () => import('@/pages/SponsorMobile'),
  postCreate: () => import('@/pages/PostCreate'),
  postDetail: () => import('@/pages/PostDetail'),
  userSpace: () => import('@/pages/UserSpace'),
  categoryFeed: () => import('@/pages/CategoryFeedMobile'),
  messages: () => import('@/pages/MessagesMobile'),
  promote: () => import('@/pages/PromoteMobile'),
  recharge: () => import('@/pages/RechargeMobile'),
  transactions: () => import('@/pages/TransactionHistoryMobile'),
  tuiPlus: () => import('@/pages/TuiPlusMobile'),
  referral: () => import('@/pages/ReferralInviteMobile'),
  notificationSettings: () => import('@/pages/NotificationSettings'),
  about: () => import('@/pages/BrandAbout'),
};

const routePathWarmupKeys: Record<string, RouteSurfaceWarmupKey> = {
  '/messages': 'messages',
  '/profile': 'profile',
  '/create': 'postCreate',
  '/sponsor': 'sponsor',
  '/invite': 'referral',
  '/promote': 'promote',
  '/recharge': 'recharge',
  '/transactions': 'transactions',
  '/tui-plus': 'tuiPlus',
  '/settings/notifications': 'notificationSettings',
  '/about': 'about',
};

const routeSurfaceWarmupCache = new Map<RouteSurfaceWarmupKey, Promise<unknown>>();

export function warmupRouteSurface(key: RouteSurfaceWarmupKey) {
  const cached = routeSurfaceWarmupCache.get(key);
  if (cached) return cached;

  const warmup = routeSurfaceWarmups[key]().catch((error) => {
    routeSurfaceWarmupCache.delete(key);
    throw error;
  });

  routeSurfaceWarmupCache.set(key, warmup);
  return warmup;
}

export function warmupRouteSurfaces(keys: readonly RouteSurfaceWarmupKey[]) {
  keys.forEach((key) => {
    void warmupRouteSurface(key).catch(ignoreRouteWarmupError);
  });
}

/** Start loading a user-surface chunk on navigation intent, never on page load. */
export function warmupRoutePath(pathname: string) {
  const key = routePathWarmupKeys[pathname];
  if (key) void warmupRouteSurface(key).catch(ignoreRouteWarmupError);
}

export function warmupNavigationIntent(intent: NavigationIntent) {
  switch (intent) {
    case 'create':
      warmupRouteSurfaces(['authModal', 'postCreate']);
      return;
    case 'profile':
      warmupRouteSurfaces(['authModal', 'profile']);
      return;
    case 'sponsor':
      warmupRouteSurfaces(['authModal', 'sponsor']);
      return;
    case 'auth':
    default:
      warmupRouteSurfaces(['authModal']);
  }
}
