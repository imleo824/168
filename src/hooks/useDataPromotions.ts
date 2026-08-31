import { useQuery } from '@tanstack/react-query';

import { getMyPromotions } from '@/services/api';

const PROMOTION_STALE_TIME = 1000 * 15;

export function useMyPromotions(enabled: boolean = true) {
  return useQuery({
    queryKey: ['promotions', 'mine'],
    queryFn: getMyPromotions,
    enabled,
    staleTime: PROMOTION_STALE_TIME,
  });
}
