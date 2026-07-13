import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  getFeedScrollEventTarget,
  getFeedScrollMetrics,
  isDocumentFeedScrollMode,
  subscribeFeedScrollModeChange,
} from '@/utils/feedScroll';

export type FeedScrollContentState = 'default' | 'loading' | 'refreshing' | 'empty' | 'error' | 'content' | 'custom';

type FeedScrollShellProps = {
  children: React.ReactNode;
  ariaLabel?: string;
  isBusy?: boolean;
  className?: string;
  contentClassName?: string;
  contentState?: FeedScrollContentState;
  onScrollPositionChange?: (scrollTop: number) => void;
  onNearBottom?: () => void;
  nearBottomThresholdPx?: number;
  topGuardPx?: number;
  scrollRootRef?: React.RefObject<HTMLDivElement | null>;
  onScrollRootChange?: (node: HTMLDivElement | null) => void;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onTouchCancel?: React.TouchEventHandler<HTMLDivElement>;
  translateY?: number;
  documentScrollMode?: boolean;
};

const DEFAULT_NEAR_BOTTOM_THRESHOLD_PX = 520;
const DEFAULT_TOP_GUARD_PX = 48;

function classNameIncludes(value: unknown, className: string) {
  if (typeof value !== 'string') return false;
  return value.split(/\s+/).includes(className);
}

function isFeedFooterStateElement(child: React.ReactNode) {
  if (!React.isValidElement(child)) return false;
  return classNameIncludes(
    (child.props as { className?: unknown }).className,
    'ui-feed-footer-state',
  );
}

/**
 * Generic feed scroll container.
 * It owns scroll-event wiring, document-scroll fallback, and scroll-root refs.
 * Pull refresh, load more, and feed rendering can be composed on top of it
 * instead of every feed implementation re-implementing scroll plumbing.
 */
export function FeedScrollShell({
  children,
  ariaLabel = '信息流',
  isBusy = false,
  className = '',
  contentClassName = '',
  contentState = 'default',
  onScrollPositionChange,
  onNearBottom,
  nearBottomThresholdPx = DEFAULT_NEAR_BOTTOM_THRESHOLD_PX,
  topGuardPx = DEFAULT_TOP_GUARD_PX,
  scrollRootRef,
  onScrollRootChange,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  translateY = 0,
  documentScrollMode = false,
}: FeedScrollShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const onScrollPositionChangeRef = useRef(onScrollPositionChange);
  const onNearBottomRef = useRef(onNearBottom);
  const [isDocumentScrollModeState, setIsDocumentScrollModeState] = useState(
    () => typeof window !== 'undefined' && isDocumentFeedScrollMode(documentScrollMode),
  );

  onScrollPositionChangeRef.current = onScrollPositionChange;
  onNearBottomRef.current = onNearBottom;

  const setNode = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (scrollRootRef) {
      scrollRootRef.current = node;
    }
    onScrollRootChange?.(node);
  }, [onScrollRootChange, scrollRootRef]);

  useEffect(() => {
    if (!scrollRootRef) return undefined;
    scrollRootRef.current = containerRef.current;
    onScrollRootChange?.(containerRef.current);

    return () => {
      if (scrollRootRef.current === containerRef.current) {
        scrollRootRef.current = null;
      }
      onScrollRootChange?.(null);
    };
  }, [onScrollRootChange, scrollRootRef]);

  useEffect(
    () =>
      subscribeFeedScrollModeChange(() => {
        const next = isDocumentFeedScrollMode(documentScrollMode);
        setIsDocumentScrollModeState((current) => (current === next ? current : next));
      }),
    [documentScrollMode],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return undefined;

    const handleScroll = () => {
      if (frameRef.current !== null) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const metrics = getFeedScrollMetrics(container, isDocumentScrollModeState);
        onScrollPositionChangeRef.current?.(metrics.scrollTop);

        if (!onNearBottomRef.current) return;
        const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
        if (metrics.scrollTop < topGuardPx || distanceFromBottom > nearBottomThresholdPx) return;
        onNearBottomRef.current();
      });
    };

    const scrollTarget = getFeedScrollEventTarget(container, isDocumentScrollModeState);
    if (!scrollTarget) return undefined;

    handleScroll();
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isDocumentScrollModeState, nearBottomThresholdPx, topGuardPx]);

  const isTranslated = translateY !== 0;
  const contentStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isTranslated) return undefined;
    return { '--feed-scroll-translate-y': `${translateY}px` } as CSSProperties;
  }, [isTranslated, translateY]);
  const isFooterOnlyContent = useMemo(() => {
    const childItems = React.Children.toArray(children);
    return childItems.length === 1 && isFeedFooterStateElement(childItems[0]);
  }, [children]);

  return (
    <div
      ref={setNode}
      data-feed-scroll-root
      data-feed-document-scroll={documentScrollMode ? 'true' : undefined}
      data-mobile-addressbar-scroll
      role="feed"
      aria-label={ariaLabel}
      aria-busy={isBusy}
      className={`feed-scroll-root ${className}`.trim()}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div
        className={`feed-scroll-content ${contentClassName}`.trim()}
        data-feed-content-state={contentState}
        data-feed-scroll-translated={isTranslated ? 'true' : 'false'}
        data-feed-footer-only={isFooterOnlyContent ? 'true' : 'false'}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
}
