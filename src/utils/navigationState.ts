import type { Location } from 'react-router-dom';

type RouteState = Record<string, unknown> | null | undefined;

function getReturnPath(location: Location) {
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
}

function shouldUseExplicitReturnOnly(location: Location) {
  // The profile page owns tab state, scroll restoration, and account actions. Detail
  // navigation from it should return to the profile route explicitly instead of
  // relying on browser history/back overlay semantics, which may point to the
  // previous top-level page such as the home feed.
  return location.pathname === '/profile';
}

export function getOverlayBackgroundLocation(location: Location) {
  return (location.state as RouteState)?.backgroundLocation || location;
}

export function withOverlayBackground(location: Location, state: Record<string, unknown> = {}) {
  return {
    ...state,
    backgroundLocation: getOverlayBackgroundLocation(location),
  };
}

export function withCurrentBackground(location: Location, state: Record<string, unknown> = {}) {
  const returnPath = getReturnPath(location);
  const nextState = {
    ...state,
    from: typeof state.from === 'string' && state.from.trim() ? state.from : returnPath,
    returnTo: typeof state.returnTo === 'string' && state.returnTo.trim() ? state.returnTo : returnPath,
  };

  if (shouldUseExplicitReturnOnly(location)) {
    return nextState;
  }

  return {
    ...nextState,
    // Keep the original base route behind overlay-to-overlay navigation. This
    // prevents hidden detail/user/category pages from becoming the next backing
    // page and piling up extra headers, scroll lanes, and render work.
    backgroundLocation: getOverlayBackgroundLocation(location),
  };
}
