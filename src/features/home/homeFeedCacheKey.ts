import type { CategoryMetaFeedFilters } from '@/types';
import type { HomeFeedKind } from '@/features/home/homeTypes';

export type StableHomeFeedParams = {
  feed: HomeFeedKind;
  categorySlug?: string;
  categoryMetaScope?: string;
  categoryMetaFilters?: CategoryMetaFeedFilters;
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next !== undefined && next !== null && next !== '') acc[key] = stableNormalize(next);
        return acc;
      }, {});
  }
  return value;
}

export function stableHomeFeedParams(params: StableHomeFeedParams): StableHomeFeedParams {
  return stableNormalize(params) as StableHomeFeedParams;
}

export function stableHomeFeedParamsKey(params: StableHomeFeedParams) {
  return JSON.stringify(stableHomeFeedParams(params));
}
