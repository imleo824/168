import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OptimizedImage from '@/ui/OptimizedImage';
import type { PromotionBooking } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import { UI_HOME_AD_IMAGE_SIZES } from '@/ui/layoutViewport';
import { normalizeAdTargetUrlForDisplay } from '@/utils/adTargetUrl';

const AUTO_ROTATE_MS = 4600;
const INTERACTION_PAUSE_MS = 5200;

export default function HomeAdBanner({
  ads,
  compact = false,
  ariaLabel = '首页横幅广告',
}: {
  ads?: PromotionBooking[];
  compact?: boolean;
  ariaLabel?: string;
}) {
  const isMobile = useIsMobile();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const resetRafRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const isPageVisible = usePageVisibility();

  const visibleAds = useMemo(
    () =>
      [...(ads || [])]
        .filter((ad) => ad.adImageUrl || ad.adMobileImageUrl)
        .sort((a, b) => {
          const slotDiff = (a.slotIndex ?? 0) - (b.slotIndex ?? 0);
          if (slotDiff !== 0) return slotDiff;
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        })
        .slice(0, 3),
    [ads],
  );

  const hasMultipleAds = visibleAds.length > 1;

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const pauseAutoRotate = useCallback(() => {
    if (!hasMultipleAds) return;
    setIsAutoPaused(true);
    clearPauseTimer();
    pauseTimerRef.current = window.setTimeout(() => {
      setIsAutoPaused(false);
      pauseTimerRef.current = null;
    }, INTERACTION_PAUSE_MS);
  }, [clearPauseTimer, hasMultipleAds]);

  const scrollToIndex = useCallback(
    (targetIndex: number, behavior: ScrollBehavior = 'smooth') => {
      const scroller = scrollerRef.current;
      if (!scroller || visibleAds.length === 0) return;

      const safeIndex = ((targetIndex % visibleAds.length) + visibleAds.length) % visibleAds.length;
      const slide = scroller.children.item(safeIndex) as HTMLElement | null;
      if (!slide) return;

      scroller.scrollTo({ left: slide.offsetLeft, behavior });
      setActiveIndex((current) => (current === safeIndex ? current : safeIndex));
    },
    [visibleAds.length],
  );

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !hasMultipleAds) return;

    if (scrollRafRef.current) {
      window.cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollRafRef.current = window.requestAnimationFrame(() => {
      const slides = Array.from(scroller.children) as HTMLElement[];
      if (slides.length === 0) {
        scrollRafRef.current = null;
        return;
      }

      const nearestIndex = slides.reduce(
        (nearest, slide, index) => {
          const distance = Math.abs(slide.offsetLeft - scroller.scrollLeft);
          return distance < nearest.distance ? { index, distance } : nearest;
        },
        { index: 0, distance: Number.POSITIVE_INFINITY },
      ).index;
      setActiveIndex((current) => (current === nearestIndex ? current : nearestIndex));
      scrollRafRef.current = null;
    });
  }, [hasMultipleAds]);

  useEffect(() => {
    if (resetRafRef.current) {
      window.cancelAnimationFrame(resetRafRef.current);
      resetRafRef.current = null;
    }
    setActiveIndex((current) => (current === 0 ? current : 0));
    resetRafRef.current = window.requestAnimationFrame(() => {
      resetRafRef.current = null;
      scrollToIndex(0, 'auto');
    });
    return () => {
      if (resetRafRef.current) {
        window.cancelAnimationFrame(resetRafRef.current);
        resetRafRef.current = null;
      }
    };
  }, [scrollToIndex]);

  useEffect(() => {
    if (!hasMultipleAds || isAutoPaused || !isPageVisible) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => {
        const nextIndex = (currentIndex + 1) % visibleAds.length;
        if (autoScrollRafRef.current) {
          window.cancelAnimationFrame(autoScrollRafRef.current);
          autoScrollRafRef.current = null;
        }
        autoScrollRafRef.current = window.requestAnimationFrame(() => {
          autoScrollRafRef.current = null;
          scrollToIndex(nextIndex);
        });
        return nextIndex;
      });
    }, AUTO_ROTATE_MS);

    return () => {
      window.clearInterval(timer);
      if (autoScrollRafRef.current) {
        window.cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    };
  }, [hasMultipleAds, isAutoPaused, isPageVisible, scrollToIndex, visibleAds.length]);

  useEffect(
    () => () => {
      clearPauseTimer();
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
      if (resetRafRef.current) window.cancelAnimationFrame(resetRafRef.current);
      if (autoScrollRafRef.current) window.cancelAnimationFrame(autoScrollRafRef.current);
    },
    [clearPauseTimer],
  );

  if (visibleAds.length === 0) return null;

  return (
    <section
      className={`home-ad-banner-shell ${compact ? 'home-ad-banner-shell--compact' : 'home-ad-banner-shell--standard'}`}
      aria-label={ariaLabel}
    >
      <div className="home-ad-stage">
        <div
          ref={scrollerRef}
          className="home-ad-scroller"
          aria-label={hasMultipleAds ? `${ariaLabel}轮播，当前第 ${activeIndex + 1} 个，共 ${visibleAds.length} 个` : ariaLabel}
          aria-roledescription={hasMultipleAds ? 'carousel' : undefined}
          onScroll={handleScroll}
          onPointerDown={pauseAutoRotate}
          onTouchStart={pauseAutoRotate}
          onWheel={pauseAutoRotate}
        >
          {visibleAds.map((ad, index) => {
            const target = normalizeAdTargetUrlForDisplay(ad.adTargetUrl);
            const external = /^(?:https?:\/\/|tg:\/\/)/i.test(target);
            const imageUrl = isMobile
              ? ad.adMobileImageUrl || ad.adImageUrl || ''
              : ad.adImageUrl || ad.adMobileImageUrl || '';
            return (
              <a
                key={ad.id}
                href={target}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="home-ad-slide pressable"
                aria-label={hasMultipleAds ? `广告 ${index + 1}/${visibleAds.length}` : '广告'}
              >
                <OptimizedImage
                  src={imageUrl}
                  alt="广告图片"
                  className="home-ad-slide-image"
                  variant="medium"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  priority={index === 0}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  sizes={UI_HOME_AD_IMAGE_SIZES}
                />
              </a>
            );
          })}
        </div>

        {hasMultipleAds && (
          <div className="home-ad-progress" aria-hidden="true">
            {visibleAds.map((ad, index) => (
              <span
                key={ad.id}
                className="home-ad-progress__segment"
                data-state={index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'idle'}
              >
                <span
                  key={`${activeIndex}-${index}-${isAutoPaused ? 'paused' : 'running'}`}
                  className={`home-ad-progress__fill ${index === activeIndex && isAutoPaused ? 'home-ad-progress__fill--paused' : ''}`}
                />
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
