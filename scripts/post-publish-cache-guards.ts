import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';

import { buildHomeFeedSnapshotKey, readHomeFeedSnapshot, writeHomeFeedSnapshot } from '../src/features/home/homeFeedSnapshotCache';
import { synchronizePostPublishCache } from '../src/features/post/postPublishCache';
import { postQueryKeys } from '../src/features/post/postQueryKeys';
import type { Post } from '../src/types';
import { safeLocalStorage } from '../src/utils/storage';

const viewerId = 'author-1';
const post = {
  id: 'post-new',
  title: '新内容',
  content: '发布后应立即出现在作者自己的列表中',
  contact: '',
  images: [],
  isPublished: true,
  viewCount: 0,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  quoteCount: 0,
  isPinned: false,
  isAnonymous: false,
  createdAt: new Date().toISOString(),
  userId: viewerId,
} satisfies Post;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const ownListKey = postQueryKeys.list({ userId: viewerId, limit: 30 });
const ownInfiniteKey = postQueryKeys.infinite({ userId: viewerId });
const otherUserKey = postQueryKeys.list({ userId: 'author-2', limit: 30 });
const rankedHomeKey = ['posts', 'home-feed', 'v8', viewerId, '{}'] as const;
const existingOwnPost = { ...post, id: 'post-old' };
const otherPost = { ...post, id: 'post-other', userId: 'author-2' };

queryClient.setQueryData(ownListKey, [existingOwnPost]);
queryClient.setQueryData(otherUserKey, [otherPost]);
queryClient.setQueryData(rankedHomeKey, {
  pages: [{ items: [existingOwnPost], nextCursor: null, hasMore: false }],
  pageParams: [undefined],
});

const snapshotParams = { feed: 'recommended' as const };
writeHomeFeedSnapshot('v8', viewerId, snapshotParams, {
  items: [existingOwnPost],
  nextCursor: null,
  hasMore: false,
});
assert.ok(safeLocalStorage.getItem(buildHomeFeedSnapshotKey('v8', viewerId, snapshotParams)));

await synchronizePostPublishCache(queryClient, post, viewerId);

assert.equal((queryClient.getQueryData<Post[]>(ownListKey) || [])[0]?.id, post.id);
assert.equal(
  (queryClient.getQueryData<any>(ownInfiniteKey)?.pages?.[0]?.items || [])[0]?.id,
  post.id,
);
assert.deepEqual(queryClient.getQueryData(otherUserKey), [otherPost]);
assert.equal(
  queryClient.getQueryData<any>(rankedHomeKey)?.pages?.[0]?.items?.[0]?.id,
  existingOwnPost.id,
  'ranked feeds must be reconciled by the server instead of receiving an unsafe local insertion',
);
assert.equal(queryClient.getQueryData(['post', post.id]), post);
assert.equal(readHomeFeedSnapshot('v8', viewerId, snapshotParams), null);
assert.equal(queryClient.getQueryState(rankedHomeKey)?.isInvalidated, true);

console.log('[post-publish-cache-guards] passed');
