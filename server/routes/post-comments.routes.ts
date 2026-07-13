import crypto from 'node:crypto';
import type { Express, Request } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { postLimiter, publicReadLimiter } from '../middlewares/rateLimit';
import { setListCacheHeaders, setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import { PostService } from '../post.service';
import { bumpPublicFeedCacheVersion, clearPublicFeedResultCache } from '../public-feed-cache';
import {
  decrementNormalCommentAggregate,
  incrementNormalCommentAggregate,
} from '../services/post/trusted-engagement-aggregate';

const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_COMMENT_LENGTH = 300;
const DEFAULT_COMMENT_LIMIT = 20;
const MAX_COMMENT_LIMIT = 50;
const MAX_CURSOR_LENGTH = 128;

function parseCommentPagination(req: Request) {
  const { limit, cursor } = parseCursorPagination(req, {
    defaultLimit: DEFAULT_COMMENT_LIMIT,
    maxLimit: MAX_COMMENT_LIMIT,
    cursorMaxLength: MAX_CURSOR_LENGTH,
  });
  return {
    limit,
    cursor: cursor && POST_ID_PATTERN.test(cursor) ? cursor : '',
  };
}

function normalizeCommentContent(raw: unknown) {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getVisiblePost(postId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string; commentCount: number }>>(Prisma.sql`
    SELECT "id", COALESCE("commentCount", 0)::int AS "commentCount"
    FROM "Post"
    WHERE "id" = ${postId}
      AND "deletedAt" IS NULL
      AND "isPublished" = true
    LIMIT 1
  `);
  return rows[0] || null;
}

function invalidateCommentFeedCaches(userId?: string | null) {
  bumpPublicFeedCacheVersion('comment');
  clearPublicFeedResultCache();
  if (userId) PostService.clearRecommendationContextCache(userId);
}

function mapCommentRow(row: any) {
  return {
    id: row.id,
    postId: row.postId,
    userId: row.userId,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: {
      id: row.userId,
      displayName: row.userDisplayName,
      username: row.userLoginAccount,
      photoUrl: row.userPhotoUrl,
      userType: row.userType,
    },
  };
}

export function registerPostCommentRoutes(app: Express) {
  app.get('/api/posts/:id/comments', publicReadLimiter, authMiddleware, catchAsync(async (req: AuthRequest, res) => {
    if (!POST_ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法加载评论。请稍后重试。' });

    const post = await getVisiblePost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { limit, cursor } = parseCommentPagination(req);
    const cursorRows = cursor
      ? await prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>(Prisma.sql`
          SELECT "id", "createdAt" FROM "PostComment" WHERE "id" = ${cursor} AND "postId" = ${post.id} LIMIT 1
        `)
      : [];
    const cursorRow = cursorRows[0] || null;
    const cursorFilter = cursorRow
      ? Prisma.sql`AND (c."createdAt" < ${cursorRow.createdAt} OR (c."createdAt" = ${cursorRow.createdAt} AND c."id" < ${cursorRow.id}))`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        c."id",
        c."postId",
        c."userId",
        c."content",
        c."status",
        c."createdAt",
        c."updatedAt",
        u."displayName" AS "userDisplayName",
        u."loginAccount" AS "userLoginAccount",
        u."photoUrl" AS "userPhotoUrl",
        u."userType" AS "userType"
      FROM "PostComment" c
      INNER JOIN "User" u ON u."id" = c."userId"
      WHERE c."postId" = ${post.id}
        AND c."status" = 'VISIBLE'
        AND c."deletedAt" IS NULL
        ${cursorFilter}
      ORDER BY c."createdAt" DESC, c."id" DESC
      LIMIT ${limit + 1}
    `);

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(mapCommentRow);
    const total = Math.max(0, Number(post.commentCount || items.length || 0));
    setCursorPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
      total,
    });
    setListCacheHeaders(res, req.user?.id || null, 15);
    return res.json({ items, total });
  }));

  app.post('/api/posts/:id/comments', postLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!POST_ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Post not found' });
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法发表评论。请稍后重试。' });

    const content = normalizeCommentContent(req.body?.content);
    if (!content) return res.status(400).json({ error: '请输入评论内容' });
    if (content.length > MAX_COMMENT_LENGTH) return res.status(400).json({ error: `评论最多 ${MAX_COMMENT_LENGTH} 字` });

    const existingPost = await getVisiblePost(req.params.id);
    if (!existingPost) return res.status(404).json({ error: 'Post not found' });

    const now = new Date();
    const commentId = crypto.randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: req.user.id }, select: { userType: true } });
      const isTrustedNormalUser = actor?.userType === 'NORMAL';
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PostComment" ("id", "postId", "userId", "content", "status", "createdAt", "updatedAt")
        VALUES (${commentId}, ${existingPost.id}, ${req.user.id}, ${content}, 'VISIBLE', ${now}, ${now})
      `);
      const postRows = await tx.$queryRaw<Array<{ commentCount: number }>>(Prisma.sql`
        UPDATE "Post"
        SET "commentCount" = COALESCE("commentCount", 0) + 1,
            "bumpedAt" = ${isTrustedNormalUser ? now : Prisma.raw('"bumpedAt"')}
        WHERE "id" = ${existingPost.id}
        RETURNING "commentCount"
      `);
      if (isTrustedNormalUser) {
        await incrementNormalCommentAggregate(existingPost.id, tx);
      }
      const commentRows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT
          c."id",
          c."postId",
          c."userId",
          c."content",
          c."status",
          c."createdAt",
          c."updatedAt",
          u."displayName" AS "userDisplayName",
          u."loginAccount" AS "userLoginAccount",
          u."photoUrl" AS "userPhotoUrl",
          u."userType" AS "userType"
        FROM "PostComment" c
        INNER JOIN "User" u ON u."id" = c."userId"
        WHERE c."id" = ${commentId}
        LIMIT 1
      `);
      return {
        comment: mapCommentRow(commentRows[0]),
        commentCount: Number(postRows[0]?.commentCount || 1),
        trusted: isTrustedNormalUser,
      };
    });

    invalidateCommentFeedCaches(req.user.id);
    if (result.trusted) PostService.schedulePostRankingRefresh(existingPost.id);
    setNoStore(res);
    return res.status(201).json({ success: true, comment: result.comment, commentCount: result.commentCount });
  }));

  app.delete('/api/posts/:postId/comments/:commentId', postLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!POST_ID_PATTERN.test(req.params.postId) || !POST_ID_PATTERN.test(req.params.commentId)) {
      return res.status(404).json({ error: '评论不存在' });
    }
    if (!isDbConfigured()) return res.status(503).json({ error: '系统服务暂时不可用，暂时无法删除评论。请稍后重试。' });

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; userId: string; postId: string; userType: string }>>(Prisma.sql`
        SELECT c."id", c."userId", c."postId", u."userType"::text AS "userType"
        FROM "PostComment" c
        INNER JOIN "User" u ON u."id" = c."userId"
        WHERE c."id" = ${req.params.commentId}
          AND c."postId" = ${req.params.postId}
          AND c."deletedAt" IS NULL
        LIMIT 1
      `);
      const comment = rows[0];
      if (!comment) return null;
      const isOwner = comment.userId === req.user.id;
      const isAdmin = req.user.role === 'ADMIN';
      if (!isOwner && !isAdmin) throw new Error('FORBIDDEN_COMMENT_DELETE');
      const isTrustedNormalUser = comment.userType === 'NORMAL';
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PostComment"
        SET "status" = 'DELETED', "deletedAt" = ${now}, "updatedAt" = ${now}
        WHERE "id" = ${comment.id}
      `);
      const postRows = await tx.$queryRaw<Array<{ commentCount: number }>>(Prisma.sql`
        UPDATE "Post"
        SET "commentCount" = GREATEST(COALESCE("commentCount", 0) - 1, 0)
        WHERE "id" = ${comment.postId}
        RETURNING "commentCount"
      `);
      if (isTrustedNormalUser) {
        await decrementNormalCommentAggregate(comment.postId, tx);
      }
      return { commentCount: Number(postRows[0]?.commentCount || 0), postId: comment.postId, trusted: isTrustedNormalUser };
    });

    if (!result) return res.status(404).json({ error: '评论不存在' });
    invalidateCommentFeedCaches(req.user.id);
    if (result.trusted) PostService.schedulePostRankingRefresh(result.postId);
    setNoStore(res);
    return res.json({ success: true, commentCount: result.commentCount });
  }));
}
