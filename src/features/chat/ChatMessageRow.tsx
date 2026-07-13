import { type CSSProperties, memo, useEffect, useState } from 'react';
import { Link, type Location } from 'react-router-dom';
import { Reply } from 'lucide-react';

import type { ChatMessage, ChatReplyMetadata } from '@/types';
import AvatarImage from '@/ui/AvatarImage';
import OptimizedImage from '@/ui/OptimizedImage';
import QuotedPostPreviewCard from '@/features/post/QuotedPostPreviewCard';
import { dedupeUnique, normalizeImageList } from '@/utils/media';
import { withCurrentBackground } from '@/utils/navigationState';

import {
  formatChatTime,
  getChatPostImages,
  getPostCreatedMetadata,
  getReplyMetadata,
} from './chatMessageUtils';

const CHAT_POST_IMAGE_PREVIEW_MAX = 4;
const CHAT_POST_MIN_ASPECT_RATIO = 3 / 4;
const CHAT_POST_MAX_ASPECT_RATIO = 4 / 3;
const CHAT_POST_DEFAULT_ASPECT_RATIO = '4 / 3';
const CHAT_POST_SINGLE_IMAGE_SIZES = '(max-width: 48rem) 82vw, 20rem';
const CHAT_POST_GRID_IMAGE_SIZES = '(max-width: 48rem) 38vw, 9.375rem';
const CHAT_REPLY_THUMB_SIZES = '2.5rem';

function getOneLineMessageBody(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isTuiPlusChatAuthor(message: ChatMessage) {
  const raw = message as any;
  if (raw.authorIsTuiPlus || raw.isTuiPlus) return true;
  const expiresAt = raw.authorPlusExpiresAt ? new Date(raw.authorPlusExpiresAt).getTime() : 0;
  const status = String(raw.authorPlusStatus || '').trim().toUpperCase();
  return Boolean(expiresAt && expiresAt > Date.now() && (status === 'TRIALING' || status === 'ACTIVE'));
}

function formatPostImageAspectRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return CHAT_POST_DEFAULT_ASPECT_RATIO;
  }

  const naturalRatio = width / height;
  const clampedRatio = Math.min(
    CHAT_POST_MAX_ASPECT_RATIO,
    Math.max(CHAT_POST_MIN_ASPECT_RATIO, naturalRatio),
  );
  const normalizedRatio = Math.round(clampedRatio * 1000);
  return `${normalizedRatio} / 1000`;
}

const ChatAvatar = memo(function ChatAvatar({ message, isTuiPlus }: { message: ChatMessage; isTuiPlus: boolean }) {
  return (
    <AvatarImage
      src={message.authorPhotoUrl || ''}
      name={message.authorName}
      id={message.authorUserId || message.id}
      alt=""
      className="chat-message-avatar-image"
      variant="thumb"
      isTuiPlus={isTuiPlus}
    />
  );
});

const ChatSystemCard = memo(function ChatSystemCard({ message }: { message: ChatMessage }) {
  return (
    <div className="chat-system-card">
      <span>{message.body}</span>
      <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
    </div>
  );
});

const ChatMessageMeta = memo(function ChatMessageMeta({
  authorName,
  createdAt,
  isOwn,
  onReply,
}: {
  authorName: string;
  createdAt: string;
  isOwn: boolean;
  onReply: () => void;
}) {
  return (
    <div className="chat-message-meta" data-own={isOwn ? 'true' : 'false'}>
      <span className="chat-message-name">{authorName}</span>
      <time className="chat-message-time" dateTime={createdAt}>{formatChatTime(createdAt)}</time>
      {!isOwn ? (
        <button
          type="button"
          className="chat-reply-action"
          onClick={onReply}
          aria-label={`回复 ${authorName}`}
          title={`回复 ${authorName}`}
        >
          <Reply aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

export const ChatReplyQuote = memo(function ChatReplyQuote({
  replyTo,
  context = false,
}: {
  replyTo: ChatReplyMetadata;
  context?: boolean;
}) {
  const images = dedupeUnique(normalizeImageList(replyTo.images)).slice(0, 1);
  const hasImages = images.length > 0 || Number(replyTo.imageCount || 0) > 0;
  const hasThumb = Boolean(images[0]);
  const preview = getOneLineMessageBody(replyTo.bodyPreview) || (hasImages ? '图片动态' : '消息');
  const authorName = String(replyTo.authorName || '用户').trim() || '用户';

  return (
    <div className={[
      'chat-reply-quote',
      context ? 'chat-reply-quote--context' : '',
      hasThumb ? 'chat-reply-quote--with-thumb' : 'chat-reply-quote--text-only',
    ].filter(Boolean).join(' ')}>
      {hasThumb ? (
        <span className="chat-reply-thumb" aria-hidden="true">
          <OptimizedImage
            src={images[0] || ''}
            className="chat-reply-thumb-image"
            alt=""
            variant="thumb"
            sizes={CHAT_REPLY_THUMB_SIZES}
            transformResize="cover"
          />
        </span>
      ) : null}
      <div className="chat-reply-quote-copy">
        <span>{context ? `回复 ${authorName}` : authorName}</span>
        <p>{preview}</p>
      </div>
    </div>
  );
});

const ChatPostImagePreview = memo(function ChatPostImagePreview({
  images,
  imageCount,
}: {
  images: string[];
  imageCount: number;
}) {
  const visibleImages = images.slice(0, CHAT_POST_IMAGE_PREVIEW_MAX);
  const hiddenCount = Math.max(0, imageCount - visibleImages.length);
  const isSingle = visibleImages.length === 1;
  const [singleRatio, setSingleRatio] = useState(CHAT_POST_DEFAULT_ASPECT_RATIO);

  useEffect(() => {
    setSingleRatio(CHAT_POST_DEFAULT_ASPECT_RATIO);
  }, [visibleImages[0]]);

  if (visibleImages.length === 0) return null;

  return (
    <div
      className={`chat-post-images${isSingle ? ' chat-post-images--single' : ''}`}
      style={isSingle ? ({ '--chat-post-preview-single-ratio': singleRatio } as CSSProperties) : undefined}
      aria-label={imageCount > 1 ? `帖子图片，共 ${imageCount} 张` : '帖子图片'}
    >
      {visibleImages.map((image, index) => {
        const showMore = hiddenCount > 0 && index === visibleImages.length - 1;
        return (
          <span className="chat-post-image-frame" key={`${image}-${index}`}>
            <OptimizedImage
              src={image}
              className="chat-post-image"
              alt={imageCount > 1 ? `post image ${index + 1}` : 'post image'}
              variant={isSingle ? 'medium' : 'thumb'}
              sizes={isSingle ? CHAT_POST_SINGLE_IMAGE_SIZES : CHAT_POST_GRID_IMAGE_SIZES}
              transformResize="contain"
              onLoad={(event) => {
                if (!isSingle || index !== 0) return;
                setSingleRatio(formatPostImageAspectRatio(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                ));
              }}
            />
            {showMore ? <span className="chat-post-image-more" aria-hidden="true">+{hiddenCount}</span> : null}
          </span>
        );
      })}
    </div>
  );
});

export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isOwn,
  location,
  onReply,
}: {
  message: ChatMessage;
  isOwn: boolean;
  location: Location;
  onReply: (message: ChatMessage) => void;
}) {
  if (message.authorType === 'SYSTEM') return <ChatSystemCard message={message} />;
  const postMetadata = getPostCreatedMetadata(message);
  const postImages = getChatPostImages(message);
  const quotedPost = postMetadata?.quotedPost || null;
  const replyTo = getReplyMetadata(message);
  const hasPostPreview = Boolean(postMetadata?.postId);
  const hasQuotedPost = Boolean(quotedPost);
  const body = String(message.body || '').trim();
  const authorName = String(message.authorName || '用户').trim() || '用户';
  const canOpenUser = Boolean(message.authorUserId);
  const profileTo = canOpenUser ? `/user/${encodeURIComponent(String(message.authorUserId))}` : '';
  const profileState = canOpenUser ? withCurrentBackground(location) : undefined;
  const postTo = postMetadata?.postId ? `/post/${encodeURIComponent(postMetadata.postId)}` : '';
  const postState = hasPostPreview ? withCurrentBackground(location) : undefined;
  const authorIsTuiPlus = isTuiPlusChatAuthor(message);
  const avatar = <ChatAvatar message={message} isTuiPlus={authorIsTuiPlus} />;

  return (
    <article className={`chat-message-row${isOwn ? ' chat-message-row--own' : ''}`}>
      {canOpenUser ? (
        <Link
          to={profileTo}
          state={profileState}
          className="chat-message-avatar pressable"
          data-tui-plus={authorIsTuiPlus ? 'true' : undefined}
          aria-label={`查看 ${authorName} 的空间`}
          title={`查看 ${authorName} 的空间`}
        >
          {avatar}
        </Link>
      ) : (
        <span className="chat-message-avatar chat-message-avatar--static" data-tui-plus={authorIsTuiPlus ? 'true' : undefined}>
          {avatar}
        </span>
      )}
      <div className="chat-message-main">
        <ChatMessageMeta
          authorName={authorName}
          createdAt={message.createdAt}
          isOwn={isOwn}
          onReply={() => onReply(message)}
        />
        {hasPostPreview ? (
          <div
            className={[
              'chat-post-message',
              body ? '' : 'chat-post-message--image-only',
              hasQuotedPost ? 'chat-post-message--with-quote' : '',
            ].filter(Boolean).join(' ')}
          >
            {replyTo ? <ChatReplyQuote replyTo={replyTo} /> : null}
            {body || postImages.length > 0 ? (
              <Link
                to={postTo}
                state={postState}
                className="chat-post-message-link"
                aria-label={postMetadata?.title ? `查看帖子：${postMetadata.title}` : '查看帖子详情'}
                title={postMetadata?.title || '查看帖子详情'}
              >
                {body ? <p className="chat-message-body">{body}</p> : null}
                {postImages.length > 0 ? (
                  <ChatPostImagePreview images={postImages} imageCount={postMetadata?.imageCount || postImages.length} />
                ) : null}
              </Link>
            ) : null}
            {quotedPost ? (
              <QuotedPostPreviewCard
                post={quotedPost}
                compact
                className="chat-quoted-post-preview"
                showEmptyMediaPlaceholder={false}
              />
            ) : null}
          </div>
        ) : replyTo ? (
          <div className="chat-message-body">
            <ChatReplyQuote replyTo={replyTo} />
            <span className="chat-message-body-text">{message.body}</span>
          </div>
        ) : (
          <p className="chat-message-body">{message.body}</p>
        )}
      </div>
    </article>
  );
});
