import React, {
  memo,
  useCallback,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Megaphone,
  RadioTower,
  Trash2,
  UserX,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useBlockUser, useReducePostRecommendation } from '@/hooks/useDataPosts';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { cn } from '@/utils/cn';
import type { PostOptionsMenuProps } from './AnchoredActionMenu';

interface PostOptionsMenuPanelProps extends PostOptionsMenuProps {
  open: boolean;
  menuId: string;
  menuTitle: string;
  initialSurfaceStyle?: CSSProperties;
  surfaceStyle?: CSSProperties;
  onOpenChange: (open: boolean) => void;
}

interface PostOptionsRowProps {
  icon: ReactNode;
  title: string;
  className?: string;
  disabled?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function stopCardEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function stopAndPreventCardEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
  event.preventDefault();
}

function eventPathContainsFeedMenu(event: Event, menuId: string) {
  const selector = `[data-feed-card-options-menu="${menuId}"], [data-feed-card-options-surface="${menuId}"]`;
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.some((item) => item instanceof Element && item.matches(selector))) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest(selector));
}

const PostOptionsRow = memo(function PostOptionsRow({
  icon,
  title,
  className = '',
  disabled = false,
  onPointerDown,
  onClick,
}: PostOptionsRowProps) {
  return (
    <button
      type="button"
      className={cn('feed-card-options-sheet-button feed-card-options-row', className)}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <span className="feed-card-options-sheet-button-main">
        <span className="feed-card-options-sheet-button-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="feed-card-options-sheet-button-copy">
          <span className="feed-card-options-sheet-button-title">{title}</span>
        </span>
      </span>
    </button>
  );
});

export const PostOptionsMenuPanel = memo(function PostOptionsMenuPanel({
  postId,
  authorId,
  ownerOptions,
  recommendationEnabled,
  open,
  menuId,
  menuTitle,
  initialSurfaceStyle,
  surfaceStyle,
  onOpenChange,
}: PostOptionsMenuPanelProps) {
  const { requireAuth, showToast } = useAuth();
  const navigate = useNavigate();
  const reduceRecommendation = useReducePostRecommendation();
  const blockUser = useBlockUser();
  const ownerOptionsEnabled = Boolean(ownerOptions?.enabled);
  const menuEnabled = ownerOptionsEnabled || recommendationEnabled;

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return undefined;

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (eventPathContainsFeedMenu(event, menuId)) return;
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [handleClose, menuId, open]);

  const submitFeedback = useCallback((message: string) => {
    if (!postId || reduceRecommendation.isPending) return;
    requireAuth(() => {
      void reduceRecommendation.mutateAsync(postId)
        .then(() => {
          onOpenChange(false);
          showToast(message, 'success');
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : '操作失败，请稍后重试', 'error');
        });
    });
  }, [onOpenChange, postId, reduceRecommendation, requireAuth, showToast]);

  const blockAuthor = useCallback(() => {
    if (!authorId || blockUser.isPending) return;
    requireAuth(() => {
      void blockUser.mutateAsync(authorId)
        .then(() => {
          onOpenChange(false);
          showToast('已屏蔽此人', 'success');
        })
        .catch((error) => {
          showToast(error instanceof Error ? error.message : '操作失败，请稍后重试', 'error');
      });
    });
  }, [authorId, blockUser, onOpenChange, requireAuth, showToast]);
  const { guarded: guardedSubmitFeedback, isPending: feedbackGuardPending } = useInteractionGuard<[string]>(submitFeedback, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 120,
    mode: 'drop',
  });
  const { guarded: guardedBlockAuthor, isPending: blockAuthorGuardPending } = useInteractionGuard(blockAuthor, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 120,
    mode: 'drop',
  });

  const runOwnerAction = useCallback((action: (() => void) | undefined) => {
    if (!action) return;
    onOpenChange(false);
    action();
  }, [onOpenChange]);

  const handleTelegramSync = useCallback(() => {
    onOpenChange(false);
    if (!ownerOptions?.onTelegramSync) {
      showToast('当前内容暂不可同步', 'error');
      return;
    }
    ownerOptions.onTelegramSync();
  }, [onOpenChange, ownerOptions, showToast]);

  const handlePromote = useCallback(() => {
    onOpenChange(false);
    if (ownerOptions?.onPromote) {
      ownerOptions.onPromote();
      return;
    }

    if (postId) {
      navigate('/promote', {
        state: {
          postId,
          from: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
        },
      });
    }
  }, [navigate, onOpenChange, ownerOptions, postId]);

  const handleOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    stopAndPreventCardEvent(event);
  }, []);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    stopAndPreventCardEvent(event);
    if (event.target === event.currentTarget) handleClose();
  }, [handleClose]);

  const handleMenuRowPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    stopCardEvent(event);
  }, []);

  const handleFeedbackClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    void guardedSubmitFeedback('已减少相似内容出现');
  }, [guardedSubmitFeedback]);

  const handleBlockAuthorClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    void guardedBlockAuthor();
  }, [guardedBlockAuthor]);

  const handleTelegramSyncClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    handleTelegramSync();
  }, [handleTelegramSync]);

  const handlePromoteClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    handlePromote();
  }, [handlePromote]);

  const handleStatusClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    runOwnerAction(ownerOptions?.onStatusChange);
  }, [ownerOptions?.onStatusChange, runOwnerAction]);

  const handleDeleteClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    stopAndPreventCardEvent(event);
    runOwnerAction(ownerOptions?.onDelete);
  }, [ownerOptions?.onDelete, runOwnerAction]);

  if (!open || !menuEnabled || !postId || typeof document === 'undefined') return null;

  const isPublished = ownerOptions?.isPublished !== false;

  return createPortal(
    <div
      className="feed-card-options-sheet-overlay feed-card-options-layer--portal"
      data-feed-card-options-surface={menuId}
      data-card-interactive="true"
      data-no-card-click="true"
      onPointerDown={handleOverlayPointerDown}
      onPointerUp={stopAndPreventCardEvent}
      onClick={handleOverlayClick}
    >
      <section
        className="ui-sheet-panel feed-card-options-sheet-panel"
        style={{ ...initialSurfaceStyle, ...surfaceStyle }}
        role="dialog"
        aria-modal="true"
        aria-label={menuTitle}
        data-feed-card-options-surface={menuId}
        data-card-interactive="true"
        data-no-card-click="true"
        onPointerDown={stopCardEvent}
        onClick={stopCardEvent}
      >
        <div className="feed-card-options-sheet-body">
          <div
            className="feed-card-options-sheet-actions"
            data-feed-card-options-surface={menuId}
            data-card-interactive="true"
            data-no-card-click="true"
            onPointerDown={stopCardEvent}
            onClick={stopCardEvent}
          >
            {ownerOptionsEnabled ? (
              <>
                <div className="feed-card-options-status" role="presentation">
                  <span className="feed-card-options-status-indicator" aria-hidden="true">
                    {isPublished ? <span className="feed-status-dot-ping" /> : null}
                    <span className={`feed-status-dot ${isPublished ? 'feed-status-dot-live' : 'feed-status-dot-offline'}`} />
                  </span>
                  <span className={`feed-status-label ${isPublished ? 'feed-status-label-live' : 'feed-status-label-offline'}`}>
                    {isPublished ? '上架中' : '已下架'}
                  </span>
                </div>
                <PostOptionsRow
                  icon={<RadioTower />}
                  title="同步到频道"
                  className="feed-card-options-row--sync"
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handleTelegramSyncClick}
                />
                <PostOptionsRow
                  icon={<Megaphone />}
                  title="推广"
                  className="feed-card-options-row--promote"
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handlePromoteClick}
                />
                <PostOptionsRow
                  icon={isPublished ? <EyeOff /> : <Eye />}
                  title={isPublished ? '下架' : '上架'}
                  className={isPublished ? 'feed-card-options-row--unpublish' : 'feed-card-options-row--publish'}
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handleStatusClick}
                />
                <PostOptionsRow
                  icon={<Trash2 />}
                  title="删除"
                  className="feed-card-options-row--delete"
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handleDeleteClick}
                />
              </>
            ) : (
              <>
                <PostOptionsRow
                  icon={<EyeOff />}
                  title="不感兴趣"
                  disabled={reduceRecommendation.isPending || feedbackGuardPending}
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handleFeedbackClick}
                />
                <PostOptionsRow
                  icon={<UserX />}
                  title="不看此人"
                  disabled={!authorId || blockUser.isPending || blockAuthorGuardPending}
                  onPointerDown={handleMenuRowPointerDown}
                  onClick={handleBlockAuthorClick}
                />
              </>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
});

export default PostOptionsMenuPanel;
