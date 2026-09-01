import prisma from '../db';
import { getPlatformDayRange } from '../platform-time';
import { HttpError } from '../http/errors';
import { RECHARGE_STATUS } from './deposit-scanner.service';
import {
  claimNextSweepBatch,
  completeSweepTransaction,
  failSweepTransaction,
  refreshSweepJobStatus,
} from './deposit-sweep.service';

const DEPOSIT_ADDRESS_STATUS_VALUES = ['AVAILABLE', 'ASSIGNED', 'DISABLED'] as const;
type DepositAddressStatus = typeof DEPOSIT_ADDRESS_STATUS_VALUES[number];

const DEPOSIT_ADDRESS_SELECT = {
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
} as const;

export function isDepositAddressStatus(value: string): value is DepositAddressStatus {
  return (DEPOSIT_ADDRESS_STATUS_VALUES as readonly string[]).includes(value);
}

export async function listAdminDepositAddresses(input: {
  status?: string;
  search?: string;
  limit: number;
  cursor?: string;
}) {
  const normalizedStatus = String(input.status || '').trim().toUpperCase();
  const safeSearch = String(input.search || '').trim().slice(0, 80);
  const addresses = await prisma.depositAddress.findMany({
    where: {
      ...(normalizedStatus ? { status: normalizedStatus as DepositAddressStatus } : {}),
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
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: DEPOSIT_ADDRESS_SELECT,
  });
  const hasMore = addresses.length > input.limit;
  const items = hasMore ? addresses.slice(0, input.limit) : addresses;
  return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}

export async function getAdminDepositStats(input: { sweepTargetConfigured: boolean }) {
  const todayRange = getPlatformDayRange();
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
    prisma.order.count({ where: { status: RECHARGE_STATUS.CREDITED as any, creditedAt: { gte: todayRange.start, lt: todayRange.end } } }),
    prisma.order.aggregate({
      where: { status: RECHARGE_STATUS.CREDITED as any, creditedAt: { gte: todayRange.start, lt: todayRange.end } },
      _sum: { usdtAmount: true },
    }),
    prisma.sweepJob.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, totalUsdt: true, orderCount: true, addressCount: true, createdAt: true, finishedAt: true },
    }),
  ]);
  return {
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
    sweepTargetConfigured: input.sweepTargetConfigured,
    lastSweepJob,
  };
}

export async function createAdminDepositSweepJob(input: { requestedById?: string | null; targetAddress: string }) {
  return prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: { status: RECHARGE_STATUS.CREDITED as any, sweepStatus: 'PENDING' as any, toAddress: { not: null } },
      orderBy: [{ creditedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: { id: true, toAddress: true, usdtAmount: true },
    });
    if (orders.length === 0) throw new HttpError('暂无待归集订单', 400);
    const totalUsdt = orders.reduce((sum, item) => sum + Number(item.usdtAmount || 0), 0);
    const addressCount = new Set(orders.map((item) => item.toAddress).filter(Boolean)).size;
    const job = await tx.sweepJob.create({
      data: {
        status: 'PENDING' as any,
        requestedById: input.requestedById || null,
        targetAddress: input.targetAddress,
        totalUsdt: totalUsdt.toFixed(6),
        orderCount: orders.length,
        addressCount,
        statusReason: 'waiting_for_sweep_worker',
      },
      select: { id: true, status: true, targetAddress: true, totalUsdt: true, orderCount: true, addressCount: true, createdAt: true },
    });
    await tx.sweepTransaction.createMany({
      data: orders.map((order) => ({
        jobId: job.id,
        orderId: order.id,
        fromAddress: order.toAddress || '',
        toAddress: input.targetAddress,
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
}

export async function claimAdminDepositSweepBatch(limit: number) {
  return prisma.$transaction((tx) => claimNextSweepBatch(tx, limit));
}

export async function completeAdminDepositSweepTransaction(input: { id: string; txHash: string; feeTrx: number | null }) {
  return prisma.$transaction(async (tx) => {
    const updated = await completeSweepTransaction(tx, input);
    await refreshSweepJobStatus(tx, updated.jobId);
    return updated;
  });
}

export async function failAdminDepositSweepTransaction(input: { id: string; errorMessage: string }) {
  return prisma.$transaction(async (tx) => {
    const updated = await failSweepTransaction(tx, input);
    await refreshSweepJobStatus(tx, updated.jobId);
    return updated;
  });
}

export async function importAdminDepositAddresses(addresses: string[]) {
  const result = await prisma.depositAddress.createMany({
    data: addresses.map((address) => ({ address, status: 'AVAILABLE' as any })),
    skipDuplicates: true,
  });
  return { created: result.count, skipped: addresses.length - result.count };
}

export async function updateAdminDepositAddressStatus(id: string, status: DepositAddressStatus) {
  const current = await prisma.depositAddress.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!current) throw new HttpError('地址不存在', 404);
  if (current.userId) throw new HttpError('已分配地址不能直接变更状态', 400);
  return prisma.depositAddress.update({ where: { id: current.id }, data: { status }, select: DEPOSIT_ADDRESS_SELECT });
}

export { DEPOSIT_ADDRESS_STATUS_VALUES };
