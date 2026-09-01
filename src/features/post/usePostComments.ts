import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { getPostCommentsPage, type PostComment, type CommentPage } from '@/services/api';

export type { PostComment, CommentPage };
export type PostCommentUser = {
  id: string;
  displayName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  userType?: string | null;
};

export function usePostComments(postId: string | undefined, enabled: boolean = true) {
  const query = useInfiniteQuery({
    queryKey: ['post-comments', postId],
    queryFn: ({ pageParam, signal }) => getPostCommentsPage({
      postId: postId!,
      limit: 20,
      cursor: pageParam as string | null | undefined,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    maxPages: 6,
    enabled: enabled && Boolean(postId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const data = useMemo(() => {
    const items: PostComment[] = [];
    query.data?.pages?.forEach((page) => {
      if (Array.isArray(page?.items)) items.push(...page.items);
    });
    return items;
  }, [query.data]);

  const total = Math.max(0, Number(query.data?.pages?.[0]?.total ?? data.length));

  return { ...query, data, total };
}
