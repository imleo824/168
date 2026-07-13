import React, { useCallback, useEffect, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useActionLock } from '@/hooks/useActionLock';
import { useFollowStatus, useFollowUser } from '@/hooks/useData';

export interface FollowButtonPanelProps {
  userId: string;
  className?: string;
  size?: 'sm' | 'md';
  hideWhenFollowing?: boolean;
}

export function FollowButtonPanel({
  userId,
  className = '',
  size = 'md',
  hideWhenFollowing = true,
}: FollowButtonPanelProps) {
  const { user, requireAuth, showToast } = useAuth();
  const followedInSessionRef = useRef(false);
  const isSelf = !!user?.id && user.id === userId;
  const { data: status } = useFollowStatus(userId, !!user && !isSelf);
  const followMutation = useFollowUser(userId);
  const isFollowingFromServer = Boolean(status?.following);

  useEffect(() => {
    followedInSessionRef.current = false;
  }, [userId]);

  const followLock = useActionLock(async () => {
    if (isSelf || followMutation.isPending) return;
    const nextFollowing = !isFollowingFromServer;
    await followMutation.mutateAsync(nextFollowing);
    if (nextFollowing) followedInSessionRef.current = true;
  }, {
    cooldownMs: 360,
    minPendingMs: 160,
    mode: 'drop',
    onError: (err) => {
      console.error(err);
      showToast('关注操作失败，请稍后重试', 'error');
    },
  });

  const transientTarget = typeof followMutation.variables === 'boolean' && (followMutation.isPending || followLock.isPending)
    ? followMutation.variables
    : undefined;
  const isFollowing = transientTarget ?? isFollowingFromServer;
  const isBusy = followMutation.isPending || followLock.isPending;
  const shouldHideResolvedFollowing = hideWhenFollowing && isFollowingFromServer && !followedInSessionRef.current && transientTarget === undefined;

  const handleFollow = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (isSelf || isBusy) return;

    requireAuth(() => {
      void followLock.run();
    });
  }, [followLock, isBusy, isSelf, requireAuth]);

  if (!userId || isSelf || shouldHideResolvedFollowing) return null;

  const baseClass = size === 'sm'
    ? 'pressable ui-compact-action feed-follow-button--compact'
    : 'pressable ui-action tap-target';

  return (
    <button
      type="button"
      onClick={handleFollow}
      disabled={isBusy}
      aria-busy={isBusy}
      aria-pressed={isFollowing}
      aria-label={isFollowing ? '已关注' : '关注'}
      data-follow-state={isFollowing ? 'following' : 'idle'}
      data-follow-pending={isBusy ? 'true' : 'false'}
      className={`${baseClass} feed-follow-button ${className}`.trim()}
    >
      <span className="feed-follow-button-inner">
        <span className="feed-follow-button-text">{isFollowing ? '已关注' : '关注'}</span>
      </span>
    </button>
  );
}

export default FollowButtonPanel;
