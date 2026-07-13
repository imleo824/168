export const POST_COLLECTION_ROOT_KEYS = ['posts', 'likes'] as const;

export type PostCollectionRootKey = typeof POST_COLLECTION_ROOT_KEYS[number];
export type PostPatch = Record<string, unknown> | ((post: any) => Record<string, unknown>);

function resolvePostPatch(post: any, patch: PostPatch) {
  return typeof patch === 'function' ? patch(post) : patch;
}

export function updatePostCollectionCache(old: any, postId: string, patch: PostPatch) {
  const updatePost = (p: any) => p?.id === postId ? { ...p, ...resolvePostPatch(p, patch) } : p;

  if (Array.isArray(old)) {
    return old.map(updatePost);
  }

  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) {
          return page.map(updatePost);
        }
        if (Array.isArray(page?.items)) {
          return {
            ...page,
            items: page.items.map(updatePost),
          };
        }
        return page;
      }),
    };
  }

  return old;
}

export function updatePostEverywhere(queryClient: any, postId: string, patch: PostPatch) {
  queryClient.setQueryData(['post', postId], (old: any) => {
    if (!old) return old;
    return { ...old, ...resolvePostPatch(old, patch) };
  });

  for (const rootKey of POST_COLLECTION_ROOT_KEYS) {
    queryClient.setQueriesData({ queryKey: [rootKey] }, (old: any) =>
      updatePostCollectionCache(old, postId, patch),
    );
  }
}

function removePostFromCollectionCache(old: any, postId: string) {
  const removePost = (items: any[]) => items.filter((p: any) => p?.id !== postId);

  if (Array.isArray(old)) {
    return removePost(old);
  }

  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) return removePost(page);
        if (Array.isArray(page?.items)) {
          return {
            ...page,
            items: removePost(page.items),
          };
        }
        return page;
      }),
    };
  }

  return old;
}

function getPostAuthorId(post: any) {
  return String(post?.userId || post?.user?.id || post?.authorId || post?.creatorId || '').trim();
}

function removeAuthorFromCollectionCache(old: any, authorId: string) {
  const removeAuthorPosts = (items: any[]) => items.filter((p: any) => getPostAuthorId(p) !== authorId);

  if (Array.isArray(old)) {
    return removeAuthorPosts(old);
  }

  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) return removeAuthorPosts(page);
        if (Array.isArray(page?.items)) {
          return {
            ...page,
            items: removeAuthorPosts(page.items),
          };
        }
        return page;
      }),
    };
  }

  return old;
}

export function removePostFromRootCaches(queryClient: any, postId: string, rootKeys: PostCollectionRootKey[]) {
  for (const rootKey of rootKeys) {
    queryClient.setQueriesData({ queryKey: [rootKey] }, (old: any) =>
      removePostFromCollectionCache(old, postId),
    );
  }
}

export function removeAuthorFromRootCaches(
  queryClient: any,
  authorId: string,
  rootKeys: readonly PostCollectionRootKey[],
) {
  for (const rootKey of rootKeys) {
    queryClient.setQueriesData({ queryKey: [rootKey] }, (old: any) =>
      removeAuthorFromCollectionCache(old, authorId),
    );
  }
}

export function markPostCachesStale(
  queryClient: any,
  postId: string,
  rootKeys: readonly PostCollectionRootKey[] = POST_COLLECTION_ROOT_KEYS,
) {
  queryClient.invalidateQueries({ queryKey: ['post', postId], refetchType: 'none' });
  for (const rootKey of rootKeys) {
    queryClient.invalidateQueries({ queryKey: [rootKey], refetchType: 'none' });
  }
}

export function findPostInCollectionCache(old: any, postId: string): any | null {
  if (Array.isArray(old)) {
    return old.find((p: any) => p?.id === postId) ?? null;
  }

  if (old?.pages && Array.isArray(old.pages)) {
    for (const page of old.pages) {
      const list = Array.isArray(page) ? page : page?.items;
      if (!Array.isArray(list)) continue;
      const found = list.find((p: any) => p?.id === postId);
      if (found) return found;
    }
  }

  return null;
}

export function findPostInKnownCaches(queryClient: any, postId: string): any | null {
  if (!postId) return null;

  const exactPost = queryClient.getQueryData(['post', postId]);
  if (exactPost) return exactPost;

  const queryGroups = [
    ...POST_COLLECTION_ROOT_KEYS.map((rootKey) => queryClient.getQueriesData({ queryKey: [rootKey] })),
  ];

  for (const group of queryGroups) {
    for (const [, data] of group) {
      const found = findPostInCollectionCache(data, postId);
      if (found) return found;
    }
  }

  return null;
}

export function flattenPageItems<T>(data: any): T[] {
  if (!data?.pages?.length) return [];
  const items: T[] = [];
  for (const page of data.pages) {
    if (Array.isArray(page?.items)) items.push(...page.items);
  }
  return items;
}

export function seedPostDetailCache(queryClient: any, postId: string) {
  if (!postId || queryClient.getQueryData(['post', postId])) return;
  const cachedPost = findPostInKnownCaches(queryClient, postId);
  if (cachedPost) {
    if (cachedPost.isFeedPreview) return;
    queryClient.setQueryData(['post', postId], cachedPost);
  }
}

export function runWhenIdle(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return;
  }

  const scheduleIdle = (window as any).requestIdleCallback as
    | undefined
    | ((handler: () => void, options?: { timeout?: number }) => number);

  if (scheduleIdle) {
    scheduleIdle(callback, { timeout: 900 });
    return;
  }

  window.setTimeout(callback, 120);
}
