import type {
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '../config-types';
import { normalizeToLocationPreset } from './location-preset-normalize.service';

export type CrawlCategoryRef = {
  id: string;
  name: string;
  slug: string;
};

export type CrawlCategoryMetaNormalizationInput = {
  category: CrawlCategoryRef;
  rawMeta: unknown;
  categoryMetaSchema: PublishCategoryMetaConfig | null;
  locationPresets: LocationPresetConfig[];
};

export type CrawlCategoryMetaNormalizationResult = {
  meta: Record<string, unknown>;
  audit: {
    schemaFound: boolean;
    categoryId: string;
    categorySlug: string;
    schemaVersion: number | null;
    configuredKeys: string[];
    normalizedKeys: string[];
    unexpectedKeys: string[];
    rejected: Record<string, { raw: unknown; reason: string }>;
  };
};

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fieldKey(field: PublishCategoryMetaFieldConfig) {
  return String(field.key || '').trim();
}

function normalizedComparable(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function textValue(raw: unknown, maxLength: number) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, maxLength) : null;
}

function normalizeNumber(raw: unknown) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, reason: 'strict_number' } : { value: null, reason: 'number_not_matched' };
  }
  if (typeof raw !== 'string') return { value: null, reason: 'number_not_matched' };
  const value = raw.normalize('NFKC').trim();
  const strict = /^[+-]?\d+(?:\.\d+)?$/.test(value);
  if (strict) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? { value: parsed, reason: 'strict_number' } : { value: null, reason: 'number_not_matched' };
  }

  const matches = value.match(/[+-]?\d[\d,]*(?:\.\d+)?/g) || [];
  if (matches.length !== 1) return { value: null, reason: 'number_not_matched' };
  const parsed = Number(matches[0].replace(/,/g, ''));
  return Number.isFinite(parsed)
    ? { value: parsed, reason: 'numeric_amount_extracted' }
    : { value: null, reason: 'number_not_matched' };
}

function exactConfiguredOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return null;
  const rawKey = normalizedComparable(raw);
  if (!rawKey) return null;
  const matches = (field.options || []).filter((option) => normalizedComparable(option) === rawKey);
  return matches.length === 1 ? matches[0] : null;
}

function normalizeFieldValue(
  raw: unknown,
  field: PublishCategoryMetaFieldConfig,
  locationPresets: LocationPresetConfig[],
): { value: unknown; reason: string } {
  if (raw === undefined || raw === null || raw === '') return { value: null, reason: 'not_provided' };

  if (field.type === 'location') {
    const value = normalizeToLocationPreset(raw, locationPresets);
    return value
      ? { value, reason: 'database_location_preset_exact' }
      : { value: null, reason: 'database_location_preset_not_matched' };
  }

  if (field.type === 'select') {
    const value = exactConfiguredOption(raw, field);
    return value
      ? { value, reason: 'database_option_exact' }
      : { value: null, reason: 'database_option_not_matched' };
  }

  if (field.type === 'number') {
    return normalizeNumber(raw);
  }

  if (field.type === 'boolean') {
    return typeof raw === 'boolean'
      ? { value: raw, reason: 'strict_boolean' }
      : { value: null, reason: 'strict_boolean_not_matched' };
  }

  const value = textValue(raw, Number(field.maxLength) || 300);
  return value
    ? { value, reason: 'schema_text' }
    : { value: null, reason: 'schema_text_not_matched' };
}

function assertSchemaMatchesCategory(category: CrawlCategoryRef, schema: PublishCategoryMetaConfig | null) {
  if (!schema) return;
  if (String(schema.categorySlug || '') !== category.slug) {
    throw new Error('auto_crawl_category_meta_schema_mismatch');
  }
}

function buildSchemaLabelKeyMap(fields: PublishCategoryMetaFieldConfig[]) {
  const labelEntries = fields
    .map((field) => [normalizedComparable(field.label), fieldKey(field)] as const)
    .filter(([label, key]) => label && key);
  const counts = new Map<string, number>();
  for (const [label] of labelEntries) counts.set(label, (counts.get(label) || 0) + 1);
  return new Map(labelEntries.filter(([label]) => counts.get(label) === 1));
}

function buildRawInputKeyMap(rawMeta: Record<string, unknown>) {
  const entries = Object.keys(rawMeta)
    .map((key) => [normalizedComparable(key), key] as const)
    .filter(([normalized]) => normalized);
  const counts = new Map<string, number>();
  for (const [normalized] of entries) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  return new Map(entries.filter(([normalized]) => counts.get(normalized) === 1));
}

function rawFieldValue(
  rawMeta: Record<string, unknown>,
  field: PublishCategoryMetaFieldConfig,
  labelKeyMap: ReadonlyMap<string, string>,
  rawInputKeyMap: ReadonlyMap<string, string>,
) {
  const key = fieldKey(field);
  if (Object.prototype.hasOwnProperty.call(rawMeta, key)) return rawMeta[key];
  const labelKey = normalizedComparable(field.label);
  const rawInputKey = rawInputKeyMap.get(labelKey);
  return labelKeyMap.get(labelKey) === key && rawInputKey ? rawMeta[rawInputKey] : undefined;
}

export async function normalizeCrawlCategoryMeta(
  input: CrawlCategoryMetaNormalizationInput,
): Promise<CrawlCategoryMetaNormalizationResult> {
  assertSchemaMatchesCategory(input.category, input.categoryMetaSchema);

  const fields = input.categoryMetaSchema?.fields || [];
  const rawMeta = objectValue(input.rawMeta);
  const configuredKeys = fields.map(fieldKey);
  const configuredKeySet = new Set(configuredKeys);
  const labelKeyMap = buildSchemaLabelKeyMap(fields);
  const rawInputKeyMap = buildRawInputKeyMap(rawMeta);
  const acceptedInputKeys = new Set([...configuredKeys, ...Array.from(labelKeyMap.keys())]);
  const meta: Record<string, unknown> = {};
  const rejected: Record<string, { raw: unknown; reason: string }> = {};

  for (const field of fields) {
    const key = fieldKey(field);
    const rawValue = rawFieldValue(rawMeta, field, labelKeyMap, rawInputKeyMap);
    const normalized = normalizeFieldValue(rawValue, field, input.locationPresets);
    if (normalized.value !== null && normalized.value !== undefined && normalized.value !== '') {
      meta[key] = normalized.value;
    } else if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      rejected[key] = { raw: rawValue, reason: normalized.reason };
    }
  }

  return {
    meta,
    audit: {
      schemaFound: Boolean(input.categoryMetaSchema),
      categoryId: input.category.id,
      categorySlug: input.category.slug,
      schemaVersion: typeof input.categoryMetaSchema?.schemaVersion === 'number'
        ? input.categoryMetaSchema.schemaVersion
        : null,
      configuredKeys,
      normalizedKeys: Object.keys(meta),
      unexpectedKeys: Object.keys(rawMeta).filter((key) => !configuredKeySet.has(key) && !acceptedInputKeys.has(normalizedComparable(key))),
      rejected,
    },
  };
}
