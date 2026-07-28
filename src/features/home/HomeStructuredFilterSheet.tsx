import { lazy, Suspense } from 'react';
import type {
  CategoryMetaFeedFilters,
  LocationPresetConfig,
  PublishCategoryMetaConfig,
} from '@/types';
import type { HomeTopicTabId } from './HomeTopicTabs';

export interface HomeStructuredFilterSheetProps {
  open: boolean;
  tabId: HomeTopicTabId;
  schema: PublishCategoryMetaConfig | null;
  value: CategoryMetaFeedFilters;
  locationPresets: LocationPresetConfig[];
  focusFieldKey?: string;
  onClose: () => void;
  onApply: (filters: CategoryMetaFeedFilters) => void;
}

const LazyHomeStructuredFilterSheetPanel = lazy(() =>
  import('./HomeStructuredFilterSheetPanel').then((module) => ({
    default: module.HomeStructuredFilterSheetPanel,
  })),
);

export function HomeStructuredFilterSheet(props: HomeStructuredFilterSheetProps) {
  if (!props.open) return null;

  return (
    <Suspense fallback={null}>
      <LazyHomeStructuredFilterSheetPanel {...props} />
    </Suspense>
  );
}

export default HomeStructuredFilterSheet;
