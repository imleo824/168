import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { apiFetch } from '@/services/api';

export type PostCommentUser = {
  id: string;
  displayName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  userType?: string | null;
};

export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  content: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: PostCommentUser | null;
};

type CommentPage = {
  items: PostComment[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
};

async function readApiMessage(response: Response) {
  try {
    const payload = await response.json();
    return String(payload?.error || payload?.message || '').trim() || `Status: ${response.status}`;
  } catch {
    return `Status: ${response.status}`;
  }
}

async function getPostCommentsPage(params: {
  postId: string;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<CommentPage> {
  const query = new URLSearchParams();
  query.set('limit', String(params.limit || 20));
  if (params.cursor) query.set('cursor', params.cursor);

  const response = await apiFetch(`/api/posts/${params.postId}/comments?${query.toString()}`, {
    signal: params.signal,
    retry: false,
  });
  if (!response.ok) throw new Error(await readApiMessage(response));

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const totalFromPayload = Number(payload?.total);
  const totalFromHeader = Number(response.headers.get('X-Total-Count') || '');
  const total = Number.isFinite(totalFromPayload)
    ? totalFromPayload
    : Number.isFinite(totalFromHeader)
      ? totalFromHeader
      : items.length;

  return {
    items,
    total: Math.max(0, Math.floor(total)),
    nextCursor: response.headers.get('X-Next-Cursor') || null,
    hasMore: response.headers.get('X-Has-More') === 'true',
  };
}

export function usePostComments(postId: string | undefined, enabled: boolean = true) {
  const query = useInfiniteQuery({
    queryKey: ['post-comments', postId],
    queryFn: ({ pageParam, signal }) => getPostCommentsPage({
      postId: postId!,
      limit: 20,
      cursor: pageParam as string | null | undefined,
      signal,
    }),
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
