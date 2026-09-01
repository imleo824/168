/**
 * useHomeRefresh - 统一管理首页手动刷新逻辑
 * 处理刷新状态、防止重复刷新、最小刷新间隔、刷新意图与服务端缓存绕过。
 */
import { useCallback, useRef, type MutableRefObject } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getHomeFeedPage } from '@/services/homeStartupApi';
import type { HomeFeedKind, MainTabId, RefreshState, RefreshUiSource } from '@/features/home/homeTypes';
import type { CategoryMetaFeedFilters } from '@/types';

const FEED_PAGE_SIZE = 30;
const MIN_MANUAL_REFRESH_MS = 420;
const MANUAL_REFRESH_COOLDOWN_MS = 760;

type FeedPage = {
  items: any[];
  nextCursor: string | null;
  hasMore: boolean;
};

interface UseHomeRefreshOptions {
  activeMainTab: MainTabId;
  activeHomeFeedKind: HomeFeedKind;
  activeHomeCategorySlug?: string;
  activeCategoryMetaScope?: string;
  activeCategoryMetaFilters?: CategoryMetaFeedFilters;
  activeFeedIdentity: string;
  activeFeedIdentityRef: MutableRefObject<string>;
  activeQueryKey: QueryKey;
  queryClient: any;
  markFeedSeen: (mainTab: MainTabId) => void;
  onRefreshStateChange?: (identity: string, state: RefreshState, source?: RefreshUiSource | null) => void;
}

interface UseHomeRefreshResult {
  runManualRefresh: (options?: {
    source?: RefreshUiSource;
    mainTab?: MainTabId;
    subTab?: string | null;
  }) => Promise<void>;
}

function normalizeRefreshIntent(source?: RefreshUiSource | null) {
  if (source === 'pull' || source === 'tab') return source;
  return 'manual';
}

export function useHomeRefresh({
  activeMainTab,
  activeHomeFeedKind,
  activeHomeCategorySlug = '',
  activeCategoryMetaScope = '',
  activeCategoryMetaFilters,
  activeFeedIdentity,
  activeFeedIdentityRef,
  activeQueryKey,
  queryClient,
  markFeedSeen,
  onRefreshStateChange,
}: UseHomeRefreshOptions): UseHomeRefreshResult {
  const { showToast } = useAuth();
  const manualRefreshInFlightRef = useRef<Map<string, Promise<void>>>(
    new Map()
  );
  const lastManualRefreshAtRef = useRef<Map<string, number>>(new Map());

  const fetchFirstPageForFeed = useCallback(
    (
      mainTab: MainTabId,
      refreshIntent: 'manual' | 'pull' | 'tab' = 'manual',
    ): Promise<FeedPage> => {
      const requestOptions = { refreshIntent, bypassServerCache: true } as const;

      return getHomeFeedPage({
        feed: mainTab === 'following' ? 'following' : activeHomeFeedKind,
        categorySlug: activeHomeFeedKind === 'category' ? activeHomeCategorySlug : '',
        categoryMetaScope: activeCategoryMetaScope,
        categoryMetaFilters: activeCategoryMetaFilters,
        limit: FEED_PAGE_SIZE,
      }, requestOptions);
    },
    [activeCategoryMetaFilters, activeCategoryMetaScope, activeHomeCategorySlug, activeHomeFeedKind]
  );

  const replaceFeedFirstPage = useCallback(
    (queryKey: QueryKey, page: FeedPage) => {
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...(old ?? {}),
        pages: [page],
        pageParams: [undefined],
      }));
    },
    [queryClient]
  );

  const runManualRefresh = useCallback(
    async (_options?: {
      source?: RefreshUiSource;
      mainTab?: MainTabId;
      subTab?: string | null;
    }) => {
      const targetIdentity = activeFeedIdentity;
      const existing = manualRefreshInFlightRef.current.get(targetIdentity);
      if (existing) return existing;

      const now = performance.now();
      const lastRefreshAt =
        lastManualRefreshAtRef.current.get(targetIdentity) ?? 0;
      if (now - lastRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) {
        if (activeFeedIdentityRef.current === targetIdentity) {
          onRefreshStateChange?.(targetIdentity, 'idle');
        }
        return;
      }
      lastManualRefreshAtRef.current.set(targetIdentity, now);

      const task = (async () => {
        try {
          const refreshIntent = normalizeRefreshIntent(_options?.source);

          if (activeFeedIdentityRef.current === targetIdentity) {
            onRefreshStateChange?.(targetIdentity, 'refreshing', _options?.source ?? 'action');
          }

          const startedAt = performance.now();
          await queryClient.cancelQueries({ queryKey: activeQueryKey });
          const page = await fetchFirstPageForFeed(
            activeMainTab,
            refreshIntent,
          );
          replaceFeedFirstPage(activeQueryKey, page);
          markFeedSeen(activeMainTab);

          const elapsed = performance.now() - startedAt;
          const delay = Math.max(0, MIN_MANUAL_REFRESH_MS - elapsed);
          if (delay > 0) await new Promise((res) => window.setTimeout(res, delay));

          if (activeFeedIdentityRef.current === targetIdentity) {
            onRefreshStateChange?.(targetIdentity, 'success');
          }
        } catch (error) {
          if (activeFeedIdentityRef.current === targetIdentity) {
            onRefreshStateChange?.(targetIdentity, 'error');
            showToast('刷新失败，请稍后重试', 'error');
          }
        } finally {
          manualRefreshInFlightRef.current.delete(targetIdentity);
        }
      })();

      manualRefreshInFlightRef.current.set(targetIdentity, task);
      return task;
    },
    [
      activeFeedIdentity,
      activeFeedIdentityRef,
      activeMainTab,
      activeHomeCategorySlug,
      activeQueryKey,
      fetchFirstPageForFeed,
      markFeedSeen,
      queryClient,
      replaceFeedFirstPage,
      showToast,
      onRefreshStateChange,
    ]
  );

  return { runManualRefresh };
}
