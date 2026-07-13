import { memo, type ComponentProps } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import PageHeader from '@/ui/PageHeader';
import TopbarIconButton from '@/ui/TopbarIconButton';
import { TopbarOnlineBadge } from '@/ui/TopbarActions';
import { useAuth } from '@/context/AuthContext';
import { warmupNavigationIntent } from '@/utils/routeWarmups';
import { apiFetch } from '@/services/api';

type PageHeaderProps = ComponentProps<typeof PageHeader>;

interface HomeTopbarProps {
  onlineCountText: string;
  className?: string;
  skeletonAvatar?: boolean;
}

async function fetchUnreadNotificationCount() {
  const res = await apiFetch('/api/me/notifications/unread-count');
  if (!res.ok) return { unreadCount: 0 };
  return res.json() as Promise<{ unreadCount: number }>;
}

export const HOME_TOPBAR_TITLE = 'tuitui';
export const HOME_TOPBAR_CLASS_NAME = 'home-topbar home-topbar--instagram ui-layer-header';
export const HOME_TOPBAR_CONTENT_CLASS_NAME = 'home-topbar-instagram-inner';
export const HOME_TOPBAR_RIGHT_CLASS_NAME = 'home-topbar-actions-slot';
export const HOME_TOPBAR_TITLE_CLASS_NAME = 'home-topbar-title';

export function HomeBrandLockup() {
  return (
    <Link className="home-topbar-brand-lockup pressable" to="/about" aria-label="关于推推" title="关于推推">
      <span className="home-topbar-brand-name" aria-label={HOME_TOPBAR_TITLE}>
        <svg
          className="home-topbar-brand-vector"
          viewBox="0 0 160 44"
          aria-hidden="true"
          focusable="false"
        >
          <rect className="home-topbar-brand-vector-ink" x="2" y="5" width="27" height="8" rx="4" />
          <rect className="home-topbar-brand-vector-ink" x="11.5" y="5" width="8" height="31" rx="4" />
          <path
            className="home-topbar-brand-vector-ink"
            d="M36 16h8v12.2c0 3.4 2 5.3 5.2 5.3s5.2-1.9 5.2-5.3V16h8v12.4c0 7.6-5.2 12.4-13.2 12.4S36 36 36 28.4V16Z"
          />
          <rect className="home-topbar-brand-vector-ink" x="70" y="16" width="8" height="24" rx="4" />
          <circle className="home-topbar-brand-vector-accent" cx="74" cy="7.5" r="4.4" />

          <rect className="home-topbar-brand-vector-ink home-topbar-brand-vector-ink--secondary" x="82" y="5" width="27" height="8" rx="4" />
          <rect className="home-topbar-brand-vector-ink home-topbar-brand-vector-ink--secondary" x="91.5" y="5" width="8" height="31" rx="4" />
          <path
            className="home-topbar-brand-vector-ink home-topbar-brand-vector-ink--secondary"
            d="M116 16h8v12.2c0 3.4 2 5.3 5.2 5.3s5.2-1.9 5.2-5.3V16h8v12.4c0 7.6-5.2 12.4-13.2 12.4S116 36 116 28.4V16Z"
          />
          <rect className="home-topbar-brand-vector-ink home-topbar-brand-vector-ink--secondary" x="150" y="16" width="8" height="24" rx="4" />
          <circle className="home-topbar-brand-vector-accent" cx="154" cy="7.5" r="4.4" />
        </svg>
      </span>
    </Link>
  );
}

function HomeBrandSkeleton() {
  return (
    <span className="home-topbar-brand-skeleton" aria-label="tuitui">
      <span className="home-topbar-brand-skeleton-text">tuitui</span>
      <span className="ui-skeleton-shimmer" aria-hidden="true" />
    </span>
  );
}

export const HomeTopbar = memo(function HomeTopbar({
  onlineCountText,
  className = '',
  skeletonAvatar = false,
}: HomeTopbarProps) {
  const { user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const unreadQuery = useQuery({
    queryKey: ['me', 'notifications', 'unread-count'],
    queryFn: fetchUnreadNotificationCount,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const hasUnread = Math.max(0, Math.floor(Number(unreadQuery.data?.unreadCount || 0))) > 0;

  const openMessages = () => {
    warmupNavigationIntent('auth');
    requireAuth(() => navigate('/messages'));
  };
  const left: PageHeaderProps['left'] = skeletonAvatar ? (
    <span
      aria-hidden="true"
      className="home-topbar-profile-skeleton ui-skeleton-shell ui-skeleton-circle"
    >
      <span className="ui-skeleton-shimmer" />
    </span>
  ) : (
    <TopbarIconButton
      icon={
        <span className="home-topbar-message-icon home-topbar-message-icon--heart" aria-hidden="true">
          <Heart />
          {hasUnread ? <span className="home-topbar-message-dot" /> : null}
        </span>
      }
      onClick={openMessages}
      ariaLabel={hasUnread ? '进入消息，有未读消息' : '进入消息'}
      title="消息"
      tone="default"
    />
  );

  return (
    <PageHeader
      title={HOME_TOPBAR_TITLE}
      titleAs="div"
      showBack={false}
      titleNode={skeletonAvatar ? <HomeBrandSkeleton /> : <HomeBrandLockup />}
      left={left}
      right={<TopbarOnlineBadge countText={onlineCountText} />}
      variant="home"
      titleAlign="center"
      className={`${HOME_TOPBAR_CLASS_NAME}${className ? ` ${className}` : ''}`}
      contentClassName={HOME_TOPBAR_CONTENT_CLASS_NAME}
      rightClassName={HOME_TOPBAR_RIGHT_CLASS_NAME}
      titleClassName={HOME_TOPBAR_TITLE_CLASS_NAME}
    />
  );
});
