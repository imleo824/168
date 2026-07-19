import prisma, { isDbConfigured } from './db';
import { HttpError } from './http/errors';
import type {
  LocationPresetConfig,
  ParsedPublishCategorySchema,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
  PublishCategoryMetaFieldType,
} from './config-types';
import {
  PUBLISH_CATEGORY_SCHEMA_FIELD_TYPES,
  PUBLISH_CATEGORY_SCHEMA_MAX_FIELDS,
  PUBLISH_CATEGORY_SCHEMA_TEXT_MAX_LENGTH,
  isValidPublishCategoryFieldKey,
  isValidPublishCategorySlug,
  normalizePublishCategoryFieldKey,
  normalizePublishCategorySchemaVersion,
  normalizePublishCategorySlug,
} from '../shared/publishCategorySchema';
import { isSameCategoryRef } from '../shared/categoryRefs';

export {
  DEFAULT_LOCATION_PRESETS,
  DEFAULT_PUBLISH_CATEGORY_SCHEMA,
} from './config-defaults';
export type {
  LocationPresetConfig,
  ParsedPublishCategorySchema,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
  PublishCategoryMetaFieldType,
} from './config-types';
export { isSameCategoryRef } from '../shared/categoryRefs';

const CATEGORY_PRICE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const TUI_PLUS_CONFIG_DEFAULTS = {
  tui_plus_ranking_boost_percent: 20,
  tui_plus_trial_days: 7,
  tui_plus_monthly_duration_days: 30,
  tui_plus_yearly_duration_days: 365,
  tui_plus_monthly_price_points: 1900,
  tui_plus_yearly_price_points: 19900,
  tui_plus_yearly_discount_percent: 13,
  tui_plus_trial_channel_limit: 1,
  tui_plus_monthly_channel_limit: 1,
  tui_plus_yearly_channel_limit: 1,
  tui_plus_trial_website_limit: 1,
  tui_plus_monthly_website_limit: 1,
  tui_plus_yearly_website_limit: 1,
  tui_plus_trial_contact_limit: 1,
  tui_plus_monthly_contact_limit: 3,
  tui_plus_yearly_contact_limit: 5,
} as const;
const TUI_PLUS_NUMERIC_CONFIG_KEYS = new Set(Object.keys(TUI_PLUS_CONFIG_DEFAULTS));
const TOP_LEVEL_CONFIG_KEYS = new Set([
  'publish_category_schema',
  'location_presets',
  'telegram_channel',
  'signup_reward_points',
  'telegram_bot_token',
  'telegram_channel_id',
  'telegram_recharge_notify_chat_id',
  'telegram_share_template',
  'telegram_sync_min_content_chars',
  'telegram_sync_require_image',
  'recharge_points_per_usdt',
  'tron_usdt_contract',
  'tron_deposit_min_usdt',
  'tron_deposit_fallback_address',
  'tron_deposit_scan_enabled',
  'tron_deposit_scan_interval_seconds',
  'tron_deposit_scan_window_minutes',
  'tron_deposit_scan_max_attempts',
  'tron_sweep_target_address',
  'feed_rank_profile',
  'online_users_min',
  'online_users_max',
  ...TUI_PLUS_NUMERIC_CONFIG_KEYS,
]);

const NUMERIC_TOP_LEVEL_CONFIG_KEYS = new Set([
  'signup_reward_points',
  'telegram_sync_min_content_chars',
  'recharge_points_per_usdt',
  'tron_deposit_min_usdt',
  'tron_deposit_scan_interval_seconds',
  'tron_deposit_scan_window_minutes',
  'tron_deposit_scan_max_attempts',
  'online_users_min',
  'online_users_max',
  ...TUI_PLUS_NUMERIC_CONFIG_KEYS,
]);
const BOOLEAN_STRING_TOP_LEVEL_CONFIG_KEYS = new Set([
  'telegram_sync_require_image',
  'tron_deposit_scan_enabled',
]);
const PRICE_CONFIG_KEYS = new Set([
  'anonymous_publish',
  'ad_home_slot_1',
  'ad_home_slot_2',
  'ad_home_slot_3',
  'telegram_sync',
  'pin_home',
  'pin_chat',
  'pin_chat_slot_1',
  'pin_chat_slot_2',
  'pin_chat_slot_3',
]);

function isValidCategoryPriceSlug(slug: string) {
  return CATEGORY_PRICE_SLUG_PATTERN.test(slug);
}

function toFiniteNumber(value: unknown, fallback: number, options: { min?: number; max?: number; integer?: boolean } = {}) {
  const parsed = Number(value);
  let next = Number.isFinite(parsed) ? parsed : fallback;
  if (options.integer !== false) next = Math.round(next);
  if (typeof options.min === 'number') next = Math.max(options.min, next);
  if (typeof options.max === 'number') next = Math.min(options.max, next);
  return next;
}

function normalizeTuiPlusConfigNumber(key: string, value: unknown, fallback: number) {
  switch (key) {
    case 'tui_plus_monthly_price_points':
    case 'tui_plus_yearly_price_points':
      return toFiniteNumber(value, fallback, { min: 1, max: 100_000_000 });
    case 'tui_plus_trial_days':
      return toFiniteNumber(value, fallback, { min: 1, max: 365 });
    case 'tui_plus_monthly_duration_days':
    case 'tui_plus_yearly_duration_days':
      return toFiniteNumber(value, fallback, { min: 1, max: 3_660 });
    case 'tui_plus_yearly_discount_percent':
      return toFiniteNumber(value, fallback, { min: 0, max: 90 });
    case 'tui_plus_ranking_boost_percent':
      return toFiniteNumber(value, fallback, { min: 0, max: 100 });
    case 'tui_plus_trial_channel_limit':
    case 'tui_plus_monthly_channel_limit':
    case 'tui_plus_yearly_channel_limit':
    case 'tui_plus_trial_website_limit':
    case 'tui_plus_monthly_website_limit':
    case 'tui_plus_yearly_website_limit':
      return 1;
    case 'tui_plus_trial_contact_limit':
    case 'tui_plus_monthly_contact_limit':
    case 'tui_plus_yearly_contact_limit':
      return toFiniteNumber(value, fallback, { min: 0, max: 100 });
    default:
      return toFiniteNumber(value, fallback, { min: 0, max: 1_000_000 });
  }
}

function normalizeConfigNumber(key: string, value: unknown, fallback: number) {
  if (TUI_PLUS_NUMERIC_CONFIG_KEYS.has(key)) return normalizeTuiPlusConfigNumber(key, value, fallback);
  switch (key) {
    case 'signup_reward_points':
      return toFiniteNumber(value, fallback, { min: 0, max: 1_000_000 });
    case 'telegram_sync_min_content_chars':
      return toFiniteNumber(value, fallback, { min: 0, max: 10_000 });
    case 'recharge_points_per_usdt':
      return toFiniteNumber(value, fallback, { min: 1, max: 1_000_000 });
    case 'tron_deposit_min_usdt':
      return toFiniteNumber(value, fallback, { min: 1, max: 1_000_000 });
    case 'tron_deposit_scan_interval_seconds':
      return toFiniteNumber(value, fallback, { min: 10, max: 3600 });
    case 'tron_deposit_scan_window_minutes':
      return toFiniteNumber(value, fallback, { min: 5, max: 1440 });
    case 'tron_deposit_scan_max_attempts':
      return toFiniteNumber(value, fallback, { min: 1, max: 10_000 });
    case 'online_users_min':
      return toFiniteNumber(value, fallback, { min: 0, max: 10_000_000 });
    case 'online_users_max':
      return toFiniteNumber(value, fallback, { min: 0, max: 10_000_000 });
    default:
      return toFiniteNumber(value, fallback, { min: 0, max: 1_000_000 });
  }
}

function normalizePriceValue(value: unknown) {
  return toFiniteNumber(value, 0, { min: 0, max: 10_000_000 });
}

function normalizePublishMetaText(raw: unknown, maxLength: number) {
  return String(raw || '').trim().slice(0, maxLength);
}

function normalizePublishMetaField(raw: unknown): PublishCategoryMetaFieldConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const field = raw as Record<string, unknown>;
  const key = normalizePublishCategoryFieldKey(field.key);
  const label = normalizePublishMetaText(field.label, 32);
  const rawType = String(field.type || '').trim().toLowerCase();
  if (!isValidPublishCategoryFieldKey(key) || !label || !PUBLISH_CATEGORY_SCHEMA_FIELD_TYPES.has(rawType)) return null;

  const next: PublishCategoryMetaFieldConfig = {
    key,
    label,
    type: rawType as PublishCategoryMetaFieldType,
    required: field.required === true,
  };
  if (next.type === 'text') {
    const maxLength = Number(field.maxLength);
    if (field.maxLength !== undefined && (!Number.isFinite(maxLength) || maxLength < 1)) return null;
    next.maxLength = field.maxLength === undefined
      ? PUBLISH_CATEGORY_SCHEMA_TEXT_MAX_LENGTH
      : Math.min(PUBLISH_CATEGORY_SCHEMA_TEXT_MAX_LENGTH, Math.floor(maxLength));
  }
  if (next.type === 'number') {
    const min = Number(field.min);
    const max = Number(field.max);
    if (field.min !== undefined && !Number.isFinite(min)) return null;
    if (field.max !== undefined && !Number.isFinite(max)) return null;
    if (field.min !== undefined) next.min = min;
    if (field.max !== undefined) next.max = max;
    if (typeof next.min === 'number' && typeof next.max === 'number' && next.min > next.max) return null;
  }
  if (next.type === 'select') {
    if (!Array.isArray(field.options)) return null;
    const options = field.options.map((option) => String(option ?? '').trim()).filter(Boolean);
    if (!options.length || new Set(options).size !== options.length) return null;
    next.options = options.slice(0, 100);
  }
  return next;
}

function normalizePublishCategoryMetaEntry(raw: unknown): PublishCategoryMetaConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  const categorySlug = normalizePublishCategorySlug(entry.categorySlug || entry.slug || entry.id);
  if (!categorySlug || !isValidPublishCategorySlug(categorySlug) || !Array.isArray(entry.fields)) return null;

  const fields = entry.fields.map(normalizePublishMetaField);
  if (fields.some((field) => !field)) return null;
  const configuredFields = fields as PublishCategoryMetaFieldConfig[];
  const keys = configuredFields.map((field) => field.key.toLowerCase());
  if (new Set(keys).size !== keys.length) return null;

  const schemaVersion = normalizePublishCategorySchemaVersion(entry.schemaVersion);
  return {
    categorySlug,
    schemaVersion,
    name: normalizePublishMetaText(entry.name, 32),
    fields: configuredFields.slice(0, PUBLISH_CATEGORY_SCHEMA_MAX_FIELDS),
  };
}

export function parsePublishCategorySchema(raw: unknown): ParsedPublishCategorySchema {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return { schema: [], parseError: 'publish_category_schema 不是合法 JSON' };
    }
  }
  if (!Array.isArray(source)) {
    return { schema: [], parseError: 'publish_category_schema 必须是数组' };
  }

  const schemaEntries = source.map(normalizePublishCategoryMetaEntry);
  if (schemaEntries.some((entry) => !entry)) {
    return { schema: [], parseError: 'publish_category_schema 包含无效分类或字段配置' };
  }
  const schema = schemaEntries as PublishCategoryMetaConfig[];
  const slugs = schema.map((entry) => entry.categorySlug || '');
  if (new Set(slugs).size !== slugs.length) {
    return { schema: [], parseError: 'publish_category_schema 包含重复分类' };
  }
  return { schema };
}

function normalizeLocationPresetText(raw: unknown, maxLength: number) {
  return String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseLocationPresets(raw: unknown): LocationPresetConfig[] {
  return parseLocationPresetsDocument(raw, false);
}

function invalidLocationPresets(message: string, strict: boolean) {
  if (strict) throw new HttpError(message, 400);
  return [] as LocationPresetConfig[];
}

function parseLocationPresetsDocument(raw: unknown, strict: boolean): LocationPresetConfig[] {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      return invalidLocationPresets('location_presets 不是合法 JSON', strict);
    }
  }
  if (!Array.isArray(source)) return invalidLocationPresets('location_presets 必须是数组', strict);

  const presets: LocationPresetConfig[] = [];
  const countries = new Set<string>();
  for (const item of source) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return invalidLocationPresets('location_presets 包含无效地点组', strict);
    const entry = item as Record<string, unknown>;
    const country = normalizeLocationPresetText(entry.country, 32);
    const countryKey = country.toLowerCase();
    if (!country) return invalidLocationPresets('location_presets 国家不能为空', strict);
    if (countries.has(countryKey)) return invalidLocationPresets(`location_presets 国家重复：${country}`, strict);
    if (!Array.isArray(entry.cities)) return invalidLocationPresets(`location_presets 城市必须是数组：${country}`, strict);
    const cities: string[] = [];
    const cityKeys = new Set<string>();
    for (const rawCity of entry.cities) {
      const city = normalizeLocationPresetText(rawCity, 32);
      if (!city) continue;
      const cityKey = city.toLowerCase();
      if (cityKeys.has(cityKey)) return invalidLocationPresets(`location_presets 城市重复：${country}`, strict);
      cities.push(city);
      cityKeys.add(cityKey);
    }
    if (!cities.length) return invalidLocationPresets(`location_presets 城市不能为空：${country}`, strict);
    presets.push({ country, cities: cities.slice(0, 50) });
    countries.add(countryKey);
  }
  return presets.slice(0, 80);
}

export function parseLocationPresetsForSave(raw: unknown): LocationPresetConfig[] {
  return parseLocationPresetsDocument(raw, true);
}

export function parseFeedRankProfileForSave(raw: unknown) {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      throw new HttpError('feed_rank_profile 不是合法 JSON', 400);
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new HttpError('feed_rank_profile 必须是对象', 400);
  }
  return source as Record<string, unknown>;
}

function normalizeTelegramShareTemplate(raw: unknown) {
  return String(raw ?? '').trim();
}

function normalizeBooleanStringConfig(raw: unknown, fallback = false) {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  if (typeof raw === 'number') return raw !== 0 ? 'true' : 'false';
  const value = String(raw ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', '启用', '是'].includes(value)) return 'true';
  if (['false', '0', 'no', 'n', 'off', '禁用', '否'].includes(value)) return 'false';
  return fallback ? 'true' : 'false';
}

function applyTelegramConfigFallbacks<T extends Record<string, any>>(configMap: T): T {
  const mutableConfig = configMap as T & { telegram_channel?: unknown; telegram_channel_id?: unknown; telegram_share_template?: unknown };
  const channelId = String(mutableConfig.telegram_channel_id || '').trim();
  const channelLink = String(mutableConfig.telegram_channel || '').trim();
  if (!channelId && channelLink) mutableConfig.telegram_channel_id = channelLink;
  mutableConfig.telegram_share_template = normalizeTelegramShareTemplate(mutableConfig.telegram_share_template);
  return mutableConfig;
}

async function validatePublishCategorySchemaForSave(raw: unknown) {
  const parsed = parsePublishCategorySchema(raw);
  if (parsed.parseError) throw new HttpError(parsed.parseError, 400);

  const categories = await prisma.category.findMany({ select: { slug: true, name: true } });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const missing = parsed.schema
    .map((schema) => schema.categorySlug || '')
    .filter((slug) => !categoryBySlug.has(slug));
  if (missing.length) throw new HttpError(`发布分类配置引用了不存在的数据库分类：${missing.join('、')}`, 400);

  return parsed.schema.map((schema) => {
    const category = categoryBySlug.get(schema.categorySlug || '')!;
    return {
      categorySlug: category.slug,
      schemaVersion: normalizePublishCategorySchemaVersion(schema.schemaVersion),
      name: category.name,
      fields: schema.fields,
    } as PublishCategoryMetaConfig;
  });
}

export class ConfigService {
  private static cacheTtlMs = 60 * 1000;
  private static cachedConfig: any | null = null;
  private static cachedAt = 0;

  private static defaults = {
    publish_category_schema: [] as PublishCategoryMetaConfig[],
    telegram_channel: '',
    telegram_share_template:
      '{contentLine}\n' +
      '\n' +
      '来自：{authorLine} {contactLine}\n' +
      '\n' +
      '来源：{sourceLine}\n' +
      '\n' +
      '{categoryLine}',
    prices: {
      anonymous_publish: 20,
      ad_home_slot_1: 1000,
      ad_home_slot_2: 800,
      ad_home_slot_3: 600,
      telegram_sync: 0,
      pin_home: 200,
      pin_chat: 600,
      pin_chat_slot_1: 600,
      pin_chat_slot_2: 500,
      pin_chat_slot_3: 400,
      pin_category_map: {},
    },
    signup_reward_points: 100,
    telegram_bot_token: '',
    telegram_channel_id: '',
    telegram_recharge_notify_chat_id: '',
    telegram_sync_min_content_chars: 0,
    telegram_sync_require_image: 'false',
    recharge_points_per_usdt: 10,
    feed_rank_profile: '{}',
    location_presets: [] as LocationPresetConfig[],
    tron_usdt_contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    tron_deposit_min_usdt: 1,
    tron_deposit_fallback_address: '',
    tron_deposit_scan_enabled: 'true',
    tron_deposit_scan_interval_seconds: 20,
    tron_deposit_scan_window_minutes: 30,
    tron_deposit_scan_max_attempts: 90,
    tron_sweep_target_address: '',
    online_users_min: 380,
    online_users_max: 6800,
    ...TUI_PLUS_CONFIG_DEFAULTS,
  };

  private static cloneDefaults() {
    return applyTelegramConfigFallbacks({
      ...this.defaults,
      publish_category_schema: structuredClone(this.defaults.publish_category_schema),
      location_presets: structuredClone(this.defaults.location_presets),
      prices: {
        ...this.defaults.prices,
        pin_category_map: { ...(this.defaults.prices as any).pin_category_map },
      },
    });
  }

  static getDefaultConfigs() {
    return this.cloneDefaults();
  }

  static async getConfigs(options: { bypassCache?: boolean } = {}) {
    const now = Date.now();
    if (!options.bypassCache && this.cachedConfig && now - this.cachedAt < this.cacheTtlMs) return structuredClone(this.cachedConfig);
    if (!isDbConfigured()) {
      const defaults = this.cloneDefaults();
      this.cachedConfig = defaults;
      this.cachedAt = now;
      return structuredClone(defaults);
    }

    try {
      const [configs, categories] = await Promise.all([
      prisma.systemConfig.findMany(),
      prisma.category.findMany({ select: { id: true, slug: true, name: true } }),
    ]);
    const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
    const configMap: any = this.cloneDefaults();
      configs.forEach((c) => {
        const [prefix, ...rest] = c.key.split('_');
        const key = rest.join('_');
        if (prefix === 'price') {
          if (key.startsWith('pin_category_map_')) {
            const slug = key.slice('pin_category_map_'.length).trim();
            if (isValidCategoryPriceSlug(slug)) configMap.prices.pin_category_map[slug] = normalizePriceValue(c.value);
            return;
          }
          if (PRICE_CONFIG_KEYS.has(key)) (configMap.prices as any)[key] = normalizePriceValue(c.value);
          return;
        }
        if (c.key === 'publish_category_schema') {
        const parsedSchema = parsePublishCategorySchema(c.value);
        if (parsedSchema.parseError) {
          (configMap as any).publish_category_schema = [];
          (configMap as any).publish_category_schema_parse_error = parsedSchema.parseError;
          return;
        }
        const missing = parsedSchema.schema.filter((schema) => !categoryBySlug.has(schema.categorySlug || ''));
        if (missing.length) throw new Error(`publish_category_schema 引用了不存在的分类：${missing.map((schema) => schema.categorySlug).join('、')}`);
        (configMap as any).publish_category_schema = parsedSchema.schema.map((schema) => ({
          id: categoryBySlug.get(schema.categorySlug || '')!.id,
          categorySlug: schema.categorySlug,
          slug: schema.categorySlug,
          schemaVersion: schema.schemaVersion,
          name: categoryBySlug.get(schema.categorySlug || '')!.name,
          fields: schema.fields,
        }));
        return;
      }
        if (c.key === 'location_presets') {
          (configMap as any).location_presets = parseLocationPresets(c.value);
          return;
        }
        if (!TOP_LEVEL_CONFIG_KEYS.has(c.key)) return;
        if (NUMERIC_TOP_LEVEL_CONFIG_KEYS.has(c.key)) {
          const defaultValue = Number((this.defaults as any)[c.key] ?? 0);
          (configMap as any)[c.key] = normalizeConfigNumber(c.key, c.value, defaultValue);
        } else if (BOOLEAN_STRING_TOP_LEVEL_CONFIG_KEYS.has(c.key)) {
          const defaultValue = String((this.defaults as any)[c.key] ?? 'false').trim().toLowerCase() === 'true';
          (configMap as any)[c.key] = normalizeBooleanStringConfig(c.value, defaultValue);
        } else if (c.key === 'telegram_share_template') {
          (configMap as any)[c.key] = normalizeTelegramShareTemplate(c.value);
        } else {
          (configMap as any)[c.key] = String(c.value ?? '').trim();
        }
      });
      applyTelegramConfigFallbacks(configMap);
      this.cachedConfig = configMap;
      this.cachedAt = now;
      return structuredClone(configMap);
    } catch (e) {
      if (this.cachedConfig) return structuredClone(this.cachedConfig);
      this.cachedConfig = null;
      this.cachedAt = 0;
      if (process.env.NODE_ENV === 'production') throw e;
      return this.cloneDefaults();
    }
  }

  static async updateConfigs(configData: any) {
    const sanitizeConfig = async (obj: any): Promise<any> => {
      if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) return {};
      const output: Record<string, any> = {};
      for (const key in obj) {
        if (key === 'prices') {
          const prices = obj[key];
          if (prices && typeof prices === 'object' && !Array.isArray(prices)) {
            const next: Record<string, any> = {};
            for (const priceKey in prices) {
              if (PRICE_CONFIG_KEYS.has(priceKey)) {
                next[priceKey] = normalizePriceValue(prices[priceKey]);
                continue;
              }
              if (priceKey === 'pin_category_map' && prices[priceKey] && typeof prices[priceKey] === 'object' && !Array.isArray(prices[priceKey])) {
                next.pin_category_map = {};
                for (const slug of Object.keys(prices[priceKey])) {
                  if (isValidCategoryPriceSlug(slug)) next.pin_category_map[slug] = normalizePriceValue(prices[priceKey][slug]);
                }
              }
            }
            output[key] = next;
            continue;
          }
        }
        if (TOP_LEVEL_CONFIG_KEYS.has(key)) {
          if (key === 'publish_category_schema') {
            const validated = await validatePublishCategorySchemaForSave(obj[key]);
            output[key] = JSON.stringify(validated);
            continue;
          }
          if (key === 'location_presets') {
            output[key] = JSON.stringify(parseLocationPresetsForSave(obj[key]));
            continue;
          }
          if (key === 'feed_rank_profile') {
            output[key] = JSON.stringify(parseFeedRankProfileForSave(obj[key]));
            continue;
          }
          if (NUMERIC_TOP_LEVEL_CONFIG_KEYS.has(key)) {
            const defaultValue = Number((this.defaults as any)[key] ?? 0);
            output[key] = normalizeConfigNumber(key, obj[key], defaultValue);
          } else {
            output[key] = BOOLEAN_STRING_TOP_LEVEL_CONFIG_KEYS.has(key)
                ? normalizeBooleanStringConfig(obj[key], String((this.defaults as any)[key] ?? 'false').trim().toLowerCase() === 'true')
              : key === 'telegram_share_template'
                ? normalizeTelegramShareTemplate(obj[key])
                : obj[key];
          }
        }
      }
      return output;
    };

    const flattenConfig = (obj: any, prefix = '') => {
      let result: Record<string, string> = {};
      for (const key in obj) {
        const val = obj[key];
        const newKey = prefix ? (prefix === 'prices' ? `price_${key}` : `${prefix}_${key}`) : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          Object.assign(result, flattenConfig(val, newKey));
        } else {
          result[newKey] = String(val);
        }
      }
      return result;
    };

    const sanitizedConfig = await sanitizeConfig(configData);
    const flat = flattenConfig(sanitizedConfig);
    delete flat.publish_category_schema_parse_error;
    if (Object.keys(flat).length === 0) return [];
    const updates = Object.entries(flat).map(([key, value]) =>
      prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } }),
    );
    const result = await prisma.$transaction(updates);
    this.cachedConfig = null;
    this.cachedAt = 0;
    return result;
  }
}
