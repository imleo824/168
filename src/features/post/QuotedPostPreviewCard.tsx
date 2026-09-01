import { memo, useCallback, useMemo, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';

import AvatarImage from '@/ui/AvatarImage';
import OptimizedImage from '@/ui/OptimizedImage';
import type { QuotePostPreview } from '@/types';
import { normalizeImageList } from '@/utils/media';
import { withCurrentBackground } from '@/utils/navigationState';
import { rememberListReturnPosition } from '@/utils/listReturnScroll';
import { resolveVisiblePostText } from '@/utils/postDisplayText';
import { cn } from '@/utils/cn';

interface QuotedPostPreviewCardProps {
  post?: QuotePostPreview | null;
  className?: string;
  compact?: boolean;
  showEmptyMediaPlaceholder?: boolean;
}

function toValidDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function getAuthorName(post: QuotePostPreview) {
  if (post.unavailable) return '';
  if (post.isAnonymous || post.userId === 'anonymous') return '匿名用户';
  const name = String(post.user?.displayName || post.user?.username || '').trim();
  return name || '用户';
}

const QuotedPostPreviewCard = memo(function QuotedPostPreviewCard({
  post,
  className,
  compact = false,
  showEmptyMediaPlaceholder = true,
}: QuotedPostPreviewCardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const unavailable = !post || post.unavailable || post.isPublished === false || Boolean(post.deletedAt);
  const images = useMemo(() => normalizeImageList(post?.images || []), [post?.images]);
  const image = images[0] || '';
  const authorName = post && !unavailable ? getAuthorName(post) : '';
  const createdAtText = post && !unavailable ? formatShortDate(post.createdAt) : '';
  const text = post && !unavailable
    ? resolveVisiblePostText(post as any).trim()
    : '';
  const previewText = text || (image ? '图片内容' : '原帖暂不可见');
  const canOpen = Boolean(post?.id && !unavailable);

  const handleOpen = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!post?.id || unavailable) return;
    rememberListReturnPosition(event.currentTarget);
    navigate(`/post/${post.id}`, { state: withCurrentBackground(location) });
  }, [location, navigate, post?.id, unavailable]);

  return (
    <button
      type="button"
      className={cn(
        'quoted-post-preview-card',
        compact && 'quoted-post-preview-card--compact',
        unavailable && 'quoted-post-preview-card--unavailable',
        className,
      )}
      onClick={handleOpen}
      disabled={!canOpen}
      data-card-interactive="true"
      data-no-card-click="true"
      data-has-media={image && !unavailable ? 'true' : undefined}
      aria-label={canOpen ? `查看引用原帖：${previewText.slice(0, 36)}` : '原帖暂不可见'}
    >
      <span className="quoted-post-preview-main">
        {unavailable ? (
          <span className="quoted-post-preview-unavailable">原帖暂不可见</span>
        ) : (
          <>
            <span className="quoted-post-preview-author">
              <AvatarImage
                src={post?.isAnonymous ? '' : (post?.user?.photoUrl || '')}
                name={authorName}
                id={post?.userId || post?.id || 'quote'}
                alt={authorName}
                className="quoted-post-preview-avatar"
                variant="thumb"
                loading="lazy"
              />
              <span className="quoted-post-preview-author-name">{authorName}</span>
              {createdAtText ? <span className="quoted-post-preview-time">· {createdAtText}</span> : null}
            </span>
            <span className="quoted-post-preview-content">
              <span className="quoted-post-preview-text">{previewText}</span>
              {image ? (
                <span className="quoted-post-preview-media" aria-hidden="true">
                  <OptimizedImage
                    src={image}
                    alt=""
                    className="quoted-post-preview-image"
                    loading="lazy"
                    variant="thumb"
                    transformResize="contain"
                  />
                </span>
              ) : compact && showEmptyMediaPlaceholder ? (
                <span className="quoted-post-preview-media quoted-post-preview-media--empty" aria-hidden="true">
                  <ImageIcon className="quoted-post-preview-media-empty-icon" />
                </span>
              ) : null}
            </span>
          </>
        )}
      </span>
    </button>
  );
});

export default QuotedPostPreviewCard;
