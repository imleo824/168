import type { Express } from 'express';

import { ConfigService } from '../config.service';
import prisma, { isDbConfigured } from '../db';
import { HttpError, isHttpError } from '../http/errors';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { getPlatformDateRangeFilter } from '../platform-time';
import {
  RECHARGE_STATUS,
  calculateRechargePoints,
} from '../services/deposit-scanner.service';
import { PromotionType, TransactionAction } from '../../shared/domain';

const ORDER_STATUS_VALUES = new Set<string>([
  ...Object.values(RECHARGE_STATUS),
]);

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type RegisterAdminBillingRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
  normalizeAdminUserTypeFilter: (value: unknown) => string;
};

export function registerAdminBillingRoutes(app: Express, options: RegisterAdminBillingRoutesOptions) {
  const {
    throwOnInvalidPagination,
    setPaginationHeaders,
    normalizeAdminUserTypeFilter,
  } = options;

  app.get('/api/admin/transactions', authMiddleware, adminOnly, async (req, res) => {
    try {
      if (isDbConfigured()) {
        const { action, search, startDate, endDate, userType } = req.query;
        const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 50 });
        const safeSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
        const normalizedAction = typeof action === 'string' ? action.trim().toUpperCase() : '';
        const normalizedUserType = normalizeAdminUserTypeFilter(userType);
        if (
          normalizedAction &&
          !Object.values(TransactionAction).includes(normalizedAction as any) &&
          !Object.values(PromotionType).includes(normalizedAction as any)
        ) {
          return res.status(400).json({ error: 'action 参数不合法' });
        }
        if (typeof userType === 'string' && userType.trim() && !normalizedUserType) {
          return res.status(400).json({ error: 'userType 参数不合法' });
        }

        const createdAtFilter = getPlatformDateRangeFilter(startDate, endDate);

        const actionWhere = normalizedAction === TransactionAction.SIGNUP_REWARD
          ? {
              OR: [
                { action: TransactionAction.SIGNUP_REWARD as any },
                { action: TransactionAction.RECHARGE as any, description: { contains: '注册', mode: 'insensitive' as const } },
              ],
            }
          : normalizedAction === PromotionType.PIN_CHAT || normalizedAction === TransactionAction.PIN_CHAT
            ? {
                OR: [
                  { action: TransactionAction.PIN_CHAT as any },
                  { action: TransactionAction.AD as any, description: { contains: '聊天室', mode: 'insensitive' as const } },
                ],
              }
            : normalizedAction === TransactionAction.RECHARGE
              ? {
                  action: TransactionAction.RECHARGE as any,
                  NOT: { description: { contains: '注册', mode: 'insensitive' as const } },
                }
              : normalizedAction === PromotionType.AD_HOME || normalizedAction === TransactionAction.AD
                ? {
                    action: TransactionAction.AD as any,
                    NOT: { description: { contains: '聊天室', mode: 'insensitive' as const } },
                  }
                : normalizedAction === PromotionType.PIN_CATEGORY
                  ? {
                      action: TransactionAction.PIN_POST as any,
                      description: { contains: '分类', mode: 'insensitive' as const },
                    }
                  : normalizedAction === PromotionType.PIN_HOME || normalizedAction === TransactionAction.PIN_POST
                    ? {
                        action: TransactionAction.PIN_POST as any,
                        NOT: { description: { contains: '分类', mode: 'insensitive' as const } },
                      }
                    : normalizedAction
                      ? { action: normalizedAction as any }
                      : {};

        const whereParts: any[] = [];
        if (Object.keys(actionWhere).length) whereParts.push(actionWhere);
        if (Object.keys(createdAtFilter).length) whereParts.push({ createdAt: createdAtFilter });
        if (normalizedUserType) whereParts.push({ user: { is: { userType: normalizedUserType as any } } });
        if (safeSearch) {
          whereParts.push({
            OR: [
              { description: { contains: safeSearch, mode: 'insensitive' as const } },
              { id: { contains: safeSearch, mode: 'insensitive' as const } },
              { userId: { contains: safeSearch, mode: 'insensitive' as const } },
              { user: { is: { displayName: { contains: safeSearch, mode: 'insensitive' as const } } } },
            ],
          });
        }
        const where = whereParts.length ? { AND: whereParts } : {};

        const txs = await prisma.pointTransaction.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            userId: true,
            amount: true,
            action: true,
            description: true,
            createdAt: true,
            user: { select: { id: true, displayName: true, userType: true } },
          },
        });
        const hasMore = txs.length > limit;
        const items = hasMore ? txs.slice(0, limit) : txs;
        setPaginationHeaders(res, {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
        });
        return res.json(items);
      }
      return res.json([]);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  app.get('/api/admin/orders', authMiddleware, adminOnly, async (req, res) => {
    try {
      if (isDbConfigured()) {
        const { status, search, startDate, endDate, userType } = req.query;
        const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 50 });
        const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
        const normalizedUserType = normalizeAdminUserTypeFilter(userType);
        const safeSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
        if (normalizedStatus && !ORDER_STATUS_VALUES.has(normalizedStatus)) {
          return res.status(400).json({ error: 'status 参数不合法' });
        }
        if (typeof userType === 'string' && userType.trim() && !normalizedUserType) {
          return res.status(400).json({ error: 'userType 参数不合法' });
        }

        const createdAtFilter = getPlatformDateRangeFilter(startDate, endDate);

        const where = {
          ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
          ...(normalizedUserType ? { user: { is: { userType: normalizedUserType as any } } } : {}),
          ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
          ...(safeSearch
            ? {
                OR: [
                  { id: { contains: safeSearch, mode: 'insensitive' as const } },
                  { userId: { contains: safeSearch, mode: 'insensitive' as const } },
                  { txHash: { contains: safeSearch, mode: 'insensitive' as const } },
                  { user: { is: { displayName: { contains: safeSearch, mode: 'insensitive' as const } } } },
                  { user: { is: { loginAccount: { contains: safeSearch, mode: 'insensitive' as const } } } },
                ],
              }
            : {}),
        };

        const orders = await prisma.order.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            userId: true,
            txHash: true,
            logIndex: true,
            chain: true,
            token: true,
            toAddress: true,
            usdtAmount: true,
            pointsGained: true,
            status: true,
            statusReason: true,
            autoCredit: true,
            sweepStatus: true,
            sweepJobId: true,
            sweptAt: true,
            scanAttempts: true,
            scanExpiresAt: true,
            lastScannedAt: true,
            blockNumber: true,
            blockTimestamp: true,
            confirmedAt: true,
            creditedAt: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { id: true, displayName: true, loginAccount: true, userType: true } },
          },
        });
        const hasMore = orders.length > limit;
        const items = hasMore ? orders.slice(0, limit) : orders;
        setPaginationHeaders(res, {
          hasMore,
          nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
        });
        return res.json(items);
      }
      return res.json([]);
    } catch (err) {
      if (isHttpError(err)) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  app.post('/api/admin/orders/:id/credit', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });

    const configs = await ConfigService.getConfigs();
    const pointsPerUsdt = Math.max(1, Number(configs?.recharge_points_per_usdt || 10));
    const minUsdt = Math.max(0, Number(configs?.tron_deposit_min_usdt || 1));
    const now = new Date();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const force = body.force === true;
    const rawPoints = body.points;
    const statusReason = typeof body.statusReason === 'string' && body.statusReason.trim()
      ? body.statusReason.trim().slice(0, 120)
      : '';

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          userId: true,
          status: true,
          usdtAmount: true,
          pointsGained: true,
        },
      });
      if (!order) throw new HttpError('充值订单不存在', 404);

      const allowForceCredit = force && (order.status === RECHARGE_STATUS.WAITING_PAYMENT || order.status === RECHARGE_STATUS.MANUAL_REVIEW);
      const allowManualCredit = order.status === RECHARGE_STATUS.MANUAL_REVIEW;
      if (!allowForceCredit && !allowManualCredit) {
        throw new HttpError('仅支持处理待人工确认或自动等待中的充值订单', 400);
      }

      const amountText = String(order.usdtAmount);
      const amountNumber = Number(amountText);
      const parsedPoints = Number(rawPoints);
      const hasCustomPoints = rawPoints !== undefined && rawPoints !== null && String(rawPoints).trim() !== '';
      const pointsGained = hasCustomPoints
        ? parsedPoints
        : calculateRechargePoints(amountText, pointsPerUsdt);

      if (!Number.isFinite(amountNumber) || amountNumber < 0) {
        throw new HttpError('订单 USDT 金额异常', 400);
      }
      if (!Number.isFinite(pointsGained) || !Number.isInteger(pointsGained) || pointsGained <= 0) {
        throw new HttpError(`充值金额低于最低入账 ${minUsdt} USDT`, 400);
      }
      if (hasCustomPoints && (!Number.isFinite(parsedPoints) || !Number.isInteger(parsedPoints) || parsedPoints <= 0)) {
        throw new HttpError('入账积分必须是正整数', 400);
      }
      if (!force && amountNumber < minUsdt) {
        throw new HttpError(`充值金额低于最低入账 ${minUsdt} USDT`, 400);
      }
      if (!force && !hasCustomPoints && pointsGained <= 0) {
        throw new HttpError(`充值金额低于最低入账 ${minUsdt} USDT`, 400);
      }

      const targetStatuses = (allowForceCredit ? [RECHARGE_STATUS.WAITING_PAYMENT, RECHARGE_STATUS.MANUAL_REVIEW] : [RECHARGE_STATUS.MANUAL_REVIEW]) as string[];
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: { in: targetStatuses } as any },
        data: {
          pointsGained,
          status: RECHARGE_STATUS.CREDITED,
          statusReason: statusReason || (force ? 'manual_credit_force' : 'manual_credit'),
          confirmedAt: now,
          creditedAt: now,
          lastScannedAt: now,
          sweepStatus: 'NONE' as any,
        },
      });
      if (changed.count !== 1) {
        throw new HttpError('订单状态已变化，请刷新后重试', 409);
      }

      await tx.user.update({
        where: { id: order.userId },
        data: { points: { increment: pointsGained } },
        select: { id: true },
      });
      await tx.pointTransaction.create({
        data: {
          userId: order.userId,
          action: TransactionAction.RECHARGE as any,
          amount: pointsGained,
          description: `TRC20-USDT 人工确认充值 ${amountText} USDT`,
        },
      });

      return tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          userId: true,
          usdtAmount: true,
          pointsGained: true,
          status: true,
          confirmedAt: true,
          creditedAt: true,
        },
      });
    });

    res.json({ success: true, order: result });
  }));
}
