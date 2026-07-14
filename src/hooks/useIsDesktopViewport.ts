import { useEffect, useState } from 'react';

function resolveIsDesktopViewport(breakpoint: number) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= breakpoint;
}

export function useIsDesktopViewport(breakpoint = 1024) {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => resolveIsDesktopViewport(breakpoint));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(`(min-width: ${breakpoint}px)`);
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
