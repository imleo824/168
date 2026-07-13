import React, { lazy, Suspense } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { FollowButtonPanelProps } from './FollowButtonPanel';

const LazyFollowButtonPanel = lazy(() =>
  import('./FollowButtonPanel').then((module) => ({ default: module.FollowButtonPanel })),
);

export type FollowButtonProps = FollowButtonPanelProps;

export function FollowButton(props: FollowButtonProps) {
  const { user } = useAuth();
  const isSelf = !!user?.id && user.id === props.userId;

  if (!props.userId || isSelf) return null;

  return (
    <Suspense fallback={null}>
      <LazyFollowButtonPanel {...props} />
    </Suspense>
  );
}
