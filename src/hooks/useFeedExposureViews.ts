import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as api from '@/services/api';
import {
  FEED_SCOPE_SELECTOR,
  getActiveRouteOverlay,
  isElementVisible,
} from '@/utils/scrollTargets';

const EXPOSURE_SELECTOR = '[data-feed-post-id]';
const EXPOSURE_VISIBLE_DELAY_MS = 1200;
const EXPOSURE_FLUSH_DELAY_MS = 2400;
const EXPOSURE_BATCH_SIZE = 30;
const MAX_SEEN_POST_IDS = 6000;
const QUICK_SKIP_MAX_MS = 900;
const ignoreExposureError = () => {};

type ExposureViewEvent = {
  postId: string;
  dwellMs?: number;
  quickSkip?: boolean;
};

function getExposureScope() {
  const activeOverlay = getActiveRouteOverlay();
  const root: ParentNode = activeOverlay || document;
  const feedScopes = Array.from(root.querySelectorAll<HTMLElement>(FEED_SCOPE_SELECTOR));
  const activeScope = feedScopes.find((scope) => isElementVisible(scope));
  return activeScope ?? activeOverlay ?? document;
}

function capSeenSetSize(set: Set<string>) {
  if (set.size <= MAX_SEEN_POST_IDS) return;
  const overflow = set.size - MAX_SEEN_POST_IDS;
  let removed = 0;
  for (const id of set) {
    set.delete(id);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function toPostIdKey(postIds: string[]) {
  return postIds.filter(Boolean).join('|');
}

export function useFeedExposureViews(postIds: string[], enabled = true) {
  const postIdKey = useMemo(() => toPostIdKey(postIds), [postIds]);
  const activePostIdsRef = useRef<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Map<string, ExposureViewEvent>>(new Map());
  const visibleTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const visibleStartedAtRef = useRef<Map<string, number>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const events = Array.from<ExposureViewEvent>(pendingRef.current.values()).slice(0, EXPOSURE_BATCH_SIZE);
    events.forEach((event) => pendingRef.current.delete(event.postId));
    if (!events.length) return;

    api.recordPostViews(events.map((event) => event.postId), events).catch(ignoreExposureError);
    if (pendingRef.current.size > 0) {
      flushTimerRef.current = setTimeout(flush, EXPOSURE_FLUSH_DELAY_MS);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flush, EXPOSURE_FLUSH_DELAY_MS);
  }, [flush]);

  const clearExposureTimer = useCallback((postId: string) => {
    const timer = visibleTimersRef.current.get(postId);
    if (!timer) return;
    clearTimeout(timer);
    visibleTimersRef.current.delete(postId);
  }, []);

  const stopObservingPost = useCallback((postId: string, clearStartedAt = true) => {
    clearExposureTimer(postId);
    if (clearStartedAt) visibleStartedAtRef.current.delete(postId);
    const element = observedElementsRef.current.get(postId);
    if (element) observerRef.current?.unobserve(element);
    observedElementsRef.current.delete(postId);
  }, [clearExposureTimer]);

  const queueSeenPost = useCallback((postId: string, event: ExposureViewEvent) => {
    seenRef.current.add(postId);
    capSeenSetSize(seenRef.current);
    pendingRef.current.set(postId, event);
    stopObservingPost(postId);
    scheduleFlush();
  }, [scheduleFlush, stopObservingPost]);

  const handleExposureEntries = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry) => {
      const element = entry.target as HTMLElement;
      const postId = element.dataset.feedPostId || '';
      if (!postId || seenRef.current.has(postId) || !activePostIdsRef.current.has(postId)) {
        return;
      }

      if (entry.intersectionRatio >= 0.55) {
        if (!visibleStartedAtRef.current.has(postId)) {
          visibleStartedAtRef.current.set(postId, Date.now());
        }
        if (visibleTimersRef.current.has(postId)) return;

        const timer = setTimeout(() => {
          visibleTimersRef.current.delete(postId);
          if (document.visibilityState === 'hidden') return;
          if (seenRef.current.has(postId) || !activePostIdsRef.current.has(postId)) return;
          const startedAt = visibleStartedAtRef.current.get(postId) || Date.now();
          queueSeenPost(postId, {
            postId,
            dwellMs: Date.now() - startedAt,
            quickSkip: false,
          });
        }, EXPOSURE_VISIBLE_DELAY_MS);
        visibleTimersRef.current.set(postId, timer);
        return;
      }

      clearExposureTimer(postId);
      const startedAt = visibleStartedAtRef.current.get(postId);
      if (startedAt && !seenRef.current.has(postId)) {
        const dwellMs = Date.now() - startedAt;
        if (dwellMs > 80 && dwellMs <= QUICK_SKIP_MAX_MS) {
          queueSeenPost(postId, {
            postId,
            dwellMs,
            quickSkip: true,
          });
          return;
        }
      }
      visibleStartedAtRef.current.delete(postId);
    });
  }, [clearExposureTimer, queueSeenPost]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    observerRef.current = new IntersectionObserver(handleExposureEntries, {
      threshold: [0, 0.55, 0.75],
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedElementsRef.current.clear();
      visibleTimersRef.current.forEach((timer) => clearTimeout(timer));
      visibleTimersRef.current.clear();
      visibleStartedAtRef.current.clear();
      flush();
    };
  }, [enabled, flush, handleExposureEntries]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [enabled, flush]);

  useEffect(() => {
    activePostIdsRef.current = new Set(postIdKey.split('|').filter(Boolean));
    const observer = observerRef.current;
    if (!enabled || !observer || activePostIdsRef.current.size === 0) {
      observedElementsRef.current.forEach((_element, postId) => stopObservingPost(postId));
      return;
    }

    observedElementsRef.current.forEach((_element, postId) => {
      if (!activePostIdsRef.current.has(postId) || seenRef.current.has(postId)) {
        stopObservingPost(postId);
      }
    });

    const scope = getExposureScope();
    const elements = Array.from(scope.querySelectorAll<HTMLElement>(EXPOSURE_SELECTOR));
    elements.forEach((element) => {
      const postId = element.dataset.feedPostId || '';
      if (!postId || !activePostIdsRef.current.has(postId) || seenRef.current.has(postId)) return;

      const currentElement = observedElementsRef.current.get(postId);
      if (currentElement === element) return;
      if (currentElement) observer.unobserve(currentElement);
      observedElementsRef.current.set(postId, element);
      observer.observe(element);
    });
  }, [enabled, postIdKey, stopObservingPost]);
}
