import {
  UI_USER_MOBILE_MAX_WIDTH,
  UI_USER_MOBILE_MEDIA_QUERY,
} from '@/ui/layoutViewport';

const DOCUMENT_SCROLL_SELECTOR = '[data-feed-document-scroll="true"]';

export type FeedScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export type FeedScrollTarget = Window | HTMLElement;

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function matchesDocumentScrollViewport() {
  if (!canUseDom()) return false;

  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(UI_USER_MOBILE_MEDIA_QUERY).matches;
  }

  return window.innerWidth <= UI_USER_MOBILE_MAX_WIDTH;
}

export function isDocumentFeedScrollMode(explicitMode?: boolean) {
  if (!canUseDom()) return false;
  if (!matchesDocumentScrollViewport()) return false;
  if (typeof explicitMode === 'boolean') return explicitMode;

  return Boolean(document.querySelector(DOCUMENT_SCROLL_SELECTOR));
}

export function getDocumentScrollElement() {
  return document.scrollingElement || document.documentElement;
}

function readPixelCustomProperty(name: string) {
  if (!canUseDom()) return 0;

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value.endsWith('px')) return 0;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getDocumentScrollClientHeight() {
  if (!canUseDom()) return 0;

  return (
    readPixelCustomProperty('--app-layout-vh') ||
    document.documentElement.clientHeight ||
    window.innerHeight ||
    0
  );
}

export function getFeedScrollMetrics(
  container?: HTMLElement | null,
  useDocumentScroll = isDocumentFeedScrollMode(),
): FeedScrollMetrics {
  if (useDocumentScroll && canUseDom()) {
    const scrollElement = getDocumentScrollElement();

    return {
      scrollTop: window.scrollY || scrollElement.scrollTop || document.documentElement.scrollTop || 0,
      scrollHeight: Math.max(
        scrollElement.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ),
      clientHeight: getDocumentScrollClientHeight(),
    };
  }

  return {
    scrollTop: container?.scrollTop ?? 0,
    scrollHeight: container?.scrollHeight ?? 0,
    clientHeight: container?.clientHeight ?? 0,
  };
}

export function getFeedScrollEventTarget(
  container?: HTMLElement | null,
  useDocumentScroll = isDocumentFeedScrollMode(),
): FeedScrollTarget | null {
  if (useDocumentScroll) return canUseDom() ? window : null;
  return container ?? null;
}

export function scrollFeedToTop(
  container?: HTMLElement | null,
  behavior: ScrollBehavior = 'smooth',
  useDocumentScroll = isDocumentFeedScrollMode(),
) {
  if (useDocumentScroll) {
    if (!canUseDom()) return;
    getDocumentScrollElement().scrollTo({ top: 0, behavior });
    return;
  }

  container?.scrollTo({ top: 0, behavior });
}

export function subscribeFeedScrollModeChange(callback: () => void): (() => void) | undefined {
  if (!canUseDom()) return undefined;

  let frame: number | null = null;
  const schedule = () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      callback();
    });
  };

  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(schedule);

  if (observer) {
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-feed-document-scroll'],
    });
  }

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule, { passive: true });
  schedule();

  return () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
  };
}
