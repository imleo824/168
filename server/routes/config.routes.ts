import type { Express } from 'express';
import { ConfigService, parsePublishCategorySchema, type PublishCategoryMetaConfig } from '../config.service';
import prisma, { isDbConfigured } from '../db';
import { catchAsync } from '../middlewares/error';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { publicReadLimiter } from '../middlewares/rateLimit';
import { setNoStore, setPublicCache } from '../http-cache';
import { PromotionService } from '../promotion.service';
import { toPublicPromotionAdPayloads } from '../services/promotion-public-ad-payload.service';
import { registerAdminAutoLikeRoutes } from './admin-auto-like.routes';
import { registerPlatformAiRoutes } from './platform-ai.routes';
import { normalizePublishCategorySlug } from '../../shared/publishCategorySchema';

const CATEGORIES_CACHE_TTL_MS = 2 * 60 * 1000;
const CONFIGS_CACHE_TTL_MS = 10 * 1000;
let categoriesCache: { expiresAt: number; data: any[]; schema: PublishCategoryMetaConfig[] } | null = null;
let categoriesCachePromise: Promise<{ categories: any[]; schema: PublishCategoryMetaConfig[] }> | null = null;
let configsCache: { expiresAt: number; data: any } | null = null;
let configsCachePromise: Promise<any> | null = null;

export function clearCachedCategories() {
  categoriesCache = null;
  categoriesCachePromise = null;
}

export function clearCachedConfigs() {
  configsCache = null;
  configsCachePromise = null;
}

export async function listDatabaseCategoryOptions() {
  if (!isDbConfigured()) return [];

  return await prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      order: true,
    },
    orderBy: [
      { order: 'asc' },
      { name: 'asc' },
      { id: 'asc' },
    ],
  });
}

export async function getConfigs(options: { bypassCache?: boolean } = {}) {
  if (options.bypassCache) {
    return await ConfigService.getConfigs(options);
  }

  if (configsCache && configsCache.expiresAt > Date.now()) {
    return structuredClone(configsCache.data);
  }

  if (!configsCachePromise) {
    configsCachePromise = ConfigService.getConfigs()
      .then((configs) => {
        configsCache = {
          data: configs,
          expiresAt: Date.now() + CONFIGS_CACHE_TTL_MS,
        };
        return configs;
      })
      .finally(() => {
        configsCachePromise = null;
      });
  }

  const configs = await configsCachePromise;
  return structuredClone(configs);
}

async function getSavedPublishCategorySchema() {
  if (!isDbConfigured()) return [] as PublishCategoryMetaConfig[];

  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: 'publish_category_schema' },
      select: { value: true },
    });
    if (!row?.value) return [] as PublishCategoryMetaConfig[];
    return parsePublishCategorySchema(row.value).schema;
  } catch (error) {
    console.warn('[config] saved publish_category_schema unavailable; returning empty public categories:', error);
    return [] as PublishCategoryMetaConfig[];
  }
}

export function toPublicConfig(configs: any, options: { publishCategorySchema?: PublishCategoryMetaConfig[] } = {}) {
  const {
    telegram_bot_token,
    telegram_channel_id,
    telegram_recharge_notify_chat_id,
    tron_deposit_fallback_address,
    tron_sweep_target_address,
    platform_ai_config,
    ...publicConfig
  } = configs || {};
  return {
    ...publicConfig,
    publish_category_schema: normalizePublicPublishCategorySchema(options.publishCategorySchema || []),
  };
}

function normalizePublicPublishCategorySchema(schemas: unknown) {
  if (!Array.isArray(schemas)) return schemas;

  return schemas.map((schema) => {
    if (!schema || typeof schema !== 'object') return schema;
    const item = schema as PublishCategoryMetaConfig;
    const categorySlug = normalizePublishCategorySlug(item.categorySlug || item.slug);
    return {
      ...item,
      categorySlug,
      slug: categorySlug,
      name: getPublicCategoryDisplayName({ ...item, categorySlug, slug: categorySlug }),
    };
  });
}

function normalizePublicCategoryName(raw: unknown) {
  return String(raw || '').trim().toLowerCase();
}

function isExposurePublicCategoryRef(value: unknown) {
  const ref = String(value || '').trim().toLowerCase();
  return ref === 'exposure' || ref === '曝光' || ref === '爆料';
}

function getPublicCategoryDisplayName(category: any) {
  return [category?.categorySlug, category?.slug, category?.id, category?.name].some(isExposurePublicCategoryRef)
    ? '爆料'
    : category?.name;
}

function normalizePublicCategory(category: any) {
  return {
    ...category,
    name: getPublicCategoryDisplayName(category),
  };
}

function getPublicCategoryCanonicalRefs(category: any) {
  const normalized = normalizePublicCategory(category);
  return [normalized?.categorySlug, normalized?.id, normalized?.slug, normalized?.name]
    .map((value) => {
      if (isExposurePublicCategoryRef(value)) return '爆料';
      return normalizePublicCategoryName(value);
    })
    .filter(Boolean);
}

function hasSamePublicCategoryRef(left: any, right: any) {
  const rightRefs = getPublicCategoryCanonicalRefs(right);
  if (rightRefs.length === 0) return false;
  const leftRefs = new Set(getPublicCategoryCanonicalRefs(left));
  return rightRefs.some((ref) => leftRefs.has(ref));
}

function normalizePublicCategories(categories: any[]) {
  const normalized: any[] = [];

  categories.forEach((category) => {
    if (!category?.id || !category?.name) return;
    const nextCategory = normalizePublicCategory(category);
    if (normalized.some((item) => hasSamePublicCategoryRef(item, nextCategory))) return;
    normalized.push(nextCategory);
  });

  return normalized.sort((left, right) => (left.order || 0) - (right.order || 0));
}

function mergePublishSchemaCategories(categories: any[], schemas: PublishCategoryMetaConfig[] | undefined) {
  const merged = normalizePublicCategories(categories);
  const maxOrder = merged.reduce((max, item) => Math.max(max, Number(item?.order || 0)), 0);
  if (!Array.isArray(schemas) || schemas.length === 0) return merged;

  schemas.forEach((schema, index) => {
      const slug = normalizePublishCategorySlug(schema.categorySlug || schema.slug);
      const rawName = String(schema.name || schema.slug || slug).trim();
      const nextCategory = normalizePublicCategory({
        id: slug,
        slug,
        categorySlug: slug,
        name: rawName || slug,
        order: maxOrder + index + 1,
        schemaVersion: schema.schemaVersion || 1,
      });
      if (!slug || merged.some((category) => hasSamePublicCategoryRef(category, nextCategory))) return;
      merged.push(nextCategory);
    });

  return normalizePublicCategories(merged);
}

function buildPublicCategoriesFromPublishSchema(schemas: PublishCategoryMetaConfig[] | undefined) {
  return mergePublishSchemaCategories([], schemas);
}

async function getCachedCategoryPayload() {
  if (categoriesCache && categoriesCache.expiresAt > Date.now()) {
    return { categories: categoriesCache.data, schema: categoriesCache.schema };
  }

  if (!categoriesCachePromise) {
    categoriesCachePromise = getSavedPublishCategorySchema()
      .then((schema) => ({
        schema: normalizePublicPublishCategorySchema(schema) as PublishCategoryMetaConfig[],
        categories: buildPublicCategoriesFromPublishSchema(schema),
      }))
      .finally(() => {
        categoriesCachePromise = null;
      });
  }

  const payload = await categoriesCachePromise;
  categoriesCache = {
    data: payload.categories,
    schema: payload.schema,
    expiresAt: Date.now() + CATEGORIES_CACHE_TTL_MS,
  };
  return payload;
}

export async function getCachedCategories() {
  return (await getCachedCategoryPayload()).categories;
}

export function registerConfigRoutes(app: Express) {
  registerAdminAutoLikeRoutes(app);
  registerPlatformAiRoutes(app);

  app.get('/api/config', publicReadLimiter, catchAsync(async (_req, res) => {
    const [configs, categoryPayload] = await Promise.all([
      getConfigs(),
      getCachedCategoryPayload(),
    ]);
    setPublicCache(res, 60);
    res.json({
      ...toPublicConfig(configs, { publishCategorySchema: categoryPayload.schema }),
      categories: categoryPayload.categories,
    });
  }));

  app.get('/api/categories', publicReadLimiter, catchAsync(async (_req, res) => {
    const categories = await getCachedCategories();
    setPublicCache(res, 30, 120, 300);
    res.json(categories);
  }));

  app.get('/api/home/bootstrap', publicReadLimiter, catchAsync(async (_req, res) => {
    const [configs, categoryPayload, homeAds] = await Promise.all([
      getConfigs(),
      getCachedCategoryPayload(),
      PromotionService.getActiveHomeAds(),
    ]);
    setPublicCache(res, 30, 120, 300);
    res.json({
      config: toPublicConfig(configs, { publishCategorySchema: categoryPayload.schema }),
      categories: categoryPayload.categories,
      homeAds: toPublicPromotionAdPayloads(homeAds),
    });
  }));

  app.get('/api/admin/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    const [configs, categoryPayload, databaseCategories] = await Promise.all([
      getConfigs(),
      getCachedCategoryPayload(),
      listDatabaseCategoryOptions(),
    ]);
    setNoStore(res);
    res.json({
      ...configs,
      publish_category_schema: configs.publish_category_schema,
      categories: categoryPayload.categories,
      category_options: databaseCategories,
    });
  }));
}
