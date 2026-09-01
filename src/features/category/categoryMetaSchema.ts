import type { PublishCategoryMetaConfig } from '@/types';
import { isSameCategoryRef } from '../../../shared/categoryRefs';
import {
  normalizePublishCategorySchemaVersion,
  normalizePublishCategorySlug,
} from '../../../shared/publishCategorySchema';

export const CATEGORY_META_TEXT_MAX_LENGTH = 120;

export function normalizeConfigText(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeRef(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export const isSameRef = isSameCategoryRef;

export function normalizePublishCategorySchema(configs: unknown): PublishCategoryMetaConfig[] {
  if (!Array.isArray(configs)) return [];
  return configs
    .map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const data = raw as Record<string, any>;
      const categorySlug = normalizePublishCategorySlug(data.categorySlug || data.slug || data.id);
      if (!categorySlug) return null;
      const fields = Array.isArray(data.fields)
        ? data.fields
            .map((field: any) => {
              const key = normalizeConfigText(field?.key || field?.name);
              const rawLabel = normalizeConfigText(field?.label || key);
              const rawType = normalizeConfigText(field?.type);
              const normalizedKey = key.toLowerCase();
              const label = rawLabel;
              const type = ['depositmonths', 'paymentmonths'].includes(normalizedKey)
                ? 'number'
                : ['text', 'select'].includes(rawType) && (normalizedKey === 'location' || label === '地点')
                  ? 'location'
                  : rawType;
              const rawMaxLength = Number(field?.maxLength);
              const maxLength = Number.isFinite(rawMaxLength)
                ? Math.max(1, Math.min(Math.round(rawMaxLength), CATEGORY_META_TEXT_MAX_LENGTH))
                : CATEGORY_META_TEXT_MAX_LENGTH;
              const rawMin = Number(field?.min);
              const rawMax = Number(field?.max);
              if (!key || !label || !['text', 'number', 'boolean', 'select', 'location'].includes(type)) return null;

              const normalizedField: PublishCategoryMetaConfig['fields'][number] = {
                key,
                label,
                type: type as 'text' | 'number' | 'boolean' | 'select' | 'location',
                required: Boolean(field?.required),
              };

              if (type === 'text') {
                normalizedField.maxLength = maxLength;
              }

              if (type === 'number') {
                if (normalizedKey === 'depositmonths') {
                  normalizedField.min = 0;
                  normalizedField.max = 24;
                } else if (normalizedKey === 'paymentmonths') {
                  normalizedField.min = 1;
                  normalizedField.max = 24;
                } else {
                  if (Number.isFinite(rawMin)) normalizedField.min = Math.round(rawMin);
                  if (Number.isFinite(rawMax)) normalizedField.max = Math.round(rawMax);
                }
              }

              if (type === 'select') {
                const options = Array.isArray(field?.options)
                  ? field.options.map((option: unknown) => normalizeConfigText(option)).filter(Boolean)
                  : [];
                if (options.length > 0) {
                  normalizedField.options = options;
                }
              }

              if (type === 'location') {
                delete normalizedField.maxLength;
              }

              return normalizedField;
            })
            .filter(Boolean)
        : [];
      return {
        categorySlug,
        schemaVersion: normalizePublishCategorySchemaVersion(data.schemaVersion),
        id: normalizeConfigText(data.id),
        slug: normalizeConfigText(data.slug || categorySlug),
        name: normalizeConfigText(data.name),
        fields,
      } as PublishCategoryMetaConfig;
    })
    .filter((item): item is PublishCategoryMetaConfig => Boolean(item));
}

export function findCategoryMetaSchema(
  categoryId: string,
  schemas: PublishCategoryMetaConfig[],
  fallbackCategories: { id: string; name: string; slug: string }[],
) {
  const selectedCategory = fallbackCategories.find((item) => {
    return isSameCategoryRef(item.id, categoryId) ||
      isSameCategoryRef(item.slug, categoryId) ||
      isSameCategoryRef(item.name, categoryId);
  });
  if (!selectedCategory) return null;

  return schemas.find((schema) => {
    return [schema.categorySlug, schema.slug, schema.id, schema.name].some((ref) => (
      isSameCategoryRef(ref, selectedCategory.slug) ||
      isSameCategoryRef(ref, selectedCategory.id) ||
      isSameCategoryRef(ref, selectedCategory.name)
    ));
  }) ?? null;
}
