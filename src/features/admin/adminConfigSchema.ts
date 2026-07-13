import type { LocationPresetConfig, PublishCategoryMetaConfig, PublishCategoryMetaFieldConfig } from '@/types';
import type { PublishCategoryFieldType } from './adminTypes';

export const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

export const formatAdminInteger = (value: unknown) => Math.round(Number(value) || 0).toLocaleString('zh-CN');
export const formatAdminPercent = (value: unknown) => `${((Number(value) || 0) * 100).toFixed(1)}%`;
export const formatAdminDuration = (value: unknown) => {
  const ms = Math.max(0, Number(value) || 0);
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
};

export function normalizeAdminBoolean(raw: unknown, fallback: boolean) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on', '启用', '是'].includes(value)) return true;
    if (['false', '0', 'no', 'n', 'off', '禁用', '否'].includes(value)) return false;
  }
  return fallback;
}

export const PUBLISH_CATEGORY_FIELD_TYPES: Array<{ value: PublishCategoryFieldType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '是/否' },
  { value: 'select', label: '下拉' },
  { value: 'location', label: '地点' },
];

export function normalizeAdminPublishText(value: unknown, maxLength = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function normalizeAdminPublishField(raw: unknown, index: number): PublishCategoryMetaFieldConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, any>;
  const key = normalizeAdminPublishText(item.key || item.name || `field_${index + 1}`, 48);
  const normalizedKey = key.toLowerCase();
  const rawLabel = normalizeAdminPublishText(item.label || key, 32);
  if (normalizedKey === 'compensationaccepted' || rawLabel === '是否接赔付') return null;
  if (normalizedKey === 'passportheld' || rawLabel === '是否压护照' || rawLabel === '护照') return null;

  const label = normalizedKey === 'salaryrange' || rawLabel === '薪资范围'
    ? '薪资'
    : normalizedKey === 'depositmonths' || rawLabel === '押金月数' || rawLabel === '押几付几'
      ? '押几'
      : normalizedKey === 'paymentmonths' || rawLabel === '付几'
        ? '付几'
        : normalizedKey === 'bathrooms' || rawLabel === '卫生间'
          ? '浴室'
          : rawLabel;
  const rawType = PUBLISH_CATEGORY_FIELD_TYPES.some((entry) => entry.value === item.type)
    ? item.type as PublishCategoryFieldType
    : 'text';
  const defaultOptions: string[] = [];
  const type: PublishCategoryFieldType =
    ['depositmonths', 'paymentmonths'].includes(normalizedKey)
      ? 'number'
      : ['text', 'select'].includes(rawType) && (normalizedKey === 'location' || label === '地点')
      ? 'location'
      : defaultOptions.length > 0 && ['text', 'select', 'boolean'].includes(rawType)
        ? 'select'
        : rawType;
  if (!key || !label) return null;

  const field: PublishCategoryMetaFieldConfig = {
    key,
    label,
    type,
    required: normalizeAdminBoolean(item.required, false),
  };

  if (type === 'text') {
    field.maxLength = Math.max(1, Math.min(120, Math.round(Number(item.maxLength) || 80)));
  }

  if (type === 'number') {
    const min = Number(item.min);
    const max = Number(item.max);
    if (normalizedKey === 'depositmonths') {
      field.min = 0;
      field.max = 24;
    } else if (normalizedKey === 'paymentmonths') {
      field.min = 1;
      field.max = 24;
    } else {
      if (Number.isFinite(min)) field.min = Math.round(min);
      if (Number.isFinite(max)) field.max = Math.round(max);
    }
  }

  if (type === 'select') {
    const options = Array.isArray(item.options)
      ? item.options
      : String(item.options || '').split(/[\n,，]/);
    const normalizedOptions = options
      .map((option: unknown) => normalizeAdminPublishText(option, 40))
      .filter(Boolean)
      .slice(0, 40);
    field.options = normalizedOptions.length > 0 ? normalizedOptions : defaultOptions;
  }

  return field;
}

export function normalizeAdminPublishCategorySchema(raw: unknown): PublishCategoryMetaConfig[] {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const entry = item as Record<string, any>;
      const id = normalizeAdminPublishText(entry.id, 80);
      const slug = normalizeAdminPublishText(entry.slug, 80);
      const name = normalizeAdminPublishText(entry.name || entry.label, 32);
      const fields = Array.isArray(entry.fields)
        ? entry.fields
          .map((field, fieldIndex) => normalizeAdminPublishField(field, fieldIndex))
          .filter((field): field is PublishCategoryMetaFieldConfig => Boolean(field))
        : [];
      if (!id && !slug && !name) return null;
      return {
        ...(id ? { id } : {}),
        ...(slug ? { slug } : {}),
        ...(name ? { name } : {}),
        fields: fields.slice(0, 20),
      };
    })
    .filter((item): item is PublishCategoryMetaConfig => Boolean(item));
}

export function makeAdminPublishField(type: PublishCategoryFieldType = 'text'): PublishCategoryMetaFieldConfig {
  return {
    key: '',
    label: '',
    type,
    required: true,
    ...(type === 'text' ? { maxLength: 80 } : {}),
  };
}

export function normalizeAdminLocationPresets(raw: unknown): LocationPresetConfig[] {
  const source = Array.isArray(raw) ? raw : [];
  const seenCountries = new Set<string>();
  return source
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      const country = normalizeAdminPublishText(entry.country || entry.name || entry.label, 32);
      const rawCities = Array.isArray(entry.cities)
        ? entry.cities
        : String(entry.cities || '').split(/[\n,，]/);
      const seenCities = new Set<string>();
      const cities = rawCities
        .map((city) => normalizeAdminPublishText(city, 32))
        .filter((city) => {
          const key = city.toLowerCase();
          if (!city || seenCities.has(key)) return false;
          seenCities.add(key);
          return true;
        });
      const countryKey = country.toLowerCase();
      if (!country || cities.length === 0 || seenCountries.has(countryKey)) return null;
      seenCountries.add(countryKey);
      return { country, cities };
    })
    .filter((item): item is LocationPresetConfig => Boolean(item));
}
