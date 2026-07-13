type RouteSurfaceWarmupKey =
  | 'authModal'
  | 'profile'
  | 'sponsor'
  | 'postCreate'
  | 'postDetail'
  | 'userSpace'
  | 'categoryFeed';

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
};

const routeSurfaceWarmupCache = new Map<RouteSurfaceWarmupKey, Promise<unknown>>();

export const primaryInteractionWarmupKeys = [
  'authModal',
  'profile',
  'postCreate',
] as const satisfies readonly RouteSurfaceWarmupKey[];

export const secondaryRouteWarmupKeys = [
  'postDetail',
  'userSpace',
  'categoryFeed',
] as const satisfies readonly RouteSurfaceWarmupKey[];

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
