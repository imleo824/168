import { useCallback } from 'react';
import { type ActionLockMode, useActionLock } from './useActionLock';

type InteractionAction<TArgs extends unknown[] = []> = (...args: TArgs) => void | Promise<void>;

type InteractionPolicy = 'instant' | 'optimistic' | 'critical';

type InteractionGuardOptions = {
  policy?: InteractionPolicy;
  cooldownMs?: number;
  minPendingMs?: number;
  mode?: ActionLockMode;
};

const POLICY_DEFAULTS: Record<InteractionPolicy, Required<Pick<InteractionGuardOptions, 'cooldownMs' | 'minPendingMs' | 'mode'>>> = {
  instant: {
    cooldownMs: 0,
    minPendingMs: 0,
    mode: 'replace',
  },
  optimistic: {
    cooldownMs: 120,
    minPendingMs: 0,
    mode: 'replace',
  },
  critical: {
    cooldownMs: 360,
    minPendingMs: 120,
    mode: 'drop',
  },
};

function resolveInteractionOptions(input?: number | InteractionGuardOptions) {
  if (typeof input === 'number') {
    return {
      policy: 'optimistic' as const,
      cooldownMs: input,
      minPendingMs: 0,
      mode: 'drop' as const,
    };
  }

  const policy = input?.policy || 'optimistic';
  const defaults = POLICY_DEFAULTS[policy];

  return {
    policy,
    cooldownMs: input?.cooldownMs ?? defaults.cooldownMs,
    minPendingMs: input?.minPendingMs ?? defaults.minPendingMs,
    mode: input?.mode ?? defaults.mode,
  };
}

/**
 * Action guard with explicit interaction policies.
 * Use instant for navigation/sheets/tabs, optimistic for local feedback actions, and critical for writes/payments.
 */
export function useInteractionGuard<TArgs extends unknown[] = []>(
  action: InteractionAction<TArgs>,
  options?: number | InteractionGuardOptions,
) {
  const resolvedOptions = resolveInteractionOptions(options);
  const lock = useActionLock<TArgs, void>(action, {
    cooldownMs: resolvedOptions.cooldownMs,
    minPendingMs: resolvedOptions.minPendingMs,
    mode: resolvedOptions.mode,
    onError: (error) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('[useInteractionGuard] 交互动作执行失败', error);
    },
  });

  const { run, reset, lockedRef, isPending } = lock;
  const guarded = useCallback((...args: TArgs) => run(...args), [run]);
  const release = useCallback(() => reset(), [reset]);

  return {
    guarded,
    release,
    inFlightRef: lockedRef,
    isPending,
  } as const;
}
