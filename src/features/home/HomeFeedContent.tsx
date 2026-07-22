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
