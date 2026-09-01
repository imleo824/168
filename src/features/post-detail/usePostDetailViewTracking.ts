import { useEffect } from 'react';

import {
  deleteRecordedViewTimestamp,
  getRecordedViewTimestamp,
  pruneRecordedViews,
  RECORDED_VIEW_TTL_MS,
  setRecordedViewTimestamp,
} from './postDetailLegacyUtils';

type RecordViewMutation = {
  mutate: (variables?: undefined, options?: { onError?: () => void }) => unknown;
};

export function usePostDetailViewTracking(postId: string | undefined, recordView: RecordViewMutation) {
  useEffect(() => {
    if (!postId) return;

    const now = Date.now();

    pruneRecordedViews(now);

    const existsAt = getRecordedViewTimestamp(postId);
    if (existsAt && now - existsAt < RECORDED_VIEW_TTL_MS) return;

    setRecordedViewTimestamp(postId, now);
    pruneRecordedViews(now);

    try {
      recordView.mutate(undefined, {
        onError: () => {
          deleteRecordedViewTimestamp(postId);
        },
      });
    } catch {
      deleteRecordedViewTimestamp(postId);
    }
  }, [postId, recordView]);
}
