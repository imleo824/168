import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
} from 'react';
import { useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';

import { useCategories } from '@/hooks/useDataConfig';
import { useInfinitePosts } from '@/hooks/useDataPosts';
import { useJoinTopic, useTopicJoinStatus } from '@/hooks/useDataSocial';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import SEO from '@/platform/SEO';
import { buildCategorySeo } from '@/platform/brand';
import PageHeader from '@/ui/PageHeader';
import { parseLocationCategoryId } from '@/utils/postPresentation';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useFeedExposureViews } from '@/hooks/useFeedExposureViews';
import ListReturnScrollRestorer from '@/utils/ListReturnScrollRestorer';
import { RefreshHint, StateBlock } from '@/ui/LoadingState';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import ActionButton, { ActionLink } from '@/ui/ActionButton';
import { TopbarActionGroup } from '@/ui/TopbarActions';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import { APP_ROUTES } from '@/app/routePaths';
import { HomeFeedSkeleton } from '@/ui/Skeleton';
import type { CategoryMetaFeedFilters } from '@/types';

import '@/features/category/CategoryFeedRoute.css';

const DEFAULT_FALLBACK_TITLE = '动态广场';
const SHORT_LIST_AUTO_LOAD_MIN_ITEMS = 4;
const LOAD_MORE_ROOT_MARGIN_PX = 1000;
const LOAD_MORE_SCROLL_THRESHOLD = 900;
const LazyPostFeedList = React.lazy(() => import('@/features/feed/PostFeedList'));

function formatRootMarginPx(value: number) {
  return `${value}px`;
}

const LOAD_MORE_ROOT_MARGIN = formatRootMarginPx(LOAD_MORE_ROOT_MARGIN_PX);

function parseCategoryMetaFiltersParam(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as CategoryMetaFeedFilters;
  } catch {
    return undefined;
  }
}

function normalizeTagParam(value: unknown) {
  return String(value ?? '').replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function hasCategoryMetaFeedFilters(filters: CategoryMetaFeedFilters | undefined) {
  return Boolean(filters && Object.keys(filters).length > 0);
}

const LoadingState = memo(function LoadingState() {
  return <HomeFeedSkeleton count={3} />;
});

const EmptyState = memo(function EmptyState({ categoryName }: { categoryName: string }) {
  return (
    <StateBlock
      title="暂无内容"
      description={`关于「${categoryName}」的动态还没有出现，现在发布可获得首批浏览机会。`}
      tone="empty"
      className="category-feed-empty"
      icon={<Sparkles className="category-feed-empty-icon" aria-hidden="true" />}
      action={<ActionLink to={APP_ROUTES.create} variant="primary">立即发布</ActionLink>}
    />
  );
});

interface UseInfiniteScrollOptions {
  identity: string;
  enabled: boolean;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  itemCount: number;
  fetchNextPage: () => Promise<unknown>;
}

function useInfiniteScroll({
  identity,
  enabled,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  itemCount,
  fetchNextPage,
}: UseInfiniteScrollOptions) {
  const inFlightRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const canAutoLoad = itemCount >= SHORT_LIST_AUTO_LOAD_MIN_ITEMS;

  const resetError = useCallback(() => {
    setLoadMoreError(false);
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    inFlightRef.current = false;
    setLoadMoreError(false);
  }, [identity]);

  const requestNextPage = useCallback(async (): Promise<void> => {
    if (!hasNextPage || isFetchingNextPage || isFetching || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const requestGeneration = requestGenerationRef.current;
    setLoadMoreError(false);

    await fetchNextPage()
      .then(() => undefined)
      .catch(() => {
        if (requestGenerationRef.current === requestGeneration) {
          setLoadMoreError(true);
        }
      })
      .finally(() => {
        if (requestGenerationRef.current === requestGeneration) {
          inFlightRef.current = false;
        }
      });
  }, [fetchNextPage, hasNextPage, isFetching, isFetchingNextPage]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !canAutoLoad) return;
    const target = sentinelRef.current;
    if (!target || !hasNextPage) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetching && !isFetchingNextPage && !inFlightRef.current) {
          void requestNextPage();
        }
      },
      { rootMargin: LOAD_MORE_ROOT_MARGIN, threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [canAutoLoad, enabled, hasNextPage, isFetching, isFetchingNextPage, requestNextPage]);

  useEffect(() => {
    if (!enabled || !canAutoLoad || typeof IntersectionObserver !== 'undefined') return;

    const maybeLoadMore = () => {
      if (!hasNextPage || isFetching || isFetchingNextPage || inFlightRef.current) return;

      const scrollElement = document.scrollingElement || document.documentElement;
      const scrollTop = window.scrollY || scrollElement.scrollTop || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const scrollHeight = Math.max(
        scrollElement.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.scrollHeight || 0,
      );

      if (scrollHeight - scrollTop - viewportHeight <= LOAD_MORE_SCROLL_THRESHOLD) {
        void requestNextPage();
      }
    };

    let frame: number | null = null;
    const onScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        maybeLoadMore();
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    maybeLoadMore();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [canAutoLoad, enabled, hasNextPage, isFetching, isFetchingNextPage, requestNextPage]);

  return { sentinelRef, loadMoreError, requestNextPage, resetError };
}

export default function CategoryFeedMobile() {
  const isMobile = useIsMobile();
  const { user, requireAuth, showToast } = useAuth();
  const { id: categoryId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const listReturnScope = `${location.pathname}${location.search}`;

  const stateName = location.state?.name as string | undefined;
  const stateResultType = location.state?.resultType as string | undefined;
  const locationFilter = useMemo(() => parseLocationCategoryId(categoryId), [categoryId]);
  const decodedTopicId = useMemo(() => {
    if (!categoryId) return '';
    try {
      return decodeURIComponent(categoryId).trim();
    } catch {
      return categoryId.trim();
    }
  }, [categoryId]);
  const country = searchParams.get('country') ?? '';
  const query = searchParams.get('q') ?? '';
  const viewMode = searchParams.get('view') ?? '';
  const explicitTag = normalizeTagParam(searchParams.get('tag') ?? '');
  const categoryMetaScopeParam = searchParams.get('categoryMetaScope') ?? '';
  const categoryMetaFilters = useMemo(
    () => parseCategoryMetaFiltersParam(searchParams.get('categoryMetaFilters')),
    [searchParams],
  );
  const hasMetaFilters = useMemo(() => hasCategoryMetaFeedFilters(categoryMetaFilters), [categoryMetaFilters]);
  const unifiedTag = explicitTag;

  const shouldNoIndexCategoryPage = categoryId === 'search' || Boolean(query.trim()) || Boolean(unifiedTag) || hasMetaFilters;
  const isRequestedMetaPage = viewMode === 'meta' || stateResultType === 'meta' || hasMetaFilters;
  const isRequestedLocationPage =
    viewMode === 'location' ||
    stateResultType === 'location' ||
    Boolean(locationFilter);
  const isRequestedTagPage = !isRequestedMetaPage && (viewMode === 'tag' || stateResultType === 'tag' || Boolean(unifiedTag));

  const { data: categories = [] } = useCategories();
  const currentCategory = useMemo(() => {
    if (!categoryId || !categories.length || locationFilter || isRequestedTagPage || isRequestedMetaPage) return null;
    return categories.find((c: any) => c.id === categoryId || c.slug === categoryId);
  }, [categories, categoryId, locationFilter, isRequestedMetaPage, isRequestedTagPage]);

  const topicNameHint = unifiedTag || stateName || currentCategory?.name || decodedTopicId || undefined;
  const postsRequestParams = useMemo(() => {
    const base = { country, query };
    if (unifiedTag) return { ...base, tag: unifiedTag };
    if (hasMetaFilters && categoryMetaFilters) {
      return {
        ...base,
        ...(categoryId && categoryId !== 'search' ? { categoryId } : {}),
        ...(categoryMetaScopeParam ? { categoryMetaScope: categoryMetaScopeParam } : {}),
        categoryMetaFilters,
      };
    }
    if (categoryId === 'search') return base;
    if (isRequestedLocationPage) return { ...base, location: locationFilter || stateName || undefined };
    if (isRequestedTagPage) return { ...base, query: query || topicNameHint || categoryId || undefined };
    if (categoryId) return { ...base, categoryId };
    return base;
  }, [categoryId, categoryMetaFilters, categoryMetaScopeParam, country, hasMetaFilters, isRequestedLocationPage, isRequestedTagPage, locationFilter, query, stateName, topicNameHint, unifiedTag]);

  const postsQuery = useInfinitePosts(postsRequestParams as any);

  const posts = useMemo(
    () => postsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [postsQuery.data],
  );

  const categoryName = useMemo(() => {
    if (unifiedTag) return unifiedTag;
    if (currentCategory?.name) return currentCategory.name;
    if (locationFilter) return locationFilter;
    if (stateName) return stateName;
    if (country) return country;
    if (query) return query;
    if (decodedTopicId) return decodedTopicId;
    return DEFAULT_FALLBACK_TITLE;
  }, [currentCategory, decodedTopicId, stateName, locationFilter, country, query, unifiedTag]);

  const pageFilterContext = useMemo(() => {
    if (unifiedTag) return unifiedTag;
    if (query) return `"${query.trim()}"`;
    if (isRequestedMetaPage) return stateName || categoryName || '筛选';
    if (isRequestedTagPage) return topicNameHint || categoryId || '搜索';
    if (isRequestedLocationPage || country) return locationFilter || stateName || country || '地区';
    return categoryName;
  }, [unifiedTag, query, isRequestedMetaPage, stateName, categoryName, isRequestedTagPage, topicNameHint, categoryId, isRequestedLocationPage, country, locationFilter]);

  const pageKind = useMemo(() => {
    if (unifiedTag || isRequestedTagPage) return 'tag';
    if (isRequestedMetaPage) return 'meta';
    if (query) return 'search';
    if (isRequestedLocationPage || country) return 'location';
    return 'category';
  }, [unifiedTag, isRequestedTagPage, isRequestedMetaPage, query, isRequestedLocationPage, country]);

  const categorySeo = useMemo<{ title: string; description: string; keywords?: string }>(() => {
    if (pageKind === 'tag') {
      return {
        title: `#${pageFilterContext} 相关内容 | 推推`,
        description: `在推推查看「${pageFilterContext}」标签相关内容，包含正文标签。`,
        keywords: `${pageFilterContext},推推标签,东南亚分类信息`,
      };
    }

    if (pageKind === 'meta') {
      return {
        title: `${pageFilterContext} 筛选结果 | 推推`,
        description: `在推推查看「${pageFilterContext}」相关的结构化筛选内容。`,
        keywords: `${pageFilterContext},推推筛选,东南亚分类信息`,
      };
    }

    if (pageKind === 'search') {
      return {
        title: `${pageFilterContext} 相关内容 | 推推`,
        description: `在推推搜索“${pageFilterContext}”，查看最新${country ? `${country} ` : ''}分类信息。`,
      };
    }

    if (pageKind === 'location') {
      return {
        title: `${pageFilterContext} 地区 | 推推`,
        description: `浏览「${pageFilterContext}」的本地分类信息，发现最新资讯与服务发布。`,
      };
    }

    return buildCategorySeo(categoryName);
  }, [categoryName, pageFilterContext, pageKind, country]);

  const joinableTopicId = useMemo(() => {
    if (!categoryId || categoryId === 'search') return '';
    if (isRequestedLocationPage || isRequestedTagPage || isRequestedMetaPage || country || query || unifiedTag) return '';
    return currentCategory?.id || categoryId;
  }, [categoryId, country, currentCategory?.id, isRequestedLocationPage, isRequestedMetaPage, isRequestedTagPage, query, unifiedTag]);
  const topicJoinStatusQuery = useTopicJoinStatus(joinableTopicId, Boolean(joinableTopicId && user?.id));
  const joinTopicMutation = useJoinTopic(joinableTopicId, categoryName);
  const isTopicJoined = Boolean(topicJoinStatusQuery.data?.joined);

  const toggleTopicJoin = useCallback(() => {
    if (!joinableTopicId) return;

    if (!user?.id) {
      requireAuth();
      return;
    }

    const nextJoined = !isTopicJoined;
    joinTopicMutation.mutate(nextJoined, {
      onSuccess: () => {
        showToast(nextJoined ? '已加入我的关注' : '已从我的关注移除', 'success');
      },
      onError: (error: any) => {
        showToast(error?.message || '操作失败，请稍后重试', 'error');
      },
    });
  }, [isTopicJoined, joinableTopicId, joinTopicMutation, requireAuth, showToast, user?.id]);

  const { guarded: guardedToggleTopicJoin } = useInteractionGuard(toggleTopicJoin, {
    policy: 'critical',
    cooldownMs: 520,
    minPendingMs: 120,
    mode: 'drop',
  });

  const isInitialLoading = postsQuery.isLoading && posts.length === 0;
  const isInitialError = postsQuery.isError && posts.length === 0;
  const isRefreshingExisting = posts.length > 0 && postsQuery.isFetching && !postsQuery.isFetchingNextPage;

  const { sentinelRef, loadMoreError, requestNextPage, resetError } = useInfiniteScroll({
    identity: listReturnScope,
    enabled: !isInitialLoading,
    hasNextPage: postsQuery.hasNextPage ?? false,
    isFetching: postsQuery.isFetching,
    isFetchingNextPage: postsQuery.isFetchingNextPage,
    itemCount: posts.length,
    fetchNextPage: postsQuery.fetchNextPage,
  });
  const refetchCategoryPosts = useCallback(async () => {
    await postsQuery.refetch();
  }, [postsQuery]);
  const { guarded: guardedRefetchCategoryPosts, isPending: refetchGuardPending } = useInteractionGuard(refetchCategoryPosts, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedRequestNextPage, isPending: loadMoreGuardPending } = useInteractionGuard(requestNextPage, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const retryBusy = postsQuery.isRefetching || refetchGuardPending;
  const loadMoreBusy = postsQuery.isFetchingNextPage || loadMoreGuardPending;

  useEffect(() => {
    resetError();
  }, [categoryId, categoryMetaScopeParam, country, hasMetaFilters, query, viewMode, unifiedTag, resetError]);

  const canRestoreListPosition = posts.length >= SHORT_LIST_AUTO_LOAD_MIN_ITEMS || Boolean(postsQuery.hasNextPage);
  useFeedExposureViews(posts, !isInitialLoading && posts.length > 0);

  const pageSeo = categorySeo;

  const categoryJsonLd = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const pageUrl = origin ? `${origin}${location.pathname}${location.search}` : undefined;

    const listItems = posts.slice(0, 12).map((post: any, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: origin ? `${origin}/post/${encodeURIComponent(post.id)}` : undefined,
      name: post.title || post.content || `${categoryName}内容`,
    }));

    return [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: categorySeo.title,
        description: categorySeo.description,
        inLanguage: 'zh-CN',
        url: pageUrl,
        isPartOf: origin ? { '@type': 'WebSite', name: '推推', url: origin } : undefined,
        about: [
          { '@type': 'Thing', name: categoryName },
          { '@type': 'Thing', name: pageKind === 'tag' ? '标签内容' : pageKind === 'meta' ? '筛选内容' : '分类信息' },
          { '@type': 'Thing', name: '圈内信息' },
        ],
      },
      listItems.length
        ? {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `${categoryName}${pageKind === 'tag' ? '标签' : pageKind === 'meta' ? '筛选' : '分类'}信息列表`,
            itemListElement: listItems,
          }
        : null,
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '推推', item: origin || undefined },
          { '@type': 'ListItem', position: 2, name: categoryName, item: pageUrl },
        ],
      },
    ].filter(Boolean) as Record<string, unknown>[];
  }, [categoryName, categorySeo, location.pathname, location.search, pageKind, posts]);

  return (
    <AppPage mobileAddressBarScroll className={isMobile ? 'category-feed-page category-feed-page--mobile' : 'category-feed-page category-feed-page--desktop'}>
      <ListReturnScrollRestorer
        scope={listReturnScope}
        ready={!isInitialLoading && canRestoreListPosition}
        restoreVersion={posts.length}
      />
      <SEO
        title={pageSeo.title}
        description={pageSeo.description}
        keywords={pageSeo.keywords}
        jsonLd={categoryJsonLd}
        canonicalPath={`${location.pathname}${location.search}`}
        noindex={shouldNoIndexCategoryPage}
      />

      <PageHeader
        title={`#${categoryName}`}
        right={joinableTopicId ? (
          <TopbarActionGroup className="category-feed-header-actions">
            <ActionButton
              type="button"
              variant="muted"
              size="header"
              onClick={() => void guardedToggleTopicJoin()}
              disabled={joinTopicMutation.isPending}
              className="category-feed-join-button"
              aria-label={isTopicJoined ? `已加入${categoryName}` : `加入${categoryName}`}
              title={isTopicJoined ? '已加入我的关注' : '加入我的关注'}
            >
              {isTopicJoined ? <Check className="category-feed-join-icon" aria-hidden="true" /> : null}
              <span>{isTopicJoined ? '已加入' : '加入'}</span>
            </ActionButton>
          </TopbarActionGroup>
        ) : undefined}
      />

      <PageContentShell as="main" variant="fluid" className={`category-feed-content-shell ${isMobile ? 'category-feed-shell--mobile' : 'category-feed-shell--desktop'} ui-app-page-main`}>
        {isInitialLoading ? (
          <LoadingState />
        ) : isInitialError ? (
          <StateBlock
            title="内容加载失败"
            description="网络恢复后可重新拉取内容。"
            tone="error"
            className="category-feed-empty"
            action={<ActionButton type="button" variant="muted" disabled={retryBusy} state={retryBusy ? 'loading' : 'idle'} onClick={() => void guardedRefetchCategoryPosts()}>{retryBusy ? '加载中' : '重新加载'}</ActionButton>}
          />
        ) : posts.length === 0 ? (
          <EmptyState categoryName={categoryName} />
        ) : (
          <>
            {isRefreshingExisting ? <div className="category-feed-refresh-row"><RefreshHint text="正在更新" /></div> : null}
            <React.Suspense fallback={<LoadingState />}>
              <LazyPostFeedList posts={posts} enableRecommendationControls />
            </React.Suspense>
            <div ref={sentinelRef}>
              <ListLoadMoreState
                error={loadMoreError}
                loading={loadMoreBusy}
                hasMore={postsQuery.hasNextPage}
                onRetry={() => void guardedRequestNextPage()}
                onLoadMore={() => void guardedRequestNextPage()}
                loadingText="正在加载更多"
                loadMoreText="点击加载更多"
                doneText="已经到底啦"
              />
            </div>
          </>
        )}
      </PageContentShell>
    </AppPage>
  );
}
