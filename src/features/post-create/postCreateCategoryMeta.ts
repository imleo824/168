import type { PublishCategoryMetaConfig } from '@/types';

import { CATEGORY_META_TEXT_MAX_LENGTH } from './postCreateConstants';
import { formatCreateLocationCity, normalizeCreateLocation } from './postCreateLocation';
import { isSameCategoryRef } from '../../../shared/categoryRefs';
import {
  normalizePublishCategorySchemaVersion,
  normalizePublishCategorySlug,
} from '../../../shared/publishCategorySchema';

export type CategoryMetaValidationResult = {
  normalized: Record<string, string>;
  errors: string[];
  fieldErrors: Record<string, string>;
};

export type CategoryMetaCompletion = {
  completed: number;
  total: number;
  missingRequired: number;
  firstErrorKey: string;
  label: string;
  tone: 'empty' | 'partial' | 'complete' | 'error';
};

export function normalizeConfigText(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeRef(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export const isSameRef = isSameCategoryRef;

export function parseCategoryMetaFieldNumber(raw: string, field: PublishCategoryMetaConfig['fields'][number]) {
  const next = Number(raw);
  if (!Number.isFinite(next)) return { error: '请输入数字' as const };

  if (typeof field.min === 'number' && next < field.min) {
    return { error: `至少 ${field.min}` as const };
  }

  if (typeof field.max === 'number' && next > field.max) {
    return { error: `最多 ${field.max}` as const };
  }

  return { value: next };
}

export function normalizeCategoryMetaBoolean(raw: unknown) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'y', '是', '已开启'].includes(value)) return true;
    if (['false', '0', 'no', 'off', 'n', '否', '未开启'].includes(value)) return false;
  }
  return null;
}

export function isCategoryMetaLocationField(field: PublishCategoryMetaConfig['fields'][number]) {
  const key = normalizeConfigText(field?.key).toLowerCase();
  const label = normalizeConfigText(field?.label);
  return field?.type === 'location' || key === 'location' || label === '地点';
}

export function getCategoryMetaFieldKey(field: PublishCategoryMetaConfig['fields'][number]) {
  return String(field?.key || '').trim();
}

export function getOrderedCategoryMetaFields(fields: PublishCategoryMetaConfig['fields']) {
  return [...fields].sort((left, right) => {
    const requiredDelta = Number(Boolean(right.required)) - Number(Boolean(left.required));
    if (requiredDelta !== 0) return requiredDelta;
    return 0;
  });
}

export function hasCategoryMetaFieldValue(field: PublishCategoryMetaConfig['fields'][number], rawValue: unknown) {
  const value = String(rawValue ?? '').trim();
  if (!value) return false;
  if (isCategoryMetaLocationField(field)) return Boolean(normalizeCreateLocation(value));
  return true;
}

export function summarizeCategoryMetaValue(field: PublishCategoryMetaConfig['fields'][number], rawValue: string) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (field.type === 'boolean') {
    const normalized = normalizeCategoryMetaBoolean(value);
    if (normalized === true) return '是';
    if (normalized === false) return '否';
  }
  if (isCategoryMetaLocationField(field)) {
    return formatCreateLocationCity(value);
  }
  return value;
}

export function getCategoryMetaCompletion(
  fields: PublishCategoryMetaConfig['fields'],
  rawMeta: Record<string, string>,
  fieldErrors: Record<string, string>,
): CategoryMetaCompletion {
  const validFields = fields.filter((field) => Boolean(getCategoryMetaFieldKey(field)));
  const total = validFields.length;
  let completed = 0;
  let missingRequired = 0;
  let firstErrorKey = '';

  validFields.forEach((field) => {
    const key = getCategoryMetaFieldKey(field);
    const hasValue = hasCategoryMetaFieldValue(field, rawMeta[key]);
    const hasError = Boolean(fieldErrors[key]);
    if (hasValue && !hasError) completed += 1;
    if (field.required && (!hasValue || hasError)) {
      missingRequired += 1;
      if (!firstErrorKey) firstErrorKey = key;
    } else if (hasError && !firstErrorKey) {
      firstErrorKey = key;
    }
  });

  const tone = firstErrorKey
    ? 'error'
    : total > 0 && completed === total
      ? 'complete'
      : completed > 0
        ? 'partial'
        : 'empty';
  const label = total > 0 ? `${completed}/${total} 已填` : '无需补充';

  return {
    completed,
    total,
    missingRequired,
    firstErrorKey,
    label,
    tone,
  };
}

export function validatePublishCategoryMetaPayload(
  schema: PublishCategoryMetaConfig | null,
  rawMeta: Record<string, string>,
  locationPresetValues = new Set<string>(),
): CategoryMetaValidationResult {
  if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    return {
      normalized: {},
      errors: [] as string[],
      fieldErrors: {},
    };
  }

  const knownFieldKeys = new Set<string>();
  schema.fields.forEach((field) => {
    if (field?.key) knownFieldKeys.add(String(field.key).trim());
  });

  const extraKeys = Object.keys(rawMeta || {}).filter((key) => {
    return !knownFieldKeys.has(key);
  });

  const normalized: Record<string, string> = {};
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  const setFieldError = (fieldKey: string, message: string) => {
    if (!fieldErrors[fieldKey]) {
      fieldErrors[fieldKey] = message;
    }
  };

  if (extraKeys.length > 0) {
    errors.push(`包含不支持字段：${extraKeys.join('、')}`);
  }

  schema.fields.forEach((field) => {
    const key = String(field?.key || '').trim();
    if (!key) return;

    const label = String(field.label || key).trim() || key;
    const rawValue = rawMeta[key];
    const hasValue = rawValue !== undefined && rawValue !== null && String(rawValue).trim().length > 0;
    const textLimit = Number.isFinite(field.maxLength as number) ? Math.max(1, Number(field.maxLength)) : CATEGORY_META_TEXT_MAX_LENGTH;

    if (isCategoryMetaLocationField(field)) {
      const text = normalizeCreateLocation(String(rawValue || ''));

      if (!text && field.required) {
        const message = `${label} 不能为空`;
        errors.push(message);
        setFieldError(key, message);
        return;
      }

      if (text) {
        if (locationPresetValues.size === 0) {
          const message = `${label} 暂无可选地点`;
          errors.push(message);
          setFieldError(key, message);
          return;
        }

        if (!locationPresetValues.has(text)) {
          const message = `${label} 请选择预设地点`;
          errors.push(message);
          setFieldError(key, message);
          return;
        }

        normalized[key] = text;
      }
      return;
    }

    if (field.type === 'text') {
      const text = normalizeConfigText(rawValue);
      if (text.length > textLimit) {
        const message = `${label} 不能超过 ${textLimit} 字`;
        errors.push(message);
        setFieldError(key, message);
        return;
      }

      if (!text && field.required) {
        const message = `${label} 不能为空`;
        errors.push(message);
        setFieldError(key, message);
      } else if (text) {
        normalized[key] = text;
      }
      return;
    }

    if (field.type === 'number') {
      if (!hasValue) {
        if (field.required) {
          const message = `${label} 不能为空`;
          errors.push(message);
          setFieldError(key, message);
        }
        return;
      }

      const result = parseCategoryMetaFieldNumber(String(rawValue).trim(), field);
      if ('error' in result) {
        const message = `${label}${result.error ? `：${result.error}` : ''}`.trim();
        errors.push(message);
        setFieldError(key, message);
        return;
      }
      if (typeof result.value === 'number') {
        normalized[key] = String(result.value);
      }
      return;
    }

    if (field.type === 'boolean') {
      const value = normalizeCategoryMetaBoolean(rawValue);
      if (!hasValue && field.required) {
        const message = `${label} 不能为空`;
        errors.push(message);
        setFieldError(key, message);
        return;
      }
      if (hasValue) {
        if (value === null) {
          const message = `${label} 请输入是/否`;
          errors.push(message);
          setFieldError(key, message);
          return;
        }
        normalized[key] = String(value);
      }
      return;
    }

    if (field.type === 'select') {
      const text = normalizeConfigText(rawValue);
      if (!text && field.required) {
        const message = `${label} 不能为空`;
        errors.push(message);
        setFieldError(key, message);
        return;
      }

      if (text) {
        const options = Array.isArray(field.options)
          ? field.options.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        if (options.length > 0 && !options.includes(text)) {
          const message = `${label} 请选择列表中的选项`;
          errors.push(message);
          setFieldError(key, message);
          return;
        }
        normalized[key] = text;
      }
      return;
    }
  });

  return { normalized, errors, fieldErrors };
}

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
              const maxLength = Number.isFinite(rawMaxLength) ? Math.max(1, Math.min(Math.round(rawMaxLength), CATEGORY_META_TEXT_MAX_LENGTH)) : CATEGORY_META_TEXT_MAX_LENGTH;
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
  const selectedCategory = fallbackCategories.find((item) => item.id === categoryId);
  if (!selectedCategory) return null;

  return schemas.find((schema) => {
    if (schema.categorySlug && schema.categorySlug === selectedCategory.slug) return true;
    if (schema.slug && schema.slug === selectedCategory.slug) return true;
    return false;
  }) ?? null;
}
