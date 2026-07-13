import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';

import { ConfigService } from '../config.service';
import prisma, { isDbConfigured } from '../db';
import { HttpError } from '../http/errors';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { getPlatformDayRange } from '../platform-time';
import {
  RECHARGE_STATUS,
  normalizeTronAddress,
} from '../services/deposit-scanner.service';

const DEPOSIT_ADDRESS_STATUS_VALUES = new Set(['AVAILABLE', 'ASSIGNED', 'DISABLED']);

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type RegisterAdminDepositRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
};

function timingSafeSecretCompare(providedSecret: string, expectedSecret: string) {
  const providedHash = crypto.createHash('sha256').update(providedSecret).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedSecret).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function timingSafeBearerTokenCompare(providedToken: string, expectedToken: string) {
  if (!providedToken || !expectedToken) return false;
  return timingSafeSecretCompare(providedToken, expectedToken);
}

function requireSweepWorker(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.TRON_SWEEP_WORKER_SECRET || '').trim();
  if (!expected) return res.status(503).json({ error: 'Sweep worker is not configured' });
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!timingSafeBearerTokenCompare(token, expected)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function refreshSweepJobStatus(tx: any, jobId: string) {
  const [pending, running, failed] = await Promise.all([
    tx.sweepTransaction.count({ where: { jobId, status: 'PENDING' } }),
    tx.sweepTransaction.count({ where: { jobId, status: 'RUNNING' } }),
    tx.sweepTransaction.count({ where: { jobId, status: 'FAILED' } }),
  ]);
  if (pending > 0 || running > 0) return;
  await tx.sweepJob.update({
    where: { id: jobId },
    data: {
      status: failed > 0 ? 'PARTIAL_FAILED' : 'COMPLETED',
      finishedAt: new Date(),
      statusReason: failed > 0 ? 'some_items_failed' : 'completed',
    },
  });
}

export function registerAdminDepositRoutes(app: Express, options: RegisterAdminDepositRoutesOptions) {
  const { throwOnInvalidPagination, setPaginationHeaders } = options;

  app.get('/api/admin/deposit-addresses', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.json([]);
    const { status, search } = req.query;
    const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 50 });
    const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
    const safeSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
    if (normalizedStatus && !DEPOSIT_ADDRESS_STATUS_VALUES.has(normalizedStatus)) {
      return res.status(400).json({ error: 'status 参数不合法' });
    }

    const addresses = await prisma.depositAddress.findMany({
      where: {
        ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
        ...(safeSearch
          ? {
              OR: [
                { address: { contains: safeSearch, mode: 'insensitive' as const } },
                { userId: { contains: safeSearch, mode: 'insensitive' as const } },
                { user: { is: { displayName: { contains: safeSearch, mode: 'insensitive' as const } } } },
                { user: { is: { loginAccount: { contains: safeSearch, mode: 'insensitive' as const } } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        address: true,
        status: true,
        source: true,
        derivationIndex: true,
        derivationPath: true,
        userId: true,
        assignedAt: true,
        lastSweptAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, displayName: true, loginAccount: true } },
      },
    });
    const hasMore = addresses.length > limit;
    const items = hasMore ? addresses.slice(0, limit) : addresses;
    setPaginationHeaders(res, {
      hasMore,
      nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
    });
    return res.json(items);
  }));

  app.get('/api/admin/deposit-addresses/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    if (!isDbConfigured()) {
      return res.json({
        available: 0,
        assigned: 0,
        hdAssigned: 0,
        disabled: 0,
        fallbackOrders: 0,
        pendingAutoCreditOrders: 0,
        pendingSweepOrders: 0,
        pendingSweepUsdt: 0,
        todayRechargeCount: 0,
        todayRechargeUsdt: 0,
        sweepTargetConfigured: false,
        lastSweepJob: null,
      });
    }
    const todayRange = getPlatformDayRange();
    const configs = await ConfigService.getConfigs();
    const sweepTarget = normalizeTronAddress(configs?.tron_sweep_target_address);
    const [
      available,
      assigned,
      hdAssigned,
      disabled,
      fallbackOrders,
      pendingAutoCreditOrders,
      pendingSweepOrders,
      pendingSweepAgg,
      todayRechargeCount,
      todayRechargeAgg,
      lastSweepJob,
    ] = await Promise.all([
      prisma.depositAddress.count({ where: { status: 'AVAILABLE', userId: null } }),
      prisma.depositAddress.count({ where: { status: 'ASSIGNED' } }),
      prisma.depositAddress.count({ where: { status: 'ASSIGNED', source: 'HD' as any } }),
      prisma.depositAddress.count({ where: { status: 'DISABLED' } }),
      prisma.order.count({ where: { status: RECHARGE_STATUS.MANUAL_REVIEW as any } }),
      prisma.order.count({ where: { status: RECHARGE_STATUS.WAITING_PAYMENT as any, autoCredit: true } }),
      prisma.order.count({ where: { status: RECHARGE_STATUS.CREDITED as any, sweepStatus: 'PENDING' as any, toAddress: { not: null } } }),
      prisma.order.aggregate({
        where: { status: RECHARGE_STATUS.CREDITED as any, sweepStatus: 'PENDING' as any, toAddress: { not: null } },
        _sum: { usdtAmount: true },
      }),
      prisma.order.count({
        where: { status: RECHARGE_STATUS.CREDITED as any, creditedAt: { gte: todayRange.start, lt: todayRange.end } },
      }),
      prisma.order.aggregate({
        where: { status: RECHARGE_STATUS.CREDITED as any, creditedAt: { gte: todayRange.start, lt: todayRange.end } },
        _sum: { usdtAmount: true },
      }),
      prisma.sweepJob.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          totalUsdt: true,
          orderCount: true,
          addressCount: true,
          createdAt: true,
          finishedAt: true,
        },
      }),
    ]);
    return res.json({
      available,
      assigned,
      hdAssigned,
      disabled,
      fallbackOrders,
      pendingAutoCreditOrders,
      pendingSweepOrders,
      pendingSweepUsdt: Number(pendingSweepAgg._sum.usdtAmount || 0),
      todayRechargeCount,
      todayRechargeUsdt: Number(todayRechargeAgg._sum.usdtAmount || 0),
      sweepTargetConfigured: Boolean(sweepTarget),
      lastSweepJob,
    });
  }));

  app.post('/api/admin/deposit-sweep-jobs', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const configs = await ConfigService.getConfigs();
    const targetAddress = normalizeTronAddress(configs?.tron_sweep_target_address);
    if (!targetAddress) {
      return res.status(400).json({ error: '请先在系统配置中设置归集目标地址' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: {
          status: RECHARGE_STATUS.CREDITED as any,
          sweepStatus: 'PENDING' as any,
          toAddress: { not: null },
        },
        orderBy: [{ creditedAt: 'asc' }, { createdAt: 'asc' }],
        take: 200,
        select: {
          id: true,
          toAddress: true,
          usdtAmount: true,
        },
      });
      if (orders.length === 0) {
        throw new HttpError('暂无待归集订单', 400);
      }

      const totalUsdt = orders.reduce((sum, item) => sum + Number(item.usdtAmount || 0), 0);
      const addressCount = new Set(orders.map((item) => item.toAddress).filter(Boolean)).size;
      const job = await tx.sweepJob.create({
        data: {
          status: 'PENDING' as any,
          requestedById: req.user?.id || null,
          targetAddress,
          totalUsdt: totalUsdt.toFixed(6),
          orderCount: orders.length,
          addressCount,
          statusReason: 'waiting_for_sweep_worker',
        },
        select: {
          id: true,
          status: true,
          targetAddress: true,
          totalUsdt: true,
          orderCount: true,
          addressCount: true,
          createdAt: true,
        },
      });

      await tx.sweepTransaction.createMany({
        data: orders.map((order) => ({
          jobId: job.id,
          orderId: order.id,
          fromAddress: order.toAddress || '',
          toAddress: targetAddress,
          usdtAmount: order.usdtAmount,
          status: 'PENDING' as any,
        })),
        skipDuplicates: true,
      });

      await tx.order.updateMany({
        where: { id: { in: orders.map((order) => order.id) }, sweepStatus: 'PENDING' as any },
        data: { sweepStatus: 'QUEUED' as any, sweepJobId: job.id },
      });

      return job;
    });

    return res.status(201).json({ success: true, job: result });
  }));

  app.get('/api/internal/deposit-sweep-jobs/next', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const job = await prisma.$transaction(async (tx) => {
      const nextJob = await tx.sweepJob.findFirst({
        where: { status: { in: ['PENDING', 'RUNNING'] as any } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, targetAddress: true, totalUsdt: true, orderCount: true, addressCount: true, createdAt: true },
      });
      if (!nextJob) return null;
      if (nextJob.status === 'PENDING') {
        await tx.sweepJob.update({
          where: { id: nextJob.id },
          data: { status: 'RUNNING' as any, startedAt: new Date(), statusReason: 'worker_claimed' },
        });
      }
      const items = await tx.sweepTransaction.findMany({
        where: { jobId: nextJob.id, status: 'PENDING' as any },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          orderId: true,
          fromAddress: true,
          toAddress: true,
          usdtAmount: true,
        },
      });
      if (items.length > 0) {
        await tx.sweepTransaction.updateMany({
          where: { id: { in: items.map((item) => item.id) }, status: 'PENDING' as any },
          data: { status: 'RUNNING' as any },
        });
      }
      return { ...nextJob, status: 'RUNNING', items };
    });
    return res.json({ job });
  }));

  app.post('/api/internal/deposit-sweep-transactions/:id/complete', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const txHash = typeof req.body?.txHash === 'string' ? req.body.txHash.trim() : '';
    if (!txHash || txHash.length > 128) return res.status(400).json({ error: 'txHash is required' });
    const feeTrx = req.body?.feeTrx === undefined || req.body?.feeTrx === null ? null : Number(req.body.feeTrx);
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.sweepTransaction.findUnique({
        where: { id: req.params.id },
        select: { id: true, jobId: true, orderId: true, fromAddress: true },
      });
      if (!item) throw new HttpError('归集明细不存在', 404);
      const now = new Date();
      const updated = await tx.sweepTransaction.update({
        where: { id: item.id },
        data: {
          status: 'COMPLETED' as any,
          txHash,
          feeTrx: Number.isFinite(feeTrx) && feeTrx !== null ? feeTrx : null,
          errorMessage: null,
        },
        select: { id: true, jobId: true, status: true, txHash: true },
      });
      await tx.order.update({
        where: { id: item.orderId },
        data: { sweepStatus: 'COMPLETED' as any, sweptAt: now },
        select: { id: true },
      });
      await tx.depositAddress.updateMany({
        where: { address: item.fromAddress },
        data: { lastSweptAt: now },
      });
      await refreshSweepJobStatus(tx, item.jobId);
      return updated;
    });
    return res.json({ success: true, item: result });
  }));

  app.post('/api/internal/deposit-sweep-transactions/:id/fail', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const errorMessage = typeof req.body?.errorMessage === 'string'
      ? req.body.errorMessage.trim().slice(0, 500)
      : 'sweep_failed';
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.sweepTransaction.findUnique({
        where: { id: req.params.id },
        select: { id: true, jobId: true, orderId: true },
      });
      if (!item) throw new HttpError('归集明细不存在', 404);
      const updated = await tx.sweepTransaction.update({
        where: { id: item.id },
        data: {
          status: 'FAILED' as any,
          errorMessage,
        },
        select: { id: true, jobId: true, status: true, errorMessage: true },
      });
      await tx.order.update({
        where: { id: item.orderId },
        data: { sweepStatus: 'FAILED' as any },
        select: { id: true },
      });
      await refreshSweepJobStatus(tx, item.jobId);
      return updated;
    });
    return res.json({ success: true, item: result });
  }));

  app.post('/api/admin/deposit-addresses', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const raw = Array.isArray(req.body?.addresses)
      ? req.body.addresses
      : typeof req.body?.addresses === 'string'
        ? req.body.addresses.split(/[,\n\r\t ]+/)
        : [];
    const normalized: string[] = raw
      .map((item: unknown) => normalizeTronAddress(item))
      .filter((address): address is string => Boolean(address));
    const uniqueAddresses: string[] = Array.from(new Set(normalized));
    if (uniqueAddresses.length === 0) {
      return res.status(400).json({ error: '请输入有效的 TRON 地址' });
    }
    if (uniqueAddresses.length > 200) {
      return res.status(400).json({ error: '单次最多导入 200 个地址' });
    }

    const result = await prisma.depositAddress.createMany({
      data: uniqueAddresses.map((address) => ({ address, status: 'AVAILABLE' as any })),
      skipDuplicates: true,
    });
    const created = result.count;
    const skipped = uniqueAddresses.length - created;

    return res.status(201).json({
      success: true,
      created,
      skipped,
      invalid: raw.length - normalized.length,
    });
  }));

  app.patch('/api/admin/deposit-addresses/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const status = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
    if (!['AVAILABLE', 'DISABLED'].includes(status)) {
      return res.status(400).json({ error: '仅支持切换为可用或停用' });
    }
    const current = await prisma.depositAddress.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });
    if (!current) return res.status(404).json({ error: '地址不存在' });
    if (current.userId) {
      return res.status(400).json({ error: '已分配地址不能直接变更状态' });
    }
    const updated = await prisma.depositAddress.update({
      where: { id: current.id },
      data: { status: status as any },
      select: {
        id: true,
        address: true,
        status: true,
        source: true,
        derivationIndex: true,
        derivationPath: true,
        userId: true,
        assignedAt: true,
        lastSweptAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.json(updated);
  }));

}
