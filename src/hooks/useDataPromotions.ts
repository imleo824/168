import { useQuery } from '@tanstack/react-query';

import { getChatAds, getMyPromotions } from '@/services/api';

const LIST_GC_TIME = 1000 * 60 * 25;
const PROMOTION_STALE_TIME = 1000 * 15;

export function useMyPromotions(enabled: boolean = true) {
  return useQuery({
    queryKey: ['promotions', 'mine'],
    queryFn: getMyPromotions,
    enabled,
    staleTime: PROMOTION_STALE_TIME,
  });
}

export function useChatAds(enabled: boolean = true) {
  return useQuery({
    queryKey: ['promotions', 'chat-ads'],
    queryFn: ({ signal }) => getChatAds({ signal }),
    enabled,
    staleTime: PROMOTION_STALE_TIME,
    gcTime: LIST_GC_TIME,
    refetchOnWindowFocus: false,
  });
}
