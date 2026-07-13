import { useCallback, useEffect, useRef, useState } from 'react';

import { shareWithSystem, type SharePayload } from '@/utils/share';

import { isAbortLike } from './postDetailLegacyUtils';

type RecordShareMutation = {
  mutateAsync: () => Promise<{ shareCount?: number } | undefined>;
};

type UsePostDetailShareArgs = {
  post: any;
  recordShare: RecordShareMutation;
  sharePayload: SharePayload | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
};

export function usePostDetailShare({
  post,
  recordShare,
  sharePayload,
  showToast,
}: UsePostDetailShareArgs) {
  const [shareCount, setShareCount] = useState(0);
  const [isSharing, setIsSharing] = useState(false);
  const shareInFlightRef = useRef(false);

  useEffect(() => {
    setShareCount(post?.shareCount || 0);
    shareInFlightRef.current = false;
    setIsSharing(false);
  }, [post?.shareCount, post?.id]);

  const handleShare = useCallback(async () => {
    if (!post || !sharePayload || shareInFlightRef.current) return;

    shareInFlightRef.current = true;
    setIsSharing(true);
    try {
      await shareWithSystem(sharePayload);
      try {
        const result = await recordShare.mutateAsync();
        if (typeof result?.shareCount === 'number') {
          setShareCount(result.shareCount);
        } else {
          setShareCount((count) => count + 1);
        }
      } catch (countError) {
        console.warn('Failed to record share count', countError);
      }
    } catch (shareError) {
      if (!isAbortLike(shareError)) {
        showToast(shareError instanceof Error ? shareError.message : '分享失败，请稍后重试', 'error');
      }
    } finally {
      shareInFlightRef.current = false;
      setIsSharing(false);
    }
  }, [post, recordShare, sharePayload, showToast]);

  return {
    handleShare,
    isSharing,
    shareCount,
  };
}
