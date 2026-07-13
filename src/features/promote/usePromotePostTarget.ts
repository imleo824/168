import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import { usePost, usePosts } from '@/hooks/useData';

import type { PromotionTypeId } from './promoteBookingUtils';

type PromoteTargetUser = {
  id?: string;
} | null | undefined;

type UsePromotePostTargetArgs = {
  isAuthLoading: boolean;
  isPostPromotion: boolean;
  requestedPostId: string;
  requireAuth: (callback?: () => void) => void;
  selectedCategoryId: string;
  selectedType: PromotionTypeId;
  setSelectedCategoryId: Dispatch<SetStateAction<string>>;
  user: PromoteTargetUser;
};

export function usePromotePostTarget({
  isAuthLoading,
  isPostPromotion,
  requestedPostId,
  requireAuth,
  selectedCategoryId,
  selectedType,
  setSelectedCategoryId,
  user,
}: UsePromotePostTargetArgs) {
  const [selectedPostId, setSelectedPostId] = useState(requestedPostId);
  const [isPostPickerOpen, setIsPostPickerOpen] = useState(false);

  const {
    data: myPosts = [],
    isLoading: isLoadingMyPosts,
    isFetching: isFetchingMyPosts,
  } = usePosts({
    userId: user?.id,
    limit: 80,
    enabled: isPostPromotion && Boolean(user?.id),
  });

  const {
    data: selectedPromotablePost,
    isLoading: isLoadingSelectedPost,
    isError: isLoadSelectedPostError,
  } = usePost(selectedPostId || undefined);

  const selectedPostFromList = useMemo(() => {
    if (!selectedPostId) return null;
    return myPosts.find((post: any) => post.id === selectedPostId) || null;
  }, [myPosts, selectedPostId]);

  const effectiveSelectedPost = selectedPromotablePost || selectedPostFromList;
  const isVerifyingSelectedPost = Boolean(isLoadingSelectedPost && !selectedPostFromList);

  const isOwnPost = Boolean(
    !isVerifyingSelectedPost &&
      !isAuthLoading &&
      user?.id &&
      effectiveSelectedPost &&
      effectiveSelectedPost.userId === user.id,
  );

  const promotablePosts = useMemo(() => {
    if (!isPostPromotion) return [];

    if (selectedType === 'PIN_CATEGORY') {
      return myPosts.filter((post: any) => !selectedCategoryId || post.categoryId === selectedCategoryId);
    }

    return myPosts;
  }, [isPostPromotion, myPosts, selectedCategoryId, selectedType]);

  const orderedPromotablePosts = useMemo(() => {
    if (!selectedPostId) return promotablePosts;

    const targetIndex = promotablePosts.findIndex((post: any) => post.id === selectedPostId);

    if (targetIndex <= 0) return promotablePosts;

    const nextPosts = [...promotablePosts];
    const [selectedPost] = nextPosts.splice(targetIndex, 1);

    nextPosts.unshift(selectedPost);

    return nextPosts;
  }, [promotablePosts, selectedPostId]);

  useEffect(() => {
    if (!isPostPromotion) {
      setSelectedPostId('');
      setIsPostPickerOpen(false);
      return;
    }

    if (requestedPostId) {
      setSelectedPostId((current) => current || requestedPostId);
    }
  }, [isPostPromotion, requestedPostId]);

  useEffect(() => {
    if (effectiveSelectedPost?.categoryId && selectedType === 'PIN_CATEGORY' && !selectedCategoryId) {
      setSelectedCategoryId(effectiveSelectedPost.categoryId);
    }
  }, [
    effectiveSelectedPost?.categoryId,
    selectedCategoryId,
    selectedType,
    setSelectedCategoryId,
  ]);

  useEffect(() => {
    if (
      selectedType === 'PIN_CATEGORY' &&
      selectedPostId &&
      selectedCategoryId &&
      effectiveSelectedPost?.categoryId &&
      effectiveSelectedPost.categoryId !== selectedCategoryId
    ) {
      setSelectedPostId('');
    }
  }, [
    effectiveSelectedPost?.categoryId,
    selectedCategoryId,
    selectedPostId,
    selectedType,
  ]);

  const selectedPostHint = useMemo(() => {
    if (!isPostPromotion) return '';
    if (!selectedPostId) return '';
    if (!user?.id && !isAuthLoading) return '请先登录后再选择推广对象';
    if (isVerifyingSelectedPost || isAuthLoading) return '正在校验帖子归属关系';
    if (isLoadSelectedPostError || !effectiveSelectedPost) return '未查询到该帖子，或该帖子不可用';
    if (!isOwnPost) return '该帖子不是你发布的，请使用自己的帖子进入';
    return '';
  }, [
    effectiveSelectedPost,
    isAuthLoading,
    isLoadSelectedPostError,
    isOwnPost,
    isPostPromotion,
    isVerifyingSelectedPost,
    selectedPostId,
    user?.id,
  ]);

  const isLoadingPromotablePosts =
    isPostPromotion &&
    Boolean(user?.id) &&
    (isLoadingMyPosts || (isFetchingMyPosts && myPosts.length === 0));

  const canSubmitPromotionTarget = isPostPromotion
    ? Boolean(selectedPostId && effectiveSelectedPost && isOwnPost && !selectedPostHint)
    : true;

  const openPostPicker = useCallback(() => {
    requireAuth(() => {
      setIsPostPickerOpen(true);
    });
  }, [requireAuth]);

  const handleSelectPromotablePost = useCallback((postId: string, closePicker = false) => {
    setSelectedPostId(postId);
    if (closePicker) setIsPostPickerOpen(false);
  }, []);

  return {
    canSubmitPromotionTarget,
    effectiveSelectedPost,
    handleSelectPromotablePost,
    isLoadingPromotablePosts,
    isPostPickerOpen,
    isVerifyingSelectedPost,
    openPostPicker,
    orderedPromotablePosts,
    promotablePosts,
    selectedPostHint,
    selectedPostId,
    setIsPostPickerOpen,
    setSelectedPostId,
  };
}
