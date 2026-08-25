import type { Prisma } from '@prisma/client';

type SweepTransactionDb = Prisma.TransactionClient;

const ACTIVE_TRANSACTION_STATUSES = ['PENDING', 'RUNNING'] as const;
const ACTIVE_ORDER_SWEEP_STATUSES = ['PENDING', 'QUEUED'] as const;

export type SweepTransactionCallbackKind = 'COMPLETED' | 'FAILED';

export type SweepTransactionCallbackDecision = 'APPLY' | 'IDEMPOTENT' | 'CONFLICT';

export class DepositSweepStateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'DepositSweepStateError';
    this.statusCode = statusCode;
  }
}

type SweepTransactionState = {
  status: string;
  txHash: string | null;
};

/**
 * Decide whether a worker callback is safe to apply.
 *
 * Worker callbacks are at-least-once by design. A terminal transaction is
 * immutable: the same callback can be acknowledged, but a different terminal
 * result must never overwrite it.
 */
export function decideSweepTransactionCallback(
  current: SweepTransactionState,
  targetStatus: SweepTransactionCallbackKind,
  callbackTxHash?: string,
): SweepTransactionCallbackDecision {
  if (current.status === targetStatus) {
    if (targetStatus === 'FAILED' || current.txHash === callbackTxHash) return 'IDEMPOTENT';
    return 'CONFLICT';
  }
  if (current.status === 'COMPLETED' || current.status === 'FAILED') return 'CONFLICT';
  return 'APPLY';
}

function callbackConflict() {
  return new DepositSweepStateError('归集明细已进入其他终态，拒绝覆盖', 409);
}

function missingSweepTransaction() {
  return new DepositSweepStateError('归集明细不存在', 404);
}

function missingSweepOrder() {
  return new DepositSweepStateError('归集关联订单不存在', 409);
}

type CompleteResult = {
  id: string;
  jobId: string;
  status: string;
  txHash: string | null;
};

type FailResult = {
  id: string;
  jobId: string;
  status: string;
  errorMessage: string | null;
};

async function loadSweepTransaction(tx: SweepTransactionDb, id: string) {
  const item = await tx.sweepTransaction.findUnique({
    where: { id },
    select: {
      id: true,
      jobId: true,
      orderId: true,
      fromAddress: true,
      status: true,
      txHash: true,
      errorMessage: true,
    },
  });
  if (!item) throw missingSweepTransaction();
  return item;
}

async function ensureOrderSweepStatus(
  tx: SweepTransactionDb,
  orderId: string,
  targetStatus: SweepTransactionCallbackKind,
  sweptAt?: Date,
) {
  const data = targetStatus === 'COMPLETED'
    ? { sweepStatus: 'COMPLETED' as const, sweptAt }
    : { sweepStatus: 'FAILED' as const };
  const result = await tx.order.updateMany({
    where: {
      id: orderId,
      sweepStatus: { in: [...ACTIVE_ORDER_SWEEP_STATUSES] },
    },
    data,
  });
  if (result.count > 0) return;

  // The order may already have been moved to the same terminal state by a
  // previous attempt. Accept that state, but reject any conflicting state so
  // the transaction and order cannot silently diverge.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { sweepStatus: true },
  });
  if (!order) throw missingSweepOrder();
  if (order.sweepStatus !== targetStatus) throw callbackConflict();
}

async function resolveLostRace(
  tx: SweepTransactionDb,
  id: string,
  targetStatus: SweepTransactionCallbackKind,
  callbackTxHash?: string,
) {
  const current = await loadSweepTransaction(tx, id);
  const decision = decideSweepTransactionCallback(current, targetStatus, callbackTxHash);
  if (decision === 'IDEMPOTENT') return current;
  throw callbackConflict();
}

export async function completeSweepTransaction(
  tx: SweepTransactionDb,
  input: { id: string; txHash: string; feeTrx: number | null },
): Promise<CompleteResult> {
  const current = await loadSweepTransaction(tx, input.id);
  const decision = decideSweepTransactionCallback(current, 'COMPLETED', input.txHash);
  if (decision === 'CONFLICT') throw callbackConflict();
  if (decision === 'IDEMPOTENT') {
    return {
      id: current.id,
      jobId: current.jobId,
      status: current.status,
      txHash: current.txHash,
    };
  }

  const now = new Date();
  const updated = await tx.sweepTransaction.updateMany({
    where: {
      id: input.id,
      status: { in: [...ACTIVE_TRANSACTION_STATUSES] },
    },
    data: {
      status: 'COMPLETED',
      txHash: input.txHash,
      feeTrx: input.feeTrx,
      errorMessage: null,
    },
  });
  if (updated.count === 0) {
    const raced = await resolveLostRace(tx, input.id, 'COMPLETED', input.txHash);
    return {
      id: raced.id,
      jobId: raced.jobId,
      status: raced.status,
      txHash: raced.txHash,
    };
  }

  await ensureOrderSweepStatus(tx, current.orderId, 'COMPLETED', now);
  await tx.depositAddress.updateMany({
    where: { address: current.fromAddress },
    data: { lastSweptAt: now },
  });

  return {
    id: current.id,
    jobId: current.jobId,
    status: 'COMPLETED',
    txHash: input.txHash,
  };
}

export async function failSweepTransaction(
  tx: SweepTransactionDb,
  input: { id: string; errorMessage: string },
): Promise<FailResult> {
  const current = await loadSweepTransaction(tx, input.id);
  const decision = decideSweepTransactionCallback(current, 'FAILED');
  if (decision === 'CONFLICT') throw callbackConflict();
  if (decision === 'IDEMPOTENT') {
    return {
      id: current.id,
      jobId: current.jobId,
      status: current.status,
      errorMessage: current.errorMessage,
    };
  }

  const updated = await tx.sweepTransaction.updateMany({
    where: {
      id: input.id,
      status: { in: [...ACTIVE_TRANSACTION_STATUSES] },
    },
    data: {
      status: 'FAILED',
      errorMessage: input.errorMessage,
    },
  });
  if (updated.count === 0) {
    const raced = await resolveLostRace(tx, input.id, 'FAILED');
    return {
      id: raced.id,
      jobId: raced.jobId,
      status: raced.status,
      errorMessage: raced.errorMessage,
    };
  }

  await ensureOrderSweepStatus(tx, current.orderId, 'FAILED');

  return {
    id: current.id,
    jobId: current.jobId,
    status: 'FAILED',
    errorMessage: input.errorMessage,
  };
}

export async function refreshSweepJobStatus(tx: SweepTransactionDb, jobId: string) {
  const [pending, running, failed] = await Promise.all([
    tx.sweepTransaction.count({ where: { jobId, status: 'PENDING' } }),
    tx.sweepTransaction.count({ where: { jobId, status: 'RUNNING' } }),
    tx.sweepTransaction.count({ where: { jobId, status: 'FAILED' } }),
  ]);
  if (pending > 0 || running > 0) return;
  await tx.sweepJob.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'RUNNING'] } },
    data: {
      status: failed > 0 ? 'PARTIAL_FAILED' : 'COMPLETED',
      finishedAt: new Date(),
      statusReason: failed > 0 ? 'some_items_failed' : 'completed',
    },
  });
}

export async function claimNextSweepBatch(tx: SweepTransactionDb, limit: number) {
  const nextJob = await tx.sweepJob.findFirst({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
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
  if (!nextJob) return null;

  if (nextJob.status === 'PENDING') {
    await tx.sweepJob.updateMany({
      where: { id: nextJob.id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), statusReason: 'worker_claimed' },
    });
  }

  const candidates = await tx.sweepTransaction.findMany({
    where: { jobId: nextJob.id, status: 'PENDING' },
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

  // Claim with one compare-and-set statement. The returned rows are exactly
  // the rows this worker changed, so concurrent workers cannot process the
  // same item and a 100-item batch does not require 100 round trips.
  const claimed = candidates.length === 0
    ? []
    : await tx.sweepTransaction.updateManyAndReturn({
        where: {
          id: { in: candidates.map((candidate) => candidate.id) },
          status: 'PENDING',
        },
        data: { status: 'RUNNING' },
        select: {
          id: true,
          orderId: true,
          fromAddress: true,
          toAddress: true,
          usdtAmount: true,
        },
      });
  const claimedIds = new Set(claimed.map((item) => item.id));
  const items = candidates.filter((candidate) => claimedIds.has(candidate.id));

  return { ...nextJob, status: 'RUNNING' as const, items };
}
