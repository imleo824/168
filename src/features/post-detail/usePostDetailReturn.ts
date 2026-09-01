import { useCallback } from 'react';
import type { Location, NavigateFunction } from 'react-router-dom';

import { APP_ROUTES } from '@/app/routePaths';
import {
  getHistoryIndex,
  getRouteState,
  parseReturnPath,
  type ReturnTarget,
} from './postDetailLegacyUtils';

const DETAIL_BACK_FALLBACK_MS = 260;

export function usePostDetailReturn(location: Location, navigate: NavigateFunction) {
  const getReturnTarget = useCallback((): ReturnTarget | null => {
    const state = getRouteState(location.state);
    const fromTarget = parseReturnPath(state?.from);
    if (fromTarget) return fromTarget;

    const returnToTarget = parseReturnPath(state?.returnTo);
    if (returnToTarget) return returnToTarget;

    if (state?.backgroundLocation?.pathname) {
      return {
        pathname: state.backgroundLocation.pathname,
        search: state.backgroundLocation.search || '',
        hash: state.backgroundLocation.hash || '',
        state: state.backgroundLocation.state || undefined,
      };
    }

    return null;
  }, [location.state]);

  const handleBack = useCallback(() => {
    const target = getReturnTarget();
    const state = getRouteState(location.state);
    const cameFromOverlay = Boolean(state?.backgroundLocation?.pathname);
    const historyIdx = getHistoryIndex();
    const currentHref = `${location.pathname}${location.search}${location.hash}`;
    const navigateToTarget = (replace = true) => {
      if (!target) {
        navigate(APP_ROUTES.home, { replace: true });
        return;
      }

      navigate(
        {
          pathname: target.pathname,
          search: target.search || '',
          hash: target.hash || '',
        },
        {
          replace,
          state: target.state as { from?: string } | undefined,
        },
      );
    };

    if (target) {
      if (cameFromOverlay && historyIdx > 0) {
        navigate(-1);
        window.setTimeout(() => {
          const nextHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (nextHref === currentHref) navigateToTarget(true);
        }, DETAIL_BACK_FALLBACK_MS);
        return;
      }

      navigateToTarget(true);
      return;
    }

    if (historyIdx > 0) {
      navigate(-1);
      window.setTimeout(() => {
        const nextHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (nextHref === currentHref) navigate(APP_ROUTES.home, { replace: true });
      }, DETAIL_BACK_FALLBACK_MS);
      return;
    }

    navigate(APP_ROUTES.home, { replace: true });
  }, [getReturnTarget, location.state, navigate]);

  return {
    getReturnTarget,
    handleBack,
  };
}
