import type { CSSProperties, ImgHTMLAttributes, ReactEventHandler } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { UI_DEFAULT_IMAGE_SIZES } from '@/ui/layoutViewport';
import { toOptimizedImageUrl, toPublicStorageObjectUrl, type ImageResizeMode } from '@/utils/image';

type OptimizedImageVariant = 'thumb' | 'medium' | 'large';

type OptimizedImageState = {
  loaded: boolean;
  fallback: boolean;
};

type OptimizedImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'loading' | 'decoding' | 'referrerPolicy' | 'onError' | 'fetchPriority'
> & {
  src: string;
  variant?: OptimizedImageVariant;
  priority?: boolean;
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
  decoding?: ImgHTMLAttributes<HTMLImageElement>['decoding'];
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
  fetchPriority?: 'high' | 'low' | 'auto';
  transformResize?: ImageResizeMode;
  disableOptimization?: boolean;
  onError?: ReactEventHandler<HTMLImageElement>;
  onLoadStateChange?: (state: OptimizedImageState) => void;
};

const FALLBACK_IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const DEFAULT_IMAGE_SIZES: Record<OptimizedImageVariant, string> = UI_DEFAULT_IMAGE_SIZES;

function resolveBestSrc(
  src: string,
  variant: OptimizedImageVariant,
  resize: ImageResizeMode,
  disableOptimization: boolean,
): string {
  if (!src) return FALLBACK_IMG;
  if (!/^https?:\/\//i.test(src)) return src;
  if (disableOptimization) return toPublicStorageObjectUrl(src);

  const optimized = toOptimizedImageUrl(src, variant, { resize });
  if (!optimized || optimized === src) return src;

  return optimized;
}

function resolveSrcSet(
  src: string,
  variant: OptimizedImageVariant,
  resize: ImageResizeMode,
  disableOptimization: boolean,
) {
  if (disableOptimization) return undefined;
  if (!src || !/^https?:\/\//i.test(src)) return undefined;
  const thumb = toOptimizedImageUrl(src, 'thumb', { resize });
  const medium = toOptimizedImageUrl(src, 'medium', { resize });
  const large = toOptimizedImageUrl(src, 'large', { resize });
  if (!thumb || !medium || !large || thumb === src) return undefined;

  if (variant === 'thumb') return `${thumb} 360w, ${medium} 900w`;
  if (variant === 'medium') return `${thumb} 360w, ${medium} 900w, ${large} 1400w`;
  return `${medium} 900w, ${large} 1400w`;
}

function shouldSkipFade(src: string) {
  return !src || src === FALLBACK_IMG || src.startsWith('data:') || src.startsWith('blob:');
}

function shouldPreserveFullImage(className?: string, props?: Record<string, unknown>) {
  return props?.['data-lightbox-image'] === 'true'
    || props?.['data-full-image'] === 'true'
    || Boolean(className?.split(/\s+/).includes('object-contain'));
}

const OptimizedImage = memo(function OptimizedImage({
  src,
  variant = 'medium',
  loading = 'lazy',
  decoding = 'async',
  referrerPolicy = 'strict-origin-when-cross-origin',
  priority = false,
  fetchPriority,
  transformResize = 'cover',
  disableOptimization = false,
  alt = '',
  className,
  style,
  onError,
  onLoad,
  onLoadStateChange,
  sizes,
  draggable = false,
  ...props
}: OptimizedImageProps) {
  const preserveFullImage = shouldPreserveFullImage(className, props as Record<string, unknown>);
  const effectiveDisableOptimization = disableOptimization || preserveFullImage;
  const effectiveResize = preserveFullImage ? 'contain' : transformResize;
  const finalSrc = useMemo(
    () => resolveBestSrc(src, variant, effectiveResize, effectiveDisableOptimization),
    [effectiveDisableOptimization, effectiveResize, src, variant],
  );
  const srcSet = useMemo(
    () => resolveSrcSet(src, variant, effectiveResize, effectiveDisableOptimization),
    [effectiveDisableOptimization, effectiveResize, src, variant],
  );
  const fallbackSrc = useMemo(() => {
    if (!src) return src;
    if (/^https?:\/\//i.test(src) && finalSrc !== src) return src;
    return toPublicStorageObjectUrl(src);
  }, [finalSrc, src]);
  const effectiveLoading = priority ? 'eager' : loading;
  const [effectiveSrc, setEffectiveSrc] = useState(finalSrc);
  const [effectiveSrcKey, setEffectiveSrcKey] = useState(finalSrc);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);
  const [isLoaded, setIsLoaded] = useState(() => shouldSkipFade(finalSrc));
  const imageRef = useRef<HTMLImageElement | null>(null);
  const mountedRef = useRef(true);
  const sourceIsCurrent = effectiveSrcKey === finalSrc;
  const renderSrc = sourceIsCurrent ? effectiveSrc : finalSrc;
  const renderHasTriedFallback = sourceIsCurrent ? hasTriedFallback : false;
  const renderIsLoaded = sourceIsCurrent ? isLoaded : shouldSkipFade(finalSrc);
  const renderIsFallback = renderSrc === FALLBACK_IMG;
  const effectiveStyle = useMemo<CSSProperties | undefined>(() => {
    if (!preserveFullImage) return style;
    return { ...style, objectFit: 'contain' };
  }, [preserveFullImage, style]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!mountedRef.current) return;
    setEffectiveSrc(finalSrc);
    setEffectiveSrcKey(finalSrc);
    setHasTriedFallback(false);
    setIsLoaded(shouldSkipFade(finalSrc));
  }, [finalSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || shouldSkipFade(renderSrc)) {
      return undefined;
    }

    if (image.complete && image.naturalWidth > 0) {
      setIsLoaded(true);
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      if (imageRef.current === image && image.complete && image.naturalWidth > 0) {
        setIsLoaded(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [renderSrc]);

  useEffect(() => {
    onLoadStateChange?.({
      loaded: renderIsLoaded,
      fallback: renderIsFallback,
    });
  }, [onLoadStateChange, renderIsFallback, renderIsLoaded]);

  return (
    <img
      ref={imageRef}
      src={renderSrc}
      srcSet={renderSrc === finalSrc ? srcSet : undefined}
      sizes={sizes || DEFAULT_IMAGE_SIZES[variant]}
      alt={alt}
      loading={effectiveLoading}
      decoding={decoding}
      fetchPriority={priority ? 'high' : fetchPriority}
      referrerPolicy={referrerPolicy}
      style={effectiveStyle}
      className={`optimized-image ${renderIsLoaded ? 'is-loaded' : ''}${renderIsFallback ? ' is-fallback' : ''}${className ? ` ${className}` : ''}`}
      draggable={draggable}
      onLoad={(e) => {
        if (mountedRef.current) {
          setEffectiveSrcKey(finalSrc);
          setIsLoaded(true);
        }
        onLoad?.(e);
      }}
      onError={(e) => {
        if (!renderHasTriedFallback && renderSrc !== fallbackSrc) {
          if (mountedRef.current) {
            setEffectiveSrcKey(finalSrc);
            setHasTriedFallback(true);
            setIsLoaded(shouldSkipFade(fallbackSrc));
            setEffectiveSrc(fallbackSrc);
          }
          return;
        }

        onError?.(e);

        if (mountedRef.current && renderSrc !== FALLBACK_IMG) {
          setEffectiveSrcKey(finalSrc);
          setHasTriedFallback(true);
          setIsLoaded(true);
          setEffectiveSrc(FALLBACK_IMG);
        }
      }}
      {...props}
    />
  );
});

export default OptimizedImage;
