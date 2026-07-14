import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

import { HomeChrome } from '@/features/home/HomeChrome';
import { HomeFeedContent } from '@/features/home/HomeFeedContent';
import { HomeSeo } from '@/features/home/HomeSeo';
import {
  getHomeTopicTab,
  getHomeTopicCategoryRef,
  getHomeTopicFeedKind,
  DEFAULT_HOME_TOPIC_TAB_ID,
  normalizeHomeTopicTabId,
  readHomeTopicFilterState,
  readHomeTopicTabId,
  shouldShowHomeTopicFilters,
  writeHomeTopicFilterState,
  writeHomeTopicTabId,
  type HomeTopicTabId,
} from '@/features/home/HomeTopicTabs';
import {
  buildHomeStructuredFilterFieldItems,
  countCategoryMetaFeedFilters,
  findHomeStructuredFilterSchema,
  getHomeStructuredFilterScope,
  sanitizeHomeStructuredFilters,
} from '@/features/home/HomeStructuredFilterSheet';
import { getHomeShellClassName } from '@/features/home/homeLayout';
import { useOnlinePresence } from '@/features/home/OnlinePresenceContext';
import {
  useHomeBootstrap,
  useHomeNotificationSummary,
} from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useFeedExposureViews } from '@/hooks/useFeedExposureViews';
import { useListReturnScroll } from '@/utils/listReturnScroll';
import { getActiveScrollIntent, hasBlockingScrollIntent, runWithScrollIntent } from '@/utils/scrollIntent';
import { registerHomeFeedScrollRoot, scrollHomeFeedToTop } from '@/features/home/homeStorage';
import type { Category, CategoryMetaFeedFilters } from '@/types';
import type { RefreshState, RefreshUiSource } from '@/features/home/homeTypes';

import {
  useHomeFeedQueries,
  useHomeInteractionCoordinator,
  useHomeRefresh,
} from '@/hooks/home';
import {
  findCategoryMetaSchema,
  normalizePublishCategorySchema,
} from '@/features/post-create/postCreateCategoryMeta';

const LOAD_MORE_WATCHDOG_MS = 12_000;
const HOME_CHROME_COLLAPSE_ENTER_PX = 72;
const HOME_CHROME_COLLAPSE_EXIT_PX = 24;
const HOME_CHROME_PROGRAMMATIC_SETTLE_MS = 160;
const HOME_CHROME_SHORT_FEED_MAX_ITEMS = 1;
const EMPTY_CATEGORY_META_FILTERS: CategoryMetaFeedFilters = {};

function hasResolvedFeedPage(data: unknown) {
  const pages = (data as { pages?: unknown[] } | undefined)?.pages;
  return Array.isArray(pages) && pages.length > 0;
}

function getStableHomeCategories(categories: Category[], stableRef: React.MutableRefObject<Category[]>) {
  if (categories.length > 0) {
    stableRef.current = categories;
    return categories;
  }
  return stableRef.current;
}

function getHomeFeedErrorMessage(error: unknown) {
  if (!error) return '';
  const message = error instanceof Error ? error.message : String(error || '');
  const normalizedMessage = message.replace(/^Error:\s*/i, '').trim();

  if (
    /DATABASE_URL|Prisma|P10\d{2}|P20\d{2}|database|schema|connection pool|ECONNREFUSED|connect timeout/i.test(
      normalizedMessage,
    )
  ) {
    return '系统服务暂时不可用，请稍后重试。';
  }

  return normalizedMessage;
}

export default function Home() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, requireAuth, loading: isAuthLoading } = useAuth();
  const listReturnScope = `${location.pathname}${location.search}`;

  const [isHomeChromeCollapsed, setIsHomeChromeCollapsed] = useState(false);
  const [activeHomeTopicTabId, setActiveHomeTopicTabId] = useState<HomeTopicTabId>(readHomeTopicTabId);
  const [homeTopicFilters, setHomeTopicFilters] = useState(readHomeTopicFilterState);
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const [refreshUiSource, setRefreshUiSource] = useState<RefreshUiSource | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const homeChromeRafRef = useRef<number | null>(null);
  const homeChromeSettleTimerRef = useRef<number | null>(null);
  const homeFeedScrollRootRef = useRef<HTMLDivElement | null>(null);
  const pendingHomeFeedScrollTopRef = useRef(0);
  const hasMountedFeedIdentityRef = useRef(false);
  const shortFeedChromeLockRef = useRef(false);
  const resolvedFeedIdentitiesRef = useRef(new Set<string>());
  const activeFeedIdentityRef = useRef('discover:all');
  const stableHomeCategoriesRef = useRef<Category[]>([]);

  const { data: homeBootstrap } = useHomeBootstrap();
  const { onlineCount } = useOnlinePresence();
  const rawCategories = homeBootstrap?.categories || [];
  const categories = getStableHomeCategories(rawCategories, stableHomeCategoriesRef);
  const config = homeBootstrap?.config;
  const homeAds = homeBootstrap?.homeAds || [];
  const { markFeedSeen } = useHomeNotificationSummary(Boolean(user?.id));
  const publishCategorySchemas = useMemo(
    () => normalizePublishCategorySchema(config?.publish_category_schema),
    [config?.publish_category_schema],
  );
  const shouldUseStructuredCategoryOrder = publishCategorySchemas.length > 0;
  const homeTopicCategories = useMemo(() => {
    const orderedCategories = [...categories].sort((left, right) => (left.order || 0) - (right.order || 0));
    if (!shouldUseStructuredCategoryOrder) return orderedCategories;

    const structuredCategories = orderedCategories
      .map((category) => ({
        category,
        schema: findCategoryMetaSchema(category.id, publishCategorySchemas, orderedCategories),
      }))
      .filter((item) => Boolean(item.schema))
      .sort((left, right) => {
        const leftIndex = left.schema ? publishCategorySchemas.indexOf(left.schema) : Number.MAX_SAFE_INTEGER;
        const rightIndex = right.schema ? publishCategorySchemas.indexOf(right.schema) : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      })
      .map((item) => item.category);

    return structuredCategories.length > 0 ? structuredCategories : orderedCategories;
  }, [categories, publishCategorySchemas, shouldUseStructuredCategoryOrder]);

  const activeHomeTopicTab = useMemo(
    () => getHomeTopicTab(activeHomeTopicTabId, homeTopicCategories),
    [activeHomeTopicTabId, homeTopicCategories],
  );
  const activeMainTab = activeHomeTopicTab.mainTab;
  const activeHomeFeedKind = getHomeTopicFeedKind(activeHomeTopicTabId, homeTopicCategories);
  const activeHomeTopicShowsFilters = shouldShowHomeTopicFilters(activeHomeTopicTabId, homeTopicCategories);
  const activeHomeTopicFilterSchema = useMemo(
    () => findHomeStructuredFilterSchema(activeHomeTopicTabId, publishCategorySchemas, homeTopicCategories),
    [activeHomeTopicTabId, homeTopicCategories, publishCategorySchemas],
  );
  const activeHomeTopicCategoryMetaFilters = useMemo<CategoryMetaFeedFilters>(
    () => sanitizeHomeStructuredFilters(
      activeHomeTopicFilterSchema,
      homeTopicFilters[activeHomeTopicTabId]?.categoryMetaFilters || EMPTY_CATEGORY_META_FILTERS,
    ),
    [activeHomeTopicFilterSchema, activeHomeTopicTabId, homeTopicFilters],
  );
  const rawHomeTopicFilterCount = useMemo(
    () => countCategoryMetaFeedFilters(activeHomeTopicCategoryMetaFilters),
    [activeHomeTopicCategoryMetaFilters],
  );
  const activeHomeTopicFilterCount = activeHomeTopicFilterSchema ? rawHomeTopicFilterCount : 0;
  const activeHomeTopicFilterFieldItems = useMemo(
    () => buildHomeStructuredFilterFieldItems(activeHomeTopicFilterSchema, activeHomeTopicCategoryMetaFilters),
    [activeHomeTopicCategoryMetaFilters, activeHomeTopicFilterSchema],
  );
  const activeHomeTopicCategoryMetaScope = activeHomeTopicFilterCount > 0
    ? getHomeStructuredFilterScope(activeHomeTopicFilterSchema, activeHomeTopicTabId)
    : '';
  const activeCategoryMetaFiltersForQuery = activeHomeTopicFilterCount > 0
    ? activeHomeTopicCategoryMetaFilters
    : undefined;
  const activeCategoryMetaFilterIdentity = useMemo(
    () => activeHomeTopicFilterCount > 0 ? JSON.stringify(activeHomeTopicCategoryMetaFilters) : 'all',
    [activeHomeTopicCategoryMetaFilters, activeHomeTopicFilterCount],
  );
  const activeHomeCategorySlug = useMemo(
    () => activeHomeFeedKind === 'category'
      ? getHomeTopicCategoryRef(activeHomeTopicTabId, homeTopicCategories)
      : '',
    [activeHomeFeedKind, activeHomeTopicTabId, homeTopicCategories],
  );
  const isFeedIdentityReady = activeMainTab !== 'following' || Boolean(user?.id);
  const activeFeedIdentity = [
    activeHomeFeedKind,
    activeHomeTopicTabId,
    activeHomeCategorySlug || 'all',
    activeCategoryMetaFilterIdentity,
  ].join(':');

  useEffect(() => {
    registerHomeFeedScrollRoot(homeFeedScrollRootRef.current);
    return () => registerHomeFeedScrollRoot(null);
  }, [activeFeedIdentity]);

  useEffect(() => {
    if (!isFeedIdentityReady) return;
    markFeedSeen(activeMainTab);
  }, [activeMainTab, isFeedIdentityReady, markFeedSeen]);

  useEffect(() => {
    if (homeTopicCategories.length === 0) return;
    const normalizedTabId = normalizeHomeTopicTabId(activeHomeTopicTabId, homeTopicCategories);
    if (normalizedTabId === activeHomeTopicTabId) return;
    setActiveHomeTopicTabId(normalizedTabId);
    writeHomeTopicTabId(normalizedTabId);
  }, [activeHomeTopicTabId, homeTopicCategories]);

  useEffect(() => {
    if (isAuthLoading || user?.id || activeHomeTopicTabId !== 'following') return;
    setActiveHomeTopicTabId(DEFAULT_HOME_TOPIC_TAB_ID);
    writeHomeTopicTabId(DEFAULT_HOME_TOPIC_TAB_ID);
  }, [activeHomeTopicTabId, isAuthLoading, user?.id]);

  const queries = useHomeFeedQueries({
    feedKind: activeHomeFeedKind,
    categorySlug: activeHomeCategorySlug,
    categoryMetaScope: activeHomeTopicCategoryMetaScope,
    categoryMetaFilters: activeCategoryMetaFiltersForQuery,
    canUseFollowing: Boolean(user?.id),
    enabled: isFeedIdentityReady,
    viewerId: user?.id || null,
  });

  useEffect(() => {
    activeFeedIdentityRef.current = activeFeedIdentity;
  }, [activeFeedIdentity]);

  useEffect(() => {
    if (!hasMountedFeedIdentityRef.current) {
      hasMountedFeedIdentityRef.current = true;
      return;
    }

    pendingHomeFeedScrollTopRef.current = 0;
    setIsHomeChromeCollapsed(false);
  }, [activeFeedIdentity]);

  const updateHomeChromeCollapsed = useCallback((scrollTop: number) => {
    if (shortFeedChromeLockRef.current) {
      pendingHomeFeedScrollTopRef.current = 0;
      setIsHomeChromeCollapsed(false);
      return;
    }

    const activeIntent = getActiveScrollIntent();
    if (
      activeIntent === 'return-restore' ||
      activeIntent === 'route-overlay' ||
      activeIntent === 'tab-switch-top'
    ) {
      if (homeChromeSettleTimerRef.current !== null) {
        window.clearTimeout(homeChromeSettleTimerRef.current);
      }
      homeChromeSettleTimerRef.current = window.setTimeout(() => {
        homeChromeSettleTimerRef.current = null;
        updateHomeChromeCollapsed(pendingHomeFeedScrollTopRef.current);
      }, HOME_CHROME_PROGRAMMATIC_SETTLE_MS);
      return;
    }

    const safeScrollTop = Math.max(0, scrollTop);
    setIsHomeChromeCollapsed((current) => {
      if (current) {
        if (safeScrollTop <= HOME_CHROME_COLLAPSE_EXIT_PX) return false;
        return true;
      }

      if (safeScrollTop < HOME_CHROME_COLLAPSE_ENTER_PX) return false;
      return true;
    });
  }, []);

  const handleHomeFeedScrollPositionChange = useCallback((scrollTop: number) => {
    pendingHomeFeedScrollTopRef.current = scrollTop;
    if (homeChromeRafRef.current !== null) return;

    homeChromeRafRef.current = window.requestAnimationFrame(() => {
      homeChromeRafRef.current = null;
      updateHomeChromeCollapsed(pendingHomeFeedScrollTopRef.current);
    });
  }, [updateHomeChromeCollapsed]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return undefined;

    return () => {
      if (homeChromeRafRef.current !== null) {
        window.cancelAnimationFrame(homeChromeRafRef.current);
        homeChromeRafRef.current = null;
      }
      if (homeChromeSettleTimerRef.current !== null) {
        window.clearTimeout(homeChromeSettleTimerRef.current);
        homeChromeSettleTimerRef.current = null;
      }
    };
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return undefined;
    if (typeof window === 'undefined') return undefined;

    const handleWindowScroll = () => {
      const scrollTop =
        window.scrollY ||
        document.scrollingElement?.scrollTop ||
        document.documentElement.scrollTop ||
        0;

      updateHomeChromeCollapsed(scrollTop);
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    handleWindowScroll();

    return () => {
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [isMobile, updateHomeChromeCollapsed]);

  const { runManualRefresh } = useHomeRefresh({
    activeMainTab,
    activeHomeFeedKind,
    activeHomeCategorySlug,
    activeCategoryMetaScope: activeHomeTopicCategoryMetaScope,
    activeCategoryMetaFilters: activeCategoryMetaFiltersForQuery,
    activeFeedIdentity,
    activeFeedIdentityRef,
    activeQueryKey: queries.activeQueryKey,
    queryClient,
    markFeedSeen,
    onRefreshStateChange: (_identity: string, state: RefreshState, source: RefreshUiSource | null = null) => {
      setRefreshState(state);
      setRefreshUiSource(state === 'refreshing' ? source : null);
    },
  });

  const queryFeedPosts = queries.displayPosts;
  const visibleFeedPosts = queries.isPlaceholderData ? [] : queryFeedPosts;

  const hasVisibleFeedPosts = visibleFeedPosts.length > 0;
  const activeFeedDataHasResolvedPage =
    !queries.isPlaceholderData && hasResolvedFeedPage(queries.activeQuery.data);
  const hasCachedActiveFeedPage = hasResolvedFeedPage(
    queryClient.getQueryData(queries.activeQueryKey),
  );
  const hasResolvedActiveFeedSnapshot =
    hasVisibleFeedPosts ||
    activeFeedDataHasResolvedPage ||
    (!queries.isPlaceholderData && hasCachedActiveFeedPage) ||
    (!queries.isPlaceholderData && queries.isFetched);
  const hasResolvedFeedIdentity =
    !queries.isPlaceholderData && resolvedFeedIdentitiesRef.current.has(activeFeedIdentity);
  const hasResolvedFeed =
    hasResolvedActiveFeedSnapshot ||
    hasResolvedFeedIdentity;

  useEffect(() => {
    if (queries.isPlaceholderData || !hasResolvedActiveFeedSnapshot) return;
    resolvedFeedIdentitiesRef.current.add(activeFeedIdentity);
  }, [
    activeFeedIdentity,
    hasResolvedActiveFeedSnapshot,
    queries.isPlaceholderData,
  ]);

  const showInitialLoading =
    !queries.isError &&
    !hasVisibleFeedPosts &&
    (!isFeedIdentityReady ||
      (!hasResolvedFeed &&
        (queries.isPlaceholderData || queries.isLoading || (queries.isFetching && !queries.isFetched))));
  const homeVisualState = showInitialLoading ? 'skeleton' : 'ready';

  const renderedFeedPosts = visibleFeedPosts;

  const showInitialError = queries.isError && renderedFeedPosts.length === 0;
  const initialFeedErrorMessage = showInitialError
    ? getHomeFeedErrorMessage(queries.activeQuery.error)
    : '';

  const canShowInitialEmpty =
    !showInitialLoading &&
    refreshState !== 'refreshing' &&
    !showInitialError &&
    isFeedIdentityReady &&
    !queries.isPlaceholderData &&
    !queries.isFetching &&
    queries.isFetched &&
    renderedFeedPosts.length === 0;

  const canLoadMore =
    refreshState !== 'refreshing' &&
    isFeedIdentityReady &&
    !queries.isFetching &&
    !queries.isPlaceholderData &&
    queries.hasNextPage;

  const shouldLockHomeChromeOpen =
    hasResolvedFeed &&
    !showInitialLoading &&
    !queries.isPlaceholderData &&
    !queries.hasNextPage &&
    renderedFeedPosts.length <= HOME_CHROME_SHORT_FEED_MAX_ITEMS;

  useEffect(() => {
    shortFeedChromeLockRef.current = shouldLockHomeChromeOpen;

    if (!shouldLockHomeChromeOpen) return;
    pendingHomeFeedScrollTopRef.current = 0;

    if (typeof window !== 'undefined' && homeChromeRafRef.current !== null) {
      window.cancelAnimationFrame(homeChromeRafRef.current);
      homeChromeRafRef.current = null;
    }
    if (typeof window !== 'undefined' && homeChromeSettleTimerRef.current !== null) {
      window.clearTimeout(homeChromeSettleTimerRef.current);
      homeChromeSettleTimerRef.current = null;
    }

    setIsHomeChromeCollapsed(false);
  }, [shouldLockHomeChromeOpen]);

  const isActiveTabFeedPending =
    queries.isLoading ||
    queries.isFetching ||
    !isFeedIdentityReady ||
    (!hasResolvedFeed && !queries.isError);

  const inFlightFetchRef = useRef(false);
  const loadMoreRequestIdRef = useRef(0);

  const handleLoadMore = useCallback(() => {
    if (!canLoadMore || inFlightFetchRef.current) return Promise.resolve();

    inFlightFetchRef.current = true;
    const requestId = ++loadMoreRequestIdRef.current;

    const targetIdentity = activeFeedIdentity;

    if (activeFeedIdentityRef.current === targetIdentity) {
      setLoadMoreError(false);
    }

    const watchdog = window.setTimeout(() => {
      if (loadMoreRequestIdRef.current === requestId) {
        inFlightFetchRef.current = false;
      }
    }, LOAD_MORE_WATCHDOG_MS);

    return Promise.resolve(queries.fetchNextPage())
      .catch(() => {
        if (activeFeedIdentityRef.current === targetIdentity) {
          setLoadMoreError(true);
        }
      })
      .finally(() => {
        window.clearTimeout(watchdog);
        if (loadMoreRequestIdRef.current === requestId) {
          inFlightFetchRef.current = false;
        }
      });
  }, [activeFeedIdentity, canLoadMore, queries]);

  const previousFeedIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousFeedIdentityRef.current === null) {
      previousFeedIdentityRef.current = activeFeedIdentity;
      return;
    }

    if (previousFeedIdentityRef.current === activeFeedIdentity) return;

    previousFeedIdentityRef.current = activeFeedIdentity;
    loadMoreRequestIdRef.current += 1;
    inFlightFetchRef.current = false;
    setLoadMoreError(false);
    setRefreshState('idle');
    setRefreshUiSource(null);

    if (!hasBlockingScrollIntent('tab-switch-top')) {
      runWithScrollIntent('tab-switch-top', () => scrollHomeFeedToTop('auto'));
    }
  }, [activeFeedIdentity]);

  const visiblePostIds = useMemo(
    () => renderedFeedPosts.map((post) => post.id),
    [renderedFeedPosts],
  );

  useFeedExposureViews(
    visiblePostIds,
    !showInitialLoading && renderedFeedPosts.length > 0,
  );

  useListReturnScroll(
    listReturnScope,
    !showInitialLoading && !shouldLockHomeChromeOpen,
    renderedFeedPosts.length,
  );

  const handleBrowseAll = useCallback(() => {
    const nextTabId = normalizeHomeTopicTabId(DEFAULT_HOME_TOPIC_TAB_ID, homeTopicCategories);
    writeHomeTopicTabId(nextTabId);
    setActiveHomeTopicTabId(nextTabId);
    scrollHomeFeedToTop('smooth');
  }, [homeTopicCategories]);

  const {
    loadingTabKey,
    requestTabChange,
    refreshFromPull,
    loadMore,
    browseAll,
  } = useHomeInteractionCoordinator({
    activeTabKey: activeHomeTopicTabId,
    refreshState,
    refreshUiSource,
    runManualRefresh,
    onLoadMore: handleLoadMore,
    onBrowseAll: handleBrowseAll,
    isActiveTabFeedPending,
  });
  const loadingHomeTopicTabId = loadingTabKey
    ? normalizeHomeTopicTabId(loadingTabKey, homeTopicCategories)
    : null;

  const commitHomeTopicTab = useCallback((tabId: HomeTopicTabId) => {
    const nextTabId = normalizeHomeTopicTabId(tabId, homeTopicCategories);
    setActiveHomeTopicTabId((currentTabId) => {
      if (currentTabId === nextTabId) return currentTabId;
      writeHomeTopicTabId(nextTabId);
      return nextTabId;
    });
  }, [homeTopicCategories]);

  const handleHomeTopicTabSelect = useCallback((tabId: HomeTopicTabId) => {
    const nextTabId = normalizeHomeTopicTabId(tabId, homeTopicCategories);
    if (nextTabId === 'following' && !user?.id) {
      requireAuth(() => {
        requestTabChange(nextTabId, () => commitHomeTopicTab(nextTabId));
      });
      return;
    }
    requestTabChange(nextTabId, () => commitHomeTopicTab(nextTabId));
  }, [homeTopicCategories, commitHomeTopicTab, requestTabChange, requireAuth, user?.id]);

  useEffect(() => {
    const handleHomeTopicTabSelectEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId?: unknown; refreshIfActive?: unknown }>).detail;
      const tabId = normalizeHomeTopicTabId(
        detail?.tabId,
        homeTopicCategories,
      );
      if (detail?.refreshIfActive === false && tabId === activeHomeTopicTabId) return;
      requestTabChange(tabId, () => commitHomeTopicTab(tabId));
    };

    const handleHomeTopicTabRefreshEvent = () => {
      void refreshFromPull();
    };

    window.addEventListener('home-topic-tab-select', handleHomeTopicTabSelectEvent);
    window.addEventListener('home-topic-tab-refresh', handleHomeTopicTabRefreshEvent);
    return () => {
      window.removeEventListener('home-topic-tab-select', handleHomeTopicTabSelectEvent);
      window.removeEventListener('home-topic-tab-refresh', handleHomeTopicTabRefreshEvent);
    };
  }, [activeHomeTopicTabId, homeTopicCategories, commitHomeTopicTab, refreshFromPull, requestTabChange]);

  const handleHomeTopicCategoryMetaFilterApply = useCallback((filters: CategoryMetaFeedFilters) => {
    setHomeTopicFilters((current) => {
      const currentFilter = current[activeHomeTopicTabId] || {};
      const nextFilters = filters || {};
      const next = {
        ...current,
        [activeHomeTopicTabId]: {
          ...currentFilter,
          categoryMetaFilters: nextFilters,
        },
      };
      writeHomeTopicFilterState(next);
      return next;
    });
  }, [activeHomeTopicTabId]);

  const hasHomeAdBanner = useMemo(
    () => homeAds.some((ad) => Boolean(ad.adImageUrl || ad.adMobileImageUrl)),
    [homeAds],
  );

  const handleBrowseAllFromFeed = useCallback(() => {
    void browseAll();
  }, [browseAll]);

  const homeShellClassName = useMemo(
    () => getHomeShellClassName({
      isMobile,
      isChromeCollapsed: shouldLockHomeChromeOpen ? false : isHomeChromeCollapsed,
    }),
    [isHomeChromeCollapsed, isMobile, shouldLockHomeChromeOpen],
  );

  return (
    <>
      <HomeSeo
        activeMainTab={activeMainTab}
        validDiscoverCategoryId={activeHomeCategorySlug || 'all'}
        categories={categories}
      />
      <section className="sr-only" aria-label="页面概要">
        <h1>推推 | 圈内最大的匿名社交分类信息网</h1>
        <h2>新闻快讯、招聘求职、资源合作、房屋租赁、证件护照信息聚合</h2>
        <h3>实时更新的分类生活信息平台，支持发布、浏览与快速互动</h3>
      </section>

      <main className={homeShellClassName}>
        <HomeChrome
          homeAds={homeAds}
          hasHomeAdBanner={hasHomeAdBanner}
          categories={homeTopicCategories}
          activeHomeTopicTabId={activeHomeTopicTabId}
          loadingHomeTopicTabId={loadingHomeTopicTabId}
          activeHomeTopicFilterCount={activeHomeTopicFilterCount}
          activeHomeTopicFilterFieldItems={activeHomeTopicFilterFieldItems}
          activeHomeTopicCategoryMetaFilters={activeHomeTopicCategoryMetaFilters}
          activeHomeTopicFilterSchema={activeHomeTopicFilterSchema}
          locationPresets={config?.location_presets || []}
          onlineCount={onlineCount}
          showHomeTopicFilters={activeHomeTopicShowsFilters}
          visualState={homeVisualState}
          onHomeTopicTabSelect={handleHomeTopicTabSelect}
          onHomeTopicCategoryMetaFilterApply={handleHomeTopicCategoryMetaFilterApply}
        />

        <HomeFeedContent
          hideCategoryTag={activeHomeFeedKind === 'category'}
          feedIdentity={activeFeedIdentity}
          visibleFeedPosts={renderedFeedPosts}
          scrollRootRef={homeFeedScrollRootRef}
          canLoadMore={canLoadMore}
          isRefreshing={refreshState === 'refreshing'}
          showInitialLoading={showInitialLoading}
          showInitialError={showInitialError}
          initialErrorMessage={initialFeedErrorMessage}
          canShowInitialEmpty={canShowInitialEmpty}
          loadMoreError={loadMoreError}
          isFetchingNextPage={queries.isFetchingNextPage}
          onScrollPositionChange={handleHomeFeedScrollPositionChange}
          onRefreshFromPull={refreshFromPull}
          onLoadMore={loadMore}
          onBrowseAll={handleBrowseAllFromFeed}
        />
      </main>
    </>
  );
}
