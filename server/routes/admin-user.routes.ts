import type { Express } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { HttpError, isHttpError } from '../http/errors';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware, clearAuthUserCache, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { getPlatformDateRangeFilter } from '../platform-time';
import { TransactionAction } from '../../shared/domain';

const ACTIVE_TUI_PLUS_STATUSES = ['TRIALING', 'ACTIVE'];
const MEMBER_FILTER_ACTIVE_VALUES = new Set(['1', 'true', 'active', 'yes', 'member', 'tui_plus', 'tui_plus_active']);
const MEMBER_FILTER_INACTIVE_VALUES = new Set(['0', 'false', 'inactive', 'no', 'non_member', 'not_member', 'tui_plus_inactive']);

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type RegisterAdminUserRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
  normalizeAdminUserTypeFilter: (value: unknown) => string;
  markUserDataChanged: (userId?: string | null) => void;
};

function normalizeAdminMemberFilter(...values: unknown[]) {
  for (const value of values) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) continue;
    if (MEMBER_FILTER_ACTIVE_VALUES.has(normalized)) return 'ACTIVE';
    if (MEMBER_FILTER_INACTIVE_VALUES.has(normalized)) return 'INACTIVE';
  }
  return '';
}

function isActiveTuiPlusUser(user: any, now = new Date()) {
  const status = String(user?.plusStatus || '').trim().toUpperCase();
  const expiresAt = user?.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  return ACTIVE_TUI_PLUS_STATUSES.includes(status) && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function buildAdminMemberSql(memberFilter: string, now: Date) {
  const activeSql = Prisma.sql`COALESCE("plusStatus", '') IN (${Prisma.join(ACTIVE_TUI_PLUS_STATUSES)}) AND "plusExpiresAt" > ${now}`;
  if (memberFilter === 'ACTIVE') return Prisma.sql`(${activeSql})`;
  if (memberFilter === 'INACTIVE') return Prisma.sql`NOT (${activeSql})`;
  return Prisma.empty;
}

function buildCreatedAtSql(filter: Record<string, Date>) {
  const parts: Prisma.Sql[] = [];
  if (filter.gte) parts.push(Prisma.sql`"createdAt" >= ${filter.gte}`);
  if (filter.lt) parts.push(Prisma.sql`"createdAt" < ${filter.lt}`);
  return parts;
}

export function registerAdminUserRoutes(app: Express, options: RegisterAdminUserRoutesOptions) {
  const {
    throwOnInvalidPagination,
    setPaginationHeaders,
    normalizeAdminUserTypeFilter,
    markUserDataChanged,
  } = options;

  app.get('/api/admin/users', authMiddleware, adminOnly, async (req, res) => {
    try {
      if (isDbConfigured()) {
        const { search, userType, startDate, endDate, member, tuiPlus, isTuiPlus } = req.query;
        const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 50 });
        const safeSearch = typeof search === 'string' ? search.trim().slice(0, 60) : '';
        const userTypeText = typeof userType === 'string' ? userType.trim() : '';
        const memberFilter = normalizeAdminMemberFilter(member, tuiPlus, isTuiPlus, userTypeText);
        const hasUserTypeFilter = userTypeText !== '' && !memberFilter;
        const createdAtFilter = getPlatformDateRangeFilter(startDate, endDate);
        const now = new Date();

        const normalizedUserType = memberFilter ? '' : normalizeAdminUserTypeFilter(userType);
        if (hasUserTypeFilter && !normalizedUserType) {
          return res.status(400).json({ error: 'userType 参数不合法' });
        }

        const conditions: Prisma.Sql[] = [];
        if (safeSearch) {
          const pattern = `%${safeSearch}%`;
          conditions.push(Prisma.sql`("id" ILIKE ${pattern} OR "displayName" ILIKE ${pattern} OR "loginAccount" ILIKE ${pattern})`);
        }
        if (normalizedUserType) conditions.push(Prisma.sql`"userType"::text = ${normalizedUserType}`);
        if (memberFilter) conditions.push(buildAdminMemberSql(memberFilter, now));
        conditions.push(...buildCreatedAtSql(createdAtFilter));
        if (cursor) {
          conditions.push(Prisma.sql`("createdAt", "id") < (SELECT "createdAt", "id" FROM "User" WHERE "id" = ${cursor} LIMIT 1)`);
        }

        const whereSql = conditions.length
          ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
          : Prisma.empty;

        const users = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT
            "id",
            "displayName",
            "loginAccount",
            "photoUrl",
            "role"::text AS "role",
            "userType"::text AS "userType",
            "isDisabled",
            "points",
            "plusStatus",
            "plusPlan",
            "plusExpiresAt",
            "plusTrialUsed",
            "createdAt",
            "updatedAt",
            "viewCount"
          FROM "User"
          ${whereSql}
          ORDER BY "createdAt" DESC, "id" DESC
          LIMIT ${limit + 1}
        `);
        const hasMore = users.length > limit;
        const items = hasMore ? users.slice(0, limit) : users;
        setPaginationHeaders(res, {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
        });
        return res.json(items.map((u) => ({
          ...u,
          photoUrl: u.photoUrl,
          isTuiPlus: isActiveTuiPlusUser(u, now),
        })));
      }
      return res.json([]);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.warn('[admin-users] Failed to fetch users', err);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.patch('/api/admin/users/:id/disabled', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const targetUserId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!targetUserId) return res.status(400).json({ error: '用户ID不能为空' });
    if (typeof req.body?.isDisabled !== 'boolean') {
      return res.status(400).json({ error: 'isDisabled 必须是布尔值' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        isDisabled: true,
        displayName: true,
      },
    });

    if (!targetUser) return res.status(404).json({ error: '用户不存在' });
    if (req.body.isDisabled && targetUser.role === 'ADMIN') {
      return res.status(400).json({ error: '管理员账号不能禁用' });
    }
    if (req.body.isDisabled && targetUser.id === req.user?.id) {
      return res.status(400).json({ error: '不能禁用当前登录账号' });
    }

    const user = await prisma.user.update({
      where: { id: targetUser.id },
      data: { isDisabled: req.body.isDisabled },
      select: {
        id: true,
        displayName: true,
        role: true,
        userType: true,
        isDisabled: true,
        updatedAt: true,
      },
    });

    clearAuthUserCache(user.id);
    markUserDataChanged(user.id);
    res.json({ success: true, user });
  }));

  app.post('/api/admin/users/:id/points', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const targetUserId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    const changeType = typeof req.body?.changeType === 'string'
      ? req.body.changeType.trim().toUpperCase()
      : '';
    const rawAmount = Number(req.body?.amount);
    const remark = typeof req.body?.remark === 'string' ? req.body.remark.trim() : '';
    const normalizedRemark = remark ? remark.slice(0, 120) : '';

    if (changeType !== 'INCREASE' && changeType !== 'DECREASE') {
      return res.status(400).json({ error: 'changeType 必须是 INCREASE 或 DECREASE' });
    }
    if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount <= 0) {
      return res.status(400).json({ error: 'amount 必须是正整数' });
    }
    if (!targetUserId) return res.status(400).json({ error: '用户ID不能为空' });

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        role: true,
        displayName: true,
        points: true,
      },
    });
    if (!targetUser) return res.status(404).json({ error: '用户不存在' });

    const points = Number(rawAmount);
    const delta = changeType === 'INCREASE' ? points : -points;
    const actionVerb = changeType === 'INCREASE' ? '上分' : '下分';

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.user.updateMany({
        where: {
          id: targetUser.id,
          ...(changeType === 'DECREASE' ? { points: { gte: points } } : {}),
        },
        data: {
          points: { [changeType === 'INCREASE' ? 'increment' : 'decrement']: points },
        },
      });

      if (updateResult.count !== 1) {
        if (changeType === 'DECREASE') {
          throw new HttpError('用户积分不足，无法下分', 400);
        }
        throw new HttpError('用户积分更新失败，请刷新后重试', 409);
      }

      const updatedUser = await tx.user.findUnique({
        where: { id: targetUser.id },
        select: {
          id: true,
          displayName: true,
          role: true,
          userType: true,
          isDisabled: true,
          points: true,
          updatedAt: true,
        },
      });

      await tx.pointTransaction.create({
        data: {
          userId: targetUser.id,
          action: TransactionAction.RECHARGE as any,
          amount: delta,
          description: `后台手动${actionVerb} ${points} 积分${normalizedRemark ? `：${normalizedRemark}` : ''}`,
        },
      });

      return updatedUser;
    });

    if (!result) throw new HttpError('用户积分更新失败', 500);

    clearAuthUserCache(result.id);
    markUserDataChanged(result.id);
    res.json({ success: true, user: result });
  }));
}
