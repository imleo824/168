import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  type TouchEvent,
} from 'react';

type PressHandler<T extends HTMLElement> = (event: MouseEvent<T>) => void;
type DirectPressEvent<T extends HTMLElement> = PointerEvent<T> | TouchEvent<T>;

type ActivePointerPress = {
  pointerId: number;
  startX: number;
  startY: number;
};

const PRESS_DEDUPE_MS = 96;
const FALLBACK_TAP_SLOP_PX = 12;

function supportsPointerEvents() {
  return typeof window !== 'undefined' && 'PointerEvent' in window;
}

function isPrimaryTouchPointer<T extends HTMLElement>(event: PointerEvent<T>) {
  return event.pointerType !== 'mouse' && event.isPrimary !== false;
}

function readTapSlopPx() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK_TAP_SLOP_PX;
  const tokenValue = window.getComputedStyle(document.documentElement).getPropertyValue('--ui-tap-slop-px').trim();
  const parsedValue = Number.parseFloat(tokenValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : FALLBACK_TAP_SLOP_PX;
}

function isWithinTapSlop(startX: number, startY: number, currentX: number, currentY: number) {
  return Math.hypot(currentX - startX, currentY - startY) <= readTapSlopPx();
}

export function useInstantPress<T extends HTMLElement>(
  onPress?: PressHandler<T>,
  disabled = false,
) {
  const directPressHandledRef = useRef(false);
  const lastDirectPressAtRef = useRef(0);
  const clearGuardTimerRef = useRef<number | null>(null);
  const activePointerPressRef = useRef<ActivePointerPress | null>(null);

  const resetDirectPressGuard = useCallback(() => {
    directPressHandledRef.current = false;
    lastDirectPressAtRef.current = 0;
    if (clearGuardTimerRef.current) {
      window.clearTimeout(clearGuardTimerRef.current);
      clearGuardTimerRef.current = null;
    }
  }, []);

  const resetActivePointerPress = useCallback(() => {
    activePointerPressRef.current = null;
  }, []);

  const setDirectPressGuard = useCallback(() => {
    if (clearGuardTimerRef.current) {
      window.clearTimeout(clearGuardTimerRef.current);
      clearGuardTimerRef.current = null;
    }
    directPressHandledRef.current = true;
    lastDirectPressAtRef.current = Date.now();
    clearGuardTimerRef.current = window.setTimeout(resetDirectPressGuard, PRESS_DEDUPE_MS);
  }, [resetDirectPressGuard]);

  const hasRecentDirectPress = useCallback(() => {
    if (directPressHandledRef.current) return true;
    const lastDirectPressAt = lastDirectPressAtRef.current;
    return lastDirectPressAt > 0 && Date.now() - lastDirectPressAt <= PRESS_DEDUPE_MS;
  }, []);

  const preventFollowupClick = useCallback((event: SyntheticEvent<T>) => {
    if (event.cancelable) {
      event.preventDefault();
    }
  }, []);

  const firePress = useCallback((event: MouseEvent<T>) => {
    if (disabled || !onPress) return;
    onPress(event);
  }, [disabled, onPress]);

  const fireDirectPress = useCallback((event: DirectPressEvent<T>) => {
    if (disabled || !onPress) return;

    if (hasRecentDirectPress()) {
      preventFollowupClick(event);
      return;
    }

    preventFollowupClick(event);
    firePress(event as unknown as MouseEvent<T>);
    setDirectPressGuard();
  }, [
    disabled,
    firePress,
    hasRecentDirectPress,
    onPress,
    preventFollowupClick,
    setDirectPressGuard,
  ]);

  const onPointerDown = useCallback((event: PointerEvent<T>) => {
    if (disabled || !onPress || !isPrimaryTouchPointer(event)) return;
    activePointerPressRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, [disabled, onPress]);

  const onPointerUp = useCallback((event: PointerEvent<T>) => {
    if (!isPrimaryTouchPointer(event)) return;
    const activePointerPress = activePointerPressRef.current;
    resetActivePointerPress();
    if (!activePointerPress || activePointerPress.pointerId !== event.pointerId) return;
    if (!isWithinTapSlop(activePointerPress.startX, activePointerPress.startY, event.clientX, event.clientY)) return;
    fireDirectPress(event);
  }, [fireDirectPress, resetActivePointerPress]);

  const onTouchEnd = useCallback((event: TouchEvent<T>) => {
    if (supportsPointerEvents()) return;
    fireDirectPress(event);
  }, [fireDirectPress]);

  const onClick = useCallback((event: MouseEvent<T>) => {
    if (hasRecentDirectPress()) {
      preventFollowupClick(event);
      resetDirectPressGuard();
      return;
    }
    if (disabled || !onPress) return;
    firePress(event);
  }, [
    disabled,
    firePress,
    hasRecentDirectPress,
    onPress,
    preventFollowupClick,
    resetDirectPressGuard,
  ]);

  const onPointerCancel = useCallback(() => {
    resetActivePointerPress();
    resetDirectPressGuard();
  }, [resetActivePointerPress, resetDirectPressGuard]);

  const onPointerLeave = useCallback(() => {
    resetActivePointerPress();
  }, [resetActivePointerPress]);

  const onTouchCancel = useCallback(() => {
    resetActivePointerPress();
    resetDirectPressGuard();
  }, [resetActivePointerPress, resetDirectPressGuard]);

  useEffect(() => {
    return () => {
      if (clearGuardTimerRef.current) {
        window.clearTimeout(clearGuardTimerRef.current);
        clearGuardTimerRef.current = null;
      }
    };
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onTouchEnd,
    onTouchCancel,
    onClick,
  } as const;
}
