import type { QueryClient } from '@tanstack/react-query';
import * as api from '@/services/api';
import type { HomeBootstrap, PromotionBooking } from '@/types';
import { PromotionType } from '@/types';
import { clearHomeFeedSnapshots } from '@/features/home/homeFeedSnapshotCache';
import { writeHomeBootstrapSnapshot } from '@/features/home/homeBootstrapSnapshotCache';

function writeHomeAdsToBootstrap(queryClient: QueryClient, homeAds: PromotionBooking[]) {
  queryClient.setQueryData<HomeBootstrap | undefined>(['home', 'bootstrap'], (current) => {
    if (!current) return current;
    const next = { ...current, homeAds };
    writeHomeBootstrapSnapshot(next);
    return next;
  });
}

export async function refreshHomeAdsNow(queryClient: QueryClient) {
  const homeAds = await api.getHomeAds({ cache: 'no-store' });
  queryClient.setQueryData(['promotions', 'home-ads'], homeAds);
  writeHomeAdsToBootstrap(queryClient, homeAds);
  return homeAds;
}

export async function syncPromotionVisibilityAfterBooking(
  queryClient: QueryClient,
  _type?: PromotionType | string,
) {
  const tasks: Array<Promise<unknown>> = [];

  clearHomeFeedSnapshots();
  tasks.push(queryClient.invalidateQueries({ queryKey: ['promotions'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['transactions'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['user-profile'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['home'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['home', 'bootstrap'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['promotions', 'home-ads'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['posts'] }));
  tasks.push(queryClient.invalidateQueries({ queryKey: ['posts', 'home-feed'] }));
  tasks.push(refreshHomeAdsNow(queryClient).catch(() => []));
  tasks.push(queryClient.refetchQueries({ queryKey: ['posts'], type: 'active' }));
  tasks.push(queryClient.refetchQueries({ queryKey: ['posts', 'home-feed'], type: 'active' }));

  return Promise.all(tasks);
}
