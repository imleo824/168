import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/services/api';
import {
  readHomeBootstrapSnapshot,
  stabilizeHomeBootstrapReferenceData,
  writeHomeBootstrapSnapshot,
} from '@/features/home/homeBootstrapSnapshotCache';

import { usePageVisibility } from './usePageVisibility';

const CONFIG_STALE_TIME = 1000 * 60 * 10;
const CATEGORY_STALE_TIME = 1000 * 60 * 5;
const CATEGORY_REFRESH_INTERVAL = 1000 * 60 * 5;
const LIST_GC_TIME = 1000 * 60 * 25;
const HOME_BOOTSTRAP_STALE_TIME = 1000 * 60;

function isHomeShellPath() {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/';
}

export function useConfig(
  enabled: boolean = true,
  options: { alwaysFresh?: boolean } = {},
) {
  const bootstrapSnapshot = useMemo(() => readHomeBootstrapSnapshot(), []);
  return useQuery({
    queryKey: ['config'],
    queryFn: api.getConfigs,
    staleTime: options.alwaysFresh ? 0 : CONFIG_STALE_TIME,
    gcTime: LIST_GC_TIME,
    initialData: options.alwaysFresh ? undefined : bootstrapSnapshot?.data?.config,
    initialDataUpdatedAt: options.alwaysFresh ? undefined : bootstrapSnapshot?.updatedAt,
    enabled: enabled && !isHomeShellPath(),
    refetchOnMount: options.alwaysFresh ? 'always' : false,
    refetchOnWindowFocus: options.alwaysFresh,
    refetchOnReconnect: options.alwaysFresh,
  });
}

export function useCategories() {
  const isVisible = usePageVisibility();

  return useQuery({
    queryKey: ['categories'],
    queryFn: api.getCategories,
    staleTime: CATEGORY_STALE_TIME,
    gcTime: 1000 * 60 * 10,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: isVisible ? CATEGORY_REFRESH_INTERVAL : false,
    refetchIntervalInBackground: false,
  });
}

export function useHomeBootstrap() {
  const queryClient = useQueryClient();
  const bootstrapSnapshot = useMemo(() => readHomeBootstrapSnapshot(), []);
  const query = useQuery({
    queryKey: ['home', 'bootstrap'],
    queryFn: api.getHomeBootstrap,
    staleTime: HOME_BOOTSTRAP_STALE_TIME,
    gcTime: LIST_GC_TIME,
    initialData: bootstrapSnapshot?.data,
    initialDataUpdatedAt: bootstrapSnapshot?.updatedAt,
    enabled: true,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const stableData = stabilizeHomeBootstrapReferenceData(data);
    if (!stableData) return;
    if (data.categories.length === 0 && stableData.categories.length > 0) {
      queryClient.setQueryData(['home', 'bootstrap'], stableData);
    }
    queryClient.setQueryData(['config'], stableData.config);
    queryClient.setQueryData(['categories'], stableData.categories);
    queryClient.setQueryData(['promotions', 'home-ads'], stableData.homeAds);
    writeHomeBootstrapSnapshot(stableData);
  }, [query.data, queryClient]);

  return query;
}
