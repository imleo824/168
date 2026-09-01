import {
  memo,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  Category,
  CategoryMetaFeedFilters,
  LocationPresetConfig,
  PromotionBooking,
  PublishCategoryMetaConfig,
} from '@/types';
import { formatOptionalOnlineCount } from '@/features/home/onlinePresence';
import { HomeTopbar } from '@/features/home/HomeTopbar';
import { HomeTopicTabs, type HomeTopicTabId, type HomeTopicTabsBootstrapState } from './HomeTopicTabs';
import { HomeStructuredFilterSheet } from './HomeStructuredFilterSheet';
import type { HomeStructuredFilterFieldItem } from './homeStructuredFilterUtils';
import type { HomeVisualState } from './homeTypes';

const LazyHomeAdBanner = lazy(() => import('@/features/feed/HomeAdBanner'));

interface HomeChromeProps {
  homeAds: PromotionBooking[];
  hasHomeAdBanner: boolean;
  categories: Category[];
  activeHomeTopicTabId: HomeTopicTabId;
  loadingHomeTopicTabId?: HomeTopicTabId | null;
  activeHomeTopicFilterCount: number;
  activeHomeTopicFilterFieldItems: HomeStructuredFilterFieldItem[];
  activeHomeTopicCategoryMetaFilters: CategoryMetaFeedFilters;
  activeHomeTopicFilterSchema: PublishCategoryMetaConfig | null;
  locationPresets: LocationPresetConfig[];
  onlineCount: number | null;
  showHomeTopicFilters?: boolean;
  visualState?: HomeVisualState;
  onHomeTopicTabSelect: (tabId: HomeTopicTabId) => void;
  onHomeTopicCategoryMetaFilterApply: (filters: CategoryMetaFeedFilters) => void;
}

export const HomeChrome = memo(function HomeChrome({
  homeAds,
  hasHomeAdBanner,
  categories,
  activeHomeTopicTabId,
  loadingHomeTopicTabId,
  activeHomeTopicFilterCount,
  activeHomeTopicFilterFieldItems,
  activeHomeTopicCategoryMetaFilters,
  activeHomeTopicFilterSchema,
  locationPresets,
  onlineCount,
  showHomeTopicFilters = true,
  visualState = 'ready',
  onHomeTopicTabSelect,
  onHomeTopicCategoryMetaFilterApply,
}: HomeChromeProps) {
  const [isTopicFilterOpen, setIsTopicFilterOpen] = useState(false);
  const [topicFilterFocusFieldKey, setTopicFilterFocusFieldKey] = useState('');
  const handleOpenTopicFilterAtField = useCallback((fieldKey: string) => {
    if (!activeHomeTopicFilterSchema) return;
    setTopicFilterFocusFieldKey(fieldKey);
    setIsTopicFilterOpen(true);
  }, [activeHomeTopicFilterSchema]);
  const handleCloseTopicFilter = useCallback(() => {
    setIsTopicFilterOpen(false);
  }, []);

  useEffect(() => {
    if (activeHomeTopicFilterSchema) return;
    setIsTopicFilterOpen(false);
  }, [activeHomeTopicFilterSchema]);
  const onlineCountText = formatOptionalOnlineCount(onlineCount);
  const topicTabsBootstrapState = useMemo<HomeTopicTabsBootstrapState>(
    () => visualState === 'skeleton' && categories.length === 0 ? 'loading' : 'ready',
    [categories.length, visualState],
  );

  return (
    <>
      <div className="home-scrollaway-chrome" data-ui-scrollaway-chrome data-home-scrollaway-chrome>
        <div className="home-scrollaway-chrome-inner">
          <HomeTopbar onlineCountText={onlineCountText} />

          {hasHomeAdBanner ? (
            <Suspense fallback={null}>
              <LazyHomeAdBanner ads={homeAds} compact />
            </Suspense>
          ) : null}
        </div>
      </div>

      <div className="home-topic-tabs-sticky-shell ui-layer-sticky-tab">
        <HomeTopicTabs
          categories={categories}
          activeTabId={activeHomeTopicTabId}
          loadingTabId={loadingHomeTopicTabId}
          bootstrapState={topicTabsBootstrapState}
          showFilters={showHomeTopicFilters}
          showStructuredFilter={Boolean(activeHomeTopicFilterSchema)}
          activeFilterCount={activeHomeTopicFilterCount}
          activeFilterFieldItems={activeHomeTopicFilterFieldItems}
          onSelect={onHomeTopicTabSelect}
          onFilterFieldClick={handleOpenTopicFilterAtField}
        />
      </div>

      <HomeStructuredFilterSheet
        open={isTopicFilterOpen}
        tabId={activeHomeTopicTabId}
        schema={activeHomeTopicFilterSchema}
        value={activeHomeTopicCategoryMetaFilters}
        locationPresets={locationPresets}
        focusFieldKey={topicFilterFocusFieldKey}
        onClose={handleCloseTopicFilter}
        onApply={onHomeTopicCategoryMetaFilterApply}
      />
    </>
  );
});
