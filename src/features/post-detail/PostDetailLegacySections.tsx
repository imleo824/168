import { memo, useCallback, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FlameKindling, MessageCircle, Quote, Share, ThumbsUp } from 'lucide-react';

import AvatarImage from '@/ui/AvatarImage';
import TopbarIconButton from '@/ui/TopbarIconButton';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import { rememberListReturnPosition } from '@/utils/listReturnScroll';
import { withCurrentBackground } from '@/utils/navigationState';
import { formatEngagementCount } from '@/utils/engagement';
import { formatRelativeTime } from '@/utils/time';
import { resolveVisiblePostText } from '@/utils/postDisplayText';
import type { FeedPost } from '@/features/post/PostCard';
import type { PostLiker } from '@/types';

import {
  getDetailQuoteAuthorName,
  isAnonymousAuthor,
  normalizeAuthorId,
} from './postDetailLegacyUtils';

export const DETAIL_BOTTOM_ACTION_CLASS = 'detail-bottom-action feed-action-btn';
export const DETAIL_BOTTOM_ACTION_MOBILE_CLASS = 'detail-bottom-action detail-bottom-action-mobile feed-action-btn';
export const DETAIL_BOTTOM_ACTION_PENDING_CLASS = 'is-pending';

export const BottomActionCount = ({ value }: { value: string }) => (
  <span
    className={`detail-bottom-count feed-action-count ${value ? '' : 'is-empty'}`}
    aria-hidden={!value}
    title={value || undefined}
  >
    {value}
  </span>
);

export const DetailBackButton = memo(function DetailBackButton({ onBack }: { onBack: () => void }) {
  return (
    <TopbarIconButton
      icon={<ArrowLeft className="ui-topbar-back-icon detail-topbar-back-icon" aria-hidden="true" />}
      onClick={onBack}
      ariaLabel="返回"
      tone="strong"
      className="ui-topbar-back-button"
    />
  );
});

export const DetailTopbarPlaceholderAuthor = memo(function DetailTopbarPlaceholderAuthor() {
  return (
    <span
      className="detail-topbar-author detail-topbar-author-row detail-topbar-author--placeholder"
      aria-hidden="true"
    >
      <span className="detail-topbar-author-avatar" />
      <span className="detail-topbar-author-meta">
        <span className="detail-topbar-author-name">帖子详情</span>
        <span className="detail-topbar-author-time">刚刚</span>
      </span>
    </span>
  );
});

export const DetailTopbarActionSpacer = memo(function DetailTopbarActionSpacer() {
  return (
    <div className="detail-topbar-actions detail-topbar-actions--placeholder" aria-hidden="true">
      <span className="detail-topbar-action-spacer" />
    </div>
  );
});

export const DetailQuoteItem = memo(function DetailQuoteItem({ post }: { post: FeedPost }) {
  const navigate = useNavigate();
  const location = useLocation();
  const authorName = getDetailQuoteAuthorName(post);
  const authorId = normalizeAuthorId(post);
  const anonymous = post.isAnonymous || isAnonymousAuthor(post);
  const avatarSrc = anonymous
    ? ''
    : String(post.user?.photoUrl || post.user?.avatarUrl || post.user?.avatar || '').trim();
  const text = resolveVisiblePostText(post as any).trim() || '引用了这条帖子';
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
      className="detail-quote-item"
      onClick={handleOpen}
      aria-label={`查看引用：${text.slice(0, 40)}`}
    >
      <AvatarImage
        src={avatarSrc}
        name={authorName}
        id={authorId || post.id}
        alt={authorName}
        className="detail-quote-item-avatar"
        variant="thumb"
        loading="lazy"
      />
      <span className="detail-quote-item-main">
        <span className="detail-quote-item-meta">
          <span className="detail-quote-item-author">{authorName}</span>
          <span className="detail-quote-item-time">· {timeText}</span>
        </span>
        <span className="detail-quote-item-text">{text}</span>
      </span>
    </button>
  );
});

export const DetailLikeWall = memo(function DetailLikeWall({
  likers,
  total,
  loading,
}: {
  likers: PostLiker[];
  total: number;
  loading?: boolean;
}) {
  const safeTotal = Math.max(0, Number(total || 0));
  if (safeTotal <= 0 && !likers.length) return null;
  if (!likers.length && !loading) return null;
  const countText = formatEngagementCount(safeTotal || likers.length) || String(safeTotal || likers.length);
  const remainingLikeCount = Math.max(0, safeTotal - likers.length);

  return (
    <section className="detail-like-wall" aria-labelledby="detail-like-wall-title">
      <div className="detail-like-wall-header">
        <h2 id="detail-like-wall-title" className="detail-like-wall-title">赞过的人</h2>
        <span className="detail-like-wall-count">{countText}</span>
      </div>
      {likers.length > 0 ? (
        <div className="detail-like-wall-avatar-row">
          {likers.map((liker) => {
            const name = liker.displayName || liker.username || '用户';
            return (
              <span key={liker.id} className="detail-like-wall-avatar-frame" title={name}>
                <AvatarImage
                  src={liker.photoUrl || ''}
                  name={name}
                  id={liker.id}
                  alt=""
                  className="detail-like-wall-avatar"
                  variant="thumb"
                  loading="lazy"
                />
              </span>
            );
          })}
          {remainingLikeCount > 0 ? (
            <span
              className="detail-like-wall-more"
              title={`共有 ${remainingLikeCount} 位用户赞过`}
              aria-label={`共有 ${remainingLikeCount} 位用户赞过`}
            >
              +{formatEngagementCount(remainingLikeCount) || remainingLikeCount}
            </span>
          ) : null}
        </div>
      ) : (
        <LoadingBlock
          text="正在加载点赞"
          compact
          className="detail-like-wall-loading-block"
        />
      )}
    </section>
  );
});

export function DetailStatePage({
  isMobile,
  isOverlayDetail,
  shouldUseDetailPageScroll,
  onBack,
  stateBlock,
}: {
  isMobile: boolean;
  isOverlayDetail: boolean;
  shouldUseDetailPageScroll: boolean;
  onBack: () => void;
  stateBlock: {
    title: string;
    description?: string;
    tone: 'empty' | 'error';
    actionLabel: string;
    onAction: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  };
}) {
  return (
    <AppPage
      surface="detail"
      data-route-overlay={isOverlayDetail ? '' : undefined}
      data-route-overlay-scroll={isOverlayDetail ? '' : undefined}
      mobileAddressBarScroll={shouldUseDetailPageScroll}
      className={`detail-page detail-page--state ${isMobile ? 'detail-page--mobile' : 'detail-page--desktop'}`}
    >
      <PageHeader
        title=""
        left={(
          <>
            <DetailBackButton onBack={onBack} />
            <DetailTopbarPlaceholderAuthor />
          </>
        )}
        right={<DetailTopbarActionSpacer />}
        showBack={false}
        className="detail-page-topbar"
        contentClassName="detail-topbar-inner"
        leftClassName="detail-topbar-left"
        rightClassName="detail-topbar-right"
      />
      <PageContentShell
        as="main"
        variant="fluid"
        data-detail-scroll-root=""
        data-route-overlay-scroll={isOverlayDetail ? '' : undefined}
        className={`detail-page-main detail-state-shell ui-app-page-main ${isMobile ? 'detail-page-main--mobile' : 'detail-page-main--desktop'}`}
      >
        <StateBlock
          title={stateBlock.title}
          description={stateBlock.description}
          tone={stateBlock.tone}
          actionLabel={stateBlock.actionLabel}
          onAction={stateBlock.onAction}
          secondaryActionLabel={stateBlock.secondaryActionLabel}
          onSecondaryAction={stateBlock.onSecondaryAction}
        />
      </PageContentShell>
    </AppPage>
  );
}

export function DetailLoadingPage({
  isMobile,
  isOverlayDetail,
  shouldUseDetailPageScroll,
  onBack,
}: {
  isMobile: boolean;
  isOverlayDetail: boolean;
  shouldUseDetailPageScroll: boolean;
  onBack: () => void;
}) {
  return (
    <AppPage
      surface="detail"
      data-route-overlay={isOverlayDetail ? '' : undefined}
      data-route-overlay-scroll={isOverlayDetail ? '' : undefined}
      mobileAddressBarScroll={shouldUseDetailPageScroll}
      className={`detail-page detail-page--loading ${isMobile ? 'detail-page--mobile' : 'detail-page--desktop'}`}
    >
      <PageHeader
        title=""
        left={<DetailBackButton onBack={onBack} />}
        showBack={false}
        className="detail-page-topbar"
        contentClassName="detail-topbar-inner"
        leftClassName="detail-topbar-left"
        rightClassName="detail-topbar-right"
      />

      <PageContentShell
        as="main"
        variant="fluid"
        data-detail-scroll-root=""
        data-route-overlay-scroll={isOverlayDetail ? '' : undefined}
        className={`detail-page-main ui-app-page-main ${isMobile ? 'detail-page-main--mobile' : 'detail-page-main--desktop'}`}
      >
        <LoadingBlock text="正在加载帖子详情" className="detail-page-loading-block" />
      </PageContentShell>
    </AppPage>
  );
}

export function DetailBottomBar({
  isMobile,
  heatCountText,
  hasLiked,
  likePending,
  isLikeFeedbackActive,
  likeCountText,
  commentCountText,
  isSharing,
  shareCountText,
  quoteCountText,
  onLike,
  onOpenCommentSheet,
  onShare,
  onOpenQuoteSheet,
}: {
  isMobile: boolean;
  heatCountText: string;
  hasLiked: boolean;
  likePending: boolean;
  isLikeFeedbackActive: boolean;
  likeCountText: string;
  commentCountText: string;
  isSharing: boolean;
  shareCountText: string;
  quoteCountText: string;
  onLike: () => void;
  onOpenCommentSheet: () => void;
  onShare: () => void;
  onOpenQuoteSheet: () => void;
}) {
  const bottomActionClass = isMobile ? DETAIL_BOTTOM_ACTION_MOBILE_CLASS : DETAIL_BOTTOM_ACTION_CLASS;

  return (
    <footer className={
      isMobile
        ? 'detail-bottom-bar detail-bottom-bar-mobile ui-layer-page-header'
        : 'detail-bottom-bar detail-bottom-bar-desktop ui-layer-header'
    }>
      <div className={isMobile ? 'detail-bottom-inner detail-bottom-inner--mobile' : 'detail-bottom-inner detail-bottom-inner--desktop'}>
        <div className={isMobile ? 'detail-bottom-actions-grid' : 'detail-bottom-actions-row'}>
          <div
            className={`${bottomActionClass} detail-bottom-action--heat`}
            aria-label={`热度指数 ${heatCountText}`}
          >
            <FlameKindling className="feed-action-heat-icon" aria-hidden="true" />
            <BottomActionCount value={heatCountText} />
          </div>

          <button
            type="button"
            onClick={onLike}
            disabled={likePending}
            className={`${bottomActionClass} ${hasLiked ? 'detail-bottom-action--liked' : 'detail-bottom-action--like'} ${isLikeFeedbackActive ? 'is-like-feedback-active' : ''} ${likePending ? DETAIL_BOTTOM_ACTION_PENDING_CLASS : ''}`}
            aria-label={hasLiked ? '取消点赞' : '点赞表达认可'}
            aria-pressed={hasLiked}
            aria-busy={likePending || undefined}
          >
            <ThumbsUp className="feed-action-like-icon" fill={hasLiked ? 'currentColor' : 'none'} aria-hidden="true" />
            <BottomActionCount value={likeCountText} />
          </button>

          <button
            type="button"
            onClick={onOpenCommentSheet}
            className={`${bottomActionClass} detail-bottom-action--comment`}
            aria-label={`查看评论 (${commentCountText || '0'})`}
          >
            <MessageCircle aria-hidden="true" />
            {commentCountText ? <BottomActionCount value={commentCountText} /> : null}
          </button>

          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className={`${bottomActionClass} detail-bottom-action--share ${isSharing ? DETAIL_BOTTOM_ACTION_PENDING_CLASS : ''}`}
            aria-label="分享内容"
            aria-busy={isSharing || undefined}
          >
            <Share aria-hidden="true" />
            <BottomActionCount value={shareCountText} />
          </button>

          <button
            type="button"
            onClick={onOpenQuoteSheet}
            className={`${bottomActionClass} detail-bottom-action--quote`}
            aria-label={`查看引用转发 (${quoteCountText || '0'})`}
          >
            <Quote aria-hidden="true" />
            {quoteCountText ? <BottomActionCount value={quoteCountText} /> : null}
          </button>
        </div>
      </div>
    </footer>
  );
}
