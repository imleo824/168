import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import OptimizedImage from './OptimizedImage';
import { useScrollLock } from '@/utils/scrollLock';
import { clampMediaIndex, normalizeImageList } from '@/utils/media';
import IconButton from '@/ui/IconButton';
import { toOptimizedImageUrl } from '@/utils/image';

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  isTracking: boolean;
  hasMoved: boolean;
};

interface ImageLightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onChange: (next: number) => void;
  closeOnRouteChange?: boolean;
}

const MIN_SWIPE_DISTANCE = 44;
const SWIPE_RATIO = 1.1;
const INTERACTION_THRESHOLD = 8;

export default function ImageLightbox({
  images,
  index,
  onClose,
  onChange,
  closeOnRouteChange = true,
}: ImageLightboxProps) {
  const normalizedImages = React.useMemo(() => normalizeImageList(images), [images]);
  const total = normalizedImages.length;
  const normalizedIndex = React.useMemo(() => {
    if (!normalizedImages.length) return -1;
    if (!Number.isFinite(index)) return -1;
    return Math.trunc(index);
  }, [index, normalizedImages.length]);
  const imageIndex = React.useMemo(() => clampMediaIndex(normalizedIndex, total), [normalizedIndex, total]);
  const hasActiveImage = imageIndex >= 0;
  const activeImage = hasActiveImage ? normalizedImages[imageIndex] : '';
  const hasMulti = total > 1;
  const canGoPrev = hasMulti && imageIndex > 0;
  const canGoNext = hasMulti && imageIndex >= 0 && imageIndex < total - 1;
  const canDragNavigate = canGoPrev || canGoNext;

  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<PointerState | null>(null);
  const suppressCloseRef = React.useRef(false);
  const rafRef = React.useRef<number | null>(null);

  useScrollLock(hasActiveImage, { fixed: false });

  React.useEffect(() => {
    if (!hasActiveImage) return;
    rootRef.current?.focus({ preventScroll: true });
  }, [hasActiveImage]);

  React.useEffect(() => {
    if (!hasActiveImage || !closeOnRouteChange || typeof window === 'undefined') return undefined;

    const initialHref = window.location.href;
    let didClose = false;
    const closeIfRouteChanged = () => {
      if (didClose || window.location.href === initialHref) return;
      didClose = true;
      onClose();
    };

    // React Router pushState does not emit popstate; this interval only runs
    // while the image preview is open so background-feed previews cannot leak
    // over route overlays.
    const routeWatchTimer = window.setInterval(closeIfRouteChanged, 120);
    window.addEventListener('popstate', closeIfRouteChanged);
    window.addEventListener('hashchange', closeIfRouteChanged);

    return () => {
      window.clearInterval(routeWatchTimer);
      window.removeEventListener('popstate', closeIfRouteChanged);
      window.removeEventListener('hashchange', closeIfRouteChanged);
    };
  }, [closeOnRouteChange, hasActiveImage, onClose]);

  React.useEffect(() => {
    setIsDragging(false);
    setDragOffset(0);
    dragStateRef.current = null;
    suppressCloseRef.current = false;
  }, [imageIndex]);

  React.useEffect(() => {
    if (!hasActiveImage || typeof Image === 'undefined') return;

    const preloadIndexes = [imageIndex - 1, imageIndex + 1].filter(
      (nextIndex) => nextIndex >= 0 && nextIndex < total,
    );

    preloadIndexes.forEach((nextIndex) => {
      const nextSrc = normalizedImages[nextIndex];
      if (!nextSrc) return;
      const image = new Image();
      image.decoding = 'async';
      (image as any).fetchPriority = 'low';
      image.src = toOptimizedImageUrl(nextSrc, 'large') || nextSrc;
    });
  }, [hasActiveImage, imageIndex, normalizedImages, total]);

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const overlayRoot =
    typeof document !== 'undefined'
      ? document.getElementById('overlay-root') || document.body
      : null;

  const requestDragOffset = React.useCallback((nextOffset: number) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      setDragOffset(nextOffset);
      rafRef.current = null;
    });
  }, []);

  const goTo = React.useCallback(
    (nextIndex: number) => {
      const next = Number.isFinite(nextIndex) ? Math.trunc(nextIndex) : -1;
      if (next < 0 || next >= total) return;
      if (next === imageIndex) return;
      onChange(next);
    },
    [imageIndex, onChange, total],
  );

  const onPrev = React.useCallback(() => {
    if (!canGoPrev) return;
    goTo(imageIndex - 1);
  }, [canGoPrev, goTo, imageIndex]);

  const onNext = React.useCallback(() => {
    if (!canGoNext) return;
    goTo(imageIndex + 1);
  }, [canGoNext, goTo, imageIndex]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft' && canGoPrev) {
        event.preventDefault();
        onPrev();
      }
      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        onNext();
      }
    },
    [canGoNext, canGoPrev, onClose, onNext, onPrev],
  );

  const beginDrag = React.useCallback(
    (x: number, y: number, pointerId: number) => {
      if (!canDragNavigate) return;

      dragStateRef.current = {
        pointerId,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        isTracking: true,
        hasMoved: false,
      };
      suppressCloseRef.current = false;
      setIsDragging(true);
      setDragOffset(0);
    },
    [canDragNavigate],
  );

  const updateDrag = React.useCallback(
    (x: number, y: number, pointerId: number, event?: { preventDefault?: () => void; cancelable?: boolean }) => {
      const state = dragStateRef.current;
      if (!state || !state.isTracking || state.pointerId !== pointerId) return;

      const dx = x - state.startX;
      const dy = Math.abs(y - state.startY);
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      state.lastX = x;
      state.lastY = y;

      if (!state.hasMoved && absDx > INTERACTION_THRESHOLD && absDx > absDy * SWIPE_RATIO) {
        state.hasMoved = true;
      }

      if (!state.hasMoved) return;

      if (event?.cancelable) {
        event.preventDefault?.();
      }

      const edgeResistance = (dx > 0 && !canGoPrev) || (dx < 0 && !canGoNext);
      requestDragOffset(edgeResistance ? dx * 0.28 : dx);
    },
    [canGoNext, canGoPrev, requestDragOffset],
  );

  const finalizePointer = React.useCallback(() => {
    const state = dragStateRef.current;
    if (!state || !state.isTracking) return;

    const dx = state.lastX - state.startX;
    const dy = Math.abs(state.lastY - state.startY);

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    state.isTracking = false;
    dragStateRef.current = null;
    setIsDragging(false);
    setDragOffset(0);

    if (!state.hasMoved || !canDragNavigate) return;

    suppressCloseRef.current = true;
    if (Math.abs(dx) < MIN_SWIPE_DISTANCE || Math.abs(dx) <= dy) return;

    if (dx < 0 && canGoNext) {
      onNext();
      return;
    }

    if (dx > 0 && canGoPrev) {
      onPrev();
    }
  }, [canDragNavigate, canGoNext, canGoPrev, onNext, onPrev]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      if (!event.isPrimary) return;
      beginDrag(event.clientX, event.clientY, event.pointerId);
      try {
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      } catch {
        // Some browsers reject pointer capture when a touch is already ending.
      }
    },
    [beginDrag],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent) => {
      updateDrag(event.clientX, event.clientY, event.pointerId, event);
    },
    [updateDrag],
  );

  const handlePointerUp = React.useCallback(
    (event: React.PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;

      try {
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already be released after a quick gesture.
      }
      finalizePointer();
    },
    [finalizePointer],
  );

  const handlePointerCancel = React.useCallback(() => {
    finalizePointer();
  }, [finalizePointer]);

  const handleViewportClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();

      if (suppressCloseRef.current) {
        suppressCloseRef.current = false;
        return;
      }

      onClose();
    },
    [onClose],
  );

  if (!overlayRoot || !hasActiveImage || !activeImage) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="ui-lightbox"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
    >
      <IconButton
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        variant="action"
        context="lightbox"
        tone="inverse"
        shape="circle"
        size="lg"
        className="ui-lightbox-control ui-lightbox-control-close"
        aria-label="关闭预览"
      >
        <X aria-hidden="true" />
      </IconButton>

      <div
        className="lightbox-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={finalizePointer}
        onClick={handleViewportClick}
      >
        <div
          className="lightbox-slide"
          data-dragging={isDragging ? 'true' : 'false'}
          style={{
            '--lightbox-drag-offset': `${dragOffset}px`,
          } as React.CSSProperties}
        >
          <OptimizedImage
            key={activeImage}
            data-lightbox-image="true"
            src={activeImage}
            alt={`preview-${imageIndex + 1}`}
            className="lightbox-image"
            variant="large"
            priority
            decoding="async"
            sizes="100vw"
            referrerPolicy="strict-origin-when-cross-origin"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
          />
        </div>
      </div>

      <div className="ui-lightbox-counter">
        {total > 0 ? `${imageIndex + 1} / ${total}` : '0 / 0'}
      </div>
    </div>,
    overlayRoot,
  );
}
