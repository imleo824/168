import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import '@/styles/components/profile-dialog.css';
import { X } from 'lucide-react';
import IconButton from '@/ui/IconButton';
import { releaseActiveTextEntry } from '@/utils/textEntryFocus';
import { useScrollLock } from '@/utils/scrollLock';
import { useFocusScrollStabilizer } from '@/hooks/useFocusScrollStabilizer';

const PROFILE_DIALOG_ROOT_ID = 'profile-dialog-root';

type ProfileDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  scrollable?: boolean;
};

function getProfileDialogRoot() {
  if (typeof document === 'undefined') return null;

  let root = document.getElementById(PROFILE_DIALOG_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = PROFILE_DIALOG_ROOT_ID;
    document.body.appendChild(root);
  }

  return root;
}

export default function ProfileDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className = '',
  scrollable = false,
}: ProfileDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const {
    rootRef: focusRootRef,
    onFocusCapture,
    onBlurCapture,
  } = useFocusScrollStabilizer('profile-dialog-keyboard-active');

  const setPanelRefs = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    focusRootRef.current = node;
  }, [focusRootRef]);

  const closeDialog = useCallback(() => {
    releaseActiveTextEntry(panelRef.current);
    onClose();
  }, [onClose]);

  const handleOverlayPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const handleScrimClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    closeDialog();
  }, [closeDialog]);

  useScrollLock(open, {
    fixed: true,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-profile-dialog-scroll]')),
  });

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDialog();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      releaseActiveTextEntry(panelRef.current);
    };
  }, [closeDialog, open]);

  if (!open) return null;

  const hasBody = children !== null && children !== undefined;
  const hasDescription = Boolean(description);

  const dialog = (
    <div
      className={[
        'ui-dialog-overlay profile-dialog-overlay',
        scrollable ? 'is-scrollable' : 'is-centered',
      ].join(' ')}
      data-profile-dialog-overlay
      onPointerDown={handleOverlayPointerDown}
    >
      <button
        type="button"
        onClick={handleScrimClick}
        className="profile-dialog-scrim"
        aria-label={`关闭${title}`}
      />
      <div
        ref={setPanelRefs}
        data-scroll-lock-allow
        data-profile-dialog-scroll
        className={['ui-layer-panel profile-dialog-panel', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="ui-layer-panel-header profile-dialog-header">
          <div className="profile-dialog-heading">
            <h3 id={titleId} className="ui-layer-panel-title profile-dialog-title">{title}</h3>
            {description ? <p id={descriptionId} className="profile-dialog-description">{description}</p> : null}
          </div>
          <IconButton
            onClick={closeDialog}
            context="sheet"
            tone="quiet"
            className="ui-layer-close-action profile-dialog-close"
            aria-label={`关闭${title}`}
          >
            <X aria-hidden="true" />
          </IconButton>
        </div>
        {hasBody ? <div className="profile-dialog-body">{children}</div> : null}
        {footer ? <div className="profile-dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );

  const root = getProfileDialogRoot();
  return root ? createPortal(dialog, root) : dialog;
}
