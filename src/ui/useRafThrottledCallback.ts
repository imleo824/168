import { useCallback, useEffect, useRef } from 'react';

/** Coalesces high-frequency visual events into one frame without stale callbacks. */
export function useRafThrottledCallback<T extends unknown[]>(callback: (...args: T) => void) {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number | null>(null);
  const argsRef = useRef<T | null>(null);

  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    argsRef.current = null;
  }, []);

  const schedule = useCallback((...args: T) => {
    argsRef.current = args;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const scheduledArgs = argsRef.current;
      argsRef.current = null;
      if (scheduledArgs) callbackRef.current(...scheduledArgs);
    });
  }, []);

  useEffect(() => cancel, [cancel]);
  return schedule;
}
