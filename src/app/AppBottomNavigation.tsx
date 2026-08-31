import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CirclePlus, House, TrendingUp, UserRound } from 'lucide-react';

import AvatarImage from '@/ui/AvatarImage';
import { useAuth } from '@/context/AuthContext';
import { useInstantPress } from '@/hooks/useInstantPress';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusPrime';
import { clearSignupRewardBadge, readSignupRewardBadgePoints, SIGNUP_REWARD_BADGE_EVENT } from '@/utils/signupRewardBadge';
import { warmupNavigationIntent, warmupRoutePath } from '@/utils/routeWarmups';
import { APP_ROUTES } from '@/app/routePaths';

const DOUBLE_TAP_INTERVAL_MS = 360;
const DOUBLE_TAP_DISTANCE_PX = 28;
const PRIMARY_TAB_PATHS = new Set<string>([
  APP_ROUTES.home,
  APP_ROUTES.messages,
  APP_ROUTES.sponsor,
  APP_ROUTES.profile,
]);

function scrollActivePageToTop(behavior: ScrollBehavior = 'smooth') {
  document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior });
  document.documentElement.scrollTo({ top: 0, left: 0, behavior });
  document.body?.scrollTo({ top: 0, left: 0, behavior });
}

function refreshActiveHomeTopicTab() {
  window.dispatchEvent(new CustomEvent('home-topic-tab-refresh'));
}

export function shouldShowBottomNavigation(pathname: string) {
  return PRIMARY_TAB_PATHS.has(pathname);
}

function isTuiPlusActive(user: any) {
  if (!user) return false;
  if (user.isTuiPlus) return true;
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  return Boolean(expiresAt && expiresAt > Date.now() && (user.plusStatus === 'TRIALING' || user.plusStatus === 'ACTIVE'));
}

export default function AppBottomNavigation() {
  const { user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const lastHomeNavTapRef = useRef({ at: 0, x: 0, y: 0 });
  const [signupRewardBadgePoints, setSignupRewardBadgePoints] = useState(readSignupRewardBadgePoints);

  const goHome = (options: { refreshIfActive?: boolean } = {}) => {
    if (pathname === APP_ROUTES.home) {
      if (options.refreshIfActive) refreshActiveHomeTopicTab();
      scrollActivePageToTop('smooth');
      return;
    }
    navigate(APP_ROUTES.home);
  };

  const handleHomeClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (pathname !== APP_ROUTES.home) {
      lastHomeNavTapRef.current = { at: 0, x: 0, y: 0 };
      goHome({ refreshIfActive: false });
      return;
    }

    const now = performance.now();
    const last = lastHomeNavTapRef.current;
    const deltaTime = now - last.at;
    const deltaX = Math.abs(event.clientX - last.x);
    const deltaY = Math.abs(event.clientY - last.y);
    const isDoubleTap =
      deltaTime > 0 &&
      deltaTime <= DOUBLE_TAP_INTERVAL_MS &&
      deltaX <= DOUBLE_TAP_DISTANCE_PX &&
      deltaY <= DOUBLE_TAP_DISTANCE_PX;

    if (isDoubleTap) {
      lastHomeNavTapRef.current = { at: 0, x: 0, y: 0 };
      goHome({ refreshIfActive: true });
      return;
    }

    lastHomeNavTapRef.current = { at: now, x: event.clientX, y: event.clientY };
    goHome({ refreshIfActive: false });
  };

  const goMessages = () => {
    warmupRoutePath(APP_ROUTES.messages);
    warmupNavigationIntent('auth');
    requireAuth(() => {
      if (pathname === APP_ROUTES.messages) {
        scrollActivePageToTop('smooth');
        return;
      }
      navigate(APP_ROUTES.messages);
    });
  };

  const goCreate = () => {
    if (pathname === APP_ROUTES.create) return;
    warmupRoutePath(APP_ROUTES.create);
    warmupNavigationIntent('create');
    requireAuth(() => {
      primePostCreateComposerFocus();
      navigate(APP_ROUTES.create);
    });
  };

  const goSponsor = () => {
    warmupRoutePath(APP_ROUTES.sponsor);
    warmupNavigationIntent('sponsor');
    requireAuth(() => {
      clearSignupRewardBadge();
      if (pathname === APP_ROUTES.sponsor) {
        scrollActivePageToTop('smooth');
        return;
      }
      navigate(APP_ROUTES.sponsor);
    });
  };

  const goProfile = () => {
    warmupRoutePath(APP_ROUTES.profile);
    warmupNavigationIntent('profile');
    if (pathname === APP_ROUTES.profile) {
      scrollActivePageToTop('smooth');
      return;
    }
    navigate(APP_ROUTES.profile);
  };

  const { guarded: guardedGoCreate } = useInteractionGuard(goCreate, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });

  const homePressHandlers = useInstantPress<HTMLButtonElement>(handleHomeClick);
  const messagesPressHandlers = useInstantPress<HTMLButtonElement>(goMessages);
  const createPressHandlers = useInstantPress<HTMLButtonElement>(() => void guardedGoCreate());
  const sponsorPressHandlers = useInstantPress<HTMLButtonElement>(goSponsor);
  const profilePressHandlers = useInstantPress<HTMLButtonElement>(goProfile);

  useEffect(() => {
    const handleSignupRewardBadgeChange = (event: Event) => {
      const points = Number((event as CustomEvent<{ points?: number }>).detail?.points || 0);
      setSignupRewardBadgePoints(Math.max(0, Math.floor(points)));
    };
    window.addEventListener(SIGNUP_REWARD_BADGE_EVENT, handleSignupRewardBadgeChange);
    return () => window.removeEventListener(SIGNUP_REWARD_BADGE_EVENT, handleSignupRewardBadgeChange);
  }, []);

  if (!shouldShowBottomNavigation(pathname)) return null;

  const profileName = user?.displayName || user?.username || user?.id || '我的';
  const profileIsTuiPlus = isTuiPlusActive(user);
  const profileIconShellClassName = user
    ? 'app-bottom-nav-icon-shell app-bottom-nav-avatar-shell'
    : 'app-bottom-nav-icon-shell';

  return (
    <nav className="app-bottom-nav" aria-label="底部导航">
      <div className="ui-floating-tabbar app-bottom-nav-inner">
        <button type="button" className="app-bottom-nav-item" data-state={pathname === APP_ROUTES.home ? 'active' : 'idle'} aria-current={pathname === APP_ROUTES.home ? 'page' : undefined} aria-label="首页" title="首页" {...homePressHandlers}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><House className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">首页</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--messages" data-state={pathname === APP_ROUTES.messages ? 'active' : 'idle'} aria-current={pathname === APP_ROUTES.messages ? 'page' : undefined} aria-label="消息" title="消息" {...messagesPressHandlers} onPointerEnter={() => warmupRoutePath(APP_ROUTES.messages)} onFocus={() => warmupRoutePath(APP_ROUTES.messages)}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><Bell className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">消息</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--publish" data-state="idle" aria-label="发推" title="发推" {...createPressHandlers} onPointerEnter={() => warmupRoutePath(APP_ROUTES.create)} onFocus={() => warmupRoutePath(APP_ROUTES.create)}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><CirclePlus className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">发推</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--sponsor" data-state={pathname === APP_ROUTES.sponsor ? 'active' : 'idle'} aria-current={pathname === APP_ROUTES.sponsor ? 'page' : undefined} aria-label="推广" title="推广" {...sponsorPressHandlers} onPointerEnter={() => warmupRoutePath(APP_ROUTES.sponsor)} onFocus={() => warmupRoutePath(APP_ROUTES.sponsor)}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true">
            <TrendingUp className="app-bottom-nav-icon" />
            {signupRewardBadgePoints > 0 ? <span className="app-bottom-nav-reward-badge">+{signupRewardBadgePoints}</span> : null}
          </span>
          <span className="app-bottom-nav-label">推广</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--profile" data-state={pathname === APP_ROUTES.profile ? 'active' : 'idle'} aria-current={pathname === APP_ROUTES.profile ? 'page' : undefined} aria-label="我的" title="我的" {...profilePressHandlers} onPointerEnter={() => warmupRoutePath(APP_ROUTES.profile)} onFocus={() => warmupRoutePath(APP_ROUTES.profile)}>
          <span className={profileIconShellClassName} data-tui-plus={profileIsTuiPlus ? 'true' : undefined} aria-hidden="true">
            {user ? (
              <AvatarImage src={user.photoUrl || ''} name={profileName} id={user.id} alt={profileName} className="app-bottom-nav-avatar" variant="thumb" />
            ) : (
              <UserRound className="app-bottom-nav-icon" />
            )}
          </span>
          <span className="app-bottom-nav-label">我的</span>
        </button>
      </div>
    </nav>
  );
}
