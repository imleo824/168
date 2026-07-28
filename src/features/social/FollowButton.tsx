import React, { lazy, Suspense } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { FollowButtonPanelProps } from './FollowButtonPanel';

const LazyFollowButtonPanel = lazy(() =>
  import('./FollowButtonPanel').then((module) => ({ default: module.FollowButtonPanel })),
);

export type FollowButtonProps = FollowButtonPanelProps;

function FollowButtonLoadingPlaceholder({
  className = '',
  size = 'md',
}: Pick<FollowButtonProps, 'className' | 'size'>) {
  const baseClass = size === 'sm'
    ? 'pressable ui-compact-action feed-follow-button--compact'
    : 'pressable ui-action tap-target';

  return (
    <span
      aria-hidden="true"
      data-follow-pending="false"
      data-follow-state="idle"
      className={`${baseClass} feed-follow-button feed-follow-button--placeholder ${className}`.trim()}
    >
      <span className="feed-follow-button-inner">
        <span className="feed-follow-button-text">关注</span>
      </span>
    </span>
  );
}

export function FollowButton(props: FollowButtonProps) {
  const { user } = useAuth();
  const isSelf = !!user?.id && user.id === props.userId;

  if (!props.userId || isSelf) return null;

  return (
    <Suspense fallback={<FollowButtonLoadingPlaceholder className={props.className} size={props.size} />}>
      <LazyFollowButtonPanel {...props} />
    </Suspense>
  );
}
