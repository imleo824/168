import { memo, type CSSProperties } from 'react';
import { ArrowDown } from 'lucide-react';
import { HomeFeedSkeleton } from '@/ui/Skeleton';
import { InlineSpinner, LoadingBlock } from '@/ui/LoadingState';
import { HOME_INITIAL_FEED_SKELETON_COUNT } from '@/features/feed/feedContracts';

type PlainFeedStateProps = {
  text: string;
  subtext?: string;
  busy?: boolean;
  className?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const PlainFeedState = memo(function PlainFeedState({
  text,
  subtext,
  busy = false,
  className = '',
  actionLabel,
  onAction,
}: PlainFeedStateProps) {
  return (
    <div
      className={['ui-feed-plain-state', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
    >
      <span className="ui-feed-plain-state-copy">
        {busy ? <InlineSpinner size="xs" className="ui-feed-plain-state-spinner" /> : null}
        <span className="ui-feed-plain-state-text">{text}</span>
        {subtext ? <span className="ui-feed-plain-state-subtext">{subtext}</span> : null}
      </span>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="pressable ui-feed-plain-state-action"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
});

export const FeedFooter = memo(function FeedFooter({
  hasMore,
  isLoadingMore,
  loadMoreError,
  onRetryLoadMore,
  onBrowseAll,
}: {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: boolean;
  onRetryLoadMore: () => void;
  onBrowseAll: () => void;
}) {
  return (
    <div
      className="ui-feed-footer-state"
      aria-live="polite"
      aria-label={
        isLoadingMore
          ? '正在加载更多内容...'
          : loadMoreError
            ? '加载出现异常，请重试'
            : hasMore
              ? '上滑继续探索更多'
              : '已为您展示全部推荐内容'
      }
    >
      {loadMoreError ? (
        <PlainFeedState
          text="内容加载出现问题"
          subtext="网络连接较慢，点击重试"
          actionLabel="重新加载"
          onAction={onRetryLoadMore}
          className="ui-feed-footer-plain-state ui-feed-footer-plain-state--error"
        />
      ) : isLoadingMore ? (
        <PlainFeedState text="正在载入更多..." busy className="ui-feed-footer-plain-state" />
      ) : hasMore ? (
        <PlainFeedState
          text="上滑继续探索更多"
          subtext="也可点击手动加载"
          actionLabel="加载更多"
          onAction={onRetryLoadMore}
          className="ui-feed-footer-plain-state"
        />
      ) : (
        <PlainFeedState
          text="已为您展示全部推荐内容"
          actionLabel="返回顶部刷新"
          onAction={onBrowseAll}
          className="ui-feed-footer-plain-state"
        />
      )}
    </div>
  );
});

export const LoadingState = memo(function LoadingState() {
  return <HomeFeedSkeleton count={HOME_INITIAL_FEED_SKELETON_COUNT} />;
});

export const EmptyState = memo(function EmptyState({
  onBrowseAll,
}: {
  onBrowseAll?: () => void;
}) {
  return (
    <section className="home-feed-empty-state ui-feed-empty-plain-state" role="status" aria-live="polite">
      <div className="home-feed-empty-state__inner">
        <h3 className="home-feed-empty-state__title">暂无相关内容</h3>
        <p className="home-feed-empty-state__copy">您可以切换分类频道，或稍后再来探索</p>
        {onBrowseAll ? (
          <button type="button" className="home-feed-empty-state__action pressable" onClick={onBrowseAll}>
            查看最新推荐
          </button>
        ) : null}
      </div>
    </section>
  );
});

export const RefreshingState = memo(function RefreshingState() {
  return <LoadingBlock text="正在获取最新动态..." compact className="ui-feed-footer-state" />;
});

export const ErrorState = memo(function ErrorState({
  onRetry,
  message,
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <section className="home-feed-empty-state home-feed-empty-state--error" role="alert" aria-live="polite">
      <div className="home-feed-empty-state__inner">
        <h3 className="home-feed-empty-state__title">{message || '动态加载出现异常，请稍后重试'}</h3>
        {onRetry ? <p className="home-feed-empty-state__copy">点击下方按钮重新尝试加载</p> : null}
        {onRetry ? (
          <button type="button" className="home-feed-empty-state__action pressable" onClick={onRetry}>
            重新加载
          </button>
        ) : null}
      </div>
    </section>
  );
});

export const PullRefreshIndicator = memo(function PullRefreshIndicator({
  pullDistance,
  isRefreshing,
  isReady,
  label,
}: {
  pullDistance: number;
  isRefreshing: boolean;
  isReady: boolean;
  label: string;
}) {
  return (
    <div
      className="feed-pull-refresh-indicator ui-layer-pull-indicator"
      style={{
        '--feed-pull-refresh-distance': `${pullDistance}px`,
      } as CSSProperties}
      aria-hidden="true"
    >
      <div
        className={`brand-pull-refresh brand-pull-refresh--weak ${
          isReady ? 'is-ready' : ''
        } ${isRefreshing ? 'is-refreshing' : ''}`}
      >
        <span className="brand-pull-refresh-mark">
          <ArrowDown className="brand-pull-refresh-icon" />
        </span>
        <span className="brand-pull-refresh-text">{label}</span>
      </div>
    </div>
  );
});
