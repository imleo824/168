import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useInteractionGuard } from "@/hooks/useInteractionGuard";
import {
  getFeedScrollMetrics,
  isDocumentFeedScrollMode,
  scrollFeedToTop,
  subscribeFeedScrollModeChange,
} from "@/utils/feedScroll";
import type { FeedPost } from "@/features/post/PostCard";
import { FeedScrollShell, type FeedScrollContentState } from "./FeedScrollShell";
import PostFeedList from './PostFeedList';
import {
  EmptyState,
  ErrorState,
  FeedFooter,
  LoadingState,
  PullRefreshIndicator,
  RefreshingState,
} from './FeedViewportStates';

const PULL_REFRESH_TRIGGER_PX = 64;
const PULL_REFRESH_MAX_PX = 120;
const PULL_REFRESH_PROGRAMMATIC_PX = 56;
const PULL_REFRESH_DAMPING = 0.45;
const PULL_GESTURE_LOCK_PX = 6;
const PULL_HORIZONTAL_CANCEL_RATIO = 1.1;
const PULL_TOP_TOLERANCE_PX = 1;
const PULL_REFRESH_COOLDOWN_MS = 680;
const PULL_REFRESH_RELEASE_DELAY_MS = 180;

const LOAD_MORE_BOTTOM_THRESHOLD_PX = 520;
const LOAD_MORE_ROOT_MARGIN_INLINE_PX = 0;
const LOAD_MORE_TOP_GUARD_PX = 48;

function formatVerticalRootMargin(offsetPx: number) {
  const blockOffset = `${offsetPx}px`;
  const inlineOffset = `${LOAD_MORE_ROOT_MARGIN_INLINE_PX}px`;
  return `${blockOffset} ${inlineOffset} ${blockOffset} ${inlineOffset}`;
}
const LOAD_MORE_COOLDOWN_MS = 650;
const LOAD_MORE_RELEASE_DELAY_MS = 160;
const ignoreLoadMoreError = () => {};

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return Boolean(
    value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<T>).then === "function",
  );
}

interface FeedViewportProps {
  posts: FeedPost[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  isRefreshing?: boolean;
  loadMoreError?: boolean;
  error?: unknown;
  errorMessage?: string;
  hasMore?: boolean;
  showEmptyState?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
  onBrowseAll?: () => void;
  children?: React.ReactNode;
  ariaLabel?: string;
  scrollRootRef?: React.RefObject<HTMLDivElement | null>;
  onScrollPositionChange?: (scrollTop: number) => void;
  hideCategoryTag?: boolean;
  enableRecommendationControls?: boolean;
  documentScrollMode?: boolean;
}

export default function FeedViewport({
  posts,
  isLoading = false,
  isLoadingMore = false,
  isRefreshing = false,
  loadMoreError = false,
  error,
  errorMessage = '',
  hasMore = true,
  showEmptyState = true,
  onLoadMore,
  onRefresh,
  onBrowseAll,
  children,
  ariaLabel = "信息流",
  scrollRootRef,
  onScrollPositionChange,
  hideCategoryTag = false,
  enableRecommendationControls = false,
  documentScrollMode = false,
}: FeedViewportProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const pendingPullDistanceRef = useRef(0);
  const pullDistanceFrameRef = useRef<number | null>(null);
  const pullActiveRef = useRef(false);
  const pullEngagedRef = useRef(false);
  const pullRefreshInFlightRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const lastPullRefreshAtRef = useRef(0);
  const lastLoadMoreAtRef = useRef(0);
  const pullIndicatorHideTimerRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullIndicatorVisible, setIsPullIndicatorVisible] = useState(false);
  const [isDocumentScrollModeState, setIsDocumentScrollModeState] = useState(() =>
    isDocumentFeedScrollMode(documentScrollMode),
  );
  const validPosts = useMemo(() => posts.filter((post) => post?.id), [posts]);
  const hasCustomContent = children !== undefined && children !== null;

  const pullRefreshLabel = useMemo(() => {
    if (isRefreshing) return "正在刷新";
    if (pullDistance >= PULL_REFRESH_TRIGGER_PX) return "松开刷新";
    return "下拉刷新";
  }, [isRefreshing, pullDistance]);

  const onLoadMoreRef = useLatestRef(onLoadMore);
  const onRefreshRef = useLatestRef(onRefresh);
  const hasMoreRef = useLatestRef(hasMore);
  const isLoadingMoreRef = useLatestRef(isLoadingMore);
  const isRefreshingRef = useLatestRef(isRefreshing);
  const loadMoreErrorRef = useLatestRef(loadMoreError);

  useEffect(
    () =>
      subscribeFeedScrollModeChange(() => {
        const next = isDocumentFeedScrollMode(documentScrollMode);
        setIsDocumentScrollModeState((current) =>
          current === next ? current : next,
        );
      }),
    [documentScrollMode],
  );

  const clearPullIndicatorHideTimer = useCallback(() => {
    if (pullIndicatorHideTimerRef.current !== null) {
      window.clearTimeout(pullIndicatorHideTimerRef.current);
      pullIndicatorHideTimerRef.current = null;
    }
  }, []);

  const updatePullDistance = useCallback((next: number) => {
    const normalized = clamp(next, 0, PULL_REFRESH_MAX_PX);
    pullDistanceRef.current = normalized;
    pendingPullDistanceRef.current = normalized;

    if (pullDistanceFrameRef.current !== null) return;
    pullDistanceFrameRef.current = window.requestAnimationFrame(() => {
      pullDistanceFrameRef.current = null;
      setPullDistance(pendingPullDistanceRef.current);
    });
  }, []);

  const resetPullGesture = useCallback(
    (hideIndicator = false) => {
      pullActiveRef.current = false;
      pullEngagedRef.current = false;
      pullStartYRef.current = null;
      pullStartXRef.current = null;
      updatePullDistance(0);
      if (hideIndicator && !isRefreshingRef.current) {
        setIsPullIndicatorVisible(false);
      }
    },
    [isRefreshingRef, updatePullDistance],
  );

  useEffect(() => {
    resetPullGesture(true);
  }, [isDocumentScrollModeState, resetPullGesture]);

  const requestLoadMore = useCallback(
    (options?: { force?: boolean }) => {
      const force = options?.force === true;

      if (
        !hasMoreRef.current ||
        isRefreshingRef.current ||
        isLoadingMoreRef.current ||
        loadMoreInFlightRef.current ||
        !onLoadMoreRef.current
      ) {
        return;
      }

      if (!force && loadMoreErrorRef.current) return;

      const now = Date.now();
      if (!force && now - lastLoadMoreAtRef.current < LOAD_MORE_COOLDOWN_MS)
        return;

      lastLoadMoreAtRef.current = now;
      loadMoreInFlightRef.current = true;

      let released = false;
      const releaseInFlight = () => {
        if (released) return;
        released = true;
        window.setTimeout(() => {
          loadMoreInFlightRef.current = false;
        }, LOAD_MORE_RELEASE_DELAY_MS);
      };

      try {
        const result = onLoadMoreRef.current();
        if (isPromiseLike(result)) {
          Promise.resolve(result)
            .catch(ignoreLoadMoreError)
            .finally(releaseInFlight);
        } else {
          releaseInFlight();
        }
      } catch {
        releaseInFlight();
      }
    },
    [
      hasMoreRef,
      isLoadingMoreRef,
      isRefreshingRef,
      loadMoreErrorRef,
      onLoadMoreRef,
    ],
  );

  const requestRefresh = useCallback(
    (source: "pull" | "retry" = "retry") => {
      const refresh = onRefreshRef.current;
      if (
        !refresh ||
        isRefreshingRef.current ||
        pullRefreshInFlightRef.current
      )
        return;

      const now = Date.now();
      if (
        source === "pull" &&
        now - lastPullRefreshAtRef.current < PULL_REFRESH_COOLDOWN_MS
      )
        return;

      pullRefreshInFlightRef.current = true;
      lastPullRefreshAtRef.current = now;

      let released = false;
      const releaseRefreshLock = () => {
        if (released) return;
        released = true;
        window.setTimeout(() => {
          pullRefreshInFlightRef.current = false;
        }, PULL_REFRESH_RELEASE_DELAY_MS);
      };

      try {
        const result = refresh();
        if (isPromiseLike(result)) {
          Promise.resolve(result)
            .catch(ignoreLoadMoreError)
            .finally(releaseRefreshLock);
        } else {
          releaseRefreshLock();
        }
      } catch {
        releaseRefreshLock();
      }
    },
    [isRefreshingRef, onRefreshRef],
  );

  const setScrollContainerNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (pullDistanceFrameRef.current !== null) {
        window.cancelAnimationFrame(pullDistanceFrameRef.current);
      }
      clearPullIndicatorHideTimer();
    };
  }, [clearPullIndicatorHideTimer]);

  useEffect(() => {
    if (isRefreshing) {
      clearPullIndicatorHideTimer();
      if (!isPullIndicatorVisible && pullDistanceRef.current <= 0) {
        setIsPullIndicatorVisible(true);
        updatePullDistance(PULL_REFRESH_PROGRAMMATIC_PX);
      }
      return;
    }

    if (
      isPullIndicatorVisible &&
      !pullActiveRef.current &&
      pullDistanceRef.current > 0
    ) {
      resetPullGesture(false);
      return;
    }

    if (
      !isPullIndicatorVisible ||
      pullDistanceRef.current > 0 ||
      pullActiveRef.current
    )
      return;
    if (pullIndicatorHideTimerRef.current !== null) return;

    pullIndicatorHideTimerRef.current = window.setTimeout(() => {
      pullIndicatorHideTimerRef.current = null;
      if (
        !isRefreshingRef.current &&
        pullDistanceRef.current <= 0 &&
        !pullActiveRef.current
      ) {
        setIsPullIndicatorVisible(false);
      }
    }, 180);
  }, [
    clearPullIndicatorHideTimer,
    isPullIndicatorVisible,
    isRefreshing,
    isRefreshingRef,
    pullDistance,
    resetPullGesture,
    updatePullDistance,
  ]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = loadMoreRef.current;

    if (
      !hasMore ||
      isLoadingMore ||
      loadMoreError ||
      !container ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const handleEntries: IntersectionObserverCallback = (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        requestLoadMore();
      }
    };

    const observer = new IntersectionObserver(
      handleEntries,
      {
        root: isDocumentScrollModeState ? null : container,
        rootMargin: formatVerticalRootMargin(LOAD_MORE_BOTTOM_THRESHOLD_PX),
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isDocumentScrollModeState, isLoadingMore, loadMoreError, requestLoadMore, validPosts.length]);

  const handleBrowseAll = useCallback(() => {
    onBrowseAll?.();
    const container = scrollContainerRef.current;
    if (container) scrollFeedToTop(container, "smooth", isDocumentScrollModeState);
  }, [isDocumentScrollModeState, onBrowseAll]);

  const retryLoadMore = useCallback(() => {
    requestLoadMore({ force: true });
  }, [requestLoadMore]);

  const retryRefresh = useCallback(() => {
    requestRefresh("retry");
  }, [requestRefresh]);

  const { guarded: guardedBrowseAll } = useInteractionGuard(
    handleBrowseAll,
    300,
  );
  const { guarded: guardedRetryLoadMore } = useInteractionGuard(
    retryLoadMore,
    450,
  );
  const { guarded: guardedRetryRefresh } = useInteractionGuard(
    retryRefresh,
    450,
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (
        !onRefreshRef.current ||
        isRefreshingRef.current ||
        pullRefreshInFlightRef.current
      )
        return;
      if (e.touches.length !== 1) return;
      if (Date.now() - lastPullRefreshAtRef.current < PULL_REFRESH_COOLDOWN_MS)
        return;

      const container = scrollContainerRef.current;
      if (
        !container ||
        getFeedScrollMetrics(container, isDocumentScrollModeState).scrollTop >
          PULL_TOP_TOLERANCE_PX
      ) {
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      clearPullIndicatorHideTimer();
      pullStartYRef.current = touch.clientY;
      pullStartXRef.current = touch.clientX;
      pullActiveRef.current = true;
      pullEngagedRef.current = false;
    },
    [
      clearPullIndicatorHideTimer,
      isDocumentScrollModeState,
      isRefreshingRef,
      onRefreshRef,
    ],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!pullActiveRef.current || pullStartYRef.current == null) return;
      if (e.touches.length !== 1) {
        resetPullGesture(true);
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) return;

      if (
        getFeedScrollMetrics(container, isDocumentScrollModeState).scrollTop >
        PULL_TOP_TOLERANCE_PX
      ) {
        resetPullGesture(true);
        return;
      }

      const touch = e.touches[0];
      if (!touch) return;

      const currentY = touch.clientY;
      const currentX = touch.clientX;
      const deltaY = currentY - pullStartYRef.current;
      const deltaX = currentX - (pullStartXRef.current ?? currentX);

      if (Math.abs(deltaX) > Math.abs(deltaY) * PULL_HORIZONTAL_CANCEL_RATIO) {
        resetPullGesture(true);
        return;
      }

      if (deltaY <= 0 && !pullEngagedRef.current) {
        resetPullGesture(true);
        return;
      }

      if (!pullEngagedRef.current) {
        if (deltaY < PULL_GESTURE_LOCK_PX) return;
        pullEngagedRef.current = true;
        setIsPullIndicatorVisible(true);
      }

      if (e.cancelable) e.preventDefault();
      updatePullDistance(deltaY * PULL_REFRESH_DAMPING);
    },
    [isDocumentScrollModeState, resetPullGesture, updatePullDistance],
  );

  const handleTouchEnd = useCallback(() => {
    if (!pullActiveRef.current) return;

    const engaged = pullEngagedRef.current;
    const shouldRefresh =
      engaged && pullDistanceRef.current >= PULL_REFRESH_TRIGGER_PX;

    resetPullGesture(!shouldRefresh);

    if (
      !shouldRefresh ||
      !onRefresh ||
      isRefreshingRef.current ||
      pullRefreshInFlightRef.current
    ) {
      return;
    }

    requestRefresh("pull");
  }, [isRefreshingRef, onRefresh, requestRefresh, resetPullGesture]);

  const contentState = useMemo<FeedScrollContentState>(() => {
    if (hasCustomContent) return 'custom';
    if (validPosts.length > 0) return 'content';
    if (isLoading) return 'loading';
    if (isPullIndicatorVisible) return 'default';
    if (isRefreshing) return 'refreshing';
    if (error) return 'error';
    if (showEmptyState) return 'empty';
    return 'default';
  }, [error, hasCustomContent, isLoading, isPullIndicatorVisible, isRefreshing, showEmptyState, validPosts.length]);

  const feedContent = useMemo(() => {
    if (hasCustomContent) return children;

    const shouldShowEmptyState = contentState === 'empty';

    return (
      <>
        {isLoading && validPosts.length === 0 && <LoadingState />}

        {!isPullIndicatorVisible &&
          !isLoading &&
          isRefreshing &&
          validPosts.length === 0 && <RefreshingState />}

        {!isLoading &&
          !isPullIndicatorVisible &&
          !isRefreshing &&
          validPosts.length === 0 &&
          (error ? (
            <ErrorState
              onRetry={onRefresh ? guardedRetryRefresh : undefined}
              message={errorMessage}
            />
          ) : shouldShowEmptyState ? (
            <EmptyState onBrowseAll={guardedBrowseAll} />
          ) : null)}

        {validPosts.length > 0 ? (
          <PostFeedList
            posts={validPosts}
            hideCategoryTag={hideCategoryTag}
            enableRecommendationControls={enableRecommendationControls}
          />
        ) : null}

        {validPosts.length > 0 && !isRefreshing && (
          <div ref={loadMoreRef}>
            <FeedFooter
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loadMoreError={loadMoreError}
              onRetryLoadMore={guardedRetryLoadMore}
              onBrowseAll={guardedBrowseAll}
            />
          </div>
        )}
      </>
    );
  }, [
    children,
    contentState,
    error,
    errorMessage,
    guardedBrowseAll,
    guardedRetryLoadMore,
    guardedRetryRefresh,
    hasCustomContent,
    hasMore,
    hideCategoryTag,
    enableRecommendationControls,
    isLoading,
    isLoadingMore,
    isPullIndicatorVisible,
    isRefreshing,
    loadMoreError,
    onRefresh,
    validPosts,
  ]);

  return (
    <div
      ref={rootRef}
      data-feed-frame
      className="feed-viewport-frame"
    >
      {isPullIndicatorVisible && (
        <PullRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          isReady={isRefreshing || pullDistance >= PULL_REFRESH_TRIGGER_PX}
          label={pullRefreshLabel}
        />
      )}

      <FeedScrollShell
        ariaLabel={ariaLabel}
        isBusy={isLoading || isRefreshing || isLoadingMore}
        scrollRootRef={scrollRootRef}
        onScrollRootChange={setScrollContainerNode}
        onScrollPositionChange={onScrollPositionChange}
        onNearBottom={typeof IntersectionObserver === "undefined" ? requestLoadMore : undefined}
        nearBottomThresholdPx={LOAD_MORE_BOTTOM_THRESHOLD_PX}
        topGuardPx={LOAD_MORE_TOP_GUARD_PX}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        translateY={pullDistance}
        documentScrollMode={documentScrollMode}
        contentState={contentState}
      >
        {feedContent}
      </FeedScrollShell>
    </div>
  );
}
