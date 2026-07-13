import { useLayoutEffect } from 'react';
import {
  LIST_SCROLL_ROOT_SELECTOR,
  getActiveRouteOverlay,
  getVisibleElements,
} from './scrollTargets';

const LIST_RETURN_SCOPE_KEY = 'list_return_pending_scope';
const LIST_RETURN_TOP_PREFIX = 'list_return_scroll_top:';
const LIST_RETURN_RESTORE_EVENT = 'list-return-scroll:restore';
const LIST_RETURN_RESTORE_SCOPE_KEY = 'list_return_restore_scope';
const LIST_RETURN_RESTORE_AT_KEY = 'list_return_restore_at';
const HISTORY_RETURN_SCOPE_KEY = '__listReturnScope';
const HISTORY_RETURN_TOP_KEY = '__listReturnTop';
const HISTORY_RETURN_EXPIRES_KEY = '__listReturnExpires';
const LIST_RETURN_TTL_MS = 5 * 60 * 1000;
const LIST_RETURN_SOURCE_MAX_AGE_MS = 90 * 1000;
const LIST_RETURN_RESTORE_REQUEST_TTL_MS = 2500;

type ReturnRecordSource = 'manual' | 'fallback';

interface ListReturnRecordPayload {
  top: number;
  expiresAt: number;
  source?: ReturnRecordSource;
  updatedAt?: number;
}

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getCurrentListScope() {
  if (typeof window === 'undefined') return '';
  return normalizeListScope(`${window.location.pathname}${window.location.search}`);
}

function normalizeListScope(scope: string) {
  if (!scope) return '';

  const [path, searchPart] = scope.split('?');
  if (!searchPart) return path || '';

  try {
    const search = new URLSearchParams(searchPart.startsWith('?') ? searchPart.slice(1) : searchPart);
    search.sort();
    const next = search.toString();
    return next ? `${path}?${next}` : path || '';
  } catch (error) {
    const normalizedSearch = searchPart.replace(/^\?/, '');
    return normalizedSearch ? `${path}?${normalizedSearch}` : path || '';
  }
}

function buildRecord(source: ReturnRecordSource, top: number): ListReturnRecordPayload {
  const now = Date.now();
  return {
    top: Math.max(0, Math.round(top)),
    source,
    updatedAt: now,
    expiresAt: now + LIST_RETURN_TTL_MS,
  };
}

function parseRecord(value: string | null): ListReturnRecordPayload | null {
  if (!value) return null;
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as ListReturnRecordPayload;
      const top = Number(parsed?.top);
      const expiresAt = Number(parsed?.expiresAt);
      if (!Number.isFinite(top) || !Number.isFinite(expiresAt)) return null;
      return {
        top: Math.max(0, Math.round(top)),
        expiresAt,
        source: parsed?.source === 'fallback' ? 'fallback' : 'manual',
        updatedAt: Number.isFinite(Number(parsed?.updatedAt)) ? Math.round(Number(parsed.updatedAt)) : undefined,
      };
    } catch {
      return null;
    }
  }

  const legacyTop = Number(value);
  if (!Number.isFinite(legacyTop)) return null;
  return {
    top: Math.max(0, Math.round(legacyTop)),
    source: 'manual',
    updatedAt: Date.now(),
    expiresAt: Date.now() + LIST_RETURN_TTL_MS,
  };
}

function readStoredRecord(scope: string): ListReturnRecordPayload | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(getTopKey(scope));
  const record = parseRecord(raw);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    storage.removeItem(getTopKey(scope));
    if (storage.getItem(LIST_RETURN_SCOPE_KEY) === scope) {
      storage.removeItem(LIST_RETURN_SCOPE_KEY);
    }
    return null;
  }

  return record;
}

function persistRecord(scope: string, payload: ListReturnRecordPayload) {
  const storage = getStorage();
  if (!storage) return;

  const record = {
    ...payload,
    top: Math.max(0, Math.round(payload.top)),
    source: payload.source || 'manual',
    updatedAt: payload.updatedAt ?? Date.now(),
    expiresAt:
      Number.isFinite(payload.expiresAt)
        ? Math.max(Date.now() + LIST_RETURN_TTL_MS, Math.round(payload.expiresAt))
        : Date.now() + LIST_RETURN_TTL_MS,
  };

  storage.setItem(LIST_RETURN_SCOPE_KEY, scope);
  storage.setItem(getTopKey(scope), JSON.stringify(record));
}

function getTopKey(scope: string) {
  return `${LIST_RETURN_TOP_PREFIX}${scope}`;
}

function getHistoryStateRecord() {
  if (typeof window === 'undefined') return null;
  const state = window.history.state;
  return state && typeof state === 'object' ? (state as Record<string, unknown>) : null;
}

function getRouterUserState(state: Record<string, unknown> | null) {
  const usr = state?.usr;
  return usr && typeof usr === 'object' ? (usr as Record<string, unknown>) : null;
}

function writeHistoryReturnPosition(scope: string, top: number) {
  if (typeof window === 'undefined' || !scope) return;
  const expiresAt = Date.now() + LIST_RETURN_TTL_MS;

  try {
    const state = getHistoryStateRecord();
    const nextTop = Math.max(0, Math.round(top));

    if (state && 'usr' in state) {
      const usr = getRouterUserState(state) || {};
      window.history.replaceState(
        {
        ...state,
        usr: {
          ...usr,
          [HISTORY_RETURN_SCOPE_KEY]: scope,
          [HISTORY_RETURN_TOP_KEY]: nextTop,
          [HISTORY_RETURN_EXPIRES_KEY]: expiresAt,
        },
      },
      '',
    );
      return;
    }

    window.history.replaceState(
      {
        ...(state || {}),
        [HISTORY_RETURN_SCOPE_KEY]: scope,
        [HISTORY_RETURN_TOP_KEY]: nextTop,
        [HISTORY_RETURN_EXPIRES_KEY]: expiresAt,
      },
      '',
    );
  } catch {
    // History state writes are best-effort; sessionStorage remains the fallback.
  }
}

function readHistoryReturnTop(scope: string) {
  const state = getHistoryStateRecord();
  if (!state || !scope) return null;

  const candidates = [getRouterUserState(state), state].filter(Boolean) as Array<Record<string, unknown>>;
  for (const candidate of candidates) {
    if (candidate[HISTORY_RETURN_SCOPE_KEY] !== scope) continue;
    const value = Number(candidate[HISTORY_RETURN_TOP_KEY]);
    const expiresAt = Number(candidate[HISTORY_RETURN_EXPIRES_KEY]);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue;
    if (Number.isFinite(value)) return Math.max(0, Math.round(value));
  }

  return null;
}

function clearHistoryReturnTop(scope: string) {
  if (typeof window === 'undefined' || !scope) return;

  try {
    const state = getHistoryStateRecord();
    if (!state) return;

    if ('usr' in state) {
      const usr = getRouterUserState(state);
      if (!usr || usr[HISTORY_RETURN_SCOPE_KEY] !== scope) return;
      const nextUsr = { ...usr };
      delete nextUsr[HISTORY_RETURN_SCOPE_KEY];
      delete nextUsr[HISTORY_RETURN_TOP_KEY];
      delete nextUsr[HISTORY_RETURN_EXPIRES_KEY];
      window.history.replaceState({ ...state, usr: nextUsr }, '');
      return;
    }

    if (state[HISTORY_RETURN_SCOPE_KEY] !== scope) return;
    const nextState = { ...state };
    delete nextState[HISTORY_RETURN_SCOPE_KEY];
    delete nextState[HISTORY_RETURN_TOP_KEY];
    delete nextState[HISTORY_RETURN_EXPIRES_KEY];
    window.history.replaceState(nextState, '');
  } catch {
    // Ignore browser-specific restrictions while leaving storage cleanup intact.
  }
}

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

function getTargetScrollTop(target?: EventTarget | null) {
  const candidates = [getDocumentScrollTop()];
  const activeOverlay = getActiveRouteOverlay();
  const activeDetailOverlay = getActiveDetailOverlay();
  const addCandidates = (elements: Iterable<HTMLElement>) => {
    for (const element of elements) {
      if (isInsideElement(activeDetailOverlay, element)) continue;
      candidates.push(element.scrollTop || 0);
    }
  };

  if (!(target instanceof HTMLElement)) {
    if (activeOverlay && !activeDetailOverlay) {
      candidates.push(activeOverlay.scrollTop || 0);
      addCandidates(activeOverlay.querySelectorAll<HTMLElement>(LIST_SCROLL_ROOT_SELECTOR));
    }
    getVisibleListReturnTargets().forEach((element) => candidates.push(element.scrollTop || 0));
    return Math.max(...candidates);
  }

  if (activeOverlay?.contains(target) && !activeDetailOverlay) {
    candidates.push(activeOverlay.scrollTop || 0);
  }

  let element: HTMLElement | null = target;
  while (element) {
    if (element.matches(LIST_SCROLL_ROOT_SELECTOR) && !isInsideElement(activeDetailOverlay, element)) {
      candidates.push(element.scrollTop || 0);
    }
    element = element.parentElement;
  }

  return Math.max(...candidates);
}

interface RememberListReturnOptions {
  source?: ReturnRecordSource;
}

export function rememberListReturnPosition(
  target?: EventTarget | null,
  scope = getCurrentListScope(),
  options: RememberListReturnOptions = {},
) {
  const normalizedScope = normalizeListScope(scope);
  if (!normalizedScope) return;

  const source: ReturnRecordSource = options.source
    ? options.source
    : target instanceof HTMLElement
      ? 'manual'
      : 'fallback';
  const top = Math.max(0, Math.round(getTargetScrollTop(target)));
  const now = Date.now();
  const storedRecord = readStoredRecord(normalizedScope);
  const historyTop = readHistoryReturnTop(normalizedScope);
  const hasRecentManualRecord = storedRecord?.top !== undefined
    ? storedRecord.source === 'manual'
      && Number.isFinite(storedRecord.top)
      && storedRecord.top > top
      && Number.isFinite(storedRecord.updatedAt)
      && now - (storedRecord.updatedAt as number) <= LIST_RETURN_SOURCE_MAX_AGE_MS
    : false;
  const storedManualTop = hasRecentManualRecord ? Math.round(storedRecord?.top || 0) : -1;
  const existingHistoryTop = Number.isFinite(historyTop) ? historyTop : -1;
  const shouldPreserveManual = source === 'fallback' && hasRecentManualRecord;
  const hasStoredRecord = !!storedRecord;
  const shouldPreserveHistory =
    source === 'fallback' && !shouldPreserveManual && !hasStoredRecord && existingHistoryTop > top;
  const nextTop = source === 'fallback' && (shouldPreserveManual || shouldPreserveHistory)
    ? Math.max(storedManualTop, existingHistoryTop)
    : top;
  if (!Number.isFinite(nextTop)) {
    return;
  }

  persistRecord(normalizedScope, buildRecord(source, Math.max(0, Math.round(nextTop))));
  writeHistoryReturnPosition(normalizedScope, Math.max(0, Math.round(nextTop)));

  return;

}

function writeRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return;

  storage.setItem(LIST_RETURN_RESTORE_SCOPE_KEY, normalizedScope);
  storage.setItem(LIST_RETURN_RESTORE_AT_KEY, String(Date.now()));
}

function hasRecentRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return false;

  const restoreScope = storage.getItem(LIST_RETURN_RESTORE_SCOPE_KEY);
  if (restoreScope !== normalizedScope) return false;

  const requestedAt = Number(storage.getItem(LIST_RETURN_RESTORE_AT_KEY));
  if (!Number.isFinite(requestedAt)) return false;

  if (Date.now() - requestedAt > LIST_RETURN_RESTORE_REQUEST_TTL_MS) {
    storage.removeItem(LIST_RETURN_RESTORE_SCOPE_KEY);
    storage.removeItem(LIST_RETURN_RESTORE_AT_KEY);
    return false;
  }

  return true;
}

function clearRestoreRequest(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!storage || !normalizedScope) return;

  if (storage.getItem(LIST_RETURN_RESTORE_SCOPE_KEY) !== normalizedScope) return;
  storage.removeItem(LIST_RETURN_RESTORE_SCOPE_KEY);
  storage.removeItem(LIST_RETURN_RESTORE_AT_KEY);
}

export function notifyListReturnScrollRestore(scope = getCurrentListScope()) {
  if (typeof window === 'undefined') return;
  writeRestoreRequest(scope);
  window.dispatchEvent(new Event(LIST_RETURN_RESTORE_EVENT));
}

function readPendingTop(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (!normalizedScope) return null;

  if (storage) {
    const storedScope = storage.getItem(LIST_RETURN_SCOPE_KEY);
    if (storedScope === normalizedScope) {
      const record = readStoredRecord(normalizedScope);
      const value = Number(record?.top);
      if (Number.isFinite(value)) return Math.max(0, Math.round(value));
    }
  }

  return readHistoryReturnTop(normalizedScope);
}

export function hasPendingListReturnPosition(scope: string) {
  return readPendingTop(scope) !== null;
}

function clearPendingTop(scope: string) {
  const storage = getStorage();
  const normalizedScope = normalizeListScope(scope);
  if (storage && normalizedScope) {
    if (storage.getItem(LIST_RETURN_SCOPE_KEY) === normalizedScope) {
      storage.removeItem(LIST_RETURN_SCOPE_KEY);
    }
    storage.removeItem(getTopKey(normalizedScope));
  }
  clearRestoreRequest(normalizedScope);
  clearHistoryReturnTop(normalizedScope);
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
