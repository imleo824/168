import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { clearHomeFeedSnapshots } from '@/features/home/homeFeedSnapshotCache';
import type { Post } from '@/types';
import { postQueryKeys } from './postQueryKeys';

type PostCollectionParams = {
  userId?: string;
  categoryId?: string;
  country?: string;
  query?: string;
  location?: string;
  quotedOnly?: boolean;
  categoryMetaScope?: string;
  categoryMetaFilters?: Record<string, unknown>;
};

function getPostCollectionParams(queryKey: QueryKey): PostCollectionParams | null {
  if (queryKey[0] !== 'posts') return null;
  const candidate = queryKey[1] === 'infinite' || queryKey[1] === 'list'
    ? queryKey[2]
    : queryKey[1];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as PostCollectionParams;
}

function isUnfilteredOwnPostCollection(queryKey: QueryKey, post: Post, viewerId: string) {
  const params = getPostCollectionParams(queryKey);
  if (!params || params.userId !== viewerId) return false;
  if (params.categoryId || params.country || params.query || params.location) return false;
  if (params.categoryMetaScope || params.categoryMetaFilters) return false;
  return params.quotedOnly !== true || Boolean(post.quotedPostId);
}

function prependPost(items: Post[], post: Post) {
  return [post, ...items.filter((item) => item?.id !== post.id)];
}

function prependPostToCollection(current: unknown, post: Post): unknown {
  if (Array.isArray(current)) return prependPost(current, post);
  if (!current || typeof current !== 'object') return current;

  const paged = current as { pages?: unknown[] };
  if (!Array.isArray(paged.pages) || paged.pages.length === 0) return current;

  const pages = paged.pages.map((page) => {
    if (Array.isArray(page)) return page.filter((item) => item?.id !== post.id);
    if (!page || typeof page !== 'object') return page;
    const pageWithItems = page as { items?: Post[] };
    if (!Array.isArray(pageWithItems.items)) return page;
    return {
      ...pageWithItems,
      items: pageWithItems.items.filter((item) => item?.id !== post.id),
    };
  });

  const firstPage = pages[0];
  pages[0] = Array.isArray(firstPage)
    ? prependPost(firstPage, post)
    : {
        ...(firstPage as Record<string, unknown>),
        items: prependPost(((firstPage as { items?: Post[] })?.items || []), post),
      };

  return { ...current, pages };
}

function seedPublishedPostForOwner(queryClient: QueryClient, post: Post, viewerId: string) {
  queryClient.setQueryData(['post', post.id], post);

  const ownListKey = postQueryKeys.list({ userId: viewerId, limit: 30 });
  const ownInfiniteKey = postQueryKeys.infinite({ userId: viewerId });
  if (queryClient.getQueryData(ownListKey) === undefined) {
    queryClient.setQueryData(ownListKey, [post]);
  }
  if (queryClient.getQueryData(ownInfiniteKey) === undefined) {
    queryClient.setQueryData(ownInfiniteKey, {
      pages: [{ items: [post], nextCursor: null, hasMore: false }],
      pageParams: [undefined],
    });
  }
  if (post.quotedPostId) {
    const ownQuotesKey = postQueryKeys.list({ userId: viewerId, quotedOnly: true, limit: 30 });
    if (queryClient.getQueryData(ownQuotesKey) === undefined) {
      queryClient.setQueryData(ownQuotesKey, [post]);
    }
  }

  for (const [queryKey, current] of queryClient.getQueriesData({ queryKey: ['posts'] })) {
    if (!isUnfilteredOwnPostCollection(queryKey, post, viewerId)) continue;
    queryClient.setQueryData(queryKey, prependPostToCollection(current, post));
  }
}

/**
 * Makes a successful publish immediately visible to its author, then lets the
 * server reconcile ranked and filtered collections in the background.
 */
export function synchronizePostPublishCache(
  queryClient: QueryClient,
  post: Post,
  viewerId: string,
) {
  seedPublishedPostForOwner(queryClient, post, viewerId);
  clearHomeFeedSnapshots();

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' }),
    queryClient.invalidateQueries({ queryKey: ['user-profile', viewerId], refetchType: 'active' }),
    queryClient.invalidateQueries({ queryKey: ['notifications', 'feed-counts'], refetchType: 'active' }),
  ]);
}
