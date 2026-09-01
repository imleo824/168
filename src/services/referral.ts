import { apiFetch } from '@/services/apiCore';

export type ReferralSettings = {
  enabled: boolean;
  commissionRate: number;
  settlementDays: number;
  minWithdrawAmount: number;
  pointsPerUsdt: number;
};

export type ReferralSummary = {
  inviteCode: string;
  settings: ReferralSettings;
  inviteCount: number;
  activeInviteeCount: number;
  totalCommission: number;
  pendingCommission: number;
  availableCommission: number;
  convertedCommission: number;
  withdrawCommission: number;
};

export type ReferralRelationItem = {
  id: string;
  inviteeId: string;
  inviteCode: string;
  source: string;
  registeredAt: string;
  displayName?: string | null;
  photoUrl?: string | null;
  totalRechargeAmount: string;
  totalCommissionAmount: string;
  lastCommissionAt?: string | null;
};

export type ReferralCommissionItem = {
  id: string;
  inviteeId: string;
  orderId: string;
  rechargeAmount: string;
  commissionRate: string;
  commissionAmount: string;
  status: string;
  availableAt: string;
  createdAt: string;
  inviteeDisplayName?: string | null;
  inviteePhotoUrl?: string | null;
};

export type ReferralWithdrawalItem = {
  id: string;
  amount: string;
  currency: string;
  network: string;
  address: string;
  status: string;
  adminNote?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  paidAt?: string | null;
  points?: number | null;
  kind?: 'withdrawal' | 'conversion';
};

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as any)?.error || (body as any)?.message || '邀请返佣操作失败');
  }
  return body as T;
}

export async function getReferralSummary() {
  const res = await apiFetch('/api/referrals/summary', { cache: 'no-store' });
  return readJson<ReferralSummary>(res);
}

export async function getReferralRelations(limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await apiFetch(`/api/referrals/relations?${params.toString()}`, { cache: 'no-store' });
  return readJson<ReferralRelationItem[]>(res);
}

export async function getReferralCommissions(limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await apiFetch(`/api/referrals/commissions?${params.toString()}`, { cache: 'no-store' });
  return readJson<ReferralCommissionItem[]>(res);
}

export async function getReferralWithdrawals(limit = 30) {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await apiFetch(`/api/referrals/withdrawals?${params.toString()}`, { cache: 'no-store' });
  return readJson<ReferralWithdrawalItem[]>(res);
}

export async function convertReferralCommissionToPoints(payload: { amount: number }) {
  const res = await apiFetch('/api/referrals/convert-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJson<{ success: boolean; conversionId?: string; convertedAmount: number; points: number; summary: ReferralSummary }>(res);
}

export async function requestReferralWithdrawal(payload: { amount: number; address: string; network?: string; paymentPassword: string }) {
  const res = await apiFetch('/api/referrals/withdrawals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJson<{ success: boolean; withdrawal: any; summary: ReferralSummary }>(res);
}
