export const ROUTE_OVERLAY_SELECTOR = '[data-route-overlay]';
export const ROUTE_OVERLAY_SCROLL_SELECTOR = '[data-route-overlay-scroll]';

export const PAGE_SCROLL_TARGET_SELECTORS = [
  ROUTE_OVERLAY_SELECTOR,
  ROUTE_OVERLAY_SCROLL_SELECTOR,
  '[data-detail-scroll-root]',
  '[data-feed-scroll-root]',
  '[data-mobile-fill]',
  '[data-mobile-addressbar-scroll]',
  '.post-create-page',
];

export const LIST_SCROLL_ROOT_SELECTOR = [
  ROUTE_OVERLAY_SELECTOR,
  ROUTE_OVERLAY_SCROLL_SELECTOR,
  '[data-detail-scroll-root]',
  '[data-feed-scroll-root]',
  '[data-list-scroll-root]',
  '[data-mobile-addressbar-scroll]',
].join(',');

export const FEED_SCOPE_SELECTOR = [
  '[data-feed-scroll-root]',
  '[data-mobile-addressbar-scroll]',
].join(',');

export function isElementVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
}

function canScrollVertically(element: HTMLElement) {
  return element.scrollHeight > element.clientHeight + 1;
}

function containsExistingTarget(targets: HTMLElement[], element: HTMLElement) {
  return targets.some((target) => target !== element && target.contains(element));
}

export function getActiveRouteOverlay(root: ParentNode = document) {
  const overlays = Array.from(root.querySelectorAll<HTMLElement>(ROUTE_OVERLAY_SELECTOR));
  for (let index = overlays.length - 1; index >= 0; index -= 1) {
    const overlay = overlays[index];
    if (overlay && isElementVisible(overlay)) return overlay;
  }
  return null;
}

export function getVisibleElements(selector: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(isElementVisible);
}

export function getVisibleScrollTargets(selectors = PAGE_SCROLL_TARGET_SELECTORS) {
  const activeOverlay = getActiveRouteOverlay();

  // Route overlays own their scroll lane. Returning nested targets as well makes
  // route restore and double-tap-top write several scroll containers in the same
  // frame, which can look like micro-jitter on mobile browsers.
  if (activeOverlay) return [activeOverlay];

  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];

  const pushElement = (element: HTMLElement) => {
    if (seen.has(element) || !isElementVisible(element) || !canScrollVertically(element)) return;
    if (containsExistingTarget(targets, element)) return;
    seen.add(element);
    targets.push(element);
  };

  selectors.forEach((selector) => {
    document.querySelectorAll<HTMLElement>(selector).forEach(pushElement);
  });

  return targets;
}
