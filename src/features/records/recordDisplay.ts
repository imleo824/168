import { TransactionAction, type RechargeOrder, type RechargeOrderStatus, type Transaction } from '@/types';

export type RechargeStatusGroup = 'PENDING' | 'CREDITED' | 'NOT_CREDITED';

export function formatRecordId(value: string) {
  if (!value) return '';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function isSignupRewardTransaction(tx: Pick<Transaction, 'action' | 'description'>) {
  return tx.action === TransactionAction.SIGNUP_REWARD
    || (tx.action === TransactionAction.RECHARGE && /注册|赠送|奖励/i.test(String(tx.description || '')));
}

export function isReferralConversionTransaction(tx: Pick<Transaction, 'action' | 'description'>) {
  return tx.action === TransactionAction.RECHARGE && /邀请返佣.*积分|返佣.*换积分/i.test(String(tx.description || ''));
}

export function isChatPinTransaction(tx: Pick<Transaction, 'action' | 'description'>) {
  return tx.action === TransactionAction.PIN_CHAT
    || (tx.action === TransactionAction.AD && /聊天室/i.test(String(tx.description || '')));
}

export function isTelegramSyncTransaction(tx: Pick<Transaction, 'action'>) {
  return tx.action === TransactionAction.TELEGRAM_SYNC;
}

export function getRechargeOrderStatusGroup(status: RechargeOrderStatus): RechargeStatusGroup {
  if (status === 'CREDITED') return 'CREDITED';
  if (status === 'WAITING_PAYMENT' || status === 'MANUAL_REVIEW') return 'PENDING';
  return 'NOT_CREDITED';
}

export function getRechargeOrderStatusLabel(status: RechargeOrderStatus) {
  const group = getRechargeOrderStatusGroup(status);
  if (group === 'CREDITED') return '已到账';
  if (group === 'PENDING') return '确认中';
  return '未到账';
}

export function getRechargeOrderStatusClass(status: RechargeOrderStatus) {
  const group = getRechargeOrderStatusGroup(status);
  if (group === 'CREDITED') return 'record-status-pill--success';
  if (group === 'PENDING') return 'record-status-pill--pending';
  return 'record-status-pill--muted';
}

export function getRechargeOrderSortTime(order: RechargeOrder) {
  return order.creditedAt || order.confirmedAt || order.createdAt;
}

export function calculateDisplayRechargePoints(order: RechargeOrder, pointsPerUsdt: number) {
  const creditedPoints = Number(order.pointsGained || 0);
  if (creditedPoints > 0) return creditedPoints;
  if (getRechargeOrderStatusGroup(order.status) !== 'PENDING') return creditedPoints;
  const amount = Number(order.usdtAmount);
  if (!Number.isFinite(amount) || amount <= 0) return creditedPoints;
  return Math.max(0, Math.floor(amount * pointsPerUsdt + 1e-9));
}
