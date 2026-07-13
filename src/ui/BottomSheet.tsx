import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useScrollLock } from '@/utils/scrollLock';
import IconButton from '@/ui/IconButton';
import { cn } from '@/utils/cn';
import { releaseActiveTextEntry } from '@/utils/textEntryFocus';

interface BottomSheetProps {
  open: boolean;
  title: string;
  ariaLabel?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  overlayClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  bodyClassName?: string;
  closeClassName?: string;
  showHandle?: boolean;
  lockScrollFixed?: boolean;
}

export default function BottomSheet({
  open,
  title,
  ariaLabel,
  onClose,
  children,
  footer,
  overlayClassName = '',
  panelClassName = 'ui-sheet-panel',
  headerClassName = '',
  titleClassName = 'ui-sheet-title ui-sheet-title--truncate',
  bodyClassName = '',
  closeClassName = '',
  showHandle = false,
  lockScrollFixed = true,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  const closeSheet = useCallback(() => {
    releaseActiveTextEntry(panelRef.current);
    onClose();
  }, [onClose]);

  const handleOverlayPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.stopPropagation();
  }, []);

  const closeFromOverlay = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    closeSheet();
  }, [closeSheet]);

  const stopPanelEvent = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  useScrollLock(open, {
    fixed: lockScrollFixed,
    allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-bottom-sheet-scroll]')),
  });

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      releaseActiveTextEntry(panelRef.current);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSheet, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn('ui-sheet-overlay', overlayClassName)}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
      onPointerDown={handleOverlayPointerDown}
      onClick={closeFromOverlay}
    >
      <section
        ref={panelRef}
        className={panelClassName}
        onPointerDown={stopPanelEvent}
        onClick={stopPanelEvent}
      >
        {showHandle ? <div className="ui-sheet-handle" /> : null}
        <div className={cn('ui-sheet-header', headerClassName || 'ui-sheet-default-header')}>
          <div className="ui-sheet-header-row">
            <div className="ui-sheet-title-wrap">
              <h2 className={titleClassName}>{title}</h2>
            </div>
            <IconButton
              variant="action"
              size="lg"
              onClick={closeSheet}
              aria-label={`关闭${title}`}
              className={cn('ui-sheet-close-action', closeClassName)}
              context="sheet"
              tone="quiet"
              shape="circle"
            >
              <X aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        <div data-bottom-sheet-scroll className={bodyClassName}>
          {children}
        </div>

        {footer}
      </section>
    </div>,
    document.body,
  );
}
