import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import PostCard, { type FeedPost } from '@/features/post/PostCard';
import { cn } from '@/utils/cn';
import {
  FEED_CARD_HIDE_CATEGORY_TAG,
  FEED_INITIAL_ANIMATED_ITEM_COUNT,
  FEED_INITIAL_RENDERED_ITEM_COUNT,
  FEED_PRIORITY_MEDIA_COUNT,
} from '@/features/feed/feedContracts';

type FeedListItemStyle = CSSProperties & {
  '--feed-list-item-index'?: number;
};

type FeedListPostLike = {
  id?: unknown;
  images?: unknown;
};

type PostFeedListProps<TPost extends FeedListPostLike> = {
  posts: TPost[];
  className?: string;
  itemClassName?: string;
  hideCategoryTag?: boolean;
  enableRecommendationControls?: boolean;
  isOwner?: boolean;
  showStatus?: boolean;
  onStatusChange?: (post: TPost, isPublished: boolean) => void;
  onDelete?: (post: TPost) => void;
  onTelegramSync?: (post: TPost) => Promise<void> | void;
  telegramChannelUrl?: string | null;
  renderPost?: (post: TPost, index: number) => ReactNode;
};

function getPostKey(post: FeedListPostLike, index: number) {
  return post.id == null ? `post-${index}` : String(post.id);
}

function getItemStyle(index: number) {
  if (index >= FEED_INITIAL_ANIMATED_ITEM_COUNT) return undefined;
  return FEED_LIST_ITEM_STYLES[index];
}

function hasFeedPostMedia(post: FeedListPostLike) {
  return Array.isArray(post.images) && post.images.length > 0;
}

const FEED_LIST_ITEM_STYLES = Array.from(
  { length: FEED_INITIAL_ANIMATED_ITEM_COUNT },
  (_, index) => ({ '--feed-list-item-index': index }) as FeedListItemStyle,
);

function getFeedRenderSignature(posts: FeedListPostLike[]) {
  const length = posts.length;
  if (length === 0) return 'empty';
  const headCount = Math.min(length, FEED_INITIAL_RENDERED_ITEM_COUNT);
  let head = '';
  for (let index = 0; index < headCount; index += 1) {
    head += `${index === 0 ? '' : '|'}${getPostKey(posts[index], index)}`;
  }
  const penultimate = length > 2 ? getPostKey(posts[length - 2], length - 2) : '';
  const last = length > 1 ? getPostKey(posts[length - 1], length - 1) : '';
  return `${length}:${head}:${penultimate}:${last}`;
}

function scheduleDeferredMount(callback: () => void) {
  if (typeof window === 'undefined') return null;
  const idleCallback = (window as any).requestIdleCallback as ((handler: () => void, options?: { timeout?: number }) => number) | undefined;
  if (typeof idleCallback === 'function') {
    const id = idleCallback(callback, { timeout: 450 });
    return () => (window as any).cancelIdleCallback?.(id);
  }
  const timeout = window.setTimeout(callback, 120);
  return () => window.clearTimeout(timeout);
}

export default function PostFeedList<TPost extends FeedListPostLike>({
  posts,
  className,
  itemClassName,
  hideCategoryTag = FEED_CARD_HIDE_CATEGORY_TAG,
  enableRecommendationControls = false,
  isOwner,
  showStatus,
  onStatusChange,
  onDelete,
  onTelegramSync,
  telegramChannelUrl,
  renderPost,
}: PostFeedListProps<TPost>) {
  const hasOwnerCallbacks = Boolean(onStatusChange || onDelete || onTelegramSync);
  const effectiveIsOwner = isOwner ?? hasOwnerCallbacks;
  const effectiveShowStatus = showStatus ?? hasOwnerCallbacks;
  const feedRenderSignature = useMemo(() => getFeedRenderSignature(posts), [posts]);
  const shouldDeferTail = posts.length > FEED_INITIAL_RENDERED_ITEM_COUNT;
  const [tailMounted, setTailMounted] = useState(!shouldDeferTail);

  useEffect(() => {
    if (!shouldDeferTail) {
      setTailMounted(true);
      return undefined;
    }

    setTailMounted(false);
    return scheduleDeferredMount(() => setTailMounted(true)) || undefined;
  }, [feedRenderSignature, shouldDeferTail]);

  const visiblePosts = useMemo(
    () => (tailMounted ? posts : posts.slice(0, FEED_INITIAL_RENDERED_ITEM_COUNT)),
    [posts, tailMounted],
  );

  return (
    <div className={cn('post-feed-list-panel', className)}>
      {visiblePosts.map((post, index) => {
        const shouldAnimate = index < FEED_INITIAL_ANIMATED_ITEM_COUNT;
        const hasMedia = hasFeedPostMedia(post);
        const renderedPost = renderPost ? (
          renderPost(post, index)
        ) : (
          <PostCard
            post={post as FeedPost}
            isOwner={effectiveIsOwner}
            showStatus={effectiveShowStatus}
            hideCategoryTag={hideCategoryTag}
            priorityMedia={index < FEED_PRIORITY_MEDIA_COUNT}
            enableRecommendationControls={enableRecommendationControls}
            onStatusChange={onStatusChange as any}
            onDelete={onDelete as any}
            onTelegramSync={onTelegramSync as any}
            telegramChannelUrl={telegramChannelUrl}
          />
        );

        return (
          <div
            className={cn(
              'feed-list-item',
              shouldAnimate ? 'feed-list-item--animated' : 'feed-list-item--deferred',
              hasMedia ? 'feed-list-item--media' : '',
              itemClassName,
            )}
            key={getPostKey(post, index)}
            role="article"
            data-feed-item-media={hasMedia ? 'true' : undefined}
            style={getItemStyle(index)}
          >
            {renderedPost}
          </div>
        );
      })}
    </div>
  );
}
