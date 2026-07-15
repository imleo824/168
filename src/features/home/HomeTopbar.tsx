import { memo, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/ui/PageHeader';
import { TopbarOnlineBadge } from '@/ui/TopbarActions';

type PageHeaderProps = ComponentProps<typeof PageHeader>;

interface HomeTopbarProps {
  onlineCountText: string;
  className?: string;
  skeletonAvatar?: boolean;
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

export const HomeTopbar = memo(function HomeTopbar({
  onlineCountText,
  className = '',
  skeletonAvatar = false,
}: HomeTopbarProps) {
  const left: PageHeaderProps['left'] = skeletonAvatar ? (
    <span
      aria-hidden="true"
      className="home-topbar-profile-skeleton ui-skeleton-shell ui-skeleton-circle"
    >
      <span className="ui-skeleton-shimmer" />
    </span>
  ) : null;

  return (
    <PageHeader
      title={HOME_TOPBAR_TITLE}
      titleAs="div"
      showBack={false}
      titleNode={skeletonAvatar ? <></> : <HomeBrandLockup />}
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
