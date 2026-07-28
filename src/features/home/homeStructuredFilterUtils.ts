import type {
  Category,
  CategoryMetaFeedFilters,
  CategoryMetaFeedFilterValue,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '@/types';
import { findCategoryMetaSchema } from '@/features/category/categoryMetaSchema';
import { getHomeTopicCategorySlug, type HomeTopicTabId } from './HomeTopicTabs';

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

function formatLocationCityLabel(value: unknown) {
  const text = normalizeText(value, 120);
  const parts = text.split(/\s*·\s*/).map((item) => item.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : text;
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
