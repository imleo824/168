import {
  TransactionAction,
  getTransactionActionLabel,
  type RechargeOrder,
  type Transaction,
} from '@/types';
import {
  calculateDisplayRechargePoints,
  getRechargeOrderSortTime,
  getRechargeOrderStatusLabel,
  isChatPinTransaction,
  isReferralConversionTransaction,
  isTelegramSyncTransaction,
  isSignupRewardTransaction,
} from './recordDisplay';

export type UnifiedLedgerRecord =
  | { kind: 'transaction'; id: string; time: string; tx: Transaction }
  | { kind: 'recharge'; id: string; time: string; order: RechargeOrder };

export function formatLedgerRecordDateTime(value: string, compact = false) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const date = new Intl.DateTimeFormat('zh-CN', compact
    ? { month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' }).format(dt);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(dt);
  return `${date} ${time}`;
}

export function isPromotionTransaction(tx: Transaction) {
  return tx.action === TransactionAction.AD || tx.action === TransactionAction.PIN_POST || isChatPinTransaction(tx);
}

export function getTransactionRecordTitle(tx: Transaction) {
  if (isReferralConversionTransaction(tx)) return '邀请返佣换积分';
  if (isChatPinTransaction(tx)) return getTransactionActionLabel(TransactionAction.PIN_CHAT);
  if (tx.action === TransactionAction.AD) return getTransactionActionLabel(TransactionAction.AD, tx.description);
  if (tx.action === TransactionAction.PIN_POST) return getTransactionActionLabel(TransactionAction.PIN_POST, tx.description);
  if (tx.action === TransactionAction.ANONYMOUS_PUBLISH) return `${getTransactionActionLabel(TransactionAction.ANONYMOUS_PUBLISH)}消费`;
  if (isTelegramSyncTransaction(tx)) return '官方频道同步';
  if (isSignupRewardTransaction(tx)) return tx.description || '注册赠送积分';
  return getTransactionActionLabel(tx.action, tx.description);
}

export function getLedgerRecordTitle(record: UnifiedLedgerRecord) {
  return record.kind === 'recharge'
    ? `积分充值 · ${record.order.usdtAmount} USDT`
    : getTransactionRecordTitle(record.tx);
}

export function getLedgerRecordId(record: UnifiedLedgerRecord) {
  return record.kind === 'recharge' ? record.order.id : record.tx.id;
}

export function getLedgerRecordTime(record: UnifiedLedgerRecord, compact = false) {
  const time = record.kind === 'recharge'
    ? record.order.creditedAt || record.order.confirmedAt || record.order.createdAt
    : record.tx.createdAt;
  return formatLedgerRecordDateTime(time, compact);
}

export function getLedgerRecordStatusText(record: UnifiedLedgerRecord) {
  return record.kind === 'recharge' ? getRechargeOrderStatusLabel(record.order.status) : '';
}

export function getLedgerRecordAmount(record: UnifiedLedgerRecord, pointsPerUsdt: number) {
  return record.kind === 'recharge'
    ? calculateDisplayRechargePoints(record.order, pointsPerUsdt)
    : record.tx.amount;
}

export function buildLedgerRecords(
  transactions: Transaction[] | undefined,
  orders: RechargeOrder[] | undefined,
) {
  const txRecords: UnifiedLedgerRecord[] = (transactions || [])
    .filter((tx) => tx.action !== TransactionAction.RECHARGE || isSignupRewardTransaction(tx) || isReferralConversionTransaction(tx))
    .map((tx) => ({ kind: 'transaction' as const, id: tx.id, time: tx.createdAt, tx }));

  const rechargeRecords: UnifiedLedgerRecord[] = (orders || [])
    .map((order) => ({ kind: 'recharge' as const, id: order.id, time: getRechargeOrderSortTime(order), order }));

  return [...txRecords, ...rechargeRecords]
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}
