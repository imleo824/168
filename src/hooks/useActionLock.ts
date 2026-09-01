import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type ActionLockMode = 'drop' | 'replace';

export type ActionLockOptions = {
  /** Prevent repeated triggers during this cooldown window after an action settles. */
  cooldownMs?: number;
  /** Keep pending UI visible for at least this long to avoid flicker. */
  minPendingMs?: number;
  /**
   * drop: ignore new calls while locked. Use only for critical write/payment flows.
   * replace: allow the latest call to become the owner. Use for navigation, sheets, tabs and other lightweight UI actions.
   */
  mode?: ActionLockMode;
  onError?: (error: unknown) => void;
};

type ActionResult<T> = T extends Promise<infer R> ? R : T;

type AsyncOrSyncAction<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult | Promise<TResult>;

const DEFAULT_COOLDOWN_MS = 80;
const DEFAULT_MIN_PENDING_MS = 0;

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return Boolean(value && (typeof value === 'object' || typeof value === 'function') && typeof (value as PromiseLike<T>).then === 'function');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function wait(ms: number) {
  return ms > 0 ? new Promise((resolve) => window.setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * useActionLock centralizes click/request locking for UI actions.
 * It prevents duplicated critical taps, keeps loading states stable, and guarantees that
 * only the latest action can release the visible pending state in replace mode.
 */
export function useActionLock<TArgs extends unknown[], TResult>(
  action: AsyncOrSyncAction<TArgs, TResult>,
  options: ActionLockOptions = {},
) {
  const {
    cooldownMs = DEFAULT_COOLDOWN_MS,
    minPendingMs = DEFAULT_MIN_PENDING_MS,
    mode = 'drop',
    onError,
  } = options;

  const actionRef = useRef(action);
  const onErrorRef = useRef(onError);
  const lockedRef = useRef(false);
  const callIdRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [isPending, setIsPending] = useState(false);

  actionRef.current = action;
  onErrorRef.current = onError;

  const clearCooldown = useCallback(() => {
    if (!cooldownTimerRef.current) return;
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = null;
  }, []);

  const unlock = useCallback((callId: number) => {
    if (mode === 'replace' && callId !== callIdRef.current) return;

    clearCooldown();

    const release = () => {
      if (mode === 'replace' && callId !== callIdRef.current) return;
      lockedRef.current = false;
      cooldownTimerRef.current = null;
      if (mountedRef.current) setIsPending(false);
    };

    if (cooldownMs <= 0) {
      release();
      return;
    }

    cooldownTimerRef.current = setTimeout(release, cooldownMs);
  }, [clearCooldown, cooldownMs, mode]);

  const run = useCallback((...args: TArgs): Promise<ActionResult<TResult> | undefined> => {
    if (lockedRef.current && mode === 'drop') {
      return Promise.resolve(undefined);
    }

    lockedRef.current = true;
    const callId = callIdRef.current + 1;
    callIdRef.current = callId;
    clearCooldown();
    if (mountedRef.current) setIsPending(true);

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const settle = async () => {
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      await wait(Math.max(0, minPendingMs - elapsed));
      unlock(callId);
    };

    try {
      const result = actionRef.current(...args);
      if (isPromiseLike<ActionResult<TResult>>(result)) {
        return Promise.resolve(result)
          .catch((error): undefined => {
            if (!isAbortError(error)) {
              onErrorRef.current?.(error);
              if (!onErrorRef.current) console.error('[useActionLock] action failed', error);
            }
            return undefined;
          })
          .finally(settle) as Promise<ActionResult<TResult> | undefined>;
      }

      return Promise.resolve(result as ActionResult<TResult>).finally(settle);
    } catch (error) {
      if (!isAbortError(error)) {
        onErrorRef.current?.(error);
        if (!onErrorRef.current) console.error('[useActionLock] action failed', error);
      }
      return Promise.resolve(undefined).finally(settle);
    }
  }, [clearCooldown, minPendingMs, mode, unlock]);

  const reset = useCallback(() => {
    clearCooldown();
    lockedRef.current = false;
    callIdRef.current += 1;
    if (mountedRef.current) setIsPending(false);
  }, [clearCooldown]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearCooldown();
      lockedRef.current = false;
    };
  }, [clearCooldown]);

  return useMemo(
    () => ({
      run,
      reset,
      isPending,
      lockedRef,
    }) as const,
    [isPending, reset, run],
  );
}
