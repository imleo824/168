import { memo } from 'react';
import { Camera } from 'lucide-react';

import OptimizedImage from '@/ui/OptimizedImage';
import { cn } from '@/utils/cn';

const PROFILE_HEADER_COVER_SIZES = '(max-width: 48rem) 100vw, 72rem';

interface ProfileHeaderCoverProps {
  coverUrl?: string | null;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  showEditBadge?: boolean;
}

function normalizeCoverUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const ProfileHeaderCover = memo(function ProfileHeaderCover({
  coverUrl,
  className,
  onClick,
  ariaLabel,
  showEditBadge = true,
}: ProfileHeaderCoverProps) {
  const imageUrl = normalizeCoverUrl(coverUrl);
  const isInteractive = Boolean(onClick);

  if (isInteractive) {
    return (
      <button
        type="button"
        className={cn(
          'profile-header-cover profile-header-cover--interactive',
          imageUrl ? 'profile-header-cover--image' : 'profile-header-cover--default',
          className,
        )}
        data-profile-cover-edge="flush"
        onClick={() => onClick?.()}
        aria-label={ariaLabel || (imageUrl ? '更换主页封面' : '添加主页封面')}
      >
        {imageUrl ? (
          <OptimizedImage
            src={imageUrl}
            alt=""
            className="profile-header-cover-image"
            variant="large"
            sizes={PROFILE_HEADER_COVER_SIZES}
            transformResize="cover"
            disableOptimization
            priority
          />
        ) : null}
        {showEditBadge ? (
          <span className="profile-header-cover-edit-badge" aria-hidden="true">
            <Camera className="profile-header-cover-edit-icon" />
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'profile-header-cover',
        imageUrl ? 'profile-header-cover--image' : 'profile-header-cover--default',
        className,
      )}
      data-profile-cover-edge="flush"
      aria-hidden="true"
    >
      {imageUrl ? (
        <OptimizedImage
          src={imageUrl}
          alt=""
          className="profile-header-cover-image"
          variant="large"
          sizes={PROFILE_HEADER_COVER_SIZES}
          transformResize="cover"
          disableOptimization
          priority
        />
      ) : null}
    </div>
  );
});

export default ProfileHeaderCover;
