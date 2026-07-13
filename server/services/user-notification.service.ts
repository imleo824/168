import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma from '../db';

export const USER_NOTIFICATION_TYPES = ['LIKE', 'COMMENT', 'QUOTE', 'FOLLOW', 'SYSTEM', 'RECHARGE', 'PROMOTION'] as const;
export type UserNotificationType = typeof USER_NOTIFICATION_TYPES[number];

const USER_NOTIFICATION_TYPE_SET = new Set<string>(USER_NOTIFICATION_TYPES);
const INTERACTION_TYPES = new Set<UserNotificationType>(['LIKE', 'COMMENT', 'QUOTE', 'FOLLOW']);
const NOTIFICATION_TEXT_MAX_LENGTH = 240;
const NOTIFICATION_TITLE_MAX_LENGTH = 80;
const NOTIFICATION_TARGET_MAX_LENGTH = 512;
const NOTIFICATION_SOURCE_KEY_MAX_LENGTH = 256;
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
const POSTGRES_UNIQUE_VIOLATION = '23505';

export type UserNotificationInput = {
  receiverId: string;
  sourceKey: string;
  type: UserNotificationType;
  actorId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  quotePostId?: string | null;
  title?: string | null;
  body?: string | null;
  targetUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
};

function normalizeText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

function normalizeSourceKey(value: unknown) {
  return normalizeText(value, NOTIFICATION_SOURCE_KEY_MAX_LENGTH);
}

function buildNotificationId(receiverId: string, sourceKey: string) {
  return `un_${crypto.createHash('sha256').update(`${receiverId}:${sourceKey}`).digest('hex').slice(0, 40)}`;
}

function normalizeTargetUrl(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw.slice(0, NOTIFICATION_TARGET_MAX_LENGTH) || null;
}

function getDatabaseErrorCode(error: unknown) {
  const anyError = error as any;
  return String(anyError?.code || anyError?.meta?.code || anyError?.cause?.code || anyError?.message || '');
}

function isSoftInsertFailure(error: unknown) {
  const code = getDatabaseErrorCode(error);
  return code.includes(POSTGRES_FOREIGN_KEY_VIOLATION) || code.includes(POSTGRES_UNIQUE_VIOLATION);
}

export function isUserNotificationType(value: unknown): value is UserNotificationType {
  return USER_NOTIFICATION_TYPE_SET.has(String(value || '').toUpperCase());
}

export function normalizeUserNotificationType(value: unknown): UserNotificationType {
  const normalized = String(value || '').trim().toUpperCase();
  return isUserNotificationType(normalized) ? normalized : 'SYSTEM';
}

export function buildInteractionSourceKey(input: {
  receiverId: string;
  actorId: string;
  type: UserNotificationType;
  postId?: string | null;
  commentId?: string | null;
  quotePostId?: string | null;
}) {
  if (input.type === 'LIKE' && input.postId) return `LIKE:${input.actorId}:${input.postId}`;
  if (input.type === 'COMMENT' && input.commentId) return `COMMENT:${input.commentId}`;
  if (input.type === 'QUOTE' && input.quotePostId) return `QUOTE:${input.quotePostId}`;
  if (input.type === 'FOLLOW') return `FOLLOW:${input.actorId}:${input.receiverId}`;
  return '';
}

export async function createUserNotification(client: Pick<typeof prisma, '$executeRaw'>, input: UserNotificationInput) {
  const receiverId = normalizeText(input.receiverId, 128);
  const sourceKey = normalizeSourceKey(input.sourceKey);
  const type = normalizeUserNotificationType(input.type);
  if (!receiverId || !sourceKey) return { created: false, reason: 'invalid_notification' };

  const actorId = normalizeText(input.actorId, 128) || null;
  if (INTERACTION_TYPES.has(type) && !actorId) return { created: false, reason: 'interaction_actor_required' };
  if (actorId && actorId === receiverId) return { created: false, reason: 'self_notification' };

  const id = buildNotificationId(receiverId, sourceKey);
  const createdAt = input.createdAt || new Date();
  const postId = normalizeText(input.postId, 128) || null;
  const commentId = normalizeText(input.commentId, 128) || null;
  const quotePostId = normalizeText(input.quotePostId, 128) || null;
  const title = normalizeText(input.title, NOTIFICATION_TITLE_MAX_LENGTH) || null;
  const body = normalizeText(input.body, NOTIFICATION_TEXT_MAX_LENGTH) || null;
  const targetUrl = normalizeTargetUrl(input.targetUrl);
  const metadata = input.metadata && typeof input.metadata === 'object'
    ? Prisma.sql`${JSON.stringify(input.metadata)}::jsonb`
    : Prisma.sql`NULL`;

  try {
    const inserted = await client.$executeRaw(Prisma.sql`
      INSERT INTO "UserNotification" (
        "id", "sourceKey", "receiverId", "actorId", "type", "postId", "commentId", "quotePostId",
        "title", "body", "targetUrl", "metadata", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${sourceKey}, ${receiverId}, ${actorId}, ${type}, ${postId}, ${commentId}, ${quotePostId},
        ${title}, ${body}, ${targetUrl}, ${metadata}, ${createdAt}, ${createdAt}
      )
      ON CONFLICT ("receiverId", "sourceKey") DO NOTHING
    `);

    return { created: Number(inserted) > 0, reason: Number(inserted) > 0 ? '' : 'duplicate' };
  } catch (error) {
    if (isSoftInsertFailure(error)) return { created: false, reason: 'stale_reference' };
    throw error;
  }
}

export async function createInteractionNotification(client: Pick<typeof prisma, '$executeRaw'>, input: {
  receiverId: string;
  actorId: string;
  type: UserNotificationType;
  postId?: string | null;
  commentId?: string | null;
  quotePostId?: string | null;
  createdAt?: Date;
}) {
  const type = normalizeUserNotificationType(input.type);
  const sourceKey = buildInteractionSourceKey({ ...input, type });
  if (!sourceKey) return { created: false, reason: 'invalid_interaction_source' };
  return createUserNotification(client, {
    receiverId: input.receiverId,
    actorId: input.actorId,
    type,
    sourceKey,
    postId: input.postId,
    commentId: input.commentId,
    quotePostId: input.quotePostId,
    createdAt: input.createdAt,
  });
}

export async function syncDerivedNotifications(receiverId: string) {

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UserNotification" (
      "id", "sourceKey", "receiverId", "actorId", "type", "postId", "createdAt", "updatedAt"
    )
    SELECT
      'un_' || md5(p."userId" || ':LIKE:' || l."userId" || ':' || l."postId"),
      'LIKE:' || l."userId" || ':' || l."postId",
      p."userId",
      l."userId",
      'LIKE',
      l."postId",
      l."createdAt",
      l."createdAt"
    FROM "Like" l
    INNER JOIN "Post" p ON p."id" = l."postId"
    WHERE p."userId" = ${receiverId}
      AND l."userId" <> ${receiverId}
      AND p."deletedAt" IS NULL
      AND p."isPublished" = true
    ON CONFLICT ("receiverId", "sourceKey") DO NOTHING
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UserNotification" (
      "id", "sourceKey", "receiverId", "actorId", "type", "postId", "commentId", "createdAt", "updatedAt"
    )
    SELECT
      'un_' || md5(p."userId" || ':COMMENT:' || c."id"),
      'COMMENT:' || c."id",
      p."userId",
      c."userId",
      'COMMENT',
      c."postId",
      c."id",
      c."createdAt",
      c."updatedAt"
    FROM "PostComment" c
    INNER JOIN "Post" p ON p."id" = c."postId"
    WHERE p."userId" = ${receiverId}
      AND c."userId" <> ${receiverId}
      AND c."status" = 'VISIBLE'
      AND c."deletedAt" IS NULL
      AND p."deletedAt" IS NULL
      AND p."isPublished" = true
    ON CONFLICT ("receiverId", "sourceKey") DO NOTHING
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UserNotification" (
      "id", "sourceKey", "receiverId", "actorId", "type", "postId", "quotePostId", "createdAt", "updatedAt"
    )
    SELECT
      'un_' || md5(original."userId" || ':QUOTE:' || q."id"),
      'QUOTE:' || q."id",
      original."userId",
      q."userId",
      'QUOTE',
      original."id",
      q."id",
      q."createdAt",
      q."updatedAt"
    FROM "Post" q
    INNER JOIN "Post" original ON original."id" = q."quotedPostId"
    WHERE original."userId" = ${receiverId}
      AND q."userId" <> ${receiverId}
      AND q."deletedAt" IS NULL
      AND q."isPublished" = true
      AND original."deletedAt" IS NULL
      AND original."isPublished" = true
    ON CONFLICT ("receiverId", "sourceKey") DO NOTHING
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "UserNotification" (
      "id", "sourceKey", "receiverId", "actorId", "type", "createdAt", "updatedAt"
    )
    SELECT
      'un_' || md5(f."followingId" || ':FOLLOW:' || f."followerId"),
      'FOLLOW:' || f."followerId" || ':' || f."followingId",
      f."followingId",
      f."followerId",
      'FOLLOW',
      f."createdAt",
      f."createdAt"
    FROM "Follow" f
    WHERE f."followingId" = ${receiverId}
      AND f."followerId" <> ${receiverId}
    ON CONFLICT ("receiverId", "sourceKey") DO NOTHING
  `);
}

export function mapUserNotificationRow(row: any) {
  const type = normalizeUserNotificationType(row.type);
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    type,
    title: row.title || null,
    body: row.body || null,
    targetUrl: row.targetUrl || null,
    readAt: row.readAt,
    createdAt: row.createdAt,
    actor: row.visibleActorId ? {
      id: row.visibleActorId,
      displayName: row.actorDisplayName,
      username: row.actorLoginAccount,
      photoUrl: row.actorPhotoUrl,
      userType: row.actorUserType,
    } : null,
    post: row.visiblePostId ? {
      id: row.visiblePostId,
      title: row.postTitle,
      content: row.postContent,
    } : null,
    comment: row.visibleCommentId ? {
      id: row.visibleCommentId,
      content: row.commentContent,
    } : null,
    quotePost: row.visibleQuotePostId ? {
      id: row.visibleQuotePostId,
      title: row.quotePostTitle,
      content: row.quotePostContent,
    } : null,
  };
}
