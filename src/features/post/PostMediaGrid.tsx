import React from 'react';
import OptimizedImage from '@/ui/OptimizedImage';
import { clampMediaIndex, dedupeUnique, normalizeImageList } from '@/utils/media';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';

interface PostMediaGridProps {
  images: string[];
  onOpen: (index: number) => void;
  priority?: boolean;
  stableAspectRatio?: boolean;
}

type ImageVariant = 'large' | 'medium' | 'thumb';
type MediaImageState = 'loading' | 'loaded' | 'error';

const MAX_VISIBLE_IMAGES = 9;
const INTERACTION_GUARD_MS = 170;
const CAROUSEL_DRAG_THRESHOLD = 12;
const MIN_CAROUSEL_ASPECT_RATIO = 3 / 4;
const MAX_CAROUSEL_ASPECT_RATIO = 4 / 3;
const DEFAULT_CAROUSEL_ASPECT_RATIO = '16 / 9';

const MEDIA_RADIUS = 'ui-media-grid';
const MEDIA_IMAGE_CLASS = 'ui-media-image';
const MEDIA_SHELL_CLASS = `${MEDIA_RADIUS} ui-media-frame media-grid-shell`;
const MEDIA_CAROUSEL_CLASS = `${MEDIA_SHELL_CLASS} media-carousel-shell ui-media-grid-full`;
const MEDIA_TRACK_CLASS = 'media-carousel-track scrollbar-hide';
const MEDIA_TILE_BASE_CLASS = 'ui-media-grid-item media-carousel-slide';
const MEDIA_PLACEHOLDER_TEXT = '圈内事 发推推';
const MEDIA_IMAGE_VARIANT: ImageVariant = 'large';

const IMAGE_COMMON_PROPS = {
  decoding: 'async' as const,
  referrerPolicy: 'strict-origin-when-cross-origin' as const,
};

function getVisibleMedia(images: string[]) {
  const visibleImages = images.slice(0, MAX_VISIBLE_IMAGES);
  const hiddenCount = Math.max(0, images.length - visibleImages.length);

  return {
    visibleImages,
    hiddenCount,
  };
}

function getShellClass(total: number) {
  if (total === 1) {
    return `${MEDIA_CAROUSEL_CLASS} media-carousel-shell-single`;
  }

  return `${MEDIA_CAROUSEL_CLASS} media-carousel-shell-multi`;
}

function getTileClass(total: number) {
  if (total === 1) {
    return `${MEDIA_TILE_BASE_CLASS} media-carousel-slide-single`;
  }

  return MEDIA_TILE_BASE_CLASS;
}

function getImageVariant(): ImageVariant {
  return MEDIA_IMAGE_VARIANT;
}

function getMediaButtonLabel(index: number, total: number, hiddenCount = 0) {
  const baseLabel = total > 1
    ? `查看图片 ${index + 1} / ${total}`
    : '查看图片';

  return hiddenCount > 0
    ? `${baseLabel}，另有 ${hiddenCount} 张图片`
    : baseLabel;
}

function getOverlayIndex(visibleCount: number, hiddenCount: number) {
  return hiddenCount > 0 ? visibleCount - 1 : -1;
}

function formatCarouselAspectRatio(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_CAROUSEL_ASPECT_RATIO;
  }

  const naturalRatio = width / height;
  const clampedRatio = Math.min(
    MAX_CAROUSEL_ASPECT_RATIO,
    Math.max(MIN_CAROUSEL_ASPECT_RATIO, naturalRatio),
  );
  const normalizedRatio = Math.round(clampedRatio * 1000);

  return `${normalizedRatio} / 1000`;
}

function areStringArraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

interface MediaTileProps {
  image: string;
  index: number;
  total: number;
  hiddenCount: number;
  priority: boolean;
  active: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onFirstImageRatioChange?: (ratio: string) => void;
}

const MediaTile = React.memo(function MediaTile({
  image,
  index,
  total,
  hiddenCount,
  priority,
  active,
  onClick,
  onFirstImageRatioChange,
}: MediaTileProps) {
  const isPriorityImage = priority && index === 0;
  const variant = getImageVariant();
  const [imageState, setImageState] = React.useState<MediaImageState>('loading');
  const imageFallbackRef = React.useRef(false);

  React.useEffect(() => {
    imageFallbackRef.current = false;
    setImageState('loading');
  }, [image]);

  const handleLoadStateChange = React.useCallback((state: { loaded: boolean; fallback: boolean }) => {
    if (!state.loaded) return;
    imageFallbackRef.current = state.fallback;
    setImageState(state.fallback ? 'error' : 'loaded');
  }, []);

  return (
    <button
      type="button"
      data-index={index}
      data-carousel-slide="true"
      data-carousel-active={active ? 'true' : undefined}
      data-media-count={total === 1 ? '1' : 'n'}
      data-media-fit="cover"
      data-media-mode="feed"
      data-media-priority={isPriorityImage ? 'true' : undefined}
      data-media-state={imageState}
      aria-current={active ? 'true' : undefined}
      aria-label={getMediaButtonLabel(index, total, hiddenCount)}
      className={getTileClass(total)}
      onClick={onClick}
    >
      {imageState !== 'loaded' ? (
        <span className="media-grid-loading-copy" aria-hidden="true">
          <span className="media-grid-loading-text">{MEDIA_PLACEHOLDER_TEXT}</span>
        </span>
      ) : null}

      <OptimizedImage
        src={image}
        className={MEDIA_IMAGE_CLASS}
        alt={total > 1 ? `post image ${index + 1}` : 'post image'}
        loading={isPriorityImage ? 'eager' : 'lazy'}
        priority={isPriorityImage}
        fetchPriority={isPriorityImage ? 'high' : 'auto'}
        variant={variant}
        onLoadStateChange={handleLoadStateChange}
        onLoad={(event) => {
          const imageElement = event.currentTarget;
          const isFallback = imageFallbackRef.current
            || imageElement.currentSrc.startsWith('data:image/gif;base64,');
          setImageState(isFallback ? 'error' : 'loaded');

          if (!isFallback && index === 0) {
            onFirstImageRatioChange?.(formatCarouselAspectRatio(
              imageElement.naturalWidth,
              imageElement.naturalHeight,
            ));
          }
        }}
        onError={() => setImageState('error')}
        {...IMAGE_COMMON_PROPS}
      />

      {hiddenCount > 0 ? (
        <span
          className="media-grid-more-overlay"
          aria-hidden="true"
        >
          <span className="media-grid-more-badge">
            +{hiddenCount}
          </span>
        </span>
      ) : null}
    </button>
  );
});

function PostMediaGrid({ images, onOpen, priority = false, stableAspectRatio = true }: PostMediaGridProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = React.useRef<number | null>(null);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = React.useRef(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [carouselRatio, setCarouselRatio] = React.useState(DEFAULT_CAROUSEL_ASPECT_RATIO);

  const normalizedImages = React.useMemo(() => {
    const safeImages = Array.isArray(images) ? images : [];
    return dedupeUnique(normalizeImageList(safeImages));
  }, [images]);

  const total = normalizedImages.length;

  const { visibleImages, hiddenCount } = React.useMemo(
    () => getVisibleMedia(normalizedImages),
    [normalizedImages],
  );

  const overlayIndex = getOverlayIndex(visibleImages.length, hiddenCount);
  const renderedTileCount = visibleImages.length;

  React.useEffect(() => {
    setActiveIndex(0);
    setCarouselRatio(DEFAULT_CAROUSEL_ASPECT_RATIO);
    suppressClickRef.current = false;
    pointerStartRef.current = null;

    trackRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [visibleImages]);

  React.useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const updateActiveSlide = React.useCallback((track: HTMLDivElement) => {
    const slides = Array.from(track.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );

    if (!slides.length) return;

    const trackCenter = track.scrollLeft + track.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - trackCenter);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    setActiveIndex((currentIndex) => (
      currentIndex === nearestIndex ? currentIndex : nearestIndex
    ));
  }, []);

  const scheduleActiveSlideUpdate = React.useCallback((track: HTMLDivElement) => {
    if (typeof window === 'undefined') {
      updateActiveSlide(track);
      return;
    }

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      updateActiveSlide(track);
      scrollFrameRef.current = null;
    });
  }, [updateActiveSlide]);

  const handleTrackScroll = React.useCallback<React.UIEventHandler<HTMLDivElement>>(
    (event) => {
      scheduleActiveSlideUpdate(event.currentTarget);
    },
    [scheduleActiveSlideUpdate],
  );

  const handleTrackPointerDown = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      suppressClickRef.current = false;
    },
    [],
  );

  const handleTrackPointerMove = React.useCallback<React.PointerEventHandler<HTMLDivElement>>(
    (event) => {
      const pointerStart = pointerStartRef.current;
      if (!pointerStart) return;

      const deltaX = Math.abs(event.clientX - pointerStart.x);
      const deltaY = Math.abs(event.clientY - pointerStart.y);

      if (deltaX > CAROUSEL_DRAG_THRESHOLD && deltaX > deltaY) {
        suppressClickRef.current = true;
      }
    },
    [],
  );

  const handleTrackPointerEnd = React.useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  const handleFirstImageRatioChange = React.useCallback((nextRatio: string) => {
    if (stableAspectRatio) return;
    setCarouselRatio((currentRatio) => (
      currentRatio === nextRatio ? currentRatio : nextRatio
    ));
  }, [stableAspectRatio]);

  const carouselStyle = React.useMemo(() => ({
    '--ui-media-carousel-dynamic-ratio': carouselRatio,
  }) as React.CSSProperties, [carouselRatio]);

  const handleOpen = React.useCallback(
    (index: number) => {
      if (!Number.isFinite(index) || total <= 0) {
        onOpen(-1);
        return;
      }

      const normalizedIndex = Math.trunc(index);

      if (!Number.isFinite(normalizedIndex)) {
        onOpen(-1);
        return;
      }

      onOpen(clampMediaIndex(normalizedIndex, total));
    },
    [onOpen, total],
  );

  const { guarded: guardedOpen } = useInteractionGuard(
    handleOpen,
    INTERACTION_GUARD_MS,
  );

  const handleTileClick = React.useCallback<React.MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      event.stopPropagation();
      event.preventDefault();

      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }

      const rawIndex = event.currentTarget.dataset.index;
      const index = Number.parseInt(rawIndex ?? '', 10);

      guardedOpen(Number.isFinite(index) ? index : -1);
    },
    [guardedOpen],
  );

  if (!total) return null;

  return (
    <div
      className={getShellClass(renderedTileCount)}
      style={carouselStyle}
      data-media-layout="carousel"
      data-media-count={renderedTileCount}
      data-media-total={total}
      role={renderedTileCount > 1 ? 'region' : undefined}
      aria-roledescription={renderedTileCount > 1 ? 'carousel' : undefined}
      aria-label={renderedTileCount > 1 ? `图片轮播，共 ${total} 张` : undefined}
    >
      <div
        ref={trackRef}
        className={MEDIA_TRACK_CLASS}
        onScroll={handleTrackScroll}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerEnd}
        onPointerCancel={handleTrackPointerEnd}
      >
        {visibleImages.map((image, index) => (
          <MediaTile
            key={`${image}-${index}`}
            image={image}
            index={index}
            total={total}
            hiddenCount={index === overlayIndex ? hiddenCount : 0}
            priority={priority}
            active={index === activeIndex}
            onClick={handleTileClick}
            onFirstImageRatioChange={!stableAspectRatio && index === 0 ? handleFirstImageRatioChange : undefined}
          />
        ))}
      </div>

      {renderedTileCount > 1 ? (
        <span className="media-carousel-count" aria-hidden="true">
          <span>{Math.min(activeIndex + 1, total)}</span>
          <span className="media-carousel-count-separator">/</span>
          <span>{total}</span>
        </span>
      ) : null}
    </div>
  );
}

function arePostMediaGridPropsEqual(
  prev: PostMediaGridProps,
  next: PostMediaGridProps,
) {
  return prev.priority === next.priority
    && prev.stableAspectRatio === next.stableAspectRatio
    && prev.onOpen === next.onOpen
    && areStringArraysEqual(prev.images, next.images);
}

export default React.memo(PostMediaGrid, arePostMediaGridPropsEqual);
