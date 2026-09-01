import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
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

  const [isZoomed, setIsZoomed] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<PointerState | null>(null);
  const suppressCloseRef = React.useRef(false);
  const rafRef = React.useRef<number | null>(null);
  const canDragNavigate = !isZoomed && (canGoPrev || canGoNext);

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
    setIsZoomed(false);
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

  const toggleZoom = React.useCallback(() => {
    setIsZoomed((current) => !current);
  }, []);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const focusable = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.getClientRects().length > 0 || element === document.activeElement);

        if (!focusable.length) {
          event.preventDefault();
          rootRef.current?.focus({ preventScroll: true });
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
          return;
        }

        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
          return;
        }
      }

      if (event.key === 'ArrowLeft' && canGoPrev) {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        onNext();
        return;
      }
      if ((event.key === '+' || event.key === '=') && !isZoomed) {
        event.preventDefault();
        setIsZoomed(true);
        return;
      }
      if ((event.key === '-' || event.key === '0') && isZoomed) {
        event.preventDefault();
        setIsZoomed(false);
      }
    },
    [canGoNext, canGoPrev, isZoomed, onClose, onNext, onPrev],
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
      if (!canDragNavigate) return;
      beginDrag(event.clientX, event.clientY, event.pointerId);
      try {
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      } catch {
        // Some browsers reject pointer capture when a touch is already ending.
      }
    },
    [beginDrag, canDragNavigate],
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
      if (event.target !== event.currentTarget) return;

      if (suppressCloseRef.current) {
        suppressCloseRef.current = false;
        return;
      }

      onClose();
    },
    [onClose],
  );

  const lightboxTrackStyle = React.useMemo(() => ({
    '--lightbox-track-offset': `calc(${imageIndex * -100}% + ${dragOffset}px)`,
    '--lightbox-zoom-scale': isZoomed ? 'var(--ui-lightbox-zoom-scale)' : 'var(--ui-opacity-visible)',
  }) as React.CSSProperties, [dragOffset, imageIndex, isZoomed]);

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
      <div className="ui-lightbox-toolbar">
        <IconButton
          onClick={(event) => {
            event.stopPropagation();
            toggleZoom();
          }}
          variant="action"
          context="lightbox"
          tone="inverse"
          shape="circle"
          size="lg"
          className="ui-lightbox-control ui-lightbox-control-zoom"
          aria-label={isZoomed ? '还原图片' : '放大图片'}
          title={isZoomed ? '还原图片' : '放大图片'}
        >
          {isZoomed ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}
        </IconButton>

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
          title="关闭预览"
        >
          <X aria-hidden="true" />
        </IconButton>
      </div>

      {hasMulti ? (
        <IconButton
          onClick={(event) => {
            event.stopPropagation();
            onPrev();
          }}
          variant="action"
          context="lightbox"
          tone="inverse"
          shape="circle"
          size="lg"
          className="ui-lightbox-control ui-lightbox-nav ui-lightbox-nav--prev"
          aria-label="上一张图片"
          title="上一张图片"
          disabled={!canGoPrev}
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>
      ) : null}

      {hasMulti ? (
        <IconButton
          onClick={(event) => {
            event.stopPropagation();
            onNext();
          }}
          variant="action"
          context="lightbox"
          tone="inverse"
          shape="circle"
          size="lg"
          className="ui-lightbox-control ui-lightbox-nav ui-lightbox-nav--next"
          aria-label="下一张图片"
          title="下一张图片"
          disabled={!canGoNext}
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
      ) : null}

      <div
        className="lightbox-viewport"
        role={hasMulti ? 'region' : undefined}
        aria-roledescription={hasMulti ? 'carousel' : undefined}
        aria-label={hasMulti ? `图片轮播，共 ${total} 张` : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={finalizePointer}
        onClick={handleViewportClick}
      >
        <div
          className="lightbox-track"
          data-dragging={isDragging ? 'true' : 'false'}
          data-zoomed={isZoomed ? 'true' : 'false'}
          style={lightboxTrackStyle}
        >
          {normalizedImages.map((image, slideIndex) => {
            const isActive = slideIndex === imageIndex;
            const isAdjacent = Math.abs(slideIndex - imageIndex) <= 1;

            return (
              <div
                key={`${image}-${slideIndex}`}
                className="lightbox-slide"
                data-active={isActive ? 'true' : 'false'}
                data-zoomed={isActive && isZoomed ? 'true' : 'false'}
                role="group"
                aria-roledescription="slide"
                aria-label={`${slideIndex + 1} / ${total}`}
                aria-hidden={!isActive}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (isActive) toggleZoom();
                }}
              >
                <OptimizedImage
                  data-lightbox-image="true"
                  src={image}
                  alt={`图片预览 ${slideIndex + 1}`}
                  className="lightbox-image"
                  variant="large"
                  priority={isActive}
                  loading={isAdjacent ? 'eager' : 'lazy'}
                  fetchPriority={isActive ? 'high' : isAdjacent ? 'low' : 'auto'}
                  decoding="async"
                  sizes="100vw"
                  referrerPolicy="strict-origin-when-cross-origin"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                />
              </div>
            );
          })}
        </div>
      </div>

      {hasMulti ? (
        <div className="ui-lightbox-picker" aria-label="选择图片">
          {normalizedImages.map((image, slideIndex) => (
            <button
              key={`${image}-picker-${slideIndex}`}
              type="button"
              className="ui-lightbox-dot"
              aria-label={`查看第 ${slideIndex + 1} 张图片`}
              aria-current={slideIndex === imageIndex ? 'true' : undefined}
              onClick={(event) => {
                event.stopPropagation();
                goTo(slideIndex);
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="ui-lightbox-counter" aria-live="polite">
        {total > 0 ? `${imageIndex + 1} / ${total}` : '0 / 0'}
      </div>
    </div>,
    overlayRoot,
  );
}
