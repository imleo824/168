import type { Key, ReactNode } from 'react';

import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import type {
  ReferralCommissionItem,
  ReferralRelationItem,
  ReferralSummary,
  ReferralWithdrawalItem,
} from '@/services/referral';

import {
  formatDate,
  formatMoney,
  formatRate,
  getCommissionDisplayAmount,
  maskAddress,
  statusLabel,
} from './referralInviteFormatters';

export function MoneyValue({ value }: { value: unknown }) {
  return (
    <span className="referral-money-value">
      {formatMoney(value)}<span className="referral-money-unit">U</span>
    </span>
  );
}

export function HeroStats({ summary, relationCount }: { summary: ReferralSummary; relationCount?: number }) {
  const inviteCount = typeof relationCount === 'number' ? relationCount : summary.inviteCount;
  const items = [
    { label: '已提现', value: <MoneyValue value={summary.withdrawCommission} /> },
    { label: '总返佣', value: <MoneyValue value={summary.totalCommission} /> },
    { label: '已邀请', value: inviteCount },
  ];
  return (
    <div className="referral-secondary-stats" aria-label="邀请收益概览">
      {items.map((item) => (
        <div key={item.label} className="referral-secondary-stat">
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

type ReferralRecordRowProps<T> = {
  key?: Key;
  item: T;
};

function ReferralRecordCard({
  title,
  lines,
  status,
  statusTone = 'muted',
  amount,
  unit,
}: {
  title: string;
  lines: string[];
  status?: string;
  statusTone?: 'success' | 'pending' | 'muted';
  amount: ReactNode;
  unit: string;
}) {
  const statusClass = statusTone === 'success'
    ? 'record-status-pill--success'
    : statusTone === 'pending'
      ? 'record-status-pill--pending'
      : 'record-status-pill--muted';
  return (
    <SurfaceSectionCard as="article" compact className="record-card referral-record-card">
      <div className="record-card-row">
        <div className="record-card-main">
          <p className="record-title record-card-line record-card-line--title">{title}</p>
          {lines.filter(Boolean).map((line) => (
            <span key={line} className="record-time record-card-line">{line}</span>
          ))}
        </div>
        <div className="record-card-aside">
          {status ? <span className={`record-status-pill ${statusClass}`}>{status}</span> : null}
          <span className="record-amount record-amount--neutral">{amount}</span>
          <span className="record-amount-unit">{unit}</span>
        </div>
      </div>
    </SurfaceSectionCard>
  );
}

export function RelationRow({ item }: ReferralRecordRowProps<ReferralRelationItem>) {
  const name = item.displayName?.trim() || '推推用户';
  const hasRecharge = Number(item.totalRechargeAmount || 0) > 0;
  return (
    <ReferralRecordCard
      title={name}
      lines={[`注册 ${formatDate(item.registeredAt)}`, item.source === 'link' ? '链接绑定' : '邀请码绑定']}
      status={hasRecharge ? '已充值' : '未充值'}
      statusTone={hasRecharge ? 'success' : 'muted'}
      amount={<MoneyValue value={item.totalCommissionAmount} />}
      unit="贡献返佣"
    />
  );
}

export function CommissionRow({ item }: ReferralRecordRowProps<ReferralCommissionItem>) {
  const name = item.inviteeDisplayName?.trim() || '推推用户';
  return (
    <ReferralRecordCard
      title={name}
      lines={[`充值 ${formatMoney(item.rechargeAmount)}U`, `比例 ${formatRate(item.commissionRate)} · ${formatDate(item.createdAt)}`]}
      amount={<MoneyValue value={getCommissionDisplayAmount(item)} />}
      unit="产生佣金"
    />
  );
}

export function WithdrawalRow({ item }: ReferralRecordRowProps<ReferralWithdrawalItem>) {
  const isConversion = item.kind === 'conversion' || item.currency === 'POINTS';
  const status = String(item.status || '').toUpperCase();
  const settled = isConversion || ['PAID', 'WITHDRAWN'].includes(status);
  const pending = ['PENDING', 'WITHDRAWING', 'APPROVED'].includes(status);
  const title = isConversion ? '换积分' : `${item.network || 'TRC20'} 提现`;
  const lines = isConversion
    ? [`金额 ${formatMoney(item.amount)}U`, `获得 ${Number(item.points || 0).toLocaleString()} 积分 · ${formatDate(item.createdAt)}`]
    : [maskAddress(item.address), formatDate(item.createdAt)];
  return (
    <ReferralRecordCard
      title={title}
      lines={lines}
      status={isConversion ? '已转积分' : statusLabel(item.status)}
      statusTone={settled ? 'success' : pending ? 'pending' : 'muted'}
      amount={isConversion ? Number(item.points || 0).toLocaleString() : <MoneyValue value={item.amount} />}
      unit={isConversion ? '积分' : item.currency || 'USDT'}
    />
  );
}
