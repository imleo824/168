export type ReferralRecordTab = 'relations' | 'commissions' | 'withdrawals';

export const REFERRAL_RECORD_TABS: Array<{ key: ReferralRecordTab; label: string }> = [
  { key: 'relations', label: '邀请记录' },
  { key: 'commissions', label: '返佣记录' },
  { key: 'withdrawals', label: '提现记录' },
];

export function normalizeReferralRecordTab(value: unknown): ReferralRecordTab {
  const normalized = String(value || '').trim();
  if (normalized === 'commissions' || normalized === 'withdrawals' || normalized === 'relations') return normalized;
  return 'relations';
}

export function referralRecordMoreLabel(tab: ReferralRecordTab) {
  if (tab === 'commissions') return '查看更多返佣记录';
  if (tab === 'withdrawals') return '查看更多提现记录';
  return '查看更多邀请记录';
}
