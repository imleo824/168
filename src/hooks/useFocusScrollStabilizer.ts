import { useCallback, useEffect, useRef, type FocusEvent } from 'react';
import { isTextEntryTarget, releaseActiveTextEntry } from '@/utils/textEntryFocus';

type FocusRoot = HTMLDivElement | null;

function readCssPixelToken(name: string, fallback: number) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function useFocusScrollStabilizer(activeClassName: string) {
  const rootRef = useRef<FocusRoot>(null);
  const timersRef = useRef<number[]>([]);
  const rafsRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    rafsRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    rafsRef.current = [];
  }, []);

  const setKeyboardMode = useCallback((enabled: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.toggle(activeClassName, enabled);
  }, [activeClassName]);

  const ensureInputVisible = useCallback((target: HTMLElement) => {
    if (!target.isConnected) return;
    const root = rootRef.current;
    const visualHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
    const rootRect = root?.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const topbarHeight = readCssPixelToken('--ui-topbar-height', 48);
    const topbarOffset = readCssPixelToken('--ui-topbar-scroll-offset-y', 12);
    const textEntryTopPadding = readCssPixelToken(
      '--ui-text-entry-scroll-padding-top',
      topbarHeight + topbarOffset,
    );
    const bottomOffset = readCssPixelToken('--ui-space-4', 16);
    const topLimit = Math.max(rootRect?.top ?? 0, 0) + textEntryTopPadding;
    const bottomLimit = Math.min(rootRect?.bottom ?? visualHeight, visualHeight) - bottomOffset;

    if (rect.top < topLimit || rect.bottom > bottomLimit) {
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    }
  }, []);

  const stabilizeFocusedInput = useCallback((target: HTMLElement) => {
    if (typeof window === 'undefined') return;
    clearTimers();
    setKeyboardMode(true);

    const firstFrame = window.requestAnimationFrame(() => {
      if (!target.isConnected) return;
      ensureInputVisible(target);
      const secondFrame = window.requestAnimationFrame(() => {
        if (target.isConnected) ensureInputVisible(target);
      });
      rafsRef.current.push(secondFrame);
    });
    rafsRef.current.push(firstFrame);

    [180, 360].forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (target.isConnected) ensureInputVisible(target);
      }, delay);
      timersRef.current.push(timer);
    });
  }, [clearTimers, ensureInputVisible, setKeyboardMode]);

  const releaseFocusedInput = useCallback(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const root = rootRef.current;
      const active = document.activeElement;
      if (root && isTextEntryTarget(active) && root.contains(active)) return;
      clearTimers();
      setKeyboardMode(false);
    }, 120);
    timersRef.current.push(timer);
  }, [clearTimers, setKeyboardMode]);

  const onFocusCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (isTextEntryTarget(target)) {
      stabilizeFocusedInput(target);
    }
  }, [stabilizeFocusedInput]);

  const onBlurCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const target = event.target;
    if (isTextEntryTarget(target)) {
      releaseFocusedInput();
    }
  }, [releaseFocusedInput]);

  useEffect(
    () => () => {
      releaseActiveTextEntry(rootRef.current);
      clearTimers();
      setKeyboardMode(false);
    },
    [clearTimers, setKeyboardMode],
  );

  return { rootRef, onFocusCapture, onBlurCapture };
}
