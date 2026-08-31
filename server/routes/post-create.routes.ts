import type { Express } from 'express';
import { postLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth } from '../middlewares/auth';
import prisma, { isDbConfigured } from '../db';
import { ConfigService, type PublishCategoryMetaConfig } from '../config.service';
import { PostService } from '../post.service';
import { buildLocationPresetValueSet } from '../services/category-meta.service';
import {
  ensurePostPublishStorageReady,
} from '../services/post-category-schema-version.service';
import { incrementNormalQuoteAggregate } from '../services/post/trusted-engagement-aggregate';
import {
  assertCanShowContactOnPost,
  isTuiPlusActiveSnapshot,
  PostContactEligibilityError,
  resolvePostContactEligibility,
} from '../services/post-contact-eligibility.service';
import { normalizePublishCategorySlug } from '../../shared/publishCategorySchema';
import {
  POST_PROMOTION_LINK_MEMBER_MESSAGE,
  POST_PROMOTION_LINK_META_KEY,
} from '../../shared/postPublishing';
import {
  createPreparedPost,
  PostPublishError,
  preparePostPublishData,
} from '../services/post/post-publish-contract';

const CATEGORY_PARAM_MAX_LENGTH = 128;
const POST_CLIENT_NONCE_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

type AccessiblePostMeta = { id: string };

type PostCreateRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  POST_CREATED_CHAT_QUOTE_SELECT: any;
  normalizeExternalLocation: (rawLocation?: unknown) => string;
  derivePostLocation: (externalLocation?: unknown) => { location: string; countryCode: string | null; countryName: string | null };
  normalizeTelegramContactHandle: (input: unknown) => string;
  normalizeBooleanInput: (value: unknown, fallback?: boolean) => boolean;
  normalizeShowContactInput: (value: unknown, normalizedContact: string | null | undefined) => boolean;
  canonicalizePersistentUploadedImageUrl: (url: string) => string;
  resolveQuotablePostMeta: (postId: string, viewerId?: string, viewerRole?: string) => Promise<AccessiblePostMeta | null>;
  adjustPostQuoteCount: (tx: any, quotedPostId: string | null | undefined, delta: number) => Promise<void>;
  publishPostCreatedToChat: (params: { post: any; user: any }) => Promise<void>;
  markContentDataChanged: () => void;
  isDatabaseUnavailableError: (error: unknown) => boolean;
  isDatabaseSchemaDriftError: (error: unknown) => boolean;
  sendDatabaseUnavailable: (res: any, action: string) => any;
  sendDatabaseSchemaDrift: (res: any, action: string) => any;
} & Record<string, unknown>;

class PostCreateHttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizePostClientNonce(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  return POST_CLIENT_NONCE_PATTERN.test(value) ? value : '';
}

function getConfiguredSchemaSlug(schema: PublishCategoryMetaConfig) {
  return normalizePublishCategorySlug(schema.categorySlug || schema.slug);
}

function runPostCreatedSideEffects(deps: PostCreateRoutesDeps, post: any, user: any) {
  try {
    deps.markContentDataChanged();
  } catch (error) {
    console.warn('[PostCreate] markContentDataChanged failed after post creation', error);
  }

  try {
    PostService.schedulePostRankingRefresh([post.id, post.quotedPostId].filter(Boolean));
  } catch (error) {
    console.warn('[PostCreate] schedulePostRankingRefresh failed after post creation', error);
  }

  void deps.publishPostCreatedToChat({ post, user }).catch((error) => {
    console.warn('[PostCreate] publishPostCreatedToChat failed after post creation', error);
  });
}

export function registerPostCreateRoutes(app: Express, deps: PostCreateRoutesDeps) {
  app.get('/api/posts/contact-eligibility', authMiddleware, mustAuth, async (req: any, res) => {
    try {
      if (!isDbConfigured()) return deps.sendDatabaseUnavailable(res, '检查联系方式权益');
      const payload = await resolvePostContactEligibility(req.user.id);
      return res.json(payload);
    } catch (error: any) {
      console.error(error);
      if (error instanceof PostContactEligibilityError) return res.status(error.statusCode).json({ error: error.message });
      if (deps.isDatabaseUnavailableError(error)) return deps.sendDatabaseUnavailable(res, '检查联系方式权益');
      if (deps.isDatabaseSchemaDriftError(error)) return deps.sendDatabaseSchemaDrift(res, '检查联系方式权益');
      return res.status(400).json({ error: '联系方式权益检查失败，请稍后重试' });
    }
  });

  app.post('/api/posts', authMiddleware, mustAuth, postLimiter, async (req: any, res) => {
    try {
      if (!isDbConfigured()) return deps.sendDatabaseUnavailable(res, '发布内容');
      await ensurePostPublishStorageReady();
      const { title, content, contact, categoryId, categoryMeta, promotionLink, images, location, quotedPostId, isAnonymous, showContact } = req.body;
      const normalizedCategoryId = typeof categoryId === 'string' ? categoryId.trim() : '';
      const normalizedQuotedPostId = typeof quotedPostId === 'string' ? quotedPostId.trim() : '';
      const normalizedClientNonce = normalizePostClientNonce(req.body?.clientNonce || req.get('Idempotency-Key') || req.get('X-Idempotency-Key'));
      const rawClientNonce = String(req.body?.clientNonce || req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || '').trim();
      const rawContactInput = typeof contact === 'string' ? contact.trim() : '';
      const normalizedContact = deps.normalizeTelegramContactHandle(contact);
      const isRobotUser = req.user.userType === 'ROBOT';

      if (rawClientNonce && !normalizedClientNonce) return res.status(400).json({ error: '发布请求标识不合法，请刷新页面后重试' });
      if (normalizedCategoryId.length > CATEGORY_PARAM_MAX_LENGTH) return res.status(400).json({ error: '分类参数不合法' });
      if (normalizedQuotedPostId && !deps.POST_ID_PATTERN.test(normalizedQuotedPostId)) return res.status(400).json({ error: '引用的帖子不存在或已删除' });
      if (!isRobotUser && rawContactInput && !normalizedContact) return res.status(400).json({ error: '联系方式格式错误：仅支持 Telegram 用户名（5-32位，字母开头，可含数字/下划线）' });

      const config = await ConfigService.getConfigs();
      const configuredSchemas = Array.isArray(config?.publish_category_schema) ? config.publish_category_schema as PublishCategoryMetaConfig[] : [];
      const shouldValidateCategoryMeta = configuredSchemas.length > 0;
      const locationPresetValues = buildLocationPresetValueSet(config?.location_presets);
      let selectedCategory = null as any;
      let categoryMetaSchema: PublishCategoryMetaConfig | null = null;
      let quotedPostMeta: AccessiblePostMeta | null = null;

      if (normalizedCategoryId) {
        const requestedCategorySlug = normalizePublishCategorySlug(normalizedCategoryId);
        if (!requestedCategorySlug) return res.status(400).json({ error: '分类参数不合法' });
        if (!shouldValidateCategoryMeta) return res.status(400).json({ error: '发布分类配置未启用' });
        categoryMetaSchema = configuredSchemas.find((schema) => getConfiguredSchemaSlug(schema) === requestedCategorySlug) || null;
        if (!categoryMetaSchema) return res.status(400).json({ error: '该分类暂不支持发布，请重新选择分类' });

        const categoryName = String(categoryMetaSchema.name || categoryMetaSchema.slug || categoryMetaSchema.categorySlug || requestedCategorySlug).trim() || requestedCategorySlug;
        selectedCategory = await prisma.category.upsert({
          where: { slug: requestedCategorySlug },
          update: { name: categoryName },
          create: { slug: requestedCategorySlug, name: categoryName },
          select: { id: true, slug: true, name: true },
        });
      }

      const prepared = preparePostPublishData({
        title,
        content,
        images,
        location,
        contact,
        showContact,
        isAnonymous,
        quotedPostId: normalizedQuotedPostId,
        clientNonce: normalizedClientNonce,
        promotionLink,
        categoryMeta,
      }, {
        category: selectedCategory,
        categoryMetaSchema,
        locationPresetValues,
        normalizeLocation: deps.normalizeExternalLocation,
        deriveLocation: deps.derivePostLocation,
        normalizeContact: deps.normalizeTelegramContactHandle,
        normalizeBoolean: deps.normalizeBooleanInput,
        normalizeShowContact: deps.normalizeShowContactInput,
        canonicalizeImageUrl: deps.canonicalizePersistentUploadedImageUrl,
        forcePublicIdentity: isRobotUser,
      });

      if (normalizedQuotedPostId) {
        quotedPostMeta = await deps.resolveQuotablePostMeta(normalizedQuotedPostId, req.user.id, req.user.role);
        if (!quotedPostMeta) return res.status(404).json({ error: '引用的帖子不存在或已删除' });
        if (!prepared.content) return res.status(400).json({ error: '引用发帖需要填写文字内容' });
        if (prepared.images.length > 0) return res.status(400).json({ error: '引用发帖暂不支持上传图片' });
      }

      if (req.user.isDisabled) return res.status(403).json({ error: '您的账号已被禁用，无法发布信息！' });

      const { post, updatedUser, idempotentReplay } = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const lockedUsers = await tx.$queryRaw<any[]>`
          SELECT "id", "points", "isDisabled", "plusStatus", "plusExpiresAt", "userType"::text AS "userType"
          FROM "User"
          WHERE "id" = ${req.user.id}
          FOR UPDATE
        `;
        const user = lockedUsers[0];
        if (!user) throw new Error('用户不存在');
        if (user.isDisabled) throw new PostCreateHttpError(403, '您的账号已被禁用，无法发布信息！');

        if (prepared.clientNonce) {
          const existingRows = await tx.$queryRaw<any[]>`
            SELECT "id"
            FROM "Post"
            WHERE "userId" = ${req.user.id}
              AND "clientNonce" = ${prepared.clientNonce}
              AND "deletedAt" IS NULL
            LIMIT 1
          `;
          const existingId = existingRows[0]?.id;
          if (existingId) {
            const existingPost = await tx.post.findUnique({
              where: { id: existingId },
              include: { category: true, quotedPost: { select: deps.POST_CREATED_CHAT_QUOTE_SELECT } },
            });
            if (existingPost) return { post: existingPost, updatedUser: { id: user.id, points: Number(user.points || 0) }, idempotentReplay: true };
          }
        }

        const activeTuiPlus = isTuiPlusActiveSnapshot(user, now);
        const normalizedPromotionLink = prepared.categoryMeta[POST_PROMOTION_LINK_META_KEY];
        if (!isRobotUser && (normalizedPromotionLink && !activeTuiPlus || prepared.categoryMeta[POST_PROMOTION_LINK_META_KEY] && !activeTuiPlus)) throw new PostCreateHttpError(403, POST_PROMOTION_LINK_MEMBER_MESSAGE);
        // Persisted inside categoryMeta: { [POST_PROMOTION_LINK_META_KEY]: normalizedPromotionLink }
        if (!isRobotUser && prepared.showContact && !activeTuiPlus) await assertCanShowContactOnPost(tx, req.user.id, now);
        const newPost = await createPreparedPost(tx, prepared, { userId: req.user.id, createdAt: now }, {
          include: { category: true, quotedPost: { select: deps.POST_CREATED_CHAT_QUOTE_SELECT } },
        });
        if (quotedPostMeta?.id) {
          await deps.adjustPostQuoteCount(tx, quotedPostMeta.id, 1);
          if (user.userType === 'NORMAL') {
            await incrementNormalQuoteAggregate(quotedPostMeta.id, tx);
          }
        }
        return { post: newPost, updatedUser: { id: user.id, points: Number(user.points || 0) }, idempotentReplay: false };
      });

      if (!idempotentReplay) runPostCreatedSideEffects(deps, post, req.user);
      res.status(idempotentReplay ? 200 : 201).json({
        success: true,
        idempotentReplay,
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          categoryId: post.categoryId,
          images: post.images,
          contact: post.contact,
          showContact: post.showContact,
          isAnonymous: post.isAnonymous,
          quotedPostId: post.quotedPostId,
          quoteCount: post.quoteCount || 0,
          categoryMeta: (post as unknown as { categoryMeta?: Record<string, unknown> | null }).categoryMeta ?? null,
          categoryMetaSchemaVersion: prepared.categoryMetaSchemaVersion,
          createdAt: post.createdAt,
        },
        userPoints: updatedUser.points,
      });
    } catch (error: any) {
      console.error(error);
      if (error instanceof PostCreateHttpError) return res.status(error.statusCode).json({ error: error.message });
      if (error instanceof PostPublishError) return res.status(400).json({ error: error.message });
      if (error instanceof PostContactEligibilityError) return res.status(error.statusCode).json({ error: error.message });
      if (deps.isDatabaseUnavailableError(error)) return deps.sendDatabaseUnavailable(res, '发布内容');
      if (deps.isDatabaseSchemaDriftError(error)) return deps.sendDatabaseSchemaDrift(res, '发布内容');
      if (error?.code === 'P2003') return res.status(400).json({ error: '分类不存在，请重新选择分类' });
      const expectedMessages = ['用户不存在'];
      const message = typeof error?.message === 'string' ? error.message : '';
      const publicMessage = expectedMessages.some((item) => message.startsWith(item)) ? message : '发布失败，请稍后重试';
      res.status(400).json({ error: publicMessage });
    }
  });
}
