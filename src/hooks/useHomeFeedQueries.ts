import { useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { getHomeFeedPage } from '@/services/api';
import { getHomeFirstScreen } from '@/services/homeFirstScreenApi';
import type { CategoryMetaFeedFilters, Post } from '@/types';
import type { FeedQueryResult } from '@/types/homeFeed';
import type { HomeFeedKind } from '@/features/home/homeTypes';
import { readHomeFeedSnapshot, writeHomeFeedSnapshot, type HomeFeedSnapshotParams } from '@/features/home/homeFeedSnapshotCache';
import { stableHomeFeedParamsKey } from '@/features/home/homeFeedCacheKey';
import { stabilizeHomeBootstrapReferenceData, writeHomeBootstrapSnapshot } from '@/features/home/homeBootstrapSnapshotCache';

const HOME_FEED_PAGE_SIZE = 10;
const HOME_FEED_QUERY_VERSION = 'v8';
const HOME_FEED_STALE_TIME = 1000 * 60 * 2;
const HOME_FEED_GC_TIME = 1000 * 60 * 30;
const HOME_FEED_MAX_PAGES = 5;
const HOME_FEED_RETRY = 0;

interface UseHomeFeedQueriesOptions {
  feedKind: HomeFeedKind;
  categorySlug?: string;
  categoryMetaScope?: string;
  categoryMetaFilters?: CategoryMetaFeedFilters;
  canUseFollowing?: boolean;
  enabled?: boolean;
  viewerId?: string | null;
}

type HomeFeedPage = { items: Post[]; nextCursor: string | null; hasMore: boolean };

type UseHomeFeedQueriesResult = FeedQueryResult & {
  activeQuery: any;
  activeQueryKey: QueryKey;
  fetchNextPage: () => void;
}

function dedupeById<T extends { id?: string | number }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = String(row?.id ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function getNextCursor(lastPage: any) {
  const items = Array.isArray(lastPage?.items) ? lastPage.items : [];
  if (!items.length) return undefined;
  return lastPage?.hasMore && lastPage?.nextCursor ? lastPage.nextCursor : undefined;
}

function getSnapshotData(viewerId: string | null | undefined, params: HomeFeedSnapshotParams): InfiniteData<HomeFeedPage, string | undefined> | undefined {
  const snapshot = readHomeFeedSnapshot(HOME_FEED_QUERY_VERSION, viewerId, params);
  if (!snapshot?.page) return undefined;
  return { pages: [snapshot.page], pageParams: [undefined] };
}

function getSnapshotUpdatedAt(viewerId: string | null | undefined, params: HomeFeedSnapshotParams) {
  return readHomeFeedSnapshot(HOME_FEED_QUERY_VERSION, viewerId, params)?.updatedAt;
}

const commonHomeFeedQueryOptions = {
  staleTime: HOME_FEED_STALE_TIME,
  gcTime: HOME_FEED_GC_TIME,
  maxPages: HOME_FEED_MAX_PAGES,
  retry: HOME_FEED_RETRY,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const;

export function useHomeFeedQueries({
  feedKind,
  categorySlug = '',
  categoryMetaScope = '',
  categoryMetaFilters,
  canUseFollowing = true,
  enabled = true,
  viewerId = null,
}: UseHomeFeedQueriesOptions): UseHomeFeedQueriesResult {
  const queryClient = useQueryClient();
  const homeFeedRequestParamsKey = useMemo(
    () => stableHomeFeedParamsKey({
      feed: feedKind,
      categorySlug: feedKind === 'category' ? categorySlug : '',
      categoryMetaScope,
      categoryMetaFilters,
    }),
    [categoryMetaFilters, categoryMetaScope, categorySlug, feedKind],
  );
  const homeFeedRequestParams = useMemo<HomeFeedSnapshotParams>(
    () => JSON.parse(homeFeedRequestParamsKey) as HomeFeedSnapshotParams,
    [homeFeedRequestParamsKey],
  );

  const homeFeedQueryKey = useMemo<QueryKey>(
    () => ['posts', 'home-feed', HOME_FEED_QUERY_VERSION, viewerId || 'anonymous', homeFeedRequestParamsKey],
    [homeFeedRequestParamsKey, viewerId],
  );

  const initialData = useMemo(() => getSnapshotData(viewerId, homeFeedRequestParams), [homeFeedRequestParams, viewerId]);
  const initialDataUpdatedAt = useMemo(() => getSnapshotUpdatedAt(viewerId, homeFeedRequestParams), [homeFeedRequestParams, viewerId]);

  const homeFeedQuery = useInfiniteQuery({
    queryKey: homeFeedQueryKey,
    queryFn: async ({ pageParam, signal }) => {
      if (!pageParam) {
        const firstScreen = await getHomeFirstScreen(
          {
            feed: homeFeedRequestParams.feed,
            categorySlug: homeFeedRequestParams.categorySlug,
            categoryMetaScope: homeFeedRequestParams.categoryMetaScope,
            categoryMetaFilters: homeFeedRequestParams.categoryMetaFilters,
            limit: HOME_FEED_PAGE_SIZE,
          },
          { signal }
        );
        if (firstScreen.bootstrap) {
          const stableBootstrap = stabilizeHomeBootstrapReferenceData(firstScreen.bootstrap) || firstScreen.bootstrap;
          queryClient.setQueryData(['home', 'bootstrap'], stableBootstrap);
          queryClient.setQueryData(['config'], stableBootstrap.config);
          queryClient.setQueryData(['categories'], stableBootstrap.categories);
          queryClient.setQueryData(['promotions', 'home-ads'], stableBootstrap.homeAds);
          writeHomeBootstrapSnapshot(stableBootstrap);
        }
        return firstScreen.feed;
      }

      return getHomeFeedPage(
        {
          feed: homeFeedRequestParams.feed,
          categorySlug: homeFeedRequestParams.categorySlug,
          categoryMetaScope: homeFeedRequestParams.categoryMetaScope,
          categoryMetaFilters: homeFeedRequestParams.categoryMetaFilters,
          limit: HOME_FEED_PAGE_SIZE,
          cursor: pageParam as string | undefined,
        },
        { signal }
      );
    },
    getNextPageParam: getNextCursor,
    initialPageParam: undefined as string | undefined,
    initialData,
    initialDataUpdatedAt,
    enabled: enabled && (feedKind !== 'following' || canUseFollowing),
    ...commonHomeFeedQueryOptions,
  });

  useEffect(() => {
    const firstPage = homeFeedQuery.data?.pages?.[0];
    if (!firstPage || homeFeedQuery.isPlaceholderData || homeFeedQuery.isError) return;
    writeHomeFeedSnapshot(HOME_FEED_QUERY_VERSION, viewerId, homeFeedRequestParams, firstPage);
  }, [homeFeedQuery.data, homeFeedQuery.isError, homeFeedQuery.isPlaceholderData, homeFeedRequestParams, viewerId]);

  const activeQuery = homeFeedQuery;
  const activeQueryKey = homeFeedQueryKey;

  const pages = activeQuery.data?.pages;
  const posts = useMemo<Post[]>(() => {
    if (!pages?.length) return [];
    const merged: Post[] = [];
    for (const page of pages) {
      if (page?.items?.length) merged.push(...page.items);
    }
    return dedupeById(merged);
  }, [pages]);

  const displayPosts = posts;

  return {
    activeQuery,
    activeQueryKey,
    posts,
    displayPosts,
    hasNextPage: Boolean(activeQuery.hasNextPage),
    isFetchingNextPage: activeQuery.isFetchingNextPage,
    fetchNextPage: activeQuery.fetchNextPage,
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    isFetched: activeQuery.isFetched,
    isFetching: activeQuery.isFetching,
    isPlaceholderData: activeQuery.isPlaceholderData,
  };
}
