import React, { useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CirclePlus,
  House,
  Info,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  UserRound,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { getNotificationsList } from '@/services/homeStartupApi';
import { APP_ROUTES } from '@/app/routePaths';
import { warmupNavigationIntent, warmupRoutePath } from '@/utils/routeWarmups';
import { primePostCreateComposerFocus } from '@/utils/postCreateFocusPrime';
import { useOnlinePresence } from '@/features/home/OnlinePresenceContext';
import AvatarImage from '@/ui/AvatarImage';
import { isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';

const DESKTOP_NAV_ITEMS = [
  { to: APP_ROUTES.home, label: '首页', icon: House, end: true },
  { to: APP_ROUTES.messages, label: '消息', icon: Bell, end: false },
  { to: APP_ROUTES.create, label: '发推', icon: CirclePlus, end: false },
  { to: APP_ROUTES.sponsor, label: '推广', icon: TrendingUp, end: false },
  { to: APP_ROUTES.profile, label: '我的', icon: UserRound, end: false },
  { to: APP_ROUTES.about, label: '关于', icon: Info, end: false },
] as const;

export const AppDesktopSidebar: React.FC = () => {
  const { user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { onlineCountText } = useOnlinePresence();

  const notificationsQuery = useQuery({
    queryKey: ['me', 'notifications', 'ALL'],
    queryFn: () => getNotificationsList({ limit: 1 }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });
  const unreadCount = notificationsQuery.data?.unreadCount || 0;

  const desktopNavItems = useMemo(() => {
    if (user?.role === 'ADMIN') {
      return [
        ...DESKTOP_NAV_ITEMS,
        { to: '/168wc', label: '后台', icon: ShieldCheck, end: false },
      ];
    }
    return DESKTOP_NAV_ITEMS;
  }, [user?.role]);

  const handleQuickPost = () => {
    if (location.pathname === APP_ROUTES.create) return;
    warmupNavigationIntent('create');
    requireAuth(() => {
      primePostCreateComposerFocus();
      navigate(APP_ROUTES.create);
    });
  };

  const { guarded: guardedHandleQuickPost } = useInteractionGuard(handleQuickPost, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });

  const handleAdPost = () => {
    warmupNavigationIntent('sponsor');
    navigate(APP_ROUTES.sponsor);
  };

  const displayName =
    user?.displayName ||
    user?.username ||
    (user?.id ? `推友_${user.id.slice(0, 4)}` : '未登录用户');

  return (
    <aside className="app-desktop-sidebar" aria-label="桌面主导航">
      {/* Brand Header */}
      <div className="app-desktop-sidebar-primary">
        <NavLink
          className="app-desktop-brand"
          to={APP_ROUTES.home}
          aria-label="返回首页"
        >
          <span className="app-desktop-brand-mark">
            T
          </span>
          <span className="app-desktop-brand-copy">
            <span className="app-desktop-brand-name">推推</span>
            <span className="app-desktop-brand-subtitle">匿名分类信息网</span>
          </span>
        </NavLink>

        {/* Navigation Items */}
        <nav className="app-desktop-nav" aria-label="桌面导航">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const isMessages = item.to === APP_ROUTES.messages;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={(e) => {
                  const protectedPaths = new Set<string>([
                    APP_ROUTES.profile,
                    APP_ROUTES.messages,
                    APP_ROUTES.create,
                    APP_ROUTES.sponsor,
                  ]);
                  if (protectedPaths.has(item.to)) {
                    e.preventDefault();
                    requireAuth(() => {
                      navigate(item.to);
                    });
                  }
                }}
                className={({ isActive }) =>
                  `app-desktop-nav-item ${
                    isActive ? 'app-desktop-nav-item--active' : ''
                  }`
                }
                onPointerEnter={() => warmupRoutePath(item.to)}
                onFocus={() => warmupRoutePath(item.to)}
              >
                <span className="app-desktop-nav-icon-container">
                  <Icon className="app-desktop-nav-icon" aria-hidden="true" />
                </span>
                <span className="app-desktop-nav-label">{item.label}</span>
                {isMessages && unreadCount > 0 ? (
                  <span className="app-desktop-nav-badge" aria-label={`${unreadCount}条未读消息`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        {/* Action Buttons Group */}
        <div className="app-desktop-action-group">
          <button
            type="button"
            className="app-desktop-post-action pressable"
            onClick={() => void guardedHandleQuickPost()}
            onMouseEnter={() => warmupNavigationIntent('create')}
            onFocus={() => warmupNavigationIntent('create')}
            aria-label="快速发推"
            title="快速发推"
          >
            <CirclePlus className="app-desktop-action-icon" aria-hidden="true" />
            <span>立即发推</span>
          </button>
          <button
            type="button"
            className="app-desktop-ad-action pressable"
            onClick={handleAdPost}
            onMouseEnter={() => warmupNavigationIntent('sponsor')}
            aria-label="投放广告"
            title="投放广告"
          >
            <Megaphone className="app-desktop-action-icon" aria-hidden="true" />
            <span>投放广告</span>
          </button>
        </div>
      </div>

      {/* User Status & Online Context Footer */}
      <section className="app-desktop-sidebar-context" aria-label="用户与状态">
        {user ? (
          <NavLink
            to={APP_ROUTES.profile}
            className="app-desktop-user-card"
            aria-label="查看个人主页"
            title="查看个人主页"
          >
            <span
              className="app-desktop-user-avatar-shell"
              data-tui-plus={isTuiPlusActive(user) ? 'true' : undefined}
            >
              <AvatarImage
                src={user.photoUrl || ''}
                name={displayName}
                id={user.id}
                alt={displayName}
                className="app-desktop-user-avatar-image"
                variant="thumb"
              />
            </span>
            <div className="app-desktop-user-info">
              <span className="app-desktop-user-name">
                {displayName}
              </span>
              <span className="app-desktop-user-role">
                {isTuiPlusActive(user)
                  ? '推推+ 尊享会员'
                  : user.role === 'ADMIN'
                  ? '平台管理员'
                  : '已登录推友'}
              </span>
            </div>
          </NavLink>
        ) : (
          <button
            type="button"
            className="app-desktop-user-card app-desktop-user-card--button pressable"
            onClick={() => requireAuth(() => {})}
            aria-label="登录或注册账号"
            title="登录或注册账号"
          >
            <span className="app-desktop-guest-avatar">
              <UserRound className="app-desktop-nav-icon" aria-hidden="true" />
            </span>
            <div className="app-desktop-user-info">
              <span className="app-desktop-user-name">
                登录 / 注册
              </span>
              <span className="app-desktop-user-role">体验完整功能</span>
            </div>
          </button>
        )}

        <div className="app-desktop-context-card">
          <div className="app-desktop-context-kicker">当前在线</div>
          <div className="app-desktop-context-metric">
            <span className="app-desktop-context-dot" aria-hidden="true" />
            <span className="app-desktop-context-value">{onlineCountText || '实时更新'}</span>
          </div>
        </div>
      </section>
    </aside>
  );
};

export default AppDesktopSidebar;
