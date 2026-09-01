import { memo } from 'react';
import { MessageCircle } from 'lucide-react';

import AvatarImage from '@/ui/AvatarImage';
import { formatRelativeTime } from '@/utils/time';
import { CommentContentText } from '@/features/post/CommentContentText';
import type { PostComment } from '@/features/post/usePostComments';

function getCommentAuthorName(comment: PostComment) {
  return String(comment.user?.displayName || comment.user?.username || '用户').trim() || '用户';
}

const DetailCommentItem = memo(function DetailCommentItem({ comment }: { comment: PostComment }) {
  const authorName = getCommentAuthorName(comment);
  const timeText = comment.createdAt ? formatRelativeTime(comment.createdAt) : '';
  const content = String(comment.content || '').trim();

  return (
    <article className="detail-quote-item detail-interaction-item detail-interaction-item--comment" aria-label={`${authorName} 的评论`}>
      <AvatarImage
        src={comment.user?.photoUrl || ''}
        name={authorName}
        id={comment.user?.id || comment.userId || comment.id}
        alt={authorName}
        className="detail-quote-item-avatar detail-interaction-item-avatar"
        variant="thumb"
        loading="lazy"
      />
      <span className="detail-quote-item-main detail-interaction-item-main">
        <span className="detail-quote-item-meta detail-interaction-item-meta">
          <span className="detail-interaction-comment-author">{authorName}</span>
          <MessageCircle className="detail-interaction-comment-icon" aria-label="评论" role="img" />
          {timeText ? <span className="detail-quote-item-time">· {timeText}</span> : null}
        </span>
        <span className="detail-quote-item-text detail-interaction-comment-text post-comment-list-text"><CommentContentText content={content} /></span>
      </span>
    </article>
  );
});

export default DetailCommentItem;
