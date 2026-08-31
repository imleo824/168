import { memo, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { APP_ROUTES } from '@/app/routePaths';
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
    <Link className="home-topbar-brand-lockup pressable" to={APP_ROUTES.about} aria-label="关于推推" title="关于推推">
      <span className="home-topbar-brand-name home-topbar-title--brand-text" aria-label={HOME_TOPBAR_TITLE}>
        {HOME_TOPBAR_TITLE}
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
