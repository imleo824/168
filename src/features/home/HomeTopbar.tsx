import { memo, type ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import { APP_ROUTES } from '@/app/routePaths';
import PageHeader from '@/ui/PageHeader';
import { TopbarOnlineBadge } from '@/ui/TopbarActions';
import { useConfig } from '@/hooks/useDataConfig';
import { resolveTelegramChannelUrl } from '@/utils/contact';

type PageHeaderProps = ComponentProps<typeof PageHeader>;

interface HomeTopbarProps {
  onlineCountText: string;
  className?: string;
  skeletonAvatar?: boolean;
}

export const HOME_TOPBAR_TITLE = 'tuitui';
export const HOME_TOPBAR_CLASS_NAME = 'home-topbar home-topbar--instagram ui-layer-header';
export const HOME_TOPBAR_CONTENT_CLASS_NAME = 'home-topbar-instagram-inner';
export const HOME_TOPBAR_LEFT_CLASS_NAME = 'home-topbar-channel-leading-slot';
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
  const { data: config } = useConfig();
  const telegramChannelUrl = resolveTelegramChannelUrl(config?.telegram_channel);

  const left: PageHeaderProps['left'] = skeletonAvatar ? (
    <span
      aria-hidden="true"
      className="home-topbar-profile-skeleton ui-skeleton-shell ui-skeleton-circle"
    >
      <span className="ui-skeleton-shimmer" />
    </span>
  ) : (
    <a
      href={telegramChannelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="home-topbar-channel-action pressable"
      aria-label="Telegram 官方频道"
      title="Telegram 官方频道"
    >
      <Send className="home-topbar-channel-icon" aria-hidden="true" />
      <span className="home-topbar-channel-text">官方频道</span>
    </a>
  );

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
      leftClassName={HOME_TOPBAR_LEFT_CLASS_NAME}
      rightClassName={HOME_TOPBAR_RIGHT_CLASS_NAME}
      titleClassName={HOME_TOPBAR_TITLE_CLASS_NAME}
    />
  );
});
