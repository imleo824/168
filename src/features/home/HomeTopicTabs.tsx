import { memo, useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { ChevronDown } from 'lucide-react';
import { useInstantPress } from '@/hooks/useInstantPress';
import type { Category, CategoryMetaFeedFilters } from '@/types';
import type { HomeFeedKind, MainTabId } from './homeTypes';
import type { HomeStructuredFilterFieldItem } from './HomeStructuredFilterSheet';

export type HomeTopicTabId = string;
export type HomeTopicTabsBootstrapState = 'loading' | 'ready';

export type HomeTopicCountryOption = {
  key: string;
  label: string;
  shortLabel?: string;
};

export type HomeTopicTabListItem = {
  id: HomeTopicTabId;
  label: string;
  disabled?: boolean;
};

type HomeTopicTabConfig = HomeTopicTabListItem & {
  mainTab: MainTabId;
  feedKind: HomeFeedKind;
  showFilters: boolean;
  categorySlug?: string;
};

interface HomeTopicTabsProps {
  categories?: Category[];
  activeTabId: HomeTopicTabId;
  loadingTabId?: HomeTopicTabId | null;
  bootstrapState?: HomeTopicTabsBootstrapState;
  showFilters?: boolean;
  showStructuredFilter?: boolean;
  activeFilterCount?: number;
  activeFilterFieldItems?: HomeStructuredFilterFieldItem[];
  onSelect: (tabId: HomeTopicTabId) => void;
  onFilterFieldClick?: (key: string) => void;
}

interface HomeTopicTabListProps {
  items: HomeTopicTabListItem[];
  activeTabId: HomeTopicTabId;
  ariaLabel: string;
  loadingTabId?: HomeTopicTabId | null;
  bootstrapState?: HomeTopicTabsBootstrapState;
  hasFilter?: boolean;
  resetScrollStartTabIds?: ReadonlySet<string>;
  tabIdPrefix?: string;
  children?: ReactNode;
  onSelect: (tabId: HomeTopicTabId) => void;
}

interface HomeTopicTabButtonProps {
  tab: HomeTopicTabListItem;
  active: boolean;
  loading: boolean;
  buttonId?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: (tabId: HomeTopicTabId) => void;
}

const HOME_TOPIC_TAB_STORAGE_KEY = 'home-active-topic-tab-id';
const HOME_TOPIC_FILTER_STORAGE_KEY = 'home-topic-filter-state-v1';
const CATEGORY_TOPIC_TAB_PREFIX = 'category:';

export const DEFAULT_HOME_TOPIC_TAB_ID: HomeTopicTabId = 'hot';

const BASE_HOME_TOPIC_TABS: HomeTopicTabConfig[] = [
  {
    id: 'following',
    label: '关注',
    mainTab: 'following',
    feedKind: 'following',
    showFilters: false,
  },
  {
    id: 'hot',
    label: '热门',
    mainTab: 'discover',
    feedKind: 'recommended',
    showFilters: false,
  },
];

const BASE_HOME_TOPIC_TAB_IDS = new Set(BASE_HOME_TOPIC_TABS.map((tab) => tab.id));

const HOME_TOPIC_LOADING_TAB_PLACEHOLDERS: HomeTopicTabConfig[] = Array.from({ length: 6 }, (_, index) => ({
  id: `home-topic-loading-placeholder-${index}`,
  label: `栏目${index + 1}`,
  disabled: true,
  mainTab: 'discover',
  feedKind: 'recommended',
  showFilters: false,
}));

const LEGACY_HOME_TOPIC_TAB_IDS: Record<string, string> = {
  'after-work': 'hot',
  backup: 'hot',
  relax: 'hot',
};

const LEGACY_CATEGORY_TOPIC_SLUGS: Record<string, string> = {
  documents: 'documents',
  jobs: 'jobs',
  secondhand: 'secondhand',
  housing: 'housing',
};

function normalizeCategoryRef(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function getCategoryTopicTabRef(category: Pick<Category, 'id' | 'slug'>) {
  return String(category.slug || category.id || '').trim();
}

export function getHomeCategoryTopicTabId(category: Pick<Category, 'id' | 'slug'>): HomeTopicTabId {
  const ref = getCategoryTopicTabRef(category);
  return ref ? `${CATEGORY_TOPIC_TAB_PREFIX}${ref}` : '';
}

export function getHomeTopicCategorySlug(tabId: HomeTopicTabId) {
  const rawTabId = String(tabId || '').trim();
  if (rawTabId.startsWith(CATEGORY_TOPIC_TAB_PREFIX)) {
    return rawTabId.slice(CATEGORY_TOPIC_TAB_PREFIX.length).trim();
  }
  return LEGACY_CATEGORY_TOPIC_SLUGS[rawTabId] || '';
}

function centerHomeTopicTabIfNeeded(tabList: HTMLElement | null, activeButton: HTMLElement | null) {
  if (!tabList || !activeButton) return;
  const listRect = tabList.getBoundingClientRect();
  const buttonRect = activeButton.getBoundingClientRect();
  if (listRect.width <= 0 || buttonRect.width <= 0) return;

  const safeInset = Math.min(listRect.width * 0.22, Math.max(0, (listRect.width - buttonRect.width) / 2));
  const safeLeft = listRect.left + safeInset;
  const safeRight = listRect.right - safeInset;
  const isComfortablyVisible = buttonRect.left >= safeLeft && buttonRect.right <= safeRight;
  if (isComfortablyVisible) return;

  const nextScrollLeft = tabList.scrollLeft +
    (buttonRect.left - listRect.left) -
    ((listRect.width - buttonRect.width) / 2);

  tabList.scrollTo({
    left: Math.max(0, nextScrollLeft),
    behavior: 'smooth',
  });
}

export function buildHomeTopicTabs(categories: Category[] = []): HomeTopicTabConfig[] {
  const seenCategoryRefs = new Set<string>();
  const categoryTabs = categories
    .flatMap((category): HomeTopicTabConfig[] => {
      const ref = getCategoryTopicTabRef(category);
      const normalizedRef = normalizeCategoryRef(ref);
      const label = String(category.name || '').trim();
      if (!ref || !label || seenCategoryRefs.has(normalizedRef)) return [];
      seenCategoryRefs.add(normalizedRef);

      return [{
        id: getHomeCategoryTopicTabId(category),
        label,
        mainTab: 'discover',
        feedKind: 'category',
        showFilters: true,
        categorySlug: ref,
      }];
    });

  return [...BASE_HOME_TOPIC_TABS, ...categoryTabs];
}

export function normalizeHomeTopicTabId(value: unknown, categories: Category[] = []): HomeTopicTabId {
  const rawTabId = String(value || '').trim();
  if (!rawTabId) return DEFAULT_HOME_TOPIC_TAB_ID;

  const migratedTabId = LEGACY_HOME_TOPIC_TAB_IDS[rawTabId] || rawTabId;
  if (BASE_HOME_TOPIC_TAB_IDS.has(migratedTabId)) return migratedTabId;

  const categorySlug = getHomeTopicCategorySlug(migratedTabId) || LEGACY_CATEGORY_TOPIC_SLUGS[migratedTabId];
  if (categorySlug) {
    if (categories.length === 0) return `${CATEGORY_TOPIC_TAB_PREFIX}${categorySlug}`;
    const matchedCategory = categories.find((category) => {
      const refs = [category.slug, category.id].map(normalizeCategoryRef);
      return refs.includes(normalizeCategoryRef(categorySlug));
    });
    return matchedCategory ? getHomeCategoryTopicTabId(matchedCategory) : DEFAULT_HOME_TOPIC_TAB_ID;
  }

  return DEFAULT_HOME_TOPIC_TAB_ID;
}

export function getHomeTopicTab(tabId: HomeTopicTabId, categories: Category[] = []) {
  const tabs = buildHomeTopicTabs(categories);
  return tabs.find((tab) => tab.id === tabId) ||
    tabs.find((tab) => tab.id === DEFAULT_HOME_TOPIC_TAB_ID) ||
    tabs[0];
}

export function shouldShowHomeTopicFilters(tabId: HomeTopicTabId, categories: Category[] = []) {
  return getHomeTopicTab(tabId, categories).showFilters;
}

export function getHomeTopicCategoryRef(tabId: HomeTopicTabId, categories: Category[] = []) {
  return getHomeTopicTab(tabId, categories).categorySlug || getHomeTopicCategorySlug(tabId);
}

export function getHomeTopicFeedKind(tabId: HomeTopicTabId, categories: Category[] = []): HomeFeedKind {
  return getHomeTopicTab(tabId, categories).feedKind;
}

export type HomeTopicFilterState = Partial<Record<HomeTopicTabId, {
  categoryMetaFilters?: CategoryMetaFeedFilters;
}>>;

function normalizeStoredCategoryMetaFilters(raw: unknown): CategoryMetaFeedFilters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: CategoryMetaFeedFilters = {};

  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;

    if (typeof value === 'string') {
      const text = value.trim();
      if (text) next[normalizedKey] = text;
      return;
    }

    if (typeof value === 'boolean') {
      next[normalizedKey] = value;
      return;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const range = value as { min?: unknown; max?: unknown };
      const min = range.min === undefined || range.min === null || range.min === '' ? undefined : Number(range.min);
      const max = range.max === undefined || range.max === null || range.max === '' ? undefined : Number(range.max);
      const normalizedRange: { min?: number; max?: number } = {};
      if (typeof min === 'number' && Number.isFinite(min)) normalizedRange.min = min;
      if (typeof max === 'number' && Number.isFinite(max)) normalizedRange.max = max;
      if (Object.keys(normalizedRange).length > 0) next[normalizedKey] = normalizedRange;
    }
  });

  return next;
}

function normalizeStoredFilterState(raw: unknown): HomeTopicFilterState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const next: HomeTopicFilterState = {};
  for (const [rawTabId, rawFilter] of Object.entries(raw)) {
    const tabId = normalizeHomeTopicTabId(rawTabId);
    if (!rawFilter || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) continue;
    const filter = rawFilter as { categoryMetaFilters?: unknown };
    const categoryMetaFilters = normalizeStoredCategoryMetaFilters(filter.categoryMetaFilters);
    next[tabId] = Object.keys(categoryMetaFilters).length > 0 ? { categoryMetaFilters } : {};
  }
  return next;
}

export function readHomeTopicTabId(): HomeTopicTabId {
  if (typeof window === 'undefined') return DEFAULT_HOME_TOPIC_TAB_ID;

  try {
    return normalizeHomeTopicTabId(window.localStorage.getItem(HOME_TOPIC_TAB_STORAGE_KEY));
  } catch {
    return DEFAULT_HOME_TOPIC_TAB_ID;
  }
}

export function writeHomeTopicTabId(tabId: HomeTopicTabId) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(HOME_TOPIC_TAB_STORAGE_KEY, tabId);
  } catch {
    // Ignore blocked storage; the tab still changes for the current session.
  }
}

export function readHomeTopicFilterState(): HomeTopicFilterState {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(HOME_TOPIC_FILTER_STORAGE_KEY);
    if (!raw) return {};
    return normalizeStoredFilterState(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeHomeTopicFilterState(filters: HomeTopicFilterState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      HOME_TOPIC_FILTER_STORAGE_KEY,
      JSON.stringify(normalizeStoredFilterState(filters)),
    );
  } catch {
    // Ignore blocked storage; filters still work for the current session.
  }
}

const HomeTopicTabButton = memo(function HomeTopicTabButton({
  tab,
  active,
  loading,
  buttonId,
  buttonRef,
  onSelect,
}: HomeTopicTabButtonProps) {
  const pressHandlers = useInstantPress<HTMLButtonElement>(() => {
    if (!tab.disabled) onSelect(tab.id);
  });

  return (
    <button
      type="button"
      {...pressHandlers}
      id={buttonId}
      ref={buttonRef}
      className={`home-topic-tab ui-segment-tab pressable ${active ? 'home-topic-tab--active' : 'home-topic-tab--idle'}`}
      data-topic={tab.id}
      role="tab"
      aria-selected={active}
      aria-busy={loading || undefined}
      aria-label={tab.label}
      disabled={tab.disabled}
    >
      <span className="home-topic-tab-label">{tab.label}</span>
    </button>
  );
});

export const HomeTopicTabList = memo(function HomeTopicTabList({
  items,
  activeTabId,
  loadingTabId,
  bootstrapState = 'ready',
  hasFilter = false,
  ariaLabel,
  resetScrollStartTabIds,
  tabIdPrefix,
  children,
  onSelect,
}: HomeTopicTabListProps) {
  const isBootstrapping = bootstrapState === 'loading';
  const activeTabButtonRef = useRef<HTMLButtonElement | null>(null);
  const tabsListRef = useRef<HTMLDivElement | null>(null);
  const homeTopicTabsStyle = useMemo(() => ({
    '--home-topic-tab-count': Math.max(items.length, 1),
  }) as CSSProperties, [items.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (isBootstrapping) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (resetScrollStartTabIds?.has(activeTabId)) {
        tabsListRef.current?.scrollTo({ left: 0, behavior: 'auto' });
        return;
      }

      centerHomeTopicTabIfNeeded(tabsListRef.current, activeTabButtonRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, isBootstrapping, resetScrollStartTabIds]);

  return (
    <nav
      className="home-topic-tabs-shell"
      data-bootstrap-state={bootstrapState}
      data-has-filter={hasFilter ? 'true' : 'false'}
      aria-busy={isBootstrapping || undefined}
      aria-label={ariaLabel}
    >
      <div className="home-topic-tabs-rail">
        <div
          ref={tabsListRef}
          className="home-topic-tabs-list"
          role="tablist"
          aria-label={ariaLabel}
          style={homeTopicTabsStyle}
        >
          {items.map((tab) => (
            <HomeTopicTabButton
              key={tab.id}
              tab={tab}
              active={activeTabId === tab.id}
              loading={loadingTabId === tab.id}
              buttonId={tabIdPrefix ? `${tabIdPrefix}-${tab.id}-tab` : undefined}
              buttonRef={activeTabId === tab.id ? activeTabButtonRef : undefined}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
      {children}
    </nav>
  );
});

export const HomeTopicTabs = memo(function HomeTopicTabs({
  categories = [],
  activeTabId,
  loadingTabId,
  bootstrapState,
  showFilters,
  showStructuredFilter = false,
  activeFilterCount = 0,
  activeFilterFieldItems = [],
  onSelect,
  onFilterFieldClick,
}: HomeTopicTabsProps) {
  const topicTabs = useMemo(() => buildHomeTopicTabs(categories), [categories]);
  const resolvedBootstrapState = bootstrapState ?? (categories.length > 0 ? 'ready' : 'loading');
  const isBootstrapping = resolvedBootstrapState === 'loading';
  const renderedTopicTabs = isBootstrapping
    ? [...topicTabs, ...HOME_TOPIC_LOADING_TAB_PLACEHOLDERS]
    : topicTabs;
  const normalizedActiveTabId = normalizeHomeTopicTabId(activeTabId, categories);
  const normalizedLoadingTabId = loadingTabId ? normalizeHomeTopicTabId(loadingTabId, categories) : null;
  const resolvedShowFilters = showFilters ?? shouldShowHomeTopicFilters(normalizedActiveTabId, categories);
  const activeTab = getHomeTopicTab(normalizedActiveTabId, categories);
  const hasActiveFilters = activeFilterCount > 0;
  const canShowStructuredFilter = !isBootstrapping && resolvedShowFilters && showStructuredFilter && activeFilterFieldItems.length > 0;

  return (
    <HomeTopicTabList
      items={renderedTopicTabs}
      activeTabId={normalizedActiveTabId}
      loadingTabId={normalizedLoadingTabId}
      bootstrapState={resolvedBootstrapState}
      hasFilter={canShowStructuredFilter}
      ariaLabel="首页内容板块"
      resetScrollStartTabIds={BASE_HOME_TOPIC_TAB_IDS}
      onSelect={onSelect}
    >
      {canShowStructuredFilter ? (
        <div
          className="home-topic-filter-row"
          data-state={hasActiveFilters ? 'on' : 'off'}
          aria-label={`${activeTab.label}筛选条件`}
        >
          {activeFilterFieldItems.map((item) => {
            const displayLabel = `${item.label}：${item.valueLabel || '全部'}`;
            return (
              <button
                key={item.key}
                type="button"
                className="home-topic-filter-field-chip pressable"
                data-state={item.hasValue ? 'on' : 'off'}
                title={displayLabel}
                aria-label={`选择${item.label}，当前为${item.valueLabel || '全部'}`}
                onClick={() => onFilterFieldClick?.(item.key)}
              >
                <span className="home-topic-filter-field-text">
                  <span className="home-topic-filter-field-label">{item.label}</span>
                  <span className="home-topic-filter-field-value">：{item.valueLabel || '全部'}</span>
                </span>
                <ChevronDown className="home-topic-filter-field-caret" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </HomeTopicTabList>
  );
});
