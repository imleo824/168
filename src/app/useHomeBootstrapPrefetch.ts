import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getHomeBootstrap } from '@/services/homeStartupApi';

const REFERENCE_DATA_STALE_TIME = 1000 * 60 * 2;

export function useHomeBootstrapPrefetch(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    void queryClient.prefetchQuery({
      queryKey: ['home', 'bootstrap'],
      queryFn: () => getHomeBootstrap(),
      staleTime: REFERENCE_DATA_STALE_TIME,
    }).catch((): void => undefined);

    if (typeof window !== 'undefined') {
      const requestIdle = (window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }).requestIdleCallback;

      const warmFeedList = () => {
        void import('@/features/feed/PostFeedList').catch((): void => undefined);
      };

      if (typeof requestIdle === 'function') {
        requestIdle(warmFeedList, { timeout: 800 });
      } else {
        setTimeout(warmFeedList, 200);
      }
    }
  }, [enabled, queryClient]);
}
