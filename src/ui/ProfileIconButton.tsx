import { memo, type MouseEvent } from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '@/utils/cn';
import AvatarImage from './AvatarImage';

type ProfileIconButtonSize = 'default' | 'compact';

interface ProfileIconButtonProps {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  ariaLabel?: string;
  className?: string;
  photoUrl?: string | null;
  displayName?: string | null;
  userId?: string | null;
  size?: ProfileIconButtonSize;
  isTuiPlus?: boolean;
}

function hasProfileIdentity(photoUrl?: string | null, displayName?: string | null, userId?: string | null) {
  return Boolean(String(photoUrl || '').trim() || String(displayName || '').trim() || String(userId || '').trim());
}

function ProfileIconButton({
  onClick,
  title,
  ariaLabel = '进入个人中心',
  className,
  photoUrl,
  displayName,
  userId,
  size = 'default',
  isTuiPlus = false,
}: ProfileIconButtonProps) {
  const hasIdentity = hasProfileIdentity(photoUrl, displayName, userId);

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      data-icon-action-size={size === 'compact' ? 'sm' : 'md'}
      data-icon-action-context="profile"
      data-icon-action-tone="quiet"
      data-icon-action-shape="circle"
      data-profile-icon-size={size}
      data-profile-icon-state={hasIdentity ? 'identified' : 'anonymous'}
      data-tui-plus={isTuiPlus ? 'true' : undefined}
      className={cn('pressable ui-icon-button ui-avatar-action ui-profile-icon-button ui-header-avatar-size ui-bg-card', className)}
    >
      {hasIdentity ? (
        <AvatarImage
          src={photoUrl || ''}
          name={displayName}
          id={userId}
          alt={displayName || userId || '用户头像'}
          className="ui-header-avatar-size"
          variant="thumb"
          isTuiPlus={isTuiPlus}
        />
      ) : (
        <span className="ui-avatar ui-avatar-fallback ui-header-avatar-size ui-profile-icon-fallback" aria-hidden="true" data-tui-plus={isTuiPlus ? 'true' : undefined}>
          <UserRound className="ui-profile-icon-fallback-glyph" />
        </span>
      )}
    </button>
  );
}

export default memo(ProfileIconButton);
