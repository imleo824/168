import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import ActionButton from '@/ui/ActionButton';
import ProfileDialog from '@/features/profile/ProfileDialog';

const COMMENT_MAX_LENGTH = 300;
const COMMENT_COMPOSER_FOCUS_MAX_ATTEMPTS = 8;

interface PostCommentComposerDialogProps {
  open: boolean;
  isSubmitting?: boolean;
  error?: string;
  onSubmit: (content: string) => void;
  onClose: () => void;
}

function normalizeDraft(value: string) {
  return value.replace(/\r\n/g, '\n');
}

function focusCommentComposer(textarea: HTMLTextAreaElement | null) {
  if (!textarea || textarea.disabled || typeof document === 'undefined') return false;
  textarea.focus({ preventScroll: true });
  try {
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
  } catch {
    // Some mobile engines can reject selection while the dialog is mounting.
  }
  return document.activeElement === textarea;
}

const PostCommentComposerDialog = memo(function PostCommentComposerDialog({
  open,
  isSubmitting = false,
  error = '',
  onSubmit,
  onClose,
}: PostCommentComposerDialogProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const normalizedDraft = normalizeDraft(draft);
  const trimmedDraft = normalizedDraft.trim();
  const remaining = COMMENT_MAX_LENGTH - normalizedDraft.length;
  const isOverLimit = remaining < 0;
  const canSubmit = Boolean(trimmedDraft) && !isOverLimit && !isSubmitting;

  const setTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (!open || isSubmitting) return;
    focusCommentComposer(node);
  }, [isSubmitting, open]);

  useEffect(() => {
    if (!open) return;
    setDraft('');
  }, [open]);

  useLayoutEffect(() => {
    if (!open || isSubmitting || typeof window === 'undefined') return undefined;

    let attempts = 0;
    let frame = 0;

    const run = () => {
      attempts += 1;
      if (focusCommentComposer(textareaRef.current)) return;
      if (attempts >= COMMENT_COMPOSER_FOCUS_MAX_ATTEMPTS) return;
      frame = window.requestAnimationFrame(run);
    };

    run();

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isSubmitting, open]);

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(trimmedDraft);
  }, [canSubmit, onSubmit, trimmedDraft]);

  const errorText = useMemo(() => {
    if (error) return error;
    if (isOverLimit) return `已超过 ${Math.abs(remaining)} 字`;
    return '';
  }, [error, isOverLimit, remaining]);

  return (
    <ProfileDialog
      open={open}
      title="发表评论"
      onClose={handleClose}
    >
      <textarea
        ref={setTextareaRef}
        id="post-comment-composer"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="profile-bio-editor"
        placeholder="分享你的观点和看法..."
        maxLength={COMMENT_MAX_LENGTH + 20}
        disabled={isSubmitting}
        aria-label="评论内容输入框"
        autoFocus
      />
      {errorText ? (
        <p className="profile-dialog-field-error" data-state="error">
          {errorText}
        </p>
      ) : null}
      <div className="profile-dialog-actions">
        <ActionButton
          type="button"
          variant="muted"
          disabled={isSubmitting}
          onClick={handleClose}
        >
          取消
        </ActionButton>
        <ActionButton
          type="button"
          variant={!isSubmitting ? 'brand' : 'disabled'}
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
          onClick={handleSubmit}
          className="ui-dialog-action-min"
        >
          {isSubmitting ? '发布中...' : '发表评论'}
        </ActionButton>
      </div>
    </ProfileDialog>
  );
});

export default PostCommentComposerDialog;
