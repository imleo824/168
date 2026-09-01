import { memo } from 'react';
import { cn } from '@/utils/cn';
import { InlineSpinner } from '@/ui/LoadingState';

interface ListLoadMoreStateProps {
  error?: boolean;
  loading?: boolean;
  hasMore?: boolean;
  doneText?: string;
  loadingText?: string;
  loadMoreText?: string;
  passiveMoreText?: string;
  errorText?: string;
  errorDescription?: string;
  onRetry?: () => void | Promise<void>;
  onLoadMore?: () => void | Promise<void>;
  className?: string;
}

function ListLoadMoreState({
  error = false,
  loading = false,
  hasMore = false,
  doneText = '没有更多内容了',
  loadingText = '正在加载',
  loadMoreText = '查看更多',
  passiveMoreText,
  errorDescription = '加载失败，稍后再试',
  onRetry,
  onLoadMore,
  className = '',
}: ListLoadMoreStateProps) {
  if (!error && !loading && !hasMore && !doneText) return null;

  const text = error
    ? errorDescription
    : loading
      ? loadingText
      : hasMore
        ? passiveMoreText || loadMoreText
        : doneText;
  const onClick = loading ? undefined : error ? onRetry : hasMore ? onLoadMore : undefined;

  const content = loading ? (
    <span className="ui-list-loadmore-text-copy ui-list-loadmore-loading-copy">
      <InlineSpinner size="xs" className="ui-list-loadmore-spinner" />
      <span>{text}</span>
    </span>
  ) : onClick ? (
    <button type="button" className="ui-list-loadmore-text-button" onClick={onClick}>
      {text}
    </button>
  ) : (
    <span className="ui-list-loadmore-text-copy">{text}</span>
  );

  return (
    <div
      className={cn(
        'ui-list-loadmore',
        error && 'ui-list-loadmore--error',
        loading && 'ui-list-loadmore--loading',
        hasMore && !loading && !error && 'ui-list-loadmore--more',
        className,
      )}
      role={error ? 'alert' : loading ? 'status' : undefined}
      aria-live={loading || error ? 'polite' : undefined}
      aria-busy={loading || undefined}
    >
      {content}
    </div>
  );
}

export default memo(ListLoadMoreState);
