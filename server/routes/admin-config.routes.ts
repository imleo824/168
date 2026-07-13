import type { Express } from 'express';

import { ConfigService, parsePublishCategorySchema } from '../config.service';
import prisma from '../db';
import { setNoStore } from '../http-cache';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { normalizePublishCategorySlug } from '../../shared/publishCategorySchema';
import {
  clearCachedCategories,
  getCachedCategories,
  getConfigs,
  toPublicConfig,
} from './config.routes';

async function assertPublishCategorySchemaUsesExistingCategories(rawSchema: unknown) {
  if (rawSchema === undefined) return;
  const parsed = parsePublishCategorySchema(rawSchema);
  if (parsed.parseError) throw new Error(parsed.parseError);
  if (parsed.schema.length === 0) throw new Error('发布分类配置错误：至少需要配置一个分类');

  const categories = await prisma.category.findMany({ select: { slug: true } });
  const existingSlugs = new Set(categories.map((category) => normalizePublishCategorySlug(category.slug)));
  const missingSlugs = parsed.schema
    .map((schema) => normalizePublishCategorySlug(schema.categorySlug || schema.slug))
    .filter((slug) => slug && !existingSlugs.has(slug));

  if (missingSlugs.length > 0) {
    throw new Error(`发布分类配置错误：以下分类未在数据库 Category 中创建：${Array.from(new Set(missingSlugs)).join('、')}`);
  }
}

export function registerAdminConfigRoutes(app: Express) {
  app.patch('/api/admin/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    await assertPublishCategorySchemaUsesExistingCategories(req.body?.publish_category_schema);
    await ConfigService.updateConfigs(req.body);
    clearCachedCategories();
    const [configs, categories] = await Promise.all([
      getConfigs(),
      getCachedCategories(),
    ]);
    setNoStore(res);
    res.json({
      success: true,
      config: toPublicConfig(configs),
      categories,
    });
  }));
}
