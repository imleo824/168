import { memo, type RefObject } from 'react';

import FeedViewport from '@/features/feed/FeedViewport';
import type { Post } from '@/types';

interface HomeFeedContentProps {
  hideCategoryTag: boolean;
  feedIdentity: string;
  visibleFeedPosts: Post[];
  scrollRootRef: RefObject<HTMLDivElement | null>;
  canLoadMore: boolean;
  isRefreshing: boolean;
  showInitialLoading: boolean;
  showInitialError: boolean;
  initialErrorMessage: string;
  canShowInitialEmpty: boolean;
  loadMoreError: boolean;
  isFetchingNextPage: boolean;
  onScrollPositionChange: (scrollTop: number) => void;
  onRefreshFromPull: () => void | Promise<void>;
  onLoadMore: () => void | Promise<void>;
  onBrowseAll: () => void;
}

function areHomeFeedContentPropsEqual(prev: HomeFeedContentProps, next: HomeFeedContentProps) {
  return (
    prev.hideCategoryTag === next.hideCategoryTag &&
    prev.feedIdentity === next.feedIdentity &&
    prev.visibleFeedPosts === next.visibleFeedPosts &&
    prev.scrollRootRef === next.scrollRootRef &&
    prev.canLoadMore === next.canLoadMore &&
    prev.isRefreshing === next.isRefreshing &&
    prev.showInitialLoading === next.showInitialLoading &&
    prev.showInitialError === next.showInitialError &&
    prev.initialErrorMessage === next.initialErrorMessage &&
    prev.canShowInitialEmpty === next.canShowInitialEmpty &&
    prev.loadMoreError === next.loadMoreError &&
    prev.isFetchingNextPage === next.isFetchingNextPage &&
    prev.onScrollPositionChange === next.onScrollPositionChange &&
    prev.onRefreshFromPull === next.onRefreshFromPull &&
    prev.onLoadMore === next.onLoadMore &&
    prev.onBrowseAll === next.onBrowseAll
  );
}

function HomeStandalonePlainState({
  title,
  description,
  actionLabel,
  onAction,
  isError = false,
}: {
  title: string;
  description?: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
  isError?: boolean;
}) {
  return (
    <div
      className="ui-feed-footer-state"
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
      aria-label={title}
    >
      <div className={`ui-feed-plain-state ui-feed-footer-plain-state${isError ? ' ui-feed-footer-plain-state--error' : ''}`}>
        <span className="ui-feed-plain-state-copy">
          <span className="ui-feed-plain-state-text">{title}</span>
          {description ? <span className="ui-feed-plain-state-subtext">{description}</span> : null}
        </span>
        <button
          type="button"
          className="pressable ui-feed-plain-state-action"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

export const HomeFeedContent = memo(function HomeFeedContent({
  hideCategoryTag,
  feedIdentity,
  visibleFeedPosts,
  scrollRootRef,
  canLoadMore,
  isRefreshing,
  showInitialLoading,
  showInitialError,
  initialErrorMessage,
  canShowInitialEmpty,
  loadMoreError,
  isFetchingNextPage,
  onScrollPositionChange,
  onRefreshFromPull,
  onLoadMore,
  onBrowseAll,
}: HomeFeedContentProps) {
  const shouldRenderStandaloneEmpty =
    !showInitialLoading &&
    !showInitialError &&
    visibleFeedPosts.length === 0 &&
    canShowInitialEmpty;

  const shouldRenderStandaloneError =
    !showInitialLoading &&
    showInitialError &&
    visibleFeedPosts.length === 0;

  if (shouldRenderStandaloneEmpty) {
    return (
      <div className="home-mobile-feed-panel">
        <HomeStandalonePlainState
          title="暂无内容"
          description="可以切回全部看看最新内容"
          actionLabel="查看全部"
          onAction={onBrowseAll}
        />
      </div>
    );
  }

  if (shouldRenderStandaloneError) {
    return (
      <div className="home-mobile-feed-panel">
        <HomeStandalonePlainState
          title={initialErrorMessage || '加载失败，稍后再试'}
          description="点一下重新加载"
          actionLabel="重试"
          onAction={onRefreshFromPull}
          isError
        />
      </div>
    );
  }

  return (
    <div key={feedIdentity} className="home-mobile-feed-panel">
      <FeedViewport
        posts={visibleFeedPosts}
        hideCategoryTag={hideCategoryTag}
        scrollRootRef={scrollRootRef}
        onScrollPositionChange={onScrollPositionChange}
        onRefresh={onRefreshFromPull}
        onBrowseAll={onBrowseAll}
        hasMore={canLoadMore}
        isRefreshing={isRefreshing}
        isLoading={showInitialLoading}
        isLoadingMore={isFetchingNextPage}
        loadMoreError={loadMoreError}
        error={showInitialError}
        errorMessage={initialErrorMessage}
        showEmptyState={canShowInitialEmpty}
        onLoadMore={onLoadMore}
        enableRecommendationControls
        documentScrollMode
      />
    </div>
  );
}, areHomeFeedContentPropsEqual);
