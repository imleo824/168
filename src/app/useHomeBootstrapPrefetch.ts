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
    }).catch(() => undefined);
  }, [enabled, queryClient]);
}
