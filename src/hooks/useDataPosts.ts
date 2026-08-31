import { useCallback, useMemo, useRef } from 'react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/services/api';
import type { CategoryMetaFeedFilters } from '@/types';

import {
  POST_COLLECTION_ROOT_KEYS,
  findPostInCollectionCache,
  findPostInKnownCaches,
  flattenPageItems,
  markPostCachesStale,
  removeAuthorFromRootCaches,
  removePostFromRootCaches,
  runWhenIdle,
  seedPostDetailCache,
  updatePostEverywhere,
} from './useDataCache';

const FEED_PAGE_SIZE = 20;
const LIST_STALE_TIME = 1000 * 60;
const LIST_GC_TIME = 1000 * 60 * 25;
const DETAIL_STALE_TIME = 1000 * 30;

type PrefetchPostOptions = {
  network?: 'immediate' | 'idle' | 'none';
};

export function usePrefetchPost() {
  const queryClient = useQueryClient();
  return useCallback((id: string, options: PrefetchPostOptions = {}) => {
    if (!id) return;
    seedPostDetailCache(queryClient, id);

    if (options.network === 'none') return;

    const prefetch = () => {
      void queryClient.prefetchQuery({
        queryKey: ['post', id],
        queryFn: () => api.getPost(id),
        staleTime: DETAIL_STALE_TIME,
      });
    };

    if (options.network === 'idle') {
      runWhenIdle(prefetch);
      return;
    }

    void queryClient.prefetchQuery({
      queryKey: ['post', id],
      queryFn: () => api.getPost(id),
      staleTime: DETAIL_STALE_TIME,
    });
  }, [queryClient]);
}

export function useReducePostRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => api.reducePostRecommendation(postId),
    onSuccess: (result) => {
      if (result?.postId) {
        removePostFromRootCaches(queryClient, result.postId, ['posts']);
        queryClient.invalidateQueries({ queryKey: ['post', result.postId], refetchType: 'none' });
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'feed-counts'] });
    },
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.blockUser(userId),
    onSuccess: (_result, userId) => {
      if (userId) {
        removeAuthorFromRootCaches(queryClient, userId, POST_COLLECTION_ROOT_KEYS);
        queryClient.invalidateQueries({ queryKey: ['user', userId], refetchType: 'none' });
        queryClient.invalidateQueries({ queryKey: ['block-status', userId], refetchType: 'none' });
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['likes'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'feed-counts'] });
    },
  });
}

export function usePosts(params: { categoryId?: string; userId?: string; country?: string; query?: string; limit?: number; location?: string; quotedOnly?: boolean; categoryMetaScope?: string; categoryMetaFilters?: CategoryMetaFeedFilters; enabled?: boolean }) {
  return useQuery({
    queryKey: ['posts', params],
    queryFn: ({ signal }) => api.getPosts(params, { signal, retry: false }),
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    enabled: params.enabled !== false,
    retry: false,
  });
}

export function useInfinitePosts(params: { categoryId?: string; userId?: string; country?: string; query?: string; location?: string; categoryMetaScope?: string; categoryMetaFilters?: CategoryMetaFeedFilters; enabled?: boolean }) {
  const { enabled, ...requestParams } = params;
  return useInfiniteQuery({
    queryKey: ['posts', 'infinite', requestParams],
    queryFn: ({ pageParam, signal }) => api.getPostsPage({
      ...requestParams,
      limit: FEED_PAGE_SIZE,
      cursor: pageParam as string | undefined,
    }, { signal, retry: false }),
    maxPages: 8,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    enabled: enabled !== false,
    retry: false,
    select: (data) => {
      const dedupedItems = new Set<string>();

      const pages = data.pages.map((page) => ({
        ...page,
        items: (page.items || []).filter((item: any) => {
          const id = item?.id;
          if (!id || dedupedItems.has(id)) return false;
          dedupedItems.add(id);
          return true;
        }),
      }));

      return {
        ...data,
        pages,
      };
    },
  });
}

export function usePost(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['post', id],
    queryFn: async ({ signal }) => {
      const post = await api.getPost(id!, { signal, retry: false });
      return post || null;
    },
    placeholderData: () => {
      if (!id) return undefined;
      const cachedPost = findPostInKnownCaches(queryClient, id);
      return cachedPost?.isFeedPreview ? undefined : cachedPost;
    },
    staleTime: DETAIL_STALE_TIME,
    gcTime: LIST_GC_TIME,
    enabled: !!id,
    retry: false,
  });
}

export function usePostStats(postId: string, initialStats?: { hasLiked: boolean, likeCount: number, viewCount?: number }) {
  const queryClient = useQueryClient();
  const toggleInFlightRef = useRef(false);

  const toggle = useMutation({
    mutationFn: () => api.toggleLike(postId),
    onMutate: async () => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['post', postId] });
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      await queryClient.cancelQueries({ queryKey: ['likes'] });

      // Snapshot the previous values
      const previousPost = queryClient.getQueryData(['post', postId]);
      const previousPosts = queryClient.getQueriesData<any[]>({ queryKey: ['posts'] });
      const previousLikes = queryClient.getQueriesData<any[]>({ queryKey: ['likes'] });

      // Determine the current state
      let currentLiked = false;
      let currentCount = 0;

      if (previousPost) {
        currentLiked = !!(previousPost as any).hasLiked;
        currentCount = (previousPost as any).likeCount || 0;
      } else {
        let found = false;
        for (const [, data] of previousPosts) {
          const item = findPostInCollectionCache(data, postId);
          if (item) {
            currentLiked = !!item.hasLiked;
            currentCount = item.likeCount || 0;
            found = true;
            break;
          }
        }
        if (!found && initialStats) {
          currentLiked = !!initialStats.hasLiked;
          currentCount = initialStats.likeCount || 0;
        }
      }

      const nextLiked = !currentLiked;
      const nextLikeCount = Math.max(0, currentCount + (nextLiked ? 1 : -1));

      updatePostEverywhere(queryClient, postId, {
        hasLiked: nextLiked,
        likeCount: nextLikeCount,
      });

      return { previousPost, previousPosts, previousLikes };
    },
    onError: (_err, _variables, context) => {
      // Rollback to previous state
      if (context) {
        if (context.previousPost) {
          queryClient.setQueryData(['post', postId], context.previousPost);
        }
        if (context.previousPosts) {
          context.previousPosts.forEach(([key, value]) => {
            queryClient.setQueryData(key, value);
          });
        }
        if (context.previousLikes) {
          context.previousLikes.forEach(([key, value]) => {
            queryClient.setQueryData(key, value);
          });
        }
      }
    },
    onSuccess: (result) => {
      const exactPatch = {
        hasLiked: result.liked,
        likeCount: result.likeCount,
        ...(typeof result.viewCount === 'number' ? { viewCount: result.viewCount } : {}),
      };

      updatePostEverywhere(queryClient, postId, exactPatch);
      if (!result.liked) {
        removePostFromRootCaches(queryClient, postId, ['likes']);
      }
    },
    onSettled: () => {
      toggleInFlightRef.current = false;
      markPostCachesStale(queryClient, postId);
      queryClient.invalidateQueries({ queryKey: ['post-likers', postId] });
      queryClient.invalidateQueries({ queryKey: ['user-profile'], refetchType: 'none' });
    },
  });

  const guardedToggleLike = useCallback(() => {
    if (toggleInFlightRef.current || toggle.isPending) {
      return Promise.resolve(undefined);
    }
    toggleInFlightRef.current = true;
    return toggle.mutateAsync().finally(() => {
      toggleInFlightRef.current = false;
    });
  }, [toggle]);

  const cd = queryClient.getQueryData(['post', postId]) as any;

  const hasLiked = cd?.hasLiked !== undefined ? !!cd.hasLiked : (initialStats?.hasLiked ?? false);
  const likeCount = cd?.likeCount !== undefined ? cd.likeCount : (initialStats?.likeCount ?? 0);
  const viewCount = cd?.viewCount !== undefined ? cd.viewCount : (initialStats?.viewCount ?? 0);

  return { toggleLike: guardedToggleLike, isPending: toggle.isPending, hasLiked, likeCount, viewCount };
}

export function useLikes(enabled: boolean = true) {
  return useQuery({
    queryKey: ['likes'],
    queryFn: api.getLikes,
    enabled,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useMyComments(enabled: boolean = true) {
  return useQuery({
    queryKey: ['comments', 'me'],
    queryFn: api.getMyComments,
    enabled,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function usePostLikers(postId: string | undefined, enabled: boolean = true, limit = 24) {
  return useQuery({
    queryKey: ['post-likers', postId, limit],
    queryFn: () => api.getPostLikers(postId!, { limit }),
    enabled: enabled && !!postId,
    staleTime: 1000 * 30,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
}

export function useRecordShare(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.recordShare(postId),
    onSuccess: (result) => {
      const patch = { shareCount: result.shareCount };
      updatePostEverywhere(queryClient, postId, patch);
    },
    onSettled: () => {
      markPostCachesStale(queryClient, postId, ['posts', 'likes']);
    },
  });
}

export function usePostQuotes(postId: string | undefined, enabled: boolean = true) {
  const query = useInfiniteQuery({
    queryKey: ['post-quotes', postId],
    queryFn: ({ pageParam, signal }) => api.getPostQuotesPage({
      postId: postId!,
      limit: FEED_PAGE_SIZE,
      cursor: pageParam as string | undefined,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    maxPages: 6,
    enabled: enabled && !!postId,
    staleTime: LIST_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
  const data = useMemo(() => flattenPageItems<any>(query.data), [query.data]);
  return { ...query, data };
}

export function useRecordView(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.recordView(postId),
    onSuccess: (result) => {
      if (typeof result.viewCount !== 'number') return;
      updatePostEverywhere(queryClient, postId, { viewCount: result.viewCount });
    },
  });
}
