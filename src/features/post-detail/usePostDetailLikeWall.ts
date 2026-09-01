import { useMemo } from 'react';

import type { PostLiker, User } from '@/types';

import { normalizeLikerId } from './postDetailLegacyUtils';

type DetailLikeWallUser = {
  displayName?: string | null;
  id?: string | null;
  loginAccount?: string | null;
  photoUrl?: string | null;
  userType?: User['userType'];
  username?: string | null;
} | null | undefined;

type UsePostDetailLikeWallArgs = {
  currentUser: DetailLikeWallUser;
  hasLiked: boolean;
  isPostLikersFetched: boolean;
  isPostLikersFetching: boolean;
  isPostLikersLoading: boolean;
  likeCount: number;
  likers?: PostLiker[];
};

const EMPTY_LIKERS: PostLiker[] = [];

export function usePostDetailLikeWall({
  currentUser,
  hasLiked,
  isPostLikersFetched,
  isPostLikersFetching,
  isPostLikersLoading,
  likeCount,
  likers,
}: UsePostDetailLikeWallArgs) {
  const sourceLikers = likers ?? EMPTY_LIKERS;

  const visibleLikeWallLikers = useMemo(() => {
    const currentUserId = normalizeLikerId(currentUser?.id);
    const shouldShowCurrentUser = Boolean(currentUserId && hasLiked);
    const likersById = new Map<string, PostLiker>();

    const addLiker = (liker: PostLiker | null | undefined) => {
      const likerId = normalizeLikerId(liker?.id);
      if (!likerId) return;
      if (likerId === currentUserId && !shouldShowCurrentUser) return;
      if (likersById.has(likerId)) return;
      likersById.set(likerId, { ...liker, id: likerId });
    };

    if (shouldShowCurrentUser) {
      addLiker({
        id: currentUserId,
        displayName: currentUser?.displayName || currentUser?.username || currentUser?.loginAccount || '用户',
        username: currentUser?.username || currentUser?.loginAccount || null,
        photoUrl: currentUser?.photoUrl || null,
        userType: currentUser?.userType,
      });
    }

    sourceLikers.forEach(addLiker);

    return Array.from(likersById.values());
  }, [
    currentUser?.displayName,
    currentUser?.id,
    currentUser?.loginAccount,
    currentUser?.photoUrl,
    currentUser?.userType,
    currentUser?.username,
    hasLiked,
    sourceLikers,
  ]);

  const visibleLikeWallTotal = Math.max(0, Number(likeCount || 0));
  const isLikeWallLoading = visibleLikeWallTotal > 0 && visibleLikeWallLikers.length === 0 && (
    isPostLikersLoading ||
    isPostLikersFetching ||
    !isPostLikersFetched
  );

  return {
    isLikeWallLoading,
    visibleLikeWallLikers,
    visibleLikeWallTotal,
  };
}
