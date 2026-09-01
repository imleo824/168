import type { Express, Request, Response } from 'express';
import { orderLimiter, orderScanLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import { UserService } from '../user.service';
import { ConfigService } from '../config.service';
import { TransactionAction } from '../../shared/domain';
import {
  RECHARGE_STATUS,
  TRON_DEFAULT_USDT_CONTRACT,
  claimRechargeOrderForScan,
  ensureUserDepositAddress,
  getRechargeOrderScanMaxAttempts,
  getRechargeOrderScanWindowMs,
  normalizeTronAddress,
  scanRechargeOrder,
} from '../services/deposit-scanner.service';

const ORDER_STATUS_VALUES = new Set<string>(Object.values(RECHARGE_STATUS));
const RECHARGE_STATUS_GROUPS = {
  PENDING: 'PENDING',
  CREDITED: 'CREDITED',
  NOT_CREDITED: 'NOT_CREDITED',
} as const;
const RECHARGE_STATUS_GROUP_VALUES = new Set<string>(Object.values(RECHARGE_STATUS_GROUPS));
const ACTIVE_RECHARGE_ORDER_STATUSES = [RECHARGE_STATUS.WAITING_PAYMENT, RECHARGE_STATUS.MANUAL_REVIEW];
const RECHARGE_MANUAL_SCAN_COOLDOWN_MS = 8 * 1000;

type PaginationParams = {
  limit: number;
  cursor?: string;
};

type BillingRoutesDeps = {
  throwOnInvalidPagination: (req: Request, options?: { maxLimit?: number; defaultLimit?: number }) => PaginationParams;
  setPaginationHeaders: (res: Response, result: { nextCursor: string | null; hasMore: boolean }) => void;
  notifyRechargeOrderSubmitted: (params: { configs: any; order: any; user: any }) => Promise<void>;
};

export function registerBillingRoutes(app: Express, deps: BillingRoutesDeps) {
  app.get('/api/me/transactions', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    const { limit, cursor } = deps.throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 50 });
    const normalizedAction = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase() : '';
    if (normalizedAction && !Object.values(TransactionAction).includes(normalizedAction as any)) {
      return res.status(400).json({ error: 'action 参数不合法' });
    }

    if (!isDbConfigured()) {
      deps.setPaginationHeaders(res, { hasMore: false, nextCursor: null });
      return res.json([]);
    }

    const txs = await UserService.getTransactions(req.user.id, {
      limit,
      cursor,
      action: normalizedAction || undefined,
    });
    const hasMore = txs.length > limit;
    const items = hasMore ? txs.slice(0, limit) : txs;

    deps.setPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
    });
    return res.json(items.map((tx) => ({
      ...tx,
      description: tx.description || '',
    })));
  }));

  app.post('/api/me/orders', orderLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const requestedAmount = Number(req.body?.usdtAmount);
    if (!Number.isInteger(requestedAmount) || requestedAmount <= 0 || requestedAmount > 1000000) {
      return res.status(400).json({ error: '请输入整数充值金额' });
    }

    const configs = await ConfigService.getConfigs();
    const minUsdt = Math.max(0, Number(configs?.tron_deposit_min_usdt || 1));
    if (requestedAmount < minUsdt) {
      return res.status(400).json({ error: `最低充值 ${minUsdt} USDT` });
    }

    const deposit = await ensureUserDepositAddress(req.user.id, {
      fallbackAddress: configs?.tron_deposit_fallback_address,
      allowPoolAssignment: true,
    });
    const now = new Date();
    const scanExpiresAt = new Date(now.getTime() + getRechargeOrderScanWindowMs(configs));
    const contractAddress = normalizeTronAddress(configs?.tron_usdt_contract || TRON_DEFAULT_USDT_CONTRACT) || TRON_DEFAULT_USDT_CONTRACT;

    const orderResult = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: req.user.id },
        data: { updatedAt: now },
        select: { id: true, displayName: true, loginAccount: true },
      });

      const existing = await tx.order.findFirst({
        where: {
          userId: req.user.id,
          status: { in: ACTIVE_RECHARGE_ORDER_STATUSES as any },
          autoCredit: deposit.autoCredit,
          toAddress: deposit.address,
          scanExpiresAt: { gt: now },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          txHash: true,
          logIndex: true,
          chain: true,
          token: true,
          toAddress: true,
          usdtAmount: true,
          pointsGained: true,
          status: true,
          statusReason: true,
          scanStartedAt: true,
          scanExpiresAt: true,
          scanAttempts: true,
          autoCredit: true,
          createdAt: true,
        },
      });
      if (existing) return { order: existing, created: false, user: updatedUser };

      await tx.order.updateMany({
        where: {
          userId: req.user.id,
          status: { in: ACTIVE_RECHARGE_ORDER_STATUSES as any },
        },
        data: {
          status: RECHARGE_STATUS.CANCELLED,
          statusReason: 'replaced_by_new_order',
          lastScannedAt: now,
        },
      });

      const order = await tx.order.create({
        data: {
          chain: 'TRON',
          token: 'USDT',
          contractAddress,
          toAddress: deposit.address,
          usdtAmount: requestedAmount,
          pointsGained: 0,
          status: deposit.autoCredit ? RECHARGE_STATUS.WAITING_PAYMENT : RECHARGE_STATUS.MANUAL_REVIEW,
          statusReason: deposit.autoCredit ? 'auto_scan_started' : `${deposit.source}_manual_review`,
          userId: req.user.id,
          scanStartedAt: now,
          scanExpiresAt,
          lastScannedAt: null,
          scanAttempts: 0,
          autoCredit: deposit.autoCredit,
        },
        select: {
          id: true,
          txHash: true,
          logIndex: true,
          chain: true,
          token: true,
          toAddress: true,
          usdtAmount: true,
          pointsGained: true,
          status: true,
          statusReason: true,
          scanStartedAt: true,
          scanExpiresAt: true,
          scanAttempts: true,
          autoCredit: true,
          createdAt: true,
        },
      });

      return { order, created: true, user: updatedUser };
    });
    const order = orderResult.order;

    if (orderResult.created) {
      void deps.notifyRechargeOrderSubmitted({
        configs,
        order,
        user: orderResult.user,
      }).catch((error) => {
        console.warn('[recharge-notify] failed:', error?.message || error);
      });
    }

    return res.status(201).json({
      order,
      address: deposit.address,
      autoCredit: deposit.autoCredit,
      depositSource: deposit.source,
      chain: 'TRON',
      token: 'USDT',
      network: 'TRC20',
      contractAddress,
      pointsPerUsdt: Number(configs?.recharge_points_per_usdt || 10),
      minUsdt,
    });
  }));

  app.post('/api/me/orders/:id/scan', orderScanLimiter, authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: {
        id: true,
        userId: true,
        toAddress: true,
        usdtAmount: true,
        status: true,
        autoCredit: true,
        createdAt: true,
        scanStartedAt: true,
        scanExpiresAt: true,
        scanAttempts: true,
        lastScannedAt: true,
      },
    });
    if (!order) return res.status(404).json({ error: '充值订单不存在' });
    if (order.status !== RECHARGE_STATUS.WAITING_PAYMENT) {
      return res.json({ success: true, status: order.status });
    }
    if (!order.autoCredit) return res.json({ success: true, status: order.status, autoCredit: false });

    const configs = await ConfigService.getConfigs();
    const maxAttempts = getRechargeOrderScanMaxAttempts(configs);
    const now = new Date();
    if (order.lastScannedAt && now.getTime() - order.lastScannedAt.getTime() < RECHARGE_MANUAL_SCAN_COOLDOWN_MS) {
      return res.json({ success: true, status: order.status, reason: 'scan_cooldown' });
    }
    if ((order.scanExpiresAt && order.scanExpiresAt < now) || order.scanAttempts >= maxAttempts) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: RECHARGE_STATUS.EXPIRED,
          statusReason: 'scan_window_expired',
          lastScannedAt: now,
        },
      });
      return res.json({ success: true, status: RECHARGE_STATUS.EXPIRED });
    }

    const claimed = await claimRechargeOrderForScan(order.id, maxAttempts, { claimWindowMs: 0 });
    if (!claimed) {
      return res.json({ success: true, status: order.status, reason: 'scan_in_progress', autoCredit: true });
    }

    const result = await scanRechargeOrder({
      order,
      contractAddress: normalizeTronAddress(configs?.tron_usdt_contract || TRON_DEFAULT_USDT_CONTRACT) || TRON_DEFAULT_USDT_CONTRACT,
      pointsPerUsdt: Math.max(1, Number(configs?.recharge_points_per_usdt || 10)),
      minUsdt: Math.max(0, Number(configs?.tron_deposit_min_usdt || 1)),
      claimedByScanner: true,
    });
    return res.json({ success: true, ...result });
  }));

  app.get('/api/me/orders', authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    if (!isDbConfigured()) return res.json([]);
    const { limit, cursor } = deps.throwOnInvalidPagination(req, { maxLimit: 50, defaultLimit: 10 });
    const normalizedStatus = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const normalizedStatusGroup = typeof req.query.statusGroup === 'string' ? req.query.statusGroup.trim().toUpperCase() : '';
    if (normalizedStatus && !ORDER_STATUS_VALUES.has(normalizedStatus)) return res.status(400).json({ error: 'status 参数不合法' });
    if (normalizedStatusGroup && !RECHARGE_STATUS_GROUP_VALUES.has(normalizedStatusGroup)) return res.status(400).json({ error: 'statusGroup 参数不合法' });

    const statusWhere = (() => {
      if (normalizedStatusGroup === RECHARGE_STATUS_GROUPS.PENDING) return { status: { in: [RECHARGE_STATUS.WAITING_PAYMENT, RECHARGE_STATUS.MANUAL_REVIEW] as any } };
      if (normalizedStatusGroup === RECHARGE_STATUS_GROUPS.CREDITED) return { status: RECHARGE_STATUS.CREDITED as any };
      if (normalizedStatusGroup === RECHARGE_STATUS_GROUPS.NOT_CREDITED) {
        return { status: { in: [RECHARGE_STATUS.EXPIRED, RECHARGE_STATUS.BELOW_MINIMUM, RECHARGE_STATUS.CANCELLED, RECHARGE_STATUS.FAILED] as any } };
      }
      return normalizedStatus ? { status: normalizedStatus as any } : {};
    })();

    let cursorFilter = {};
    if (cursor) {
      const cursorOrder = await prisma.order.findFirst({
        where: { id: cursor, userId: req.user.id, ...statusWhere },
        select: { createdAt: true, id: true },
      });
      if (!cursorOrder?.createdAt) return res.status(400).json({ error: 'cursor 无效或已过期' });
      cursorFilter = { OR: [{ createdAt: { lt: cursorOrder.createdAt } }, { createdAt: cursorOrder.createdAt, id: { lt: cursorOrder.id } }] };
    }

    const orders = await prisma.order.findMany({
      where: { userId: req.user.id, ...statusWhere, ...(cursorFilter as Record<string, unknown>) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        txHash: true,
        logIndex: true,
        chain: true,
        token: true,
        toAddress: true,
        usdtAmount: true,
        pointsGained: true,
        status: true,
        statusReason: true,
        scanExpiresAt: true,
        scanAttempts: true,
        autoCredit: true,
        blockNumber: true,
        blockTimestamp: true,
        confirmedAt: true,
        creditedAt: true,
        createdAt: true,
      },
    });
    const hasMore = orders.length > limit;
    const items = hasMore ? orders.slice(0, limit) : orders;
    deps.setPaginationHeaders(res, { hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null });
    return res.json(items);
  }));
}
