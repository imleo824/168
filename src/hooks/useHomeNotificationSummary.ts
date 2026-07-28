import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getHomeNotificationSummary } from '@/services/homeStartupApi';
import { safeLocalStorage } from '@/utils/storage';
import type { FeedBadgeCounts, FeedTabId } from '@/types';

import { usePageVisibility } from './usePageVisibility';

const LIVE_BADGE_STALE_TIME = 1000 * 20;

type FeedSeenAt = Record<FeedTabId, string>;

const FEED_SEEN_STORAGE_KEYS: Record<FeedTabId, string> = {
  following: 'feed_seen_at_following',
  discover: 'feed_seen_at_discover',
};

const emptyFeedUpdateCounts: FeedBadgeCounts = {
  following: { count: 0, hasMore: false },
  discover: { count: 0, hasMore: false },
};

function readFeedSeenAt() {
  const now = new Date().toISOString();
  const seenAt = {
    following: safeLocalStorage.getItem(FEED_SEEN_STORAGE_KEYS.following) || now,
    discover: safeLocalStorage.getItem(FEED_SEEN_STORAGE_KEYS.discover) || now,
  };

  for (const tab of Object.keys(FEED_SEEN_STORAGE_KEYS) as FeedTabId[]) {
    if (!safeLocalStorage.getItem(FEED_SEEN_STORAGE_KEYS[tab])) {
      safeLocalStorage.setItem(FEED_SEEN_STORAGE_KEYS[tab], seenAt[tab]);
    }
  }

  return seenAt;
}

export function useHomeNotificationSummary(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [seenAt, setSeenAt] = useState<FeedSeenAt>(() => readFeedSeenAt());
  const seenAtRef = useRef(seenAt);
  const isPageVisible = usePageVisibility();
  const shouldPoll = enabled && isPageVisible;

  useEffect(() => {
    seenAtRef.current = seenAt;
  }, [seenAt]);

  const query = useQuery({
    queryKey: ['notifications', 'home-summary'],
    queryFn: async () => {
      const requestedSeenAt = seenAtRef.current;
      const summary = await getHomeNotificationSummary({
        followingSince: requestedSeenAt.following,
        discoverSince: requestedSeenAt.discover,
      });
      return { ...summary, requestedSeenAt };
    },
    enabled: shouldPoll,
    staleTime: LIVE_BADGE_STALE_TIME,
    refetchInterval: shouldPoll ? 1000 * 60 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    queryClient.setQueryData(['notifications', 'following'], data.followStatus);
    queryClient.setQueryData(['notifications', 'feed-counts', data.requestedSeenAt], data.feedCounts);
  }, [query.data, queryClient]);

  const markFeedSeen = useCallback((tab: FeedTabId) => {
    const nextValue = new Date().toISOString();
    safeLocalStorage.setItem(FEED_SEEN_STORAGE_KEYS[tab], nextValue);
    const nextSeenAt = { ...seenAtRef.current, [tab]: nextValue };
    seenAtRef.current = nextSeenAt;
    setSeenAt(nextSeenAt);
    queryClient.setQueriesData({ queryKey: ['notifications', 'home-summary'] }, (old: any) => {
      if (!old?.feedCounts?.[tab]) return old;
      return {
        ...old,
        feedCounts: {
          ...old.feedCounts,
          [tab]: { count: 0, hasMore: false },
        },
      };
    });
    queryClient.setQueriesData({ queryKey: ['notifications', 'feed-counts'] }, (old: any) => {
      if (!old?.[tab]) return old;
      return {
        ...old,
        [tab]: { count: 0, hasMore: false },
      };
    });
  }, [queryClient]);

  return {
    ...query,
    followStatus: query.data?.followStatus || { hasNew: false },
    counts: query.data?.feedCounts || emptyFeedUpdateCounts,
    markFeedSeen,
  };
}
