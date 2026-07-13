import { normalizeCategoryRef } from './categoryRefs';

export const PUBLISH_CATEGORY_SCHEMA_VERSION = 1;
export const PUBLISH_CATEGORY_SCHEMA_VERSION_KEY = 'schemaVersion';
export const PUBLISH_CATEGORY_SCHEMA_CATEGORY_SLUG_KEY = 'categorySlug';
export const PUBLISH_CATEGORY_SCHEMA_FIELD_TYPES = new Set(['text', 'number', 'boolean', 'select', 'location']);
export const PUBLISH_CATEGORY_SCHEMA_MAX_FIELDS = 20;
export const PUBLISH_CATEGORY_SCHEMA_TEXT_MAX_LENGTH = 120;
export const PUBLISH_CATEGORY_SCHEMA_FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
export const PUBLISH_CATEGORY_SCHEMA_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function normalizePublishCategorySlug(value: unknown) {
  return normalizeCategoryRef(value).toLowerCase();
}

export function isValidPublishCategorySlug(value: unknown) {
  return PUBLISH_CATEGORY_SCHEMA_SLUG_PATTERN.test(normalizePublishCategorySlug(value));
}

export function normalizePublishCategorySchemaVersion(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return PUBLISH_CATEGORY_SCHEMA_VERSION;
  return Math.max(1, Math.floor(parsed));
}

export function normalizePublishCategoryFieldKey(value: unknown) {
  return String(value || '').trim();
}

export function isValidPublishCategoryFieldKey(value: unknown) {
  return PUBLISH_CATEGORY_SCHEMA_FIELD_KEY_PATTERN.test(normalizePublishCategoryFieldKey(value));
}
