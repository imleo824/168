import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CirclePlus, House, MessagesSquare, TrendingUp, UserRound } from 'lucide-react';

import AvatarImage from '@/ui/AvatarImage';
import { useAuth } from '@/context/AuthContext';
import { useInstantPress } from '@/hooks/useInstantPress';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusBridge';
import { clearSignupRewardBadge, readSignupRewardBadgePoints, SIGNUP_REWARD_BADGE_EVENT } from '@/utils/signupRewardBadge';
import { warmupNavigationIntent } from '@/utils/routeWarmups';

const DOUBLE_TAP_INTERVAL_MS = 360;
const DOUBLE_TAP_DISTANCE_PX = 28;
const PRIMARY_TAB_PATHS = new Set(['/', '/chat', '/sponsor', '/profile']);

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
    if (pathname === '/') {
      if (options.refreshIfActive) refreshActiveHomeTopicTab();
      scrollActivePageToTop('smooth');
      return;
    }
    navigate('/');
  };

  const handleHomeClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (pathname !== '/') {
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

  const goChat = () => {
    if (pathname === '/chat') {
      scrollActivePageToTop('smooth');
      return;
    }
    navigate('/chat');
  };

  const goCreate = () => {
    if (pathname === '/create') return;
    warmupNavigationIntent('create');
    requireAuth(() => {
      primePostCreateComposerFocus();
      navigate('/create');
    });
  };

  const goSponsor = () => {
    warmupNavigationIntent('sponsor');
    requireAuth(() => {
      clearSignupRewardBadge();
      if (pathname === '/sponsor') {
        scrollActivePageToTop('smooth');
        return;
      }
      navigate('/sponsor');
    });
  };

  const goProfile = () => {
    warmupNavigationIntent('profile');
    if (pathname === '/profile') {
      scrollActivePageToTop('smooth');
      return;
    }
    navigate('/profile');
  };

  const { guarded: guardedGoCreate } = useInteractionGuard(goCreate, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });

  const homePressHandlers = useInstantPress<HTMLButtonElement>(handleHomeClick);
  const chatPressHandlers = useInstantPress<HTMLButtonElement>(goChat);
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

  return (
    <nav className="app-bottom-nav" aria-label="底部导航">
      <div className="ui-floating-tabbar app-bottom-nav-inner">
        <button type="button" className="app-bottom-nav-item" data-state={pathname === '/' ? 'active' : 'idle'} aria-current={pathname === '/' ? 'page' : undefined} aria-label="首页" title="首页" {...homePressHandlers}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><House className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">首页</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--chat" data-state={pathname === '/chat' ? 'active' : 'idle'} aria-current={pathname === '/chat' ? 'page' : undefined} aria-label="聊天" title="聊天" {...chatPressHandlers}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><MessagesSquare className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">聊天</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--publish" data-state="idle" aria-label="发推" title="发推" {...createPressHandlers}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true"><CirclePlus className="app-bottom-nav-icon" /></span>
          <span className="app-bottom-nav-label">发推</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--sponsor" data-state={pathname === '/sponsor' ? 'active' : 'idle'} aria-current={pathname === '/sponsor' ? 'page' : undefined} aria-label="买曝光" title="买曝光" {...sponsorPressHandlers}>
          <span className="app-bottom-nav-icon-shell" aria-hidden="true">
            <TrendingUp className="app-bottom-nav-icon" />
            {signupRewardBadgePoints > 0 ? <span className="app-bottom-nav-reward-badge">+{signupRewardBadgePoints}</span> : null}
          </span>
          <span className="app-bottom-nav-label">买曝光</span>
        </button>
        <button type="button" className="app-bottom-nav-item app-bottom-nav-item--profile" data-state={pathname === '/profile' ? 'active' : 'idle'} aria-current={pathname === '/profile' ? 'page' : undefined} aria-label="我的" title="我的" {...profilePressHandlers}>
          <span className="app-bottom-nav-icon-shell app-bottom-nav-avatar-shell" data-tui-plus={profileIsTuiPlus ? 'true' : undefined} aria-hidden="true">
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
