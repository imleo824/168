import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/services/api';
import { safeLocalStorage } from '@/utils/storage';
import type { FeedBadgeCounts, FeedTabId, JoinedTopic } from '@/types';

import { flattenPageItems } from './useDataCache';
import { usePageVisibility } from './usePageVisibility';

const FEED_PAGE_SIZE = 20;
const USER_LIST_PAGE_SIZE = 30;
const LIST_STALE_TIME = 1000 * 60;
const LIST_GC_TIME = 1000 * 60 * 25;
const PROFILE_STALE_TIME = 1000 * 60;
const LIVE_BADGE_STALE_TIME = 1000 * 20;
const FOLLOW_STATUS_STALE_TIME = 1000 * 60 * 5;

// Follow buttons appear in feed cards. Keep their status cache longer so repeated
// home visits, tab switches, and remounts do not create a request per visible card.
const FOLLOW_STATUS_GC_TIME = 1000 * 60 * 30;

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

export function useFollowUser(targetUserId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (following: boolean) => following ? api.followUser(targetUserId) : api.unfollowUser(targetUserId),
    onMutate: async (following: boolean) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['follow-status', targetUserId] });

      // Snapshot the previous value
      const previousStatus = queryClient.getQueryData(['follow-status', targetUserId]);

      // Optimistically update to the new value
      queryClient.setQueryData(['follow-status', targetUserId], { following });

      return { previousStatus };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousStatus) {
        queryClient.setQueryData(['follow-status', targetUserId], context.previousStatus);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-status', targetUserId] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'following'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'fans'] });
    },
  });
}

export function useJoinedTopics(enabled: boolean = true, scopeKey: string = 'anonymous') {
  return useQuery({
    queryKey: ['topics', 'joined', scopeKey],
    queryFn: api.getJoinedTopics,
    enabled,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useTopicJoinStatus(topicId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['topics', 'join-status', topicId],
    queryFn: () => api.getTopicJoinStatus(topicId!),
    enabled: Boolean(topicId && enabled),
    staleTime: 1000 * 30,
  });
}

export function useJoinTopic(topicId: string | undefined, topicName: string) {
  const queryClient = useQueryClient();
  const normalizedTopicName = String(topicName || '').trim();
  type TopicJoinMutationResult = { success: boolean; topic?: JoinedTopic };

  return useMutation({
    mutationFn: (joined: boolean): Promise<TopicJoinMutationResult> => {
      if (!topicId) return Promise.reject(new Error('话题不存在'));
      return joined ? api.joinTopic(topicId, normalizedTopicName) : api.leaveTopic(topicId);
    },
    onMutate: async (joined: boolean) => {
      if (!topicId) return {};
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['topics', 'join-status', topicId] }),
        queryClient.cancelQueries({ queryKey: ['topics', 'joined'] }),
      ]);

      const previousStatus = queryClient.getQueryData(['topics', 'join-status', topicId]);
      const previousJoinedTopics = queryClient.getQueryData<JoinedTopic[]>(['topics', 'joined']);
      queryClient.setQueryData(['topics', 'join-status', topicId], { joined });

      if (previousJoinedTopics) {
        queryClient.setQueryData<JoinedTopic[]>(['topics', 'joined'], (current = []) => {
          if (joined) {
            if (current.some((topic) => topic.id === topicId)) return current;
            return [
              {
                id: topicId,
                name: normalizedTopicName || topicId,
                createdAt: new Date().toISOString(),
              },
              ...current,
            ];
          }
          return current.filter((topic) => topic.id !== topicId);
        });
      }

      return { previousStatus, previousJoinedTopics };
    },
    onError: (_error, _joined, context) => {
      if (!topicId) return;
      if (context?.previousStatus) {
        queryClient.setQueryData(['topics', 'join-status', topicId], context.previousStatus);
      }
      if (context?.previousJoinedTopics) {
        queryClient.setQueryData(['topics', 'joined'], context.previousJoinedTopics);
      }
    },
    onSuccess: (result, joined) => {
      if (!topicId) return;
      queryClient.setQueryData(['topics', 'join-status', topicId], { joined });
      if (joined && result.topic) {
        queryClient.setQueryData<JoinedTopic[]>(['topics', 'joined'], (current = []) => {
          const withoutCurrent = current.filter((topic) => topic.id !== result.topic.id);
          return [result.topic, ...withoutCurrent];
        });
      }
    },
    onSettled: () => {
      if (topicId) {
        queryClient.invalidateQueries({ queryKey: ['topics', 'join-status', topicId] });
      }
      queryClient.invalidateQueries({ queryKey: ['topics', 'joined'] });
    },
  });
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
      const summary = await api.getHomeNotificationSummary({
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

export function useFollowingUsers(enabled: boolean = true) {
  const query = useInfiniteQuery({
    queryKey: ['users', 'following'],
    queryFn: ({ pageParam, signal }) => api.getFollowingUsersPage({
      limit: USER_LIST_PAGE_SIZE,
      cursor: pageParam as string | undefined,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    maxPages: 8,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
  const data = useMemo(() => flattenPageItems<any>(query.data), [query.data]);
  return { ...query, data };
}

export function useFans(enabled: boolean = true) {
  const query = useInfiniteQuery({
    queryKey: ['users', 'fans'],
    queryFn: ({ pageParam, signal }) => api.getFansPage({
      limit: USER_LIST_PAGE_SIZE,
      cursor: pageParam as string | undefined,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    maxPages: 8,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
  const data = useMemo(() => flattenPageItems<any>(query.data), [query.data]);
  return { ...query, data };
}

export function useUser(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['user-profile', id],
    queryFn: () => api.getUser(id!),
    enabled: enabled && !!id,
    staleTime: PROFILE_STALE_TIME,
    gcTime: LIST_GC_TIME,
  });
}

export function useFollowStatus(userId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['follow-status', userId],
    queryFn: () => api.getFollowStatus(userId!),
    enabled: !!userId && enabled,
    staleTime: FOLLOW_STATUS_STALE_TIME,
    gcTime: FOLLOW_STATUS_GC_TIME,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
