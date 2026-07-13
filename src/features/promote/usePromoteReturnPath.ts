import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

import { PROMOTE_RETURN_PATH_KEY, normalizePath } from './promoteBookingUtils';

type UsePromoteReturnPathArgs = {
  from: unknown;
  navigate: NavigateFunction;
  routePath: string;
  stateReturnPath: unknown;
};

export function usePromoteReturnPath({
  from,
  navigate,
  routePath,
  stateReturnPath,
}: UsePromoteReturnPathArgs) {
  const [returnPath, setReturnPath] = useState('/profile');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let nextReturnPath = normalizePath(stateReturnPath);
    const hasHistory = typeof window.history.state?.idx === 'number' && window.history.state.idx > 0;

    try {
      const storedReturnPath = normalizePath(window.sessionStorage.getItem(PROMOTE_RETURN_PATH_KEY));

      if (!nextReturnPath || nextReturnPath === routePath) {
        if (hasHistory && storedReturnPath && storedReturnPath !== routePath) {
          nextReturnPath = storedReturnPath;
        }
      }

      if (!nextReturnPath || nextReturnPath === routePath) {
        nextReturnPath = hasHistory ? '' : '/profile';
      }

      setReturnPath(nextReturnPath);

      if (!nextReturnPath) {
        window.sessionStorage.removeItem(PROMOTE_RETURN_PATH_KEY);
      } else {
        window.sessionStorage.setItem(PROMOTE_RETURN_PATH_KEY, nextReturnPath);
      }
    } catch {
      if (!nextReturnPath) {
        nextReturnPath = hasHistory ? '' : '/profile';
      }

      setReturnPath(nextReturnPath);
    }
  }, [routePath, stateReturnPath]);

  const handleBack = useCallback(() => {
    const normalizedFrom = normalizePath(from);
    const normalizedReturnPath = returnPath && returnPath !== routePath ? returnPath : '';
    const historyIdx = typeof window.history.state?.idx === 'number' ? window.history.state.idx : -1;

    window.sessionStorage.removeItem(PROMOTE_RETURN_PATH_KEY);

    if (normalizedReturnPath && normalizedReturnPath !== routePath) {
      navigate(normalizedReturnPath, { replace: true });
      return;
    }

    if (normalizedFrom && normalizedFrom !== routePath) {
      navigate(normalizedFrom, { replace: true });
      return;
    }

    if (historyIdx > 0) {
      navigate(-1);
      return;
    }

    navigate('/profile', { replace: true });
  }, [from, navigate, returnPath, routePath]);

  return {
    handleBack,
    returnPath,
  };
}
