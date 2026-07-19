import type { Express } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { isHttpError } from '../http/errors';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { getPlatformDateRangeFilter } from '../platform-time';
import { PromotionService } from '../promotion.service';
import { PromotionType } from '../../shared/domain';

type AdminPromotionEffectStats = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  quotes: number;
};

const EMPTY_ADMIN_PROMOTION_EFFECT_STATS: AdminPromotionEffectStats = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  quotes: 0,
};

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type RegisterAdminPromotionRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
  normalizeAdminUserTypeFilter: (value: unknown) => string;
  markPromotionDataChanged: () => void;
  normalizePromotionErrorMessage: (error: unknown) => string;
};

function setAdminPromotionMetric(
  statsByPostId: Map<string, AdminPromotionEffectStats>,
  rows: Array<Record<string, unknown>>,
  metric: keyof AdminPromotionEffectStats,
) {
  rows.forEach((row) => {
    const postId = String(row.postId || '');
    if (!postId) return;
    const stats = statsByPostId.get(postId);
    if (!stats) return;
    const count = Number(row.count || 0);
    stats[metric] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  });
}

async function loadAdminPromotionEffectStats(postIds: string[]) {
  const uniquePostIds = Array.from(new Set(postIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const statsByPostId = new Map<string, AdminPromotionEffectStats>();
  uniquePostIds.forEach((postId) => {
    statsByPostId.set(postId, { ...EMPTY_ADMIN_PROMOTION_EFFECT_STATS });
  });
  if (uniquePostIds.length === 0) return statsByPostId;

  const [viewRows, likeRows, shareRows, quoteRows] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT pv."postId" AS "postId", COUNT(*)::int AS count
      FROM "PostView" pv
      INNER JOIN "Post" p ON p."id" = pv."postId"
      INNER JOIN "User" author ON author."id" = p."userId"
      WHERE pv."postId" IN (${Prisma.join(uniquePostIds)})
        AND author."userType"::text <> 'ROBOT'
      GROUP BY pv."postId"
    `),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT l."postId" AS "postId", COUNT(*)::int AS count
      FROM "Like" l
      INNER JOIN "User" actor ON actor."id" = l."userId"
      INNER JOIN "Post" p ON p."id" = l."postId"
      INNER JOIN "User" author ON author."id" = p."userId"
      WHERE l."postId" IN (${Prisma.join(uniquePostIds)})
        AND actor."userType"::text <> 'ROBOT'
        AND author."userType"::text <> 'ROBOT'
      GROUP BY l."postId"
    `),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT ps."postId" AS "postId", COUNT(*)::int AS count
      FROM "PostShare" ps
      INNER JOIN "Post" p ON p."id" = ps."postId"
      INNER JOIN "User" author ON author."id" = p."userId"
      LEFT JOIN "User" actor ON actor."id" = ps."userId"
      WHERE ps."postId" IN (${Prisma.join(uniquePostIds)})
        AND author."userType"::text <> 'ROBOT'
        AND (ps."userId" IS NULL OR actor."userType"::text <> 'ROBOT')
      GROUP BY ps."postId"
    `),
    prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT q."quotedPostId" AS "postId", COUNT(*)::int AS count
      FROM "Post" q
      INNER JOIN "User" actor ON actor."id" = q."userId"
      INNER JOIN "Post" source ON source."id" = q."quotedPostId"
      INNER JOIN "User" author ON author."id" = source."userId"
      WHERE q."quotedPostId" IN (${Prisma.join(uniquePostIds)})
        AND q."isPublished" = true
        AND q."deletedAt" IS NULL
        AND actor."userType"::text <> 'ROBOT'
        AND author."userType"::text <> 'ROBOT'
      GROUP BY q."quotedPostId"
    `),
  ]);

  setAdminPromotionMetric(statsByPostId, viewRows, 'views');
  setAdminPromotionMetric(statsByPostId, likeRows, 'likes');
  setAdminPromotionMetric(statsByPostId, shareRows, 'shares');
  setAdminPromotionMetric(statsByPostId, quoteRows, 'quotes');
  return statsByPostId;
}

export function registerAdminPromotionRoutes(app: Express, options: RegisterAdminPromotionRoutesOptions) {
  const {
    throwOnInvalidPagination,
    setPaginationHeaders,
    normalizeAdminUserTypeFilter,
    markPromotionDataChanged,
    normalizePromotionErrorMessage,
  } = options;

  app.get('/api/admin/promotions', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    try {
      if (isDbConfigured()) {
        const { type, status, search, categoryId, startDate, endDate, userType } = req.query;
        const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 40 });
        const normalizedType = typeof type === 'string' ? type.trim().toUpperCase() : '';
        const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
        const normalizedUserType = normalizeAdminUserTypeFilter(userType);
        const safeSearch = typeof search === 'string' ? search.trim().slice(0, 100) : '';
        const safeCategoryId = typeof categoryId === 'string' ? categoryId.trim() : '';
        const now = new Date();
        let typeFilter: PromotionType | '' = '';

        if (normalizedType) {
          if (!Object.values(PromotionType).includes(normalizedType as PromotionType)) {
            return res.status(400).json({ error: 'type 参数不合法' });
          }
          typeFilter = normalizedType as PromotionType;
        }
        if (typeof userType === 'string' && userType.trim() && !normalizedUserType) {
          return res.status(400).json({ error: 'userType 参数不合法' });
        }

        let statusFilter: { startsAt: { lte: Date }; endsAt: { gt: Date } } | { OR: Array<{ endsAt: { lte: Date } } | { startsAt: { gt: Date } }> } | null = null;
        if (normalizedStatus) {
          if (normalizedStatus === 'active' || normalizedStatus === '1' || normalizedStatus === 'true') {
            statusFilter = { startsAt: { lte: now }, endsAt: { gt: now } };
          } else if (normalizedStatus === 'inactive' || normalizedStatus === '0' || normalizedStatus === 'false') {
            statusFilter = { OR: [{ endsAt: { lte: now } }, { startsAt: { gt: now } }] };
          } else {
            return res.status(400).json({ error: 'status 参数不合法' });
          }
        }

        const targetDateFilter = getPlatformDateRangeFilter(startDate, endDate);

        const where = {
          ...(typeFilter ? { type: typeFilter } : {}),
          ...(safeCategoryId ? { categoryId: safeCategoryId } : {}),
          ...(normalizedUserType ? { user: { is: { userType: normalizedUserType as any } } } : {}),
          ...(statusFilter ? statusFilter : {}),
          ...(Object.keys(targetDateFilter).length ? { targetDate: targetDateFilter } : {}),
          ...(safeSearch
            ? {
                OR: [
                  { adTargetUrl: { contains: safeSearch, mode: 'insensitive' as const } },
                  { id: { contains: safeSearch, mode: 'insensitive' as const } },
                  { userId: { contains: safeSearch, mode: 'insensitive' as const } },
                  { user: { is: { displayName: { contains: safeSearch, mode: 'insensitive' as const } } } },
                  { post: { is: { title: { contains: safeSearch, mode: 'insensitive' as const } } } },
                ],
              }
            : {}),
        };

        const promotions = await prisma.promotionBooking.findMany({
          where,
          orderBy: [{ targetDate: 'desc' }, { slotIndex: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            campaignId: true,
            type: true,
            targetDate: true,
            startsAt: true,
            endsAt: true,
            slotIndex: true,
            postId: true,
            adImageUrl: true,
            adMobileImageUrl: true,
            adTargetUrl: true,
            categoryId: true,
            pricePaid: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                displayName: true,
                loginAccount: true,
                userType: true,
              },
            },
            post: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        const hasMore = promotions.length > limit;
        const items = hasMore ? promotions.slice(0, limit) : promotions;
        const effectStatsByPostId = await loadAdminPromotionEffectStats(
          items.map((item) => item.postId || item.post?.id || ''),
        );
        setPaginationHeaders(res, {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
        });
        return res.json(items.map((item) => ({
          ...item,
          effectStats: item.postId
            ? effectStatsByPostId.get(item.postId) || EMPTY_ADMIN_PROMOTION_EFFECT_STATS
            : EMPTY_ADMIN_PROMOTION_EFFECT_STATS,
        })));
      }
      return res.json([]);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to fetch promotions' });
    }
  }));

  app.patch('/api/admin/promotions/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const bookingId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!bookingId) return res.status(400).json({ error: '投放ID不能为空' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const hasAdImage = Object.prototype.hasOwnProperty.call(body, 'adImageUrl');
    const hasAdMobileImage = Object.prototype.hasOwnProperty.call(body, 'adMobileImageUrl');
    const hasTargetUrl = Object.prototype.hasOwnProperty.call(body, 'adTargetUrl');
    const hasActive = Object.prototype.hasOwnProperty.call(body, 'isActive');
    if (hasActive) {
      return res.status(400).json({ error: '广告展示状态请使用专用接口更新' });
    }
    if (!hasAdImage && !hasAdMobileImage && !hasTargetUrl) {
      return res.status(400).json({ error: '请提交需要更新的信息' });
    }

    try {
      const result = await PromotionService.updateHomeAdCreativeByAdmin({
        bookingId,
        adImageUrl: hasAdImage ? body.adImageUrl : undefined,
        adMobileImageUrl: hasAdMobileImage ? body.adMobileImageUrl : undefined,
        adTargetUrl: hasTargetUrl ? body.adTargetUrl : undefined,
      });

      markPromotionDataChanged();
      return res.json(result);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(400).json({ error: normalizePromotionErrorMessage(err) });
    }
  }));

  app.patch('/api/admin/promotions/:id/display-state', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const bookingId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!bookingId) return res.status(400).json({ error: '投放ID不能为空' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive 必须是布尔值' });
    }

    try {
      const result = await PromotionService.setBookingDisplayStateByAdmin({
        bookingId,
        isActive: body.isActive,
      });

      markPromotionDataChanged();
      return res.json(result);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      return res.status(400).json({ error: normalizePromotionErrorMessage(err) });
    }
  }));

  app.delete('/api/admin/promotions/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const bookingId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!bookingId) return res.status(400).json({ error: '投放ID不能为空' });

    try {
      const result = await PromotionService.deleteBookingByAdmin(bookingId);
      markPromotionDataChanged();
      res.json({ success: true, ...result });
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if ((err as any)?.message === '投放记录不存在') {
        return res.status(404).json({ error: '投放不存在' });
      }
      return res.status(400).json({ error: normalizePromotionErrorMessage(err) });
    }
  }));
}
