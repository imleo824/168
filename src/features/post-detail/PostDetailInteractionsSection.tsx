import { memo, useCallback, useMemo } from 'react';

import DetailCommentItem from '@/features/post-detail/DetailCommentItem';
import { DetailQuoteItem } from '@/features/post-detail/PostDetailLegacySections';
import { usePostQuotes } from '@/hooks/useDataPosts';
import { usePostComments, type PostComment } from '@/features/post/usePostComments';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import { formatEngagementCount } from '@/utils/engagement';
import type { FeedPost } from '@/features/post/PostCard';

type DetailInteractionItem =
  | { kind: 'comment'; id: string; createdAt?: string | Date; comment: PostComment }
  | { kind: 'quote'; id: string; createdAt?: string | Date; quote: FeedPost };

function toSafeCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function toTimeMs(value: unknown) {
  const time = value ? new Date(value as string | Date).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

interface PostDetailInteractionsSectionProps {
  postId: string;
  quoteCount: number;
  commentCount: number;
}

const PostDetailInteractionsSection = memo(function PostDetailInteractionsSection({
  postId,
  quoteCount,
  commentCount,
}: PostDetailInteractionsSectionProps) {
  const safeQuoteCount = toSafeCount(quoteCount);
  const safeCommentCount = toSafeCount(commentCount);
  const shouldLoadQuotes = Boolean(postId && safeQuoteCount > 0);
  const shouldLoadComments = Boolean(postId && safeCommentCount > 0);

  const {
    data: quotes,
    isLoading: isQuotesLoading,
    isFetchingNextPage: isQuotesFetchingMore,
    hasNextPage: hasMoreQuotes,
    fetchNextPage: fetchMoreQuotes,
    error: quotesError,
    refetch: refetchQuotes,
    isFetched: isQuotesFetched,
    isFetching: isQuotesFetching,
  } = usePostQuotes(postId, shouldLoadQuotes);

  const {
    data: comments,
    total: loadedCommentTotal,
    isLoading: isCommentsLoading,
    isFetchingNextPage: isCommentsFetchingMore,
    hasNextPage: hasMoreComments,
    fetchNextPage: fetchMoreComments,
    error: commentsError,
    refetch: refetchComments,
    isFetched: isCommentsFetched,
    isFetching: isCommentsFetching,
  } = usePostComments(postId, shouldLoadComments);

  const resolvedCommentCount = Math.max(safeCommentCount, toSafeCount(loadedCommentTotal));
  const interactionCount = safeQuoteCount + resolvedCommentCount;
  const interactionCountText = formatEngagementCount(interactionCount) || '0';

  const interactions = useMemo<DetailInteractionItem[]>(() => {
    const items: DetailInteractionItem[] = [];

    comments.forEach((comment) => {
      if (!comment?.id) return;
      items.push({
        kind: 'comment',
        id: `comment:${comment.id}`,
        createdAt: comment.createdAt,
        comment,
      });
    });

    quotes.forEach((quote) => {
      if (!quote?.id) return;
      items.push({
        kind: 'quote',
        id: `quote:${quote.id}`,
        createdAt: quote.createdAt,
        quote: quote as FeedPost,
      });
    });

    return items.sort((left, right) => toTimeMs(right.createdAt) - toTimeMs(left.createdAt));
  }, [comments, quotes]);

  const hasLoadedInteractions = interactions.length > 0;
  const isInitialLoading = !hasLoadedInteractions && (
    (shouldLoadQuotes && (isQuotesLoading || isQuotesFetching || !isQuotesFetched)) ||
    (shouldLoadComments && (isCommentsLoading || isCommentsFetching || !isCommentsFetched))
  );
  const interactionError = quotesError || commentsError;
  const canShowEmpty = !isInitialLoading && !interactionError && interactionCount > 0 && interactions.length === 0;
  const hasMoreInteractions = Boolean(hasMoreQuotes || hasMoreComments);
  const isFetchingMoreInteractions = Boolean(isQuotesFetchingMore || isCommentsFetchingMore);

  const refetchInteractions = useCallback(async () => {
    const tasks: Array<Promise<unknown>> = [];
    if (quotesError) tasks.push(refetchQuotes());
    if (commentsError) tasks.push(refetchComments());
    await Promise.all(tasks);
  }, [commentsError, quotesError, refetchComments, refetchQuotes]);

  const loadMoreInteractions = useCallback(async () => {
    const tasks: Array<Promise<unknown>> = [];
    if (hasMoreComments && !isCommentsFetchingMore) tasks.push(fetchMoreComments());
    if (hasMoreQuotes && !isQuotesFetchingMore) tasks.push(fetchMoreQuotes());
    await Promise.all(tasks);
  }, [fetchMoreComments, fetchMoreQuotes, hasMoreComments, hasMoreQuotes, isCommentsFetchingMore, isQuotesFetchingMore]);
  const { guarded: guardedRefetchInteractions, isPending: refetchInteractionsGuardPending } = useInteractionGuard(refetchInteractions, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedLoadMoreInteractions, isPending: loadMoreInteractionsGuardPending } = useInteractionGuard(loadMoreInteractions, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const retryBusy = isQuotesFetching || isCommentsFetching || refetchInteractionsGuardPending;
  const loadMoreBusy = isFetchingMoreInteractions || loadMoreInteractionsGuardPending;

  if (interactionCount <= 0) return null;

  return (
    <section className="detail-quotes-section detail-interactions-section" aria-labelledby="detail-interactions-title">
      <div className="detail-quotes-header detail-interactions-header">
        <h2 id="detail-interactions-title" className="detail-quotes-title detail-interactions-title">互动</h2>
        <span className="detail-quotes-count detail-interactions-count">{interactionCountText}</span>
      </div>

      {isInitialLoading ? (
        <LoadingBlock
          text="正在加载互动"
          compact
          className="detail-quotes-loading-block detail-interactions-loading-block"
        />
      ) : interactionError && interactions.length === 0 ? (
        <StateBlock
          title="互动加载失败"
          tone="error"
          compact
          className="detail-quotes-state-block detail-interactions-state-block"
          actionLabel={retryBusy ? '加载中' : '重新加载'}
          onAction={() => void guardedRefetchInteractions()}
        />
      ) : canShowEmpty ? (
        <StateBlock
          title="暂无可见互动"
          tone="empty"
          compact
          className="detail-quotes-state-block detail-interactions-state-block"
        />
      ) : (
        <div className="detail-quotes-list detail-interactions-list" aria-label="互动列表">
          {interactions.map((item) => item.kind === 'comment' ? (
            <DetailCommentItem key={item.id} comment={item.comment} />
          ) : (
            <DetailQuoteItem key={item.id} post={item.quote} />
          ))}
          <ListLoadMoreState
            loading={loadMoreBusy}
            hasMore={hasMoreInteractions}
            onLoadMore={() => void guardedLoadMoreInteractions()}
            loadingText="正在加载更多互动"
            loadMoreText="查看更多互动"
            doneText=""
            className="detail-quotes-loadmore detail-interactions-loadmore"
          />
        </div>
      )}
    </section>
  );
});

export default PostDetailInteractionsSection;
