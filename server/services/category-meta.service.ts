import type { PostCategoryMetaFilter } from '../post.service';
import type {
  LocationPresetConfig,
  PublishCategoryMetaFieldConfig,
  PublishCategoryMetaConfig,
} from '../config.service';
import { isSameCategoryRef } from '../../shared/categoryRefs';

const DEFAULT_PUBLISH_CATEGORY_META_TEXT_MAX_LENGTH = 120;
const CATEGORY_META_LOCATION_MAX_LENGTH = 120;

function normalizeCategoryMetaTextValue(raw: unknown, _maxLength = DEFAULT_PUBLISH_CATEGORY_META_TEXT_MAX_LENGTH) {
  void _maxLength;
  const text = String(raw ?? '').trim();
  return text;
}

function normalizeCategoryMetaLocationValue(raw: unknown) {
  return String(raw ?? '')
    .replace(/^📍\s*/, '')
    .replace(/^(?:location|loc|位置|地点)[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CATEGORY_META_LOCATION_MAX_LENGTH);
}

export function buildLocationPresetValueSet(rawPresets: unknown) {
  const source = Array.isArray(rawPresets) ? rawPresets as LocationPresetConfig[] : [];
  const values = new Set<string>();

  source.forEach((group) => {
    if (!group || typeof group !== 'object') return;
    const country = normalizeCategoryMetaLocationValue((group as LocationPresetConfig).country);
    if (country) values.add(country);
    const cities = Array.isArray((group as LocationPresetConfig).cities)
      ? (group as LocationPresetConfig).cities
      : [];

    cities.forEach((city) => {
      const normalizedCity = normalizeCategoryMetaLocationValue(city);
      if (!country || !normalizedCity) return;
      values.add(`${country} · ${normalizedCity}`);
    });
  });

  return values;
}

function normalizeCategoryMetaBooleanValue(raw: unknown) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '已开启', '是', 'y', '是的'].includes(value)) return true;
    if (['false', '0', 'no', 'n', 'off', '未开启', '否', '不是'].includes(value)) return false;
  }

  return null;
}

type PublishCategoryMetaValidationResult = {
  normalized: Record<string, unknown>;
  errors: string[];
};

function normalizePublishCategoryMetaValue(
  schema: PublishCategoryMetaFieldConfig,
  rawValue: unknown,
  errors: string[],
  locationPresetValues: Set<string>,
) {
  if (!schema || typeof schema !== 'object') return null;

  const key = String(schema.key || '').trim();
  if (!key) return null;

  const label = String(schema.label || schema.key || key);
  const isRequired = Boolean(schema.required);
  const configuredType = String(schema.type || '').toLowerCase();
  const type = (key.toLowerCase() === 'location' || label.trim() === '地点') &&
    (configuredType === 'text' || configuredType === 'select')
      ? 'location'
      : configuredType;

  if (type === 'text') {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (isRequired) {
        errors.push(`${label} 必填`);
      }
      return null;
    }

    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      errors.push(`${label} 需为文本`);
      return null;
    }

    const next = normalizeCategoryMetaTextValue(rawValue, Number(schema.maxLength) || DEFAULT_PUBLISH_CATEGORY_META_TEXT_MAX_LENGTH);
    const textMaxLength = Number(schema.maxLength) && Number(schema.maxLength) > 0
      ? Math.floor(Number(schema.maxLength))
      : DEFAULT_PUBLISH_CATEGORY_META_TEXT_MAX_LENGTH;

    if (next.length > textMaxLength) {
      errors.push(`${label} 不超过 ${textMaxLength} 字`);
      return null;
    }

    if (!next) {
      if (isRequired) errors.push(`${label} 必填`);
      return null;
    }

    return next;
  }

  if (type === 'location') {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (isRequired) {
        errors.push(`${label} 必填`);
      }
      return null;
    }

    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      errors.push(`${label} 需为地点`);
      return null;
    }

    const next = normalizeCategoryMetaLocationValue(rawValue);
    if (!next) {
      if (isRequired) errors.push(`${label} 必填`);
      return null;
    }

    if (locationPresetValues.size === 0) {
      errors.push(`${label} 暂无可选地点，请先在后台配置地点预设`);
      return null;
    }

    if (!locationPresetValues.has(next)) {
      errors.push(`${label} 请选择预设地点`);
      return null;
    }

    return next;
  }

  if (type === 'number') {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (isRequired) {
        errors.push(`${label} 必填`);
      }
      return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      errors.push(`${label} 需为数字`);
      return null;
    }

    if (typeof schema.min === 'number' && Number.isFinite(schema.min) && parsed < schema.min) {
      errors.push(`${label} 不低于 ${schema.min}`);
      return null;
    }
    if (typeof schema.max === 'number' && Number.isFinite(schema.max) && parsed > schema.max) {
      errors.push(`${label} 不超过 ${schema.max}`);
      return null;
    }
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (type === 'boolean') {
    if (rawValue === undefined || rawValue === null) {
      if (isRequired) {
        errors.push(`${label} 必填`);
      }
      return null;
    }

    const normalizedBoolean = normalizeCategoryMetaBooleanValue(rawValue);
    if (normalizedBoolean === null) {
      errors.push(`${label} 需为布尔值`);
      return null;
    }

    return normalizedBoolean;
  }

  if (type === 'select') {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (isRequired) {
        errors.push(`${label} 必填`);
      }
      return null;
    }

    const next = normalizeCategoryMetaTextValue(rawValue);
    const options = Array.isArray(schema.options)
      ? schema.options.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    if (options.length > 0 && !options.includes(next)) {
      errors.push(`${label} 选项不合法`);
      return null;
    }

    if (!next && isRequired) {
      errors.push(`${label} 必填`);
      return null;
    }

    return next;
  }

  return null;
}

export function normalizePublishCategoryMetaPayload(
  rawMeta: unknown,
  schema: PublishCategoryMetaConfig | null,
  locationPresetValues = new Set<string>(),
): PublishCategoryMetaValidationResult {
  if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    return { normalized: {}, errors: [] };
  }

  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    const hasRequired = schema.fields.some((field) => Boolean(field?.required));
    if (hasRequired) {
      return {
        normalized: {},
        errors: ['请补充该分类的附加信息'],
      };
    }
    return { normalized: {}, errors: [] };
  }

  const rawMetaObject = rawMeta as Record<string, unknown>;
  const expectedFields = schema.fields.filter((field) => {
    const key = String(field?.key || '').trim();
    return key.length > 0;
  });
  const knownKeys = new Set(expectedFields.map((field) => String(field.key).trim()));

  const extraKeys = Object.keys(rawMetaObject).filter((key) => !knownKeys.has(key));
  const errors: string[] = [];

  if (extraKeys.length > 0) {
    errors.push(`含有不支持的字段：${extraKeys.join('、')}`);
  }

  const normalized: Record<string, unknown> = {};
  expectedFields.forEach((field) => {
    const key = String(field.key || '').trim();
    if (!key) return;
    const normalizedValue = normalizePublishCategoryMetaValue(field, rawMetaObject[key], errors, locationPresetValues);
    if (normalizedValue !== null) {
      normalized[key] = normalizedValue;
    }
  });

  return { normalized, errors };
}

function findPublishCategoryMetaSchemaByScope(
  scope: unknown,
  schemas: PublishCategoryMetaConfig[],
) {
  const normalizedScope = String(scope || '').trim();
  if (!normalizedScope) return null;

  return schemas.find((schema) => {
    return [schema.id, schema.slug, schema.categorySlug, schema.name].some((ref) => isSameCategoryRef(ref, normalizedScope));
  }) || null;
}

function findPublishCategoryMetaSchemaByFilterKeys(
  filters: Record<string, unknown>,
  schemas: PublishCategoryMetaConfig[],
) {
  const keys = Object.keys(filters || {}).map((key) => key.trim()).filter(Boolean);
  if (keys.length === 0) return null;

  return schemas.find((schema) => {
    const fields = Array.isArray(schema.fields) ? schema.fields : [];
    const fieldKeys = new Set(fields.map((field) => String(field?.key || '').trim()).filter(Boolean));
    return keys.every((key) => fieldKeys.has(key));
  }) || null;
}

function parseCategoryMetaFilterPayload(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return { value: {} as Record<string, unknown> };

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null as Record<string, unknown> | null, error: 'categoryMetaFilters 必须是对象' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { value: null as Record<string, unknown> | null, error: 'categoryMetaFilters 不是合法 JSON' };
  }
}

export function normalizeCategoryMetaFeedFilters(
  rawScope: unknown,
  rawFilters: unknown,
  schemas: PublishCategoryMetaConfig[],
  locationPresetValues: Set<string>,
): { filters: PostCategoryMetaFilter[]; errors: string[] } {
  if (!rawScope && !rawFilters) return { filters: [], errors: [] };

  const parsed = parseCategoryMetaFilterPayload(rawFilters);
  if (parsed.error || !parsed.value) {
    return { filters: [], errors: [parsed.error || 'categoryMetaFilters 不合法'] };
  }

  const rawFilterObject = parsed.value;
  const schema = findPublishCategoryMetaSchemaByScope(rawScope, schemas) ||
    (!rawScope ? findPublishCategoryMetaSchemaByFilterKeys(rawFilterObject, schemas) : null);
  if (!schema) {
    return { filters: [], errors: [rawScope ? 'categoryMetaScope 不合法' : 'categoryMetaScope 必填'] };
  }

  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const fieldByKey = new Map(
    fields
      .map((field) => [String(field?.key || '').trim(), field] as const)
      .filter(([key]) => Boolean(key)),
  );
  const errors: string[] = [];
  const filters: PostCategoryMetaFilter[] = [];

  Object.entries(rawFilterObject).forEach(([rawKey, rawValue]) => {
    const key = String(rawKey || '').trim();
    if (!key) return;

    const field = fieldByKey.get(key);
    if (!field) {
      errors.push(`不支持的筛选字段：${key}`);
      return;
    }

    const label = String(field.label || field.key || key).trim() || key;
    const configuredType = String(field.type || '').toLowerCase();
    const type = (key.toLowerCase() === 'location' || label === '地点') &&
      (configuredType === 'text' || configuredType === 'select')
        ? 'location'
        : configuredType;

    if (rawValue === undefined || rawValue === null || rawValue === '') return;

    if (type === 'number') {
      const range = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue as Record<string, unknown>
        : { min: rawValue, max: rawValue };
      const rawMin = range.min;
      const rawMax = range.max;
      const hasMin = rawMin !== undefined && rawMin !== null && rawMin !== '';
      const hasMax = rawMax !== undefined && rawMax !== null && rawMax !== '';
      const min = hasMin ? Number(rawMin) : undefined;
      const max = hasMax ? Number(rawMax) : undefined;

      if (hasMin && !Number.isFinite(min)) {
        errors.push(`${label} 最小值不合法`);
        return;
      }
      if (hasMax && !Number.isFinite(max)) {
        errors.push(`${label} 最大值不合法`);
        return;
      }
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        errors.push(`${label} 最小值不能大于最大值`);
        return;
      }
      if (typeof field.min === 'number' && typeof min === 'number' && min < field.min) {
        errors.push(`${label} 不低于 ${field.min}`);
        return;
      }
      if (typeof field.max === 'number' && typeof max === 'number' && max > field.max) {
        errors.push(`${label} 不超过 ${field.max}`);
        return;
      }
      if (typeof min === 'number' || typeof max === 'number') {
        filters.push({ key, type: 'number', min, max });
      }
      return;
    }

    if (type === 'boolean') {
      const value = normalizeCategoryMetaBooleanValue(rawValue);
      if (value === null) {
        errors.push(`${label} 需为布尔值`);
        return;
      }
      filters.push({ key, type: 'boolean', value });
      return;
    }

    if (type === 'location') {
      const value = normalizeCategoryMetaLocationValue(rawValue);
      if (!value) return;
      if (locationPresetValues.size === 0 || !locationPresetValues.has(value)) {
        errors.push(`${label} 请选择预设地点`);
        return;
      }
      filters.push({ key, type: 'location', value });
      return;
    }

    if (type === 'select') {
      const value = normalizeCategoryMetaTextValue(rawValue);
      if (!value) return;
      const options = Array.isArray(field.options)
        ? field.options.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      if (options.length > 0 && !options.includes(value)) {
        errors.push(`${label} 选项不合法`);
        return;
      }
      filters.push({ key, type: 'select', value });
      return;
    }

    if (type === 'text') {
      const value = normalizeCategoryMetaTextValue(rawValue, Number(field.maxLength) || DEFAULT_PUBLISH_CATEGORY_META_TEXT_MAX_LENGTH);
      if (value) {
        filters.push({ key, type: 'text', value });
      }
    }
  });

  return { filters, errors };
}
