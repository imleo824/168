import type { Express } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { publicReadLimiter } from '../middlewares/rateLimit';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import { normalizeStringParam } from '../http/params';
import {
  USER_NOTIFICATION_TYPES,
  isUserNotificationType,
  mapUserNotificationRow,
  syncDerivedNotifications,
  type UserNotificationType,
} from '../services/user-notification.service';

const DEFAULT_NOTIFICATION_LIMIT = 30;
const MAX_NOTIFICATION_LIMIT = 80;
const MAX_CURSOR_LENGTH = 128;
const NOTIFICATION_TYPES = new Set<string>(USER_NOTIFICATION_TYPES);

function parseNotificationType(raw: unknown): UserNotificationType | null | undefined {
  const type = normalizeStringParam(raw, 30).toUpperCase();
  if (!type) return null;
  return isUserNotificationType(type) ? type : undefined;
}

export function registerNotificationRoutes(app: Express) {
  app.get('/api/me/notifications', publicReadLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法加载消息。请稍后重试。' });

    const receiverId = req.user.id;
    await syncDerivedNotifications(receiverId);

    const { limit, cursor } = parseCursorPagination(req, {
      defaultLimit: DEFAULT_NOTIFICATION_LIMIT,
      maxLimit: MAX_NOTIFICATION_LIMIT,
      cursorMaxLength: MAX_CURSOR_LENGTH,
    });
    const type = parseNotificationType(req.query.type);
    if (type === undefined) return res.status(400).json({ error: '消息类型不合法' });
    const typeFilter = type ? Prisma.sql`AND n."type" = ${type}` : Prisma.empty;
    const cursorRows = cursor
      ? await prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>(Prisma.sql`
          SELECT "id", "createdAt" FROM "UserNotification" WHERE "id" = ${cursor} AND "receiverId" = ${receiverId} LIMIT 1
        `)
      : [];
    const cursorRow = cursorRows[0] || null;
    const cursorFilter = cursorRow
      ? Prisma.sql`AND (n."createdAt" < ${cursorRow.createdAt} OR (n."createdAt" = ${cursorRow.createdAt} AND n."id" < ${cursorRow.id}))`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        n."id", n."sourceKey", n."receiverId", n."actorId", n."type", n."postId", n."commentId", n."quotePostId",
        n."title", n."body", n."targetUrl", n."readAt", n."createdAt",
        actor."id" AS "visibleActorId",
        actor."displayName" AS "actorDisplayName",
        actor."loginAccount" AS "actorLoginAccount",
        actor."photoUrl" AS "actorPhotoUrl",
        actor."userType" AS "actorUserType",
        p."id" AS "visiblePostId",
        p."title" AS "postTitle",
        p."content" AS "postContent",
        c."id" AS "visibleCommentId",
        c."content" AS "commentContent",
        qp."id" AS "visibleQuotePostId",
        qp."title" AS "quotePostTitle",
        qp."content" AS "quotePostContent"
      FROM "UserNotification" n
      LEFT JOIN "User" actor ON actor."id" = n."actorId" AND actor."isDisabled" = false
      LEFT JOIN "Post" p ON p."id" = n."postId" AND p."deletedAt" IS NULL AND p."isPublished" = true
      LEFT JOIN "PostComment" c ON c."id" = n."commentId" AND c."deletedAt" IS NULL AND c."status" = 'VISIBLE'
      LEFT JOIN "Post" qp ON qp."id" = n."quotePostId" AND qp."deletedAt" IS NULL AND qp."isPublished" = true
      WHERE n."receiverId" = ${receiverId}
        ${typeFilter}
        ${cursorFilter}
      ORDER BY n."createdAt" DESC, n."id" DESC
      LIMIT ${limit + 1}
    `);

    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "UserNotification" n WHERE n."receiverId" = ${receiverId} ${typeFilter}
    `);
    const unreadRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "UserNotification" n WHERE n."receiverId" = ${receiverId} AND n."readAt" IS NULL ${typeFilter}
    `);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(mapUserNotificationRow);
    const total = Number(totalRows[0]?.count || 0);
    const unreadCount = Number(unreadRows[0]?.count || 0);
    setCursorPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
      total,
    });
    setNoStore(res);
    return res.json({ items, total, unreadCount, types: Array.from(NOTIFICATION_TYPES) });
  }));

  app.get('/api/me/notifications/unread-count', publicReadLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法加载消息。请稍后重试。' });
    await syncDerivedNotifications(req.user.id);
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "UserNotification" WHERE "receiverId" = ${req.user.id} AND "readAt" IS NULL
    `);
    setNoStore(res);
    return res.json({ unreadCount: Number(rows[0]?.count || 0) });
  }));

  app.post('/api/me/notifications/read-all', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法更新消息。请稍后重试。' });
    const now = new Date();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "UserNotification"
      SET "readAt" = COALESCE("readAt", ${now}), "updatedAt" = ${now}
      WHERE "receiverId" = ${req.user.id} AND "readAt" IS NULL
    `);
    setNoStore(res);
    return res.json({ success: true, unreadCount: 0 });
  }));

  app.post('/api/me/notifications/:id/read', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法更新消息。请稍后重试。' });
    const now = new Date();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "UserNotification"
      SET "readAt" = COALESCE("readAt", ${now}), "updatedAt" = ${now}
      WHERE "id" = ${req.params.id} AND "receiverId" = ${req.user.id}
    `);
    setNoStore(res);
    return res.json({ success: true });
  }));
}
