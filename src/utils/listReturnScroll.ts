import {
  LIST_SCROLL_ROOT_SELECTOR,
  getActiveRouteOverlay,
  getVisibleElements,
} from './scrollTargets';
import {
  LIST_RETURN_SOURCE_MAX_AGE_MS,
  buildRecord,
  getCurrentListScope,
  normalizeListScope,
  persistRecord,
  readHistoryReturnTop,
  readStoredRecord,
  writeHistoryReturnPosition,
  type ReturnRecordSource,
} from './listReturnScrollCore';

interface RememberListReturnOptions {
  source?: ReturnRecordSource;
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
}
