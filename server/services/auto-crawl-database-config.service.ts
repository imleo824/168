import prisma from '../db';
import type {
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '../config-types';

const META_SCHEMA_KEY = 'publish_category_schema';
const LOCATION_PRESETS_KEY = 'location_presets';
const META_FIELD_TYPES = new Set(['text', 'select', 'number', 'boolean', 'location']);

export type AutoCrawlDatabaseCategory = {
  id: string;
  name: string;
  slug: string;
};

export type AutoCrawlDatabaseConfig = {
  categoriesById: ReadonlyMap<string, AutoCrawlDatabaseCategory>;
  schemasBySlug: ReadonlyMap<string, PublishCategoryMetaConfig>;
  locationPresets: LocationPresetConfig[];
};

function parseJson(raw: unknown, key: string) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`auto_crawl_database_config_invalid_json:${key}`);
  }
}

function cleanText(raw: unknown, max: number) {
  return String(raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseField(raw: unknown, categorySlug: string, fieldIndex: number): PublishCategoryMetaFieldConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`auto_crawl_database_meta_field_invalid:${categorySlug}:${fieldIndex}`);
  }

  const field = raw as Record<string, unknown>;
  const key = cleanText(field.key, 64);
  const label = cleanText(field.label, 64);
  const type = cleanText(field.type, 32).toLowerCase();
  if (!key || !label || !META_FIELD_TYPES.has(type)) {
    throw new Error(`auto_crawl_database_meta_field_invalid:${categorySlug}:${fieldIndex}`);
  }

  const parsed: PublishCategoryMetaFieldConfig = {
    key,
    label,
    type: type as PublishCategoryMetaFieldConfig['type'],
    required: field.required === true,
  };

  if (type === 'select') {
    if (!Array.isArray(field.options)) {
      throw new Error(`auto_crawl_database_meta_options_required:${categorySlug}:${key}`);
    }
    const options = field.options.map((option) => cleanText(option, 120)).filter(Boolean);
    if (!options.length || new Set(options).size !== options.length) {
      throw new Error(`auto_crawl_database_meta_options_invalid:${categorySlug}:${key}`);
    }
    parsed.options = options;
  }

  if (type === 'text' && field.maxLength !== undefined) {
    if (typeof field.maxLength !== 'number' || !Number.isFinite(field.maxLength) || field.maxLength < 1) {
      throw new Error(`auto_crawl_database_meta_max_length_invalid:${categorySlug}:${key}`);
    }
    parsed.maxLength = Math.floor(field.maxLength);
  }

  return parsed;
}

function parseMetaSchemas(
  raw: unknown,
  categoriesBySlug: ReadonlyMap<string, AutoCrawlDatabaseCategory>,
): Map<string, PublishCategoryMetaConfig> {
  const value = parseJson(raw, META_SCHEMA_KEY);
  if (value === null) return new Map();
  if (!Array.isArray(value)) throw new Error('auto_crawl_database_meta_schema_not_array');

  const schemas = new Map<string, PublishCategoryMetaConfig>();
  value.forEach((item, schemaIndex) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`auto_crawl_database_meta_schema_invalid:${schemaIndex}`);
    }

    const entry = item as Record<string, unknown>;
    const categorySlug = cleanText(entry.categorySlug, 64);
    const category = categoriesBySlug.get(categorySlug);
    if (!categorySlug || !category) {
      throw new Error(`auto_crawl_database_meta_category_not_found:${categorySlug || schemaIndex}`);
    }
    if (schemas.has(categorySlug)) {
      throw new Error(`auto_crawl_database_meta_category_duplicate:${categorySlug}`);
    }
    if (!Array.isArray(entry.fields)) {
      throw new Error(`auto_crawl_database_meta_fields_not_array:${categorySlug}`);
    }

    const fields = entry.fields.map((field, index) => parseField(field, categorySlug, index));
    const keys = fields.map((field) => field.key);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`auto_crawl_database_meta_field_duplicate:${categorySlug}`);
    }

    if (typeof entry.schemaVersion !== 'number' || !Number.isInteger(entry.schemaVersion) || entry.schemaVersion < 1) {
      throw new Error(`auto_crawl_database_meta_schema_version_invalid:${categorySlug}`);
    }

    schemas.set(categorySlug, {
      categorySlug,
      schemaVersion: entry.schemaVersion,
      name: category.name,
      fields,
    });
  });

  return schemas;
}

function parseLocationPresetsStrict(raw: unknown): LocationPresetConfig[] {
  const value = parseJson(raw, LOCATION_PRESETS_KEY);
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('auto_crawl_database_location_presets_not_array');

  const presets: LocationPresetConfig[] = [];
  const seenCountries = new Set<string>();
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`auto_crawl_database_location_preset_invalid:${index}`);
    }
    const entry = item as Record<string, unknown>;
    const country = cleanText(entry.country, 64);
    if (!country || seenCountries.has(country) || !Array.isArray(entry.cities)) {
      throw new Error(`auto_crawl_database_location_preset_invalid:${index}`);
    }
    const cities = entry.cities.map((city) => cleanText(city, 64)).filter(Boolean);
    if (!cities.length || new Set(cities).size !== cities.length) {
      throw new Error(`auto_crawl_database_location_cities_invalid:${country}`);
    }
    presets.push({ country, cities });
    seenCountries.add(country);
  });
  return presets;
}

export function getAutoCrawlDatabaseCategory(
  config: AutoCrawlDatabaseConfig,
  categoryId: unknown,
): AutoCrawlDatabaseCategory {
  const id = cleanText(categoryId, 128);
  const category = id ? config.categoriesById.get(id) : null;
  if (!category) throw new Error('auto_crawl_database_category_not_found');
  return category;
}

export function getAutoCrawlCategorySchema(
  config: AutoCrawlDatabaseConfig,
  category: AutoCrawlDatabaseCategory,
) {
  return config.schemasBySlug.get(category.slug) || null;
}

export async function loadAutoCrawlDatabaseConfig(): Promise<AutoCrawlDatabaseConfig> {
  const [configRows, categories] = await Promise.all([
    prisma.systemConfig.findMany({
      where: { key: { in: [META_SCHEMA_KEY, LOCATION_PRESETS_KEY] } },
      select: { key: true, value: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true, slug: true } }),
  ]);

  const categoriesById = new Map<string, AutoCrawlDatabaseCategory>();
  const categoriesBySlug = new Map<string, AutoCrawlDatabaseCategory>();
  for (const category of categories) {
    const normalized: AutoCrawlDatabaseCategory = {
      id: category.id,
      name: category.name,
      slug: category.slug,
    };
    categoriesById.set(normalized.id, normalized);
    categoriesBySlug.set(normalized.slug, normalized);
  }

  const values = new Map(configRows.map((row) => [row.key, row.value]));
  return {
    categoriesById,
    schemasBySlug: parseMetaSchemas(values.get(META_SCHEMA_KEY), categoriesBySlug),
    locationPresets: parseLocationPresetsStrict(values.get(LOCATION_PRESETS_KEY)),
  };
}
