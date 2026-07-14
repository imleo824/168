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

function negotiableOption(field: PublishCategoryMetaFieldConfig) {
  return (field.options || []).find((option) => normalizedComparable(option) === normalizedComparable('面议')) || null;
}

function isSalarySelectField(field: PublishCategoryMetaFieldConfig) {
  return field.type === 'select'
    && /薪资|工资|待遇/i.test(field.label)
    && (field.options || []).some((option) => /\$|面议/.test(option));
}

function salaryCurrencyRate(raw: string) {
  if (/(?:usdt|usd|(?:^|[^a-z])u(?:$|[^a-z])|美元|美金|刀|\$)/i.test(raw)) return 1;
  if (/(?:rmb|cny|人民币|¥)/i.test(raw)) return 0.14;
  if (/(?:php|披索|比索|peso)/i.test(raw)) return 0.017;
  if (/(?:thb|泰铢)/i.test(raw)) return 0.027;
  if (/(?:khr|瑞尔)/i.test(raw)) return 0.00025;
  if (/(?:vnd|越南盾)/i.test(raw)) return 0.000039;
  if (/(?:aed|迪拉姆)/i.test(raw)) return 0.272;
  if (/(?:myr|马币|林吉特)/i.test(raw)) return 0.21;
  if (/(?:sgd|新币|新加坡元)/i.test(raw)) return 0.74;
  if (/(?:idr|印尼盾)/i.test(raw)) return 0.000061;
  if (/(?:lak|基普)/i.test(raw)) return 0.000046;
  if (/(?:mmk|缅币)/i.test(raw)) return 0.00048;
  if (/(?:jpy|日元)/i.test(raw)) return 0.0064;
  if (/(?:krw|韩元)/i.test(raw)) return 0.00072;
  if (/(?:hkd|港币)/i.test(raw)) return 0.128;
  if (/(?:mop|澳门币)/i.test(raw)) return 0.124;
  if (/(?:eur|欧元)/i.test(raw)) return 1.08;
  return null;
}

function salaryOptionRange(option: string) {
  const text = String(option || '').normalize('NFKC').replace(/,/g, '');
  const numbers = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  if (/以下/.test(text)) return { min: Number.NEGATIVE_INFINITY, max: numbers[0] };
  if (/以上/.test(text)) return { min: numbers[0], max: Number.POSITIVE_INFINITY };
  if (numbers.length >= 2) return { min: Math.min(numbers[0], numbers[1]), max: Math.max(numbers[0], numbers[1]) };
  return null;
}

function chooseSalaryRangeOption(usdAmount: number, field: PublishCategoryMetaFieldConfig) {
  for (const option of field.options || []) {
    const range = salaryOptionRange(option);
    if (!range) continue;
    if (usdAmount >= range.min && usdAmount <= range.max) return option;
  }
  return null;
}

function semanticSalaryOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (!isSalarySelectField(field)) return null;

  const option = negotiableOption(field);
  if (typeof raw !== 'number' && typeof raw !== 'string') return option;
  const text = String(raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return option;
  if (/面议|面谈|详聊|从优|看能力|negotiable|tbd/i.test(text)) return option;

  const rate = typeof raw === 'number' ? 1 : salaryCurrencyRate(text);
  if (!rate) return option;
  if (/(?:时薪|小时|hourly|per hour|日薪|每天|daily|per day|年薪|annual|yearly|per year)/i.test(text)) return option;

  const amounts = typeof raw === 'number'
    ? [raw]
    : (text.match(/[+-]?\d[\d,]*(?:\.\d+)?/g) || [])
      .map((amount) => Number(amount.replace(/,/g, '')))
      .filter(Number.isFinite);
  if (!amounts.length) return option;
  const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const salaryOption = chooseSalaryRangeOption(averageAmount * rate, field);
  return salaryOption || option;
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
    const exactValue = exactConfiguredOption(raw, field);
    if (exactValue) return { value: exactValue, reason: 'database_option_exact' };
    const salaryValue = semanticSalaryOption(raw, field);
    return salaryValue
      ? { value: salaryValue, reason: 'salary_option_semantic' }
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
