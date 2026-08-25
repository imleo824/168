import { useCallback, useEffect, useRef, useState } from 'react';

type AsyncFlowTaskContext = {
  signal: AbortSignal;
  isActive: () => boolean;
};

type AsyncFlowTask<TArgs extends unknown[] = []> = (
  context: AsyncFlowTaskContext,
  ...args: TArgs
) => Promise<unknown> | unknown;

interface UseAsyncFlowOptions {
  cooldownMs?: number;
  minBusyMs?: number;
  onError?: (error: unknown) => void;
}

const DEFAULT_COOLDOWN_MS = 160;
const DEFAULT_MIN_BUSY_MS = 120;

function wait(ms: number) {
  return ms > 0 ? new Promise((resolve) => window.setTimeout(resolve, ms)) : Promise.resolve();
}

export function useAsyncFlow<TArgs extends unknown[] = []>(
  task: AsyncFlowTask<TArgs>,
  { cooldownMs = DEFAULT_COOLDOWN_MS, minBusyMs = DEFAULT_MIN_BUSY_MS, onError }: UseAsyncFlowOptions = {},
): {
  isBusy: boolean;
  isActive: () => boolean;
  run: (...args: TArgs) => Promise<unknown | undefined>;
  abort: () => void;
} {
  const taskRef = useRef(task);
  const mountedRef = useRef(true);
  const latestRunIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const isActive = useCallback((runId?: number) => {
    if (!mountedRef.current) return false;

    const checkRunId = runId ?? latestRunIdRef.current;
    const currentController = abortControllerRef.current;

    if (!currentController || checkRunId !== latestRunIdRef.current) return false;

    return !currentController.signal.aborted;
  }, []);

  const clearCooldown = useCallback(() => {
    if (cooldownTimerRef.current) {
      window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const beginCooldown = useCallback(() => {
    clearCooldown();

    if (cooldownMs <= 0) {
      cooldownRef.current = false;
      return;
    }

    cooldownRef.current = true;
    cooldownTimerRef.current = window.setTimeout(() => {
      cooldownRef.current = false;
      cooldownTimerRef.current = null;
    }, cooldownMs);
  }, [clearCooldown, cooldownMs]);

  const finalize = useCallback(async (runId: number) => {
    if (runId !== latestRunIdRef.current || !mountedRef.current) return;

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAtRef.current;
    await wait(Math.max(0, minBusyMs - elapsed));

    if (runId !== latestRunIdRef.current || !mountedRef.current) return;

    inFlightRef.current = false;
    abortControllerRef.current = null;

    setIsBusy(false);
    beginCooldown();
  }, [beginCooldown, minBusyMs]);

  const abort = useCallback(() => {
    clearCooldown();
    abortControllerRef.current?.abort();
    cooldownRef.current = false;

    if (inFlightRef.current) {
      inFlightRef.current = false;
      abortControllerRef.current = null;
      setIsBusy(false);
    }
  }, [clearCooldown]);

  const reportError = useCallback((error: unknown) => {
    if (onError) {
      onError(error);
      return;
    }

    console.error('[useAsyncFlow] 任务执行失败', error);
  }, [onError]);

  const run = useCallback(async (...args: TArgs) => {
    if (!mountedRef.current || inFlightRef.current || cooldownRef.current) return undefined;

    const runId = latestRunIdRef.current + 1;
    latestRunIdRef.current = runId;
    inFlightRef.current = true;
    startedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

    setIsBusy(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const context: AsyncFlowTaskContext = {
      signal: abortController.signal,
      isActive: () => isActive(runId),
    };

    try {
      return await taskRef.current(context, ...args);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return undefined;
      }

      reportError(error);
      return undefined;
    } finally {
      void finalize(runId);
    }
  }, [finalize, isActive, reportError, taskRef]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abort();
    };
  }, [abort]);

  return {
    isBusy,
    isActive: () => isActive(),
    run,
    abort,
  };
}
