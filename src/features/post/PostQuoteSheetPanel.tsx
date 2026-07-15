import { memo, useCallback, useEffect, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Quote } from 'lucide-react';

import type { FeedPost } from '@/features/post/PostCard';
import BottomSheet from '@/ui/BottomSheet';
import ActionButton from '@/ui/ActionButton';
import { StateBlock } from '@/ui/LoadingState';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import AvatarImage from '@/ui/AvatarImage';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { usePostQuotes } from '@/hooks/useData';
import { withCurrentBackground } from '@/utils/navigationState';
import { rememberListReturnPosition } from '@/utils/listReturnScroll';
import { resolveVisiblePostText } from '@/utils/postDisplayText';
import { formatRelativeTime } from '@/utils/time';
import { markPostCreateComposerFocusIntent, primePostCreateComposerFocus } from '@/utils/postCreateFocusBridge';
import {
  dispatchPostSheetOpen,
  subscribePostSheetOpen,
} from './postSheetOpenIntent';

export interface PostQuoteSheetPanelProps {
  open: boolean;
  postId?: string;
  quoteCount?: number;
  targetPost?: FeedPost | null;
  onClose: () => void;
}

const PostQuoteSheetItem = memo(function PostQuoteSheetItem({ post }: { post: FeedPost }) {
  const navigate = useNavigate();
  const location = useLocation();
  const authorName = post.isAnonymous || post.userId === 'anonymous'
    ? '匿名用户'
    : String(post.user?.displayName || post.user?.username || '用户').trim();
  const text = resolveVisiblePostText(post).trim() || '引用了这条帖子';
  const timeText = formatRelativeTime(post.createdAt);

  const handleOpen = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!post.id) return;
    rememberListReturnPosition(event.currentTarget);
    navigate(`/post/${post.id}`, { state: withCurrentBackground(location) });
  }, [location, navigate, post.id]);

  return (
    <button
      type="button"
      className="detail-quote-item post-quote-list-item"
      onClick={handleOpen}
      aria-label={`查看引用：${text.slice(0, 40)}`}
    >
      <AvatarImage
        src={post.isAnonymous ? '' : (post.user?.photoUrl || '')}
        name={authorName}
        id={post.userId || post.id}
        alt={authorName}
        className="detail-quote-item-avatar post-quote-list-avatar"
        variant="thumb"
        loading="lazy"
      />
      <span className="detail-quote-item-main post-quote-list-main">
        <span className="detail-quote-item-meta">
          <span className="detail-quote-item-author post-quote-list-author">{authorName}</span>
          <span className="detail-quote-item-time">· {timeText}</span>
        </span>
        <span className="detail-quote-item-text post-quote-list-text">{text}</span>
      </span>
    </button>
  );
});

function scheduleAfterSheetHandoff(callback: () => void) {
  if (typeof window === 'undefined') {
    callback();
    return;
  }

  window.requestAnimationFrame(callback);
}

export const PostQuoteSheetPanel = memo(function PostQuoteSheetPanel({
  open,
  postId,
  quoteCount = 0,
  targetPost,
  onClose,
}: PostQuoteSheetPanelProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { requireAuth } = useAuth();
  const resolvedPostId = String(postId || targetPost?.id || '').trim();
  const canCreateQuote = Boolean(resolvedPostId);
  const {
    data: quotes,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
    isRefetching,
  } = usePostQuotes(resolvedPostId, open && Boolean(resolvedPostId));

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    if (!resolvedPostId) {
      onClose();
      return undefined;
    }

    dispatchPostSheetOpen({ postId: resolvedPostId, kind: 'quote' });

    return subscribePostSheetOpen((event) => {
      if (event.detail.kind === 'quote' && event.detail.postId === resolvedPostId) return;
      onClose();
    });
  }, [onClose, open, resolvedPostId]);

  const createQuoteFromSheet = useCallback(() => {
    if (!canCreateQuote) return;

    requireAuth(() => {
      primePostCreateComposerFocus();
      markPostCreateComposerFocusIntent();
      onClose();
      scheduleAfterSheetHandoff(() => {
        navigate(`/create?quote=${encodeURIComponent(resolvedPostId)}`, {
          state: {
            from: `${location.pathname}${location.search}`,
            quotedPost: targetPost || undefined,
          },
        });
      });
    });
  }, [canCreateQuote, location.pathname, location.search, navigate, onClose, requireAuth, resolvedPostId, targetPost]);
  const { guarded: guardedCreateQuoteFromSheet, isPending: createQuoteGuardPending } = useInteractionGuard(createQuoteFromSheet, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const handleCreateQuote = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void guardedCreateQuoteFromSheet();
  }, [guardedCreateQuoteFromSheet]);
  const refetchQuotes = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const fetchNextQuotes = useCallback(async () => {
    await fetchNextPage();
  }, [fetchNextPage]);
  const { guarded: guardedRefetchQuotes, isPending: refetchQuotesGuardPending } = useInteractionGuard(refetchQuotes, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedFetchNextQuotes, isPending: fetchNextQuotesGuardPending } = useInteractionGuard(fetchNextQuotes, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const retryBusy = isRefetching || refetchQuotesGuardPending;
  const loadMoreBusy = isFetchingNextPage || fetchNextQuotesGuardPending;
  const createQuoteBusy = createQuoteGuardPending;

  return (
    <BottomSheet
      open={open}
      title={`引用 ${quoteCount || 0}`}
      ariaLabel="帖子引用"
      onClose={onClose}
      panelClassName="ui-sheet-panel post-quote-sheet"
      bodyClassName="post-quote-sheet-body"
      closeClassName="quiet-button ui-icon-action post-create-sheet-close"
      footer={(
        <div className="post-quote-sheet-footer">
          <ActionButton
            type="button"
            variant="brand"
            size="md"
            onClick={handleCreateQuote}
            instantPress={false}
            disabled={!canCreateQuote || createQuoteBusy}
            state={!canCreateQuote ? 'disabled' : createQuoteBusy ? 'loading' : 'idle'}
            className="post-quote-create-action"
          >
            <Quote className="post-quote-create-action-icon" aria-hidden="true" />
            <span>我要引用发帖</span>
          </ActionButton>
        </div>
      )}
      showHandle
    >
      {isLoading ? (
        <div className="post-quote-sheet-loading">正在加载引用</div>
      ) : error ? (
        <StateBlock
          title="引用加载失败"
          tone="error"
          compact
          action={(
            <ActionButton
              type="button"
              variant="brand"
              size="sm"
              disabled={retryBusy}
              state={retryBusy ? 'loading' : 'idle'}
              onClick={() => void guardedRefetchQuotes()}
            >
              {retryBusy ? '加载中' : '重新加载'}
            </ActionButton>
          )}
        />
      ) : quotes.length === 0 ? (
        <StateBlock
          title="还没有引用"
          tone="empty"
          compact
          icon={<Quote className="post-quote-empty-icon" aria-hidden="true" />}
        />
      ) : (
        <div className="post-quote-list" aria-label="引用列表">
          {quotes.map((quote) => (
            <PostQuoteSheetItem
              key={quote.id}
              post={quote}
            />
          ))}
          <ListLoadMoreState
            error={Boolean(error)}
            loading={loadMoreBusy}
            hasMore={Boolean(hasNextPage)}
            onRetry={() => void guardedRefetchQuotes()}
            onLoadMore={() => void guardedFetchNextQuotes()}
            loadingText="正在加载更多引用"
            doneText=""
          />
        </div>
      )}
    </BottomSheet>
  );
});

export default PostQuoteSheetPanel;
