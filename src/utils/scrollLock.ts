import { useEffect, useLayoutEffect, useRef } from 'react';
import { releaseActiveTextEntry } from '@/utils/textEntryFocus';
import { getVisibleScrollTargets } from '@/utils/scrollTargets';

type ScrollLockOptions = {
  /**
   * Kept for API compatibility. The shared lock no longer relies on fixed body
   * positioning; it freezes the actual visible scroll lanes instead.
   */
  fixed?: boolean;
  allowTouchMove?: (target: EventTarget | null) => boolean;
};

type ScrollSnapshot = {
  element: HTMLElement;
  top: number;
  left: number;
};

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

let nextLockId = 1;
const locks = new Map<number, ScrollLockOptions>();
let listenersAttached = false;
let frozenTargets: ScrollSnapshot[] = [];
let frozenWindowTop = 0;
let frozenWindowLeft = 0;
let restoringScroll = false;
let lastTouchY: number | null = null;
let lastTouchX: number | null = null;

function getWindowScrollTop() {
  if (typeof window === 'undefined') return 0;
  return Math.max(
    0,
    window.scrollY ||
      document.scrollingElement?.scrollTop ||
      document.documentElement.scrollTop ||
      0,
  );
}

function getWindowScrollLeft() {
  if (typeof window === 'undefined') return 0;
  return Math.max(
    0,
    window.scrollX ||
      document.scrollingElement?.scrollLeft ||
      document.documentElement.scrollLeft ||
      0,
  );
}

function getElementFromTarget(target: EventTarget | null) {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function isScrollableElement(element: HTMLElement) {
  return (
    element.scrollHeight > element.clientHeight + 1 ||
    element.scrollWidth > element.clientWidth + 1
  );
}

function canScrollElement(element: HTMLElement, deltaX: number, deltaY: number) {
  if (!isScrollableElement(element)) return false;
  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return true;

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const currentLeft = element.scrollLeft;

    if (deltaX < 0) return currentLeft > 0;
    if (deltaX > 0) return currentLeft < maxScrollLeft - 1;
    return maxScrollLeft > 0;
  }

  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const currentTop = element.scrollTop;

  if (deltaY < 0) return currentTop > 0;
  if (deltaY > 0) return currentTop < maxScrollTop - 1;
  return true;
}

function findAllowedScrollableElement(target: EventTarget | null, deltaX = 0, deltaY = 0) {
  const start = getElementFromTarget(target);
  if (!start) return null;

  let node: Element | null = start;
  while (node && node !== document.body && node !== document.documentElement) {
    if (
      node instanceof HTMLElement &&
      isTargetAllowedByAnyLock(node) &&
      canScrollElement(node, deltaX, deltaY)
    ) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function isTargetAllowedByAnyLock(target: EventTarget | null) {
  const elementTarget = getElementFromTarget(target);

  for (const lock of locks.values()) {
    if (lock.allowTouchMove?.(target)) return true;
    if (
      elementTarget &&
      elementTarget !== target &&
      lock.allowTouchMove?.(elementTarget)
    ) {
      return true;
    }
  }
  return false;
}

function shouldAllowScrollEvent(target: EventTarget | null, deltaX = 0, deltaY = 0) {
  if (!isTargetAllowedByAnyLock(target)) return false;

  return Boolean(findAllowedScrollableElement(target, deltaX, deltaY));
}

function getTouchClientY(event: TouchEvent) {
  return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null;
}

function getTouchClientX(event: TouchEvent) {
  return event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX ?? null;
}

function handleTouchStart(event: TouchEvent) {
  lastTouchY = getTouchClientY(event);
  lastTouchX = getTouchClientX(event);
}

function handleTouchEnd() {
  lastTouchY = null;
  lastTouchX = null;
}

function preventBackgroundScroll(event: Event) {
  let deltaY = 0;
  let deltaX = 0;

  if (event instanceof WheelEvent) {
    deltaY = event.deltaY;
    deltaX = event.deltaX;
  } else if (event instanceof TouchEvent) {
    const currentY = getTouchClientY(event);
    const currentX = getTouchClientX(event);
    if (currentY !== null && lastTouchY !== null) {
      deltaY = lastTouchY - currentY;
    }
    if (currentX !== null && lastTouchX !== null) {
      deltaX = lastTouchX - currentX;
    }
    if (currentY !== null) lastTouchY = currentY;
    if (currentX !== null) lastTouchX = currentX;
  }

  if (shouldAllowScrollEvent(event.target, deltaX, deltaY)) return;

  if (event.cancelable) event.preventDefault();
  restoreScrollTargets();
}

function snapshotScrollTargets() {
  frozenWindowTop = getWindowScrollTop();
  frozenWindowLeft = getWindowScrollLeft();
  frozenTargets = getVisibleScrollTargets()
    .filter((element) => !isTargetAllowedByAnyLock(element))
    .map((element) => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
}

function restoreScrollTargets() {
  if (restoringScroll || typeof window === 'undefined') return;
  restoringScroll = true;

  try {
    if (getWindowScrollTop() !== frozenWindowTop || getWindowScrollLeft() !== frozenWindowLeft) {
      window.scrollTo({ top: frozenWindowTop, left: frozenWindowLeft, behavior: 'auto' });
      document.scrollingElement?.scrollTo({ top: frozenWindowTop, left: frozenWindowLeft, behavior: 'auto' });
      document.documentElement.scrollTo({ top: frozenWindowTop, left: frozenWindowLeft, behavior: 'auto' });
      document.body?.scrollTo({ top: frozenWindowTop, left: frozenWindowLeft, behavior: 'auto' });
    }

    frozenTargets.forEach(({ element, top, left }) => {
      if (!element.isConnected) return;
      if (isTargetAllowedByAnyLock(element)) return;
      if (element.scrollTop === top && element.scrollLeft === left) return;
      element.scrollTo({ top, left, behavior: 'auto' });
    });
  } finally {
    window.setTimeout(() => {
      restoringScroll = false;
    }, 0);
  }
}

function handleFrozenScroll(event: Event) {
  if (shouldAllowScrollEvent(event.target)) return;
  restoreScrollTargets();
}

function attachListeners() {
  if (listenersAttached || typeof document === 'undefined') return;
  snapshotScrollTargets();
  document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', preventBackgroundScroll, { passive: false, capture: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });
  document.addEventListener('wheel', preventBackgroundScroll, { passive: false, capture: true });
  document.addEventListener('scroll', handleFrozenScroll, { passive: true, capture: true });
  window.addEventListener('scroll', handleFrozenScroll, { passive: true, capture: true });
  listenersAttached = true;
}

function detachListeners() {
  if (!listenersAttached || typeof document === 'undefined') return;
  document.removeEventListener('touchstart', handleTouchStart, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('touchmove', preventBackgroundScroll, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('touchend', handleTouchEnd, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('touchcancel', handleTouchEnd, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('wheel', preventBackgroundScroll, { capture: true } as AddEventListenerOptions);
  document.removeEventListener('scroll', handleFrozenScroll, { capture: true } as AddEventListenerOptions);
  window.removeEventListener('scroll', handleFrozenScroll, { capture: true } as AddEventListenerOptions);
  listenersAttached = false;
  frozenTargets = [];
  lastTouchY = null;
  lastTouchX = null;
}

export function acquireScrollLock(options: ScrollLockOptions = {}): (() => void) | undefined {
  if (typeof document === 'undefined') return undefined;

  const lockId = nextLockId;
  nextLockId += 1;
  locks.set(lockId, options);
  attachListeners();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks.delete(lockId);

    if (locks.size > 0) return;

    detachListeners();
    releaseActiveTextEntry();
  };
}

export function useScrollLock(locked: boolean, options: ScrollLockOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useIsomorphicLayoutEffect(() => {
    if (!locked) return undefined;
    return acquireScrollLock(optionsRef.current);
  }, [locked]);
}
