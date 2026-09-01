import type { Prisma } from '@prisma/client';

import type { PublishCategoryMetaConfig } from '../../config.service';
import { normalizePublishCategoryMetaPayload } from '../category-meta.service';
import {
  POST_CONTACT_MAX_LENGTH,
  POST_CONTENT_MAX_LENGTH,
  POST_IMAGE_ONLY_TITLE,
  POST_IMAGE_URL_MAX_LENGTH,
  POST_LOCATION_MAX_LENGTH,
  POST_MAX_IMAGE_COUNT,
  POST_PROMOTION_LINK_META_KEY,
  POST_TITLE_MAX_LENGTH,
  normalizePostPromotionLinkInput,
} from '../../../shared/postPublishing';

export const POST_PUBLISH_CONTRACT_VERSION = 2;

export type PostPublishCategory = {
  id: string;
  name: string;
  slug: string;
};

export type PostPublishDraft = {
  title?: unknown;
  content?: unknown;
  images?: unknown;
  location?: unknown;
  contact?: unknown;
  showContact?: unknown;
  isAnonymous?: unknown;
  quotedPostId?: unknown;
  clientNonce?: unknown;
  promotionLink?: unknown;
  categoryMeta?: unknown;
  source?: unknown;
};

export type PreparedPostPublishData = {
  contractVersion: typeof POST_PUBLISH_CONTRACT_VERSION;
  title: string;
  content: string;
  images: string[];
  location: string | null;
  countryCode: string | null;
  countryName: string | null;
  contact: string;
  showContact: boolean;
  isAnonymous: boolean;
  quotedPostId: string | null;
  clientNonce: string | null;
  source: string | null;
  category: PostPublishCategory | null;
  categoryMeta: Record<string, unknown>;
  categoryMetaSchemaVersion: number | null;
};

export type PreparePostPublishContext = {
  category: PostPublishCategory | null;
  categoryMetaSchema: PublishCategoryMetaConfig | null;
  locationPresetValues: Set<string>;
  normalizeLocation: (raw: unknown) => string | null;
  deriveLocation: (raw: unknown) => {
    location: string | null;
    countryCode: string | null;
    countryName: string | null;
  };
  normalizeContact: (raw: unknown) => string;
  normalizeBoolean: (raw: unknown, fallback?: boolean) => boolean;
  normalizeShowContact: (raw: unknown, normalizedContact: string | null | undefined) => boolean;
  canonicalizeImageUrl: (url: string) => string;
  allowContentTruncation?: boolean;
  allowTitleTruncation?: boolean;
  forcePublicIdentity?: boolean;
};

export class PostPublishError extends Error {
  code: string;
  retryable: boolean;
  details: Record<string, unknown>;

  constructor(code: string, message: string, options: { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'PostPublishError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.details = options.details || {};
  }
}

function text(raw: unknown) {
  return typeof raw === 'string' ? raw.trim() : '';
}

function truncateAtBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const candidate = value.slice(0, maxLength);
  const boundary = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf('。'), candidate.lastIndexOf('！'), candidate.lastIndexOf('？'));
  return (boundary >= Math.floor(maxLength * 0.72) ? candidate.slice(0, boundary + 1) : candidate).trim();
}

function normalizeTitle(rawTitle: unknown, content: string, allowTruncation: boolean) {
  const provided = text(rawTitle).replace(/\s+/g, ' ');
  const fallback = content.replace(/\s+/g, ' ').trim() || POST_IMAGE_ONLY_TITLE;
  const title = provided || fallback;
  if (!allowTruncation && Array.from(title).length > POST_TITLE_MAX_LENGTH) {
    throw new PostPublishError('title_too_long', `标题最长 ${POST_TITLE_MAX_LENGTH} 字`);
  }
  return Array.from(title).slice(0, POST_TITLE_MAX_LENGTH).join('');
}

export function preparePostPublishData(
  draft: PostPublishDraft,
  context: PreparePostPublishContext,
): PreparedPostPublishData {
  const rawContent = text(draft.content);
  const content = context.allowContentTruncation
    ? truncateAtBoundary(rawContent, POST_CONTENT_MAX_LENGTH)
    : rawContent;
  if (!context.allowContentTruncation && content.length > POST_CONTENT_MAX_LENGTH) {
    throw new PostPublishError('content_too_long', `内容最长 ${POST_CONTENT_MAX_LENGTH} 字`);
  }

  const rawImages = draft.images === undefined || draft.images === null ? [] : draft.images;
  if (!Array.isArray(rawImages)) throw new PostPublishError('images_not_array', '图片参数必须是数组');
  if (rawImages.length > POST_MAX_IMAGE_COUNT) {
    throw new PostPublishError('too_many_images', `最多上传 ${POST_MAX_IMAGE_COUNT} 张图片`);
  }
  const images = Array.from(new Set(rawImages.map((item, index) => {
    const raw = typeof item === 'string' ? item.trim() : '';
    const normalized = raw && raw.length <= POST_IMAGE_URL_MAX_LENGTH ? context.canonicalizeImageUrl(raw) : '';
    if (!normalized) {
      throw new PostPublishError('image_not_persistent', `第 ${index + 1} 张图片必须先上传成功`, {
        retryable: true,
        details: { imageIndex: index },
      });
    }
    return normalized;
  })));

  if (!content && images.length === 0) throw new PostPublishError('content_empty', '请提供文字或图片内容');

  const normalizedLocation = context.normalizeLocation(draft.location);
  if (draft.location !== undefined && draft.location !== null && typeof draft.location !== 'string') {
    throw new PostPublishError('location_invalid', '地点参数不合法');
  }
  if (normalizedLocation && normalizedLocation.length > POST_LOCATION_MAX_LENGTH) {
    throw new PostPublishError('location_too_long', `地点最长 ${POST_LOCATION_MAX_LENGTH} 字`);
  }
  const location = context.deriveLocation(normalizedLocation);

  const contact = context.normalizeContact(draft.contact);
  if (contact.length > POST_CONTACT_MAX_LENGTH) {
    throw new PostPublishError('contact_too_long', `联系方式最长 ${POST_CONTACT_MAX_LENGTH} 字`);
  }
  const showContact = context.normalizeShowContact(draft.showContact, contact);
  if (showContact && !contact) {
    throw new PostPublishError('contact_required', '已开启联系按钮时，必须提供 Telegram 联系方式（@用户名）', {
      retryable: true,
    });
  }

  if (context.category && !context.categoryMetaSchema) {
    throw new PostPublishError('category_schema_unavailable', '该分类暂不支持发布，请重新选择分类', { retryable: true });
  }
  const metaValidation = normalizePublishCategoryMetaPayload(
    draft.categoryMeta,
    context.categoryMetaSchema,
    context.locationPresetValues,
  );
  if (metaValidation.errors.length) {
    throw new PostPublishError('category_meta_invalid', `分类附加信息校验失败：${metaValidation.errors.join('；')}`, {
      retryable: true,
      details: { validationErrors: metaValidation.errors },
    });
  }

  const promotionLinkResult = normalizePostPromotionLinkInput(draft.promotionLink);
  if (promotionLinkResult.error) throw new PostPublishError('promotion_link_invalid', promotionLinkResult.error);
  const categoryMeta = promotionLinkResult.link
    ? { ...metaValidation.normalized, [POST_PROMOTION_LINK_META_KEY]: promotionLinkResult.link }
    : metaValidation.normalized;

  return {
    contractVersion: POST_PUBLISH_CONTRACT_VERSION,
    title: normalizeTitle(draft.title, content, Boolean(context.allowTitleTruncation)),
    content,
    images,
    location: location.location,
    countryCode: location.countryCode,
    countryName: location.countryName,
    contact,
    showContact,
    isAnonymous: context.forcePublicIdentity ? false : context.normalizeBoolean(draft.isAnonymous, false),
    quotedPostId: text(draft.quotedPostId) || null,
    clientNonce: text(draft.clientNonce) || null,
    source: text(draft.source).slice(0, 80) || null,
    category: context.category,
    categoryMeta,
    categoryMetaSchemaVersion: context.categoryMetaSchema?.schemaVersion || null,
  };
}

export function buildPreparedPostCreateData(
  prepared: PreparedPostPublishData,
  input: { userId: string; createdAt: Date; bumpedAt?: Date },
) {
  return {
    title: prepared.title,
    content: prepared.content,
    location: prepared.location,
    countryCode: prepared.countryCode,
    countryName: prepared.countryName,
    contact: prepared.contact,
    showContact: prepared.showContact,
    images: prepared.images,
    source: prepared.source,
    isAnonymous: prepared.isAnonymous,
    isPublished: true,
    clientNonce: prepared.clientNonce,
    ...(prepared.quotedPostId ? { quotedPost: { connect: { id: prepared.quotedPostId } } } : {}),
    ...(prepared.category?.id ? { category: { connect: { id: prepared.category.id } } } : {}),
    ...(Object.keys(prepared.categoryMeta).length
      ? { categoryMeta: prepared.categoryMeta as Prisma.InputJsonValue }
      : {}),
    categoryMetaSchemaVersion: prepared.categoryMetaSchemaVersion,
    createdAt: input.createdAt,
    bumpedAt: input.bumpedAt || input.createdAt,
    user: { connect: { id: input.userId } },
  } satisfies Prisma.PostCreateInput;
}

export async function createPreparedPost(
  tx: { post: { create: (args: any) => Promise<any> } },
  prepared: PreparedPostPublishData,
  input: { userId: string; createdAt: Date; bumpedAt?: Date },
  resultShape: { select?: Record<string, unknown>; include?: Record<string, unknown> } = {},
) {
  return tx.post.create({
    data: buildPreparedPostCreateData(prepared, input),
    ...resultShape,
  });
}
