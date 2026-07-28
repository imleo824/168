import { useLayoutEffect } from 'react';
import {
  LIST_SCROLL_ROOT_SELECTOR,
  getActiveRouteOverlay,
  getVisibleElements,
} from './scrollTargets';
import {
  LIST_RETURN_RESTORE_EVENT,
  clearPendingTop,
  clearRestoreRequest,
  getCurrentListScope,
  hasRecentRestoreRequest,
  readPendingTop,
  writeRestoreRequest,
} from './listReturnScrollCore';

function getDocumentScrollTop() {
  if (typeof window === 'undefined') return 0;
  return Math.max(
    window.scrollY || 0,
    document.scrollingElement?.scrollTop || 0,
    document.documentElement.scrollTop || 0,
    document.body?.scrollTop || 0,
  );
}

function getActiveDetailOverlay() {
  if (typeof window === 'undefined') return null;
  const activeOverlay = getActiveRouteOverlay();
  if (!activeOverlay) return null;
  return /^\/post(?:\/|$)/.test(window.location.pathname) ? activeOverlay : null;
}

function isInsideElement(root: HTMLElement | null, element: HTMLElement) {
  return Boolean(root && (root === element || root.contains(element)));
}

function getVisibleListReturnTargets() {
  const activeDetailOverlay = getActiveDetailOverlay();
  return getVisibleElements(LIST_SCROLL_ROOT_SELECTOR).filter(
    (element) => !isInsideElement(activeDetailOverlay, element),
  );
}

export function notifyListReturnScrollRestore(scope = getCurrentListScope()) {
  if (typeof window === 'undefined') return;
  writeRestoreRequest(scope);
  window.dispatchEvent(new Event(LIST_RETURN_RESTORE_EVENT));
}

export function hasPendingListReturnPosition(scope: string) {
  return readPendingTop(scope) !== null;
}

function withInstantScrollBehavior<T>(target: Element | null | undefined, action: () => T) {
  const element = target instanceof HTMLElement ? target : null;
  const previousScrollBehavior = element?.style.scrollBehavior;

  if (element) {
    element.style.scrollBehavior = 'auto';
  }

  try {
    return action();
  } finally {
    if (element && previousScrollBehavior !== undefined) {
      element.style.scrollBehavior = previousScrollBehavior;
    }
  }
}

function scrollElementToTopInstant(element: Element | null | undefined, top: number) {
  if (!element) return;

  withInstantScrollBehavior(element, () => {
    element.scrollTo({ top, left: 0, behavior: 'auto' });
    if ('scrollTop' in element) {
      (element as HTMLElement).scrollTop = top;
      (element as HTMLElement).scrollLeft = 0;
    }
  });
}

function scrollWindowToTopInstant(top: number) {
  const documentElement = document.documentElement;
  const body = document.body;
  const previousDocumentScrollBehavior = documentElement.style.scrollBehavior;
  const previousBodyScrollBehavior = body?.style.scrollBehavior;

  documentElement.style.scrollBehavior = 'auto';
  if (body) {
    body.style.scrollBehavior = 'auto';
  }

  try {
    window.scrollTo({ top, left: 0, behavior: 'auto' });
    document.scrollingElement?.scrollTo({ top, left: 0, behavior: 'auto' });
    documentElement.scrollTop = top;
    documentElement.scrollLeft = 0;
    if (body) {
      body.scrollTop = top;
      body.scrollLeft = 0;
    }
  } finally {
    documentElement.style.scrollBehavior = previousDocumentScrollBehavior;
    if (body && previousBodyScrollBehavior !== undefined) {
      body.style.scrollBehavior = previousBodyScrollBehavior;
    }
  }
}

type RestoreCompletionReason = 'done' | 'deferred';

function isListReturnRestoreDeferred() {
  return Boolean(getActiveRouteOverlay());
}

function applyDocumentScrollTop(top: number) {
  if (isListReturnRestoreDeferred()) return false;

  getVisibleListReturnTargets().forEach((element) => {
    if (element.scrollHeight > element.clientHeight) {
      scrollElementToTopInstant(element, top);
    }
  });
  scrollElementToTopInstant(document.scrollingElement, top);
  scrollElementToTopInstant(document.documentElement, top);
  scrollElementToTopInstant(document.body, top);
  scrollWindowToTopInstant(top);
  return true;
}

function getCurrentScrollTop() {
  return Math.max(
    getDocumentScrollTop(),
    ...getVisibleListReturnTargets().map((element) => element.scrollTop || 0),
  );
}

function getMaxReachableScrollTop() {
  return Math.max(
    Math.max(0, (document.scrollingElement?.scrollHeight || 0) - (document.scrollingElement?.clientHeight || 0)),
    Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight),
    Math.max(0, document.body.scrollHeight - window.innerHeight),
    ...getVisibleListReturnTargets().map((element) =>
      Math.max(0, element.scrollHeight - element.clientHeight),
    ),
  );
}

function restoreDocumentScrollTop(
  top: number,
  onDone: (reason: RestoreCompletionReason) => void,
): (() => void) | undefined {
  const safeTop = Math.max(0, Math.round(top));
  let done = false;
  let frame2: number | null = null;
  let frame3: number | null = null;
  let interval: number | null = null;
  let timeout: number | null = null;
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const maxRestoreMs = 7000;

  const finish = (reason: RestoreCompletionReason = 'done') => {
    if (done) return;
    done = true;
    if (frame2 !== null) window.cancelAnimationFrame(frame2);
    if (frame3 !== null) window.cancelAnimationFrame(frame3);
    if (interval !== null) window.clearInterval(interval);
    if (timeout !== null) window.clearTimeout(timeout);
    onDone(reason);
  };
  const apply = () => {
    if (!applyDocumentScrollTop(safeTop)) {
      finish('deferred');
      return false;
    }
    return true;
  };

  const isCloseEnough = () => Math.abs(getCurrentScrollTop() - safeTop) <= 8;
  const canReachTarget = () => getMaxReachableScrollTop() >= safeTop - 8;
  const tick = (forceFinish = false) => {
    if (done) return;
    if (isListReturnRestoreDeferred()) {
      finish('deferred');
      return;
    }
    if (!apply()) return;

    if (isCloseEnough()) {
      finish();
      return;
    }

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    if (forceFinish || (elapsed >= maxRestoreMs && canReachTarget())) {
      finish();
    }
  };

  tick();
  if (done) return;

  const frame1 = window.requestAnimationFrame(() => {
    tick();
    frame2 = window.requestAnimationFrame(() => {
      tick();
      frame3 = window.requestAnimationFrame(() => tick());
    });
  });
  interval = window.setInterval(() => tick(), 120);
  timeout = window.setTimeout(() => tick(true), maxRestoreMs);

  return () => {
    done = true;
    window.cancelAnimationFrame(frame1);
    if (frame2 !== null) window.cancelAnimationFrame(frame2);
    if (frame3 !== null) window.cancelAnimationFrame(frame3);
    if (interval !== null) window.clearInterval(interval);
    if (timeout !== null) window.clearTimeout(timeout);
  };
}

export function useListReturnScroll(scope: string, ready: boolean, restoreVersion: unknown) {
  useLayoutEffect(() => {
    if (!ready || typeof window === 'undefined') return undefined;

    let restoreCleanup: (() => void) | null | undefined = null;
    const scheduledFrames = new Set<number>();
    const scheduledTimers = new Set<number>();

    const attemptRestore = () => {
      if (restoreCleanup) return;
      if (!hasRecentRestoreRequest(scope)) return;
      if (isListReturnRestoreDeferred()) return;

      const top = readPendingTop(scope);
      if (top === null) {
        clearRestoreRequest(scope);
        return;
      }

      restoreCleanup = restoreDocumentScrollTop(top, (reason) => {
        restoreCleanup = null;
        if (reason === 'done') {
          clearPendingTop(scope);
        }
      });
    };

    const scheduleRestore = () => {
      attemptRestore();

      const frame1 = window.requestAnimationFrame(() => {
        scheduledFrames.delete(frame1);
        attemptRestore();

        const frame2 = window.requestAnimationFrame(() => {
          scheduledFrames.delete(frame2);
          attemptRestore();
        });
        scheduledFrames.add(frame2);
      });
      scheduledFrames.add(frame1);

      const timer = window.setTimeout(() => {
        scheduledTimers.delete(timer);
        attemptRestore();
      }, 180);
      scheduledTimers.add(timer);
    };

    scheduleRestore();
    window.addEventListener('popstate', scheduleRestore);
    window.addEventListener('pageshow', scheduleRestore);
    window.addEventListener(LIST_RETURN_RESTORE_EVENT, scheduleRestore);

    return () => {
      window.removeEventListener('popstate', scheduleRestore);
      window.removeEventListener('pageshow', scheduleRestore);
      window.removeEventListener(LIST_RETURN_RESTORE_EVENT, scheduleRestore);
      scheduledFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      scheduledTimers.forEach((timer) => window.clearTimeout(timer));
      restoreCleanup?.();
    };
  }, [ready, restoreVersion, scope]);
}

export function ListReturnScrollRestorer({
  scope,
  ready,
  restoreVersion,
}: {
  scope: string;
  ready: boolean;
  restoreVersion: unknown;
}) {
  useListReturnScroll(scope, ready, restoreVersion);
  return null;
}
