import type {
  Category,
  CategoryMetaFeedFilters,
  CategoryMetaFeedFilterValue,
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '@/types';
import { findCategoryMetaSchema } from '@/features/post-create/postCreateCategoryMeta';
import { getHomeTopicCategorySlug, type HomeTopicTabId } from './HomeTopicTabs';

export type DraftFilters = Record<string, CategoryMetaFeedFilterValue>;
export type LocationCityOption = { country: string; city: string; value: string };
export type LocationCountryGroup = { country: string; cities: LocationCityOption[] };
export type HomeStructuredFilterSummaryItem = { key: string; label: string };
export type HomeStructuredFilterFieldItem = {
  key: string;
  label: string;
  valueLabel?: string;
  hasValue: boolean;
};

const STRUCTURED_FILTER_TAB_SCOPES: Partial<Record<HomeTopicTabId, { slug: string; names: string[] }>> = {
  documents: { slug: 'documents', names: ['证件'] },
  jobs: { slug: 'jobs', names: ['招聘'] },
  secondhand: { slug: 'secondhand', names: ['二手'] },
  housing: { slug: 'housing', names: ['租房'] },
};

export const HOUSING_PRICE_RANGE_OPTIONS = [
  { label: '$500 以下', value: { max: 500 } },
  { label: '$500 - $800', value: { min: 500, max: 800 } },
  { label: '$800 - $1,200', value: { min: 800, max: 1200 } },
  { label: '$1,200 - $1,500', value: { min: 1200, max: 1500 } },
  { label: '$1,500 - $2,000', value: { min: 1500, max: 2000 } },
  { label: '$2,000 - $3,000', value: { min: 2000, max: 3000 } },
  { label: '$3,000 - $5,000', value: { min: 3000, max: 5000 } },
  { label: '$5,000 以上', value: { min: 5000 } },
] as const;

export function normalizeText(value: unknown, maxLength = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeRef(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCompactRef(value: unknown) {
  return normalizeRef(value).replace(/[\s_-]+/g, '');
}

export function getFieldKey(field: PublishCategoryMetaFieldConfig) {
  return normalizeText(field.key, 48);
}

export function getFieldLabel(field: PublishCategoryMetaFieldConfig) {
  return normalizeText(field.label || field.key, 32) || getFieldKey(field);
}

function isHousingFilterSchema(schema: PublishCategoryMetaConfig | null | undefined) {
  if (!schema) return false;
  return normalizeCompactRef(schema.slug || schema.id) === 'housing' || normalizeRef(schema.name) === '租房';
}

export function isHousingPriceFilterField(
  schema: PublishCategoryMetaConfig | null | undefined,
  field: PublishCategoryMetaFieldConfig,
) {
  if (!isHousingFilterSchema(schema)) return false;
  const key = normalizeCompactRef(getFieldKey(field));
  const label = normalizeRef(getFieldLabel(field));
  return key === 'price' ||
    key === 'rent' ||
    key === 'monthlyrent' ||
    label === '价格' ||
    label === '租金' ||
    label === '月租';
}

function isHiddenHousingFilterField(field: PublishCategoryMetaFieldConfig) {
  const key = normalizeCompactRef(getFieldKey(field));
  const label = normalizeRef(getFieldLabel(field));
  return key === 'area' ||
    key === 'depositmonths' ||
    key === 'paymentmonths' ||
    label === '面积' ||
    label === '押几' ||
    label === '付几' ||
    label === '押金月数' ||
    label === '押几付几';
}

export function getVisibleHomeStructuredFilterFields(schema: PublishCategoryMetaConfig | null | undefined) {
  if (!schema || !Array.isArray(schema.fields)) return [];
  return sortHomeStructuredFilterFields(
    schema.fields.filter((field) => !(isHousingFilterSchema(schema) && isHiddenHousingFilterField(field))),
  );
}

export function isLocationField(field: PublishCategoryMetaFieldConfig) {
  const key = getFieldKey(field).toLowerCase();
  const label = getFieldLabel(field);
  return key === 'location' || label === '地点' || field.type === 'location';
}

function sortHomeStructuredFilterFields(fields: PublishCategoryMetaFieldConfig[]) {
  return [...fields].sort((left, right) => Number(isLocationField(right)) - Number(isLocationField(left)));
}

export function isSingleMinimumNumberFilterField(field: PublishCategoryMetaFieldConfig) {
  const key = normalizeCompactRef(getFieldKey(field));
  const label = normalizeRef(getFieldLabel(field));
  return key === 'bedrooms' ||
    key === 'bathrooms' ||
    label === '卧室' ||
    label === '浴室' ||
    label === '卫生间';
}

function formatLocationCityLabel(value: unknown) {
  const text = normalizeText(value, 120);
  const parts = text.split(/\s*·\s*/).map((item) => item.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : text;
}

export function getRangeDraft(value: CategoryMetaFeedFilterValue | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { min: '', max: '' };
  return {
    min: value.min === undefined || value.min === null ? '' : String(value.min),
    max: value.max === undefined || value.max === null ? '' : String(value.max),
  };
}

export function setRangeDraft(current: DraftFilters, key: string, edge: 'min' | 'max', value: string): DraftFilters {
  const range = getRangeDraft(current[key]);
  const nextRange = { ...range, [edge]: value };
  if (!nextRange.min && !nextRange.max) {
    const next = { ...current };
    delete next[key];
    return next;
  }
  return { ...current, [key]: nextRange };
}

export function setMinimumNumberDraft(current: DraftFilters, key: string, value: string): DraftFilters {
  if (!value) {
    const next = { ...current };
    delete next[key];
    return next;
  }
  return { ...current, [key]: { min: value } };
}

export function areRangesEqual(
  left: CategoryMetaFeedFilterValue | undefined,
  right: { min?: number; max?: number },
) {
  const range = getRangeDraft(left);
  const min = range.min ? Number(range.min) : undefined;
  const max = range.max ? Number(range.max) : undefined;
  return (right.min === undefined ? min === undefined : min === right.min) &&
    (right.max === undefined ? max === undefined : max === right.max);
}

export function normalizeLocationGroups(locationPresets: LocationPresetConfig[]): LocationCountryGroup[] {
  const seenCountries = new Set<string>();
  return locationPresets.map((preset) => {
    const country = normalizeText(preset.country, 32);
    if (!country || !Array.isArray(preset.cities)) return null;
    const countryKey = country.toLowerCase();
    if (seenCountries.has(countryKey)) return null;
    seenCountries.add(countryKey);

    const seenCities = new Set<string>([country.toLowerCase()]);
    const cityOptions = preset.cities
      .map((city) => normalizeText(city, 32))
      .filter(Boolean)
      .map((city) => {
        const value = `${country} · ${city}`;
        const key = city.toLowerCase();
        if (seenCities.has(key)) return null;
        seenCities.add(key);
        return { country, city, value };
      })
      .filter((item): item is { country: string; city: string; value: string } => Boolean(item));
    const cities = [{ country, city: country, value: country }, ...cityOptions];

    return cities.length > 0 ? { country, cities } : null;
  }).filter((item): item is LocationCountryGroup => Boolean(item));
}

export function getLocationSelectedCountry(value: unknown, groups: LocationCountryGroup[]) {
  const text = normalizeText(value, 120);
  if (text) {
    const matchedGroup = groups.find((group) => group.cities.some((city) => city.value === text));
    if (matchedGroup) return matchedGroup.country;

    const [country] = text.split(/\s*·\s*/);
    const normalizedCountry = normalizeText(country, 32).toLowerCase();
    const groupByCountry = groups.find((group) => group.country.toLowerCase() === normalizedCountry);
    if (groupByCountry) return groupByCountry.country;
  }

  return groups[0]?.country || '';
}

export function normalizeDraftFilters(
  fields: PublishCategoryMetaFieldConfig[],
  draft: DraftFilters,
) {
  const next: CategoryMetaFeedFilters = {};
  const errors: string[] = [];

  fields.forEach((field) => {
    const key = getFieldKey(field);
    if (!key) return;
    const rawValue = draft[key];
    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    if (field.type === 'number') {
      const range = getRangeDraft(rawValue);
      const min = range.min ? Number(range.min) : undefined;
      const isMinimumOnly = isSingleMinimumNumberFilterField(field);
      const max = !isMinimumOnly && range.max ? Number(range.max) : undefined;
      const label = getFieldLabel(field);

      if (range.min && !Number.isFinite(min)) {
        errors.push(`${label}最小值不合法`);
        return;
      }
      if (!isMinimumOnly && range.max && !Number.isFinite(max)) {
        errors.push(`${label}最大值不合法`);
        return;
      }
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        errors.push(`${label}最小值不能大于最大值`);
        return;
      }

      const normalizedRange: { min?: number; max?: number } = {};
      if (typeof min === 'number') normalizedRange.min = min;
      if (typeof max === 'number') normalizedRange.max = max;
      if (Object.keys(normalizedRange).length > 0) next[key] = normalizedRange;
      return;
    }

    if (field.type === 'boolean') {
      if (typeof rawValue === 'boolean') next[key] = rawValue;
      return;
    }

    const text = normalizeText(rawValue, Number(field.maxLength) || 120);
    if (text) next[key] = text;
  });

  return { filters: next, errors };
}

export function getHomeStructuredFilterScope(schema: PublishCategoryMetaConfig | null | undefined, tabId?: HomeTopicTabId) {
  if (schema?.slug || schema?.id) return normalizeText(schema.slug || schema.id, 80);
  return tabId ? getHomeTopicCategorySlug(tabId) || STRUCTURED_FILTER_TAB_SCOPES[tabId]?.slug || '' : '';
}

export function findHomeStructuredFilterSchema(
  tabId: HomeTopicTabId,
  schemas: PublishCategoryMetaConfig[] | undefined,
  categories: Category[] = [],
) {
  if (!Array.isArray(schemas)) return null;

  const categorySlug = getHomeTopicCategorySlug(tabId);
  if (categorySlug) {
    const normalizedCategorySlug = normalizeRef(categorySlug);
    const selectedCategory = categories.find((category) => {
      return normalizeRef(category.slug) === normalizedCategorySlug ||
        normalizeRef(category.id) === normalizedCategorySlug;
    });
    return selectedCategory ? findCategoryMetaSchema(selectedCategory.id, schemas, categories) : null;
  }

  const target = STRUCTURED_FILTER_TAB_SCOPES[tabId];
  if (!target) return null;
  const targetNames = new Set(target.names.map((name) => normalizeRef(name)));

  return schemas.find((schema) => {
    if (normalizeRef(schema.slug) === normalizeRef(target.slug)) return true;
    if (normalizeRef(schema.id) === normalizeRef(target.slug)) return true;
    return targetNames.has(normalizeRef(schema.name));
  }) || null;
}

export function countCategoryMetaFeedFilters(filters: CategoryMetaFeedFilters | undefined) {
  if (!filters) return 0;
  return Object.values(filters).filter((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'boolean') return true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value.min !== undefined || value.max !== undefined;
    }
    return false;
  }).length;
}

function formatHomeStructuredFilterValue(
  field: PublishCategoryMetaFieldConfig,
  value: CategoryMetaFeedFilterValue | undefined,
) {
  if (value === undefined || value === null || value === '') return '';

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (field.type === 'number' && typeof value === 'object' && !Array.isArray(value)) {
    const min = typeof value.min === 'number' ? value.min : undefined;
    const max = typeof value.max === 'number' ? value.max : undefined;
    if (min !== undefined && max !== undefined) return `${min}-${max}`;
    if (min !== undefined) return `≥${min}`;
    if (max !== undefined) return `≤${max}`;
    return '';
  }

  if (isLocationField(field)) {
    return formatLocationCityLabel(value);
  }

  return normalizeText(value, 80);
}

export function buildHomeStructuredFilterSummaryItems(
  schema: PublishCategoryMetaConfig | null | undefined,
  filters: CategoryMetaFeedFilters | undefined,
) {
  if (!schema || !Array.isArray(schema.fields) || !filters) return [];

  return getVisibleHomeStructuredFilterFields(schema).flatMap((field) => {
    const key = getFieldKey(field);
    if (!key) return [];

    const value = filters[key];
    const valueLabel = formatHomeStructuredFilterValue(field, value);
    return valueLabel ? [{ key, label: valueLabel }] : [];
  });
}

export function buildHomeStructuredFilterFieldItems(
  schema: PublishCategoryMetaConfig | null | undefined,
  filters: CategoryMetaFeedFilters | undefined,
): HomeStructuredFilterFieldItem[] {
  return getVisibleHomeStructuredFilterFields(schema).flatMap((field) => {
    const key = getFieldKey(field);
    if (!key) return [];
    const valueLabel = formatHomeStructuredFilterValue(field, filters?.[key]);
    return [{
      key,
      label: getFieldLabel(field),
      valueLabel: valueLabel || '全部',
      hasValue: Boolean(valueLabel),
    }];
  });
}

export function sanitizeHomeStructuredFilters(
  schema: PublishCategoryMetaConfig | null | undefined,
  filters: CategoryMetaFeedFilters | undefined,
) {
  if (!filters) return {};
  const allowedKeys = new Set(getVisibleHomeStructuredFilterFields(schema).map(getFieldKey).filter(Boolean));
  return Object.entries(filters).reduce<CategoryMetaFeedFilters>((next, [key, value]) => {
    if (allowedKeys.has(key)) next[key] = value;
    return next;
  }, {});
}
