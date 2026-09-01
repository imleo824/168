export type MainTabId = 'following' | 'discover';
export type HomeFeedKind = 'following' | 'recommended' | 'category';
export type HomeVisualState = 'ready' | 'skeleton';

export type HomeTabKind = 'following' | 'recommend' | 'category' | 'add';

export type HomeTab = {
  key: string;
  kind: HomeTabKind;
  label: string;
  categoryId?: string;
  countryFilterable?: boolean;
  countryFilterKey?: string;
  countryFilterLabel?: string;
};

export type FeedUpdateBadge = {
  count: number;
  hasMore: boolean;
};

export type RefreshState = 'idle' | 'refreshing' | 'success' | 'error';

export type RefreshUiSource = 'pull' | 'action' | 'tab';

export function getFeedIdentity(mainTab: MainTabId, categoryId: string) {
  if (mainTab === 'discover') return `discover:${categoryId || 'all'}`;
  return 'following';
}
