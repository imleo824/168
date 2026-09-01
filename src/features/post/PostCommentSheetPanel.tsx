import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { MessageCircle } from 'lucide-react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import BottomSheet from '@/ui/BottomSheet';
import ActionButton from '@/ui/ActionButton';
import { StateBlock } from '@/ui/LoadingState';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import AvatarImage from '@/ui/AvatarImage';
import { getPostCommentsPage, createPostComment, type PostComment, type CommentPage } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { formatRelativeTime } from '@/utils/time';
import { formatCompactChineseEngagementCount } from '@/utils/engagement';
import PostCommentComposerDialog from '@/features/post/PostCommentComposerDialog';
import { CommentContentText } from '@/features/post/CommentContentText';
import {
  dispatchPostSheetOpen,
  subscribePostSheetOpen,
} from './postSheetOpenIntent';

export type { PostComment, CommentPage };
export type PostCommentUser = {
  id: string;
  displayName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  userType?: string | null;
};

export interface PostCommentSheetPanelProps {
  open: boolean;
  postId: string;
  commentCount: number;
  onCommentCountChange?: (count: number) => void;
  onClose: () => void;
}

function getCommentAuthorName(comment: PostComment) {
  return String(comment.user?.displayName || comment.user?.username || '用户').trim() || '用户';
}

const PostCommentSheetItem = memo(function PostCommentSheetItem({ comment }: { comment: PostComment }) {
  const authorName = getCommentAuthorName(comment);
  const timeText = comment.createdAt ? formatRelativeTime(comment.createdAt) : '';
  const content = String(comment.content || '').trim();

  return (
    <article className="detail-quote-item post-quote-list-item post-comment-list-item" aria-label={`${authorName} 的评论`}>
      <AvatarImage
        src={comment.user?.photoUrl || ''}
        name={authorName}
        id={comment.user?.id || comment.userId || comment.id}
        alt={authorName}
        className="detail-quote-item-avatar post-quote-list-avatar post-comment-list-avatar"
        variant="thumb"
        loading="lazy"
      />
      <span className="detail-quote-item-main post-quote-list-main post-comment-list-main">
        <span className="detail-quote-item-meta">
          <span className="detail-quote-item-author post-quote-list-author">{authorName}</span>
          {timeText ? <span className="detail-quote-item-time">· {timeText}</span> : null}
        </span>
        <span className="detail-quote-item-text post-quote-list-text post-comment-list-text"><CommentContentText content={content} /></span>
      </span>
    </article>
  );
});

export const PostCommentSheetPanel = memo(function PostCommentSheetPanel({
  open,
  postId,
  commentCount,
  onCommentCountChange,
  onClose,
}: PostCommentSheetPanelProps) {
  const queryClient = useQueryClient();
  const { requireAuth, showToast } = useAuth();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerError, setComposerError] = useState('');
  const queryKey = useMemo(() => ['post-comments', postId] as const, [postId]);

  const commentsQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => getPostCommentsPage({
      postId,
      limit: 20,
      cursor: pageParam as string | null | undefined,
    }, { signal }),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    maxPages: 6,
    enabled: open && Boolean(postId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const comments = useMemo(() => {
    const items: PostComment[] = [];
    commentsQuery.data?.pages?.forEach((page) => {
      if (Array.isArray(page?.items)) items.push(...page.items);
    });
    return items;
  }, [commentsQuery.data]);

  const total = Math.max(0, Number(commentsQuery.data?.pages?.[0]?.total ?? commentCount ?? 0));
  const titleCount = formatCompactChineseEngagementCount(total) || '0';

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    dispatchPostSheetOpen({ postId, kind: 'comment' });

    return subscribePostSheetOpen((event) => {
      if (event.detail.kind === 'comment' && event.detail.postId === postId) return;
      onClose();
    });
  }, [onClose, open, postId]);

  useEffect(() => {
    if (!open || !commentsQuery.data?.pages?.length) return;
    onCommentCountChange?.(total);
  }, [commentsQuery.data?.pages?.length, onCommentCountChange, open, total]);

  const createMutation = useMutation({
    mutationFn: (content: string) => createPostComment(postId, { content }),
    onSuccess: (result) => {
      setComposerError('');
      setIsComposerOpen(false);
      queryClient.setQueryData(queryKey, (current: any) => {
        if (!current?.pages?.length) return current;
        const [firstPage, ...restPages] = current.pages;
        const nextFirstPage = {
          ...firstPage,
          total: result.commentCount,
          items: [result.comment, ...(Array.isArray(firstPage.items) ? firstPage.items : [])],
        };
        return {
          ...current,
          pages: [nextFirstPage, ...restPages],
        };
      });
      queryClient.setQueryData(['post', postId], (old: any) => old ? { ...old, commentCount: result.commentCount } : old);
      queryClient.setQueriesData({ queryKey: ['posts'] }, (old: any) => patchPostCommentCount(old, postId, result.commentCount));
      onCommentCountChange?.(result.commentCount);
      showToast('评论已成功发表', 'success');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '评论发表失败，请稍后重试';
      setComposerError(message);
      showToast(message, 'error');
    },
  });

  const handleOpenComposer = useCallback((event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!postId || createMutation.isPending) return;
    requireAuth(() => {
      setComposerError('');
      setIsComposerOpen(true);
    });
  }, [createMutation.isPending, postId, requireAuth]);

  const submitComment = useCallback(async (content: string) => {
    if (!postId || createMutation.isPending) return;
    await createMutation.mutateAsync(content);
  }, [createMutation, postId]);
  const refetchComments = useCallback(async () => {
    await commentsQuery.refetch();
  }, [commentsQuery]);
  const fetchNextComments = useCallback(async () => {
    await commentsQuery.fetchNextPage();
  }, [commentsQuery]);
  const { guarded: guardedRefetchComments, isPending: refetchCommentsGuardPending } = useInteractionGuard(refetchComments, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedFetchNextComments, isPending: fetchNextCommentsGuardPending } = useInteractionGuard(fetchNextComments, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedSubmitComment, isPending: submitCommentGuardPending } = useInteractionGuard(submitComment, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 220,
    mode: 'drop',
  });
  const retryBusy = commentsQuery.isRefetching || refetchCommentsGuardPending;
  const loadMoreBusy = commentsQuery.isFetchingNextPage || fetchNextCommentsGuardPending;
  const submitBusy = createMutation.isPending || submitCommentGuardPending;
  const handleCloseComposer = useCallback(() => {
    if (submitBusy) return;
    setIsComposerOpen(false);
    setComposerError('');
  }, [submitBusy]);

  return (
    <>
      <BottomSheet
        open={open}
        title={`评论 (${titleCount})`}
        ariaLabel="帖子评论"
        onClose={onClose}
        panelClassName="ui-sheet-panel post-quote-sheet post-comment-sheet"
        bodyClassName="post-quote-sheet-body post-comment-sheet-body"
        closeClassName="quiet-button ui-icon-action post-create-sheet-close"
        footer={(
          <div className="post-quote-sheet-footer post-comment-sheet-footer">
            <ActionButton
              type="button"
              variant="brand"
              size="md"
              onClick={handleOpenComposer}
              instantPress={false}
              disabled={!postId || submitBusy}
              state={!postId ? 'disabled' : submitBusy ? 'loading' : 'idle'}
              aria-busy={submitBusy || undefined}
              className="post-quote-create-action post-comment-create-action"
            >
              <MessageCircle className="post-quote-create-action-icon post-comment-create-action-icon" aria-hidden="true" />
              <span>发表评论</span>
            </ActionButton>
          </div>
        )}
        showHandle
      >
        {commentsQuery.isLoading ? (
          <div className="post-quote-sheet-loading post-comment-sheet-loading">正在加载评论列表...</div>
        ) : commentsQuery.error ? (
          <StateBlock
            title="评论暂无法加载"
            tone="error"
            compact
            action={(
              <ActionButton
                type="button"
                variant="brand"
                size="sm"
                disabled={retryBusy}
                state={retryBusy ? 'loading' : 'idle'}
                onClick={() => void guardedRefetchComments()}
              >
                {retryBusy ? '加载中' : '刷新重试'}
              </ActionButton>
            )}
          />
        ) : comments.length === 0 ? (
          <StateBlock
            title="暂无评论，来发表第一条观点吧"
            tone="empty"
            compact
            icon={<MessageCircle className="post-quote-empty-icon post-comment-empty-icon" aria-hidden="true" />}
          />
        ) : (
          <div className="post-quote-list post-comment-list" aria-label="评论列表">
            {comments.map((comment) => (
              <PostCommentSheetItem key={comment.id} comment={comment} />
            ))}
            <ListLoadMoreState
              error={Boolean(commentsQuery.error)}
              loading={loadMoreBusy}
              hasMore={Boolean(commentsQuery.hasNextPage)}
              onRetry={() => void guardedRefetchComments()}
              onLoadMore={() => void guardedFetchNextComments()}
              loadingText="正在载入更多评论..."
              doneText=""
            />
          </div>
        )}
      </BottomSheet>
      <PostCommentComposerDialog
        open={isComposerOpen}
        isSubmitting={submitBusy}
        error={composerError}
        onSubmit={(content) => void guardedSubmitComment(content)}
        onClose={handleCloseComposer}
      />
    </>
  );
});

function patchPostCommentCount(old: any, postId: string, commentCount: number): any {
  if (!old) return old;
  const patchPost = (item: any) => item?.id === postId ? { ...item, commentCount } : item;
  if (Array.isArray(old)) return old.map(patchPost);
  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) return page.map(patchPost);
        if (Array.isArray(page?.items)) return { ...page, items: page.items.map(patchPost) };
        return page;
      }),
    };
  }
  return patchPost(old);
}

export default PostCommentSheetPanel;
