import { useState, useEffect } from 'react';
import { UI_USER_DESKTOP_MIN_WIDTH, getMaxWidthMediaQuery } from '@/ui/layoutViewport';

function isAdminRoute() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/168wc');
}

function resolveIsMobileForSurface(breakpoint: number) {
  if (typeof window === 'undefined') return true;
  if (!isAdminRoute()) return true;
  return window.innerWidth < breakpoint;
}

export function useIsMobile(breakpoint = UI_USER_DESKTOP_MIN_WIDTH) {
  const [isMobile, setIsMobile] = useState(() => resolveIsMobileForSurface(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(getMaxWidthMediaQuery(breakpoint - 1));
    const handleChange = () => setIsMobile(resolveIsMobileForSurface(breakpoint));

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener('popstate', handleChange);
    window.addEventListener('hashchange', handleChange);
    window.addEventListener('resize', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('popstate', handleChange);
      window.removeEventListener('hashchange', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, [breakpoint]);

  return isMobile;
}
