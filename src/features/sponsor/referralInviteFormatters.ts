import { APP_ROUTES } from '@/app/routePaths';
import { buildReferralInviteLandingUrl } from '@/utils/referralInvite';
import type { ReferralCommissionItem } from '@/services/referral';

export function formatMoney(value: unknown, digits = 2) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  const formatted = parsed.toFixed(parsed > 0 && parsed < 1 ? 4 : digits);
  return formatted.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function parseAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed * 1_000_000) / 1_000_000 : 0;
}

export function formatRate(value: unknown) {
  const rate = Number(value || 0);
  if (!Number.isFinite(rate) || rate <= 0) return '';
  return `${Math.round(rate * 100)}%`;
}

export function formatDate(value?: string | null) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

export function buildInviteLink(inviteCode: string) {
  return buildReferralInviteLandingUrl(inviteCode, undefined, APP_ROUTES.invite);
}

export function maskAddress(value?: string | null) {
  const address = String(value || '').trim();
  if (!address) return '未填写地址';
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function statusLabel(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PENDING') return '待处理';
  if (normalized === 'WITHDRAWING') return '处理中';
  if (normalized === 'WITHDRAWN') return '已打款';
  if (normalized === 'APPROVED') return '处理中';
  if (normalized === 'PAID') return '已打款';
  if (normalized === 'REJECTED') return '已拒绝';
  if (normalized === 'CANCELED') return '已拒绝';
  if (normalized === 'CONVERTED') return '已转积分';
  return normalized || '未知';
}

export function getCommissionDisplayAmount(item: ReferralCommissionItem) {
  const storedAmount = Number(item.commissionAmount || 0);
  if (Number.isFinite(storedAmount) && storedAmount > 0) return storedAmount;
  return 0;
}
