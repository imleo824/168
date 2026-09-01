import { useEffect, useState } from 'react';
import { UI_USER_DESKTOP_MIN_WIDTH, getMinWidthMediaQuery } from '@/ui/layoutViewport';

function resolveIsDesktopViewport(breakpoint: number) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoint;
}

export function useIsDesktopViewport(breakpoint = UI_USER_DESKTOP_MIN_WIDTH) {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => resolveIsDesktopViewport(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(getMinWidthMediaQuery(breakpoint));
    const handleChange = () => setIsDesktopViewport(resolveIsDesktopViewport(breakpoint));

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener('resize', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, [breakpoint]);

  return isDesktopViewport;
}
