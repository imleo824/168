import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';

import { APP_ROUTES } from '@/app/routePaths';
import ActionButton from '@/ui/ActionButton';
import EmptyStateCard from '@/ui/EmptyStateCard';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import SegmentTabs from '@/ui/SegmentTabs';
import RecordMoreLink from '@/ui/RecordMoreLink';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { useScrollLock } from '@/utils/scrollLock';
import { updatePaymentPassword } from '@/services/api';
import {
  convertReferralCommissionToPoints,
  getReferralCommissions,
  getReferralRelations,
  getReferralSummary,
  getReferralWithdrawals,
  requestReferralWithdrawal,
} from '@/services/referral';

import {
  CommissionRow,
  HeroStats,
  MoneyValue,
  RelationRow,
  WithdrawalRow,
} from './ReferralInviteRecordRows';
import {
  buildInviteLink,
  formatMoney,
  formatRate,
  parseAmount,
} from './referralInviteFormatters';
import {
  REFERRAL_RECORD_TABS,
  referralRecordMoreLabel,
  type ReferralRecordTab,
} from './referralInviteTabs';

type ReferralInvitePageContentProps = {
  isRulesOpen: boolean;
  onCloseRules: () => void;
};

const REFERRAL_RECORD_PREVIEW_LIMIT = 4;
const loadReferralRulesSheet = () => import('./ReferralRulesSheet');
const loadReferralInviteSheets = () => import('./ReferralInviteSheets');
const LazyReferralRulesSheet = lazy(loadReferralRulesSheet);
const LazyReferralConvertSheet = lazy(() =>
  loadReferralInviteSheets().then((module) => ({ default: module.ReferralConvertSheet })),
);
const LazyReferralWithdrawSheet = lazy(() =>
  loadReferralInviteSheets().then((module) => ({ default: module.ReferralWithdrawSheet })),
);

export default function ReferralInvitePageContent({ isRulesOpen, onCloseRules }: ReferralInvitePageContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, patchUser, showToast } = useAuth();
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [paymentPassword, setPaymentPassword] = useState('');
  const [newPaymentPassword, setNewPaymentPassword] = useState('');
  const [confirmPaymentPassword, setConfirmPaymentPassword] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isWithdrawSheetOpen, setIsWithdrawSheetOpen] = useState(false);
  const [convertAmount, setConvertAmount] = useState('');
  const [convertError, setConvertError] = useState('');
  const [isConvertSheetOpen, setIsConvertSheetOpen] = useState(false);
  const [isSavingPaymentPassword, setIsSavingPaymentPassword] = useState(false);
  const [paymentPasswordSetupDone, setPaymentPasswordSetupDone] = useState(false);
  const [activeRecordTab, setActiveRecordTab] = useState<ReferralRecordTab>('relations');
  const summaryQuery = useQuery({ queryKey: ['referrals', 'summary'], queryFn: getReferralSummary, staleTime: 1000 * 30 });
  const relationsQuery = useQuery({ queryKey: ['referrals', 'relations', 'preview'], queryFn: () => getReferralRelations(REFERRAL_RECORD_PREVIEW_LIMIT + 1), staleTime: 1000 * 30 });
  const commissionsQuery = useQuery({ queryKey: ['referrals', 'commissions', 'preview'], queryFn: () => getReferralCommissions(REFERRAL_RECORD_PREVIEW_LIMIT + 1), staleTime: 1000 * 30 });
  const withdrawalsQuery = useQuery({ queryKey: ['referrals', 'withdrawals', 'preview'], queryFn: () => getReferralWithdrawals(REFERRAL_RECORD_PREVIEW_LIMIT + 1), staleTime: 1000 * 30 });
  const summary = summaryQuery.data;
  const inviteLink = useMemo(() => buildInviteLink(summary?.inviteCode || ''), [summary?.inviteCode]);
  const hasPaymentPassword = Boolean(user?.hasPaymentPassword);
  const needsPaymentPasswordSetup = !hasPaymentPassword && !paymentPasswordSetupDone;
  const normalizedPaymentPassword = paymentPassword.trim();
  const normalizedNewPaymentPassword = newPaymentPassword.trim();
  const normalizedConfirmPaymentPassword = confirmPaymentPassword.trim();
  const parsedConvertAmount = parseAmount(convertAmount);
  const parsedWithdrawAmount = parseAmount(withdrawAmount);
  const previewConvertPoints = summary ? Math.floor(parsedConvertAmount * summary.settings.pointsPerUsdt + 1e-9) : 0;
  const visibleRelations = useMemo(() => (relationsQuery.data || []).slice(0, REFERRAL_RECORD_PREVIEW_LIMIT), [relationsQuery.data]);
  const visibleCommissions = useMemo(() => (commissionsQuery.data || []).slice(0, REFERRAL_RECORD_PREVIEW_LIMIT), [commissionsQuery.data]);
  const visibleWithdrawals = useMemo(() => (withdrawalsQuery.data || []).slice(0, REFERRAL_RECORD_PREVIEW_LIMIT), [withdrawalsQuery.data]);
  const hasMoreRelations = (relationsQuery.data?.length || 0) > REFERRAL_RECORD_PREVIEW_LIMIT;
  const hasMoreCommissions = (commissionsQuery.data?.length || 0) > REFERRAL_RECORD_PREVIEW_LIMIT;
  const hasMoreWithdrawals = (withdrawalsQuery.data?.length || 0) > REFERRAL_RECORD_PREVIEW_LIMIT;
  const hasMoreActiveRecords = activeRecordTab === 'commissions' ? hasMoreCommissions : activeRecordTab === 'withdrawals' ? hasMoreWithdrawals : hasMoreRelations;

  useScrollLock(isRulesOpen || isWithdrawSheetOpen || isConvertSheetOpen, { fixed: true, allowTouchMove: (target) => target instanceof Element && Boolean(target.closest('[data-referral-rules-scroll], [data-payment-action-scroll], [data-promote-sheet-scroll]')) });

  const convertMutation = useMutation({ mutationFn: () => convertReferralCommissionToPoints({ amount: parsedConvertAmount }), onSuccess: (result) => { queryClient.setQueryData(['referrals', 'summary'], result.summary); queryClient.invalidateQueries({ queryKey: ['me'] }); queryClient.invalidateQueries({ queryKey: ['referrals', 'commissions'] }); queryClient.invalidateQueries({ queryKey: ['referrals', 'withdrawals'] }); queryClient.invalidateQueries({ queryKey: ['sponsor', 'transactions-preview'] }); setActiveRecordTab('withdrawals'); setIsConvertSheetOpen(false); setConvertAmount(''); setConvertError(''); showToast(result.points > 0 ? `已转为 ${result.points} 积分` : '暂无可转换返佣', result.points > 0 ? 'success' : 'info'); }, onError: (error: any) => { const message = error?.message || '转积分失败'; setConvertError(message); showToast(message, 'error'); } });
  const withdrawalMutation = useMutation({ mutationFn: () => requestReferralWithdrawal({ amount: parsedWithdrawAmount, address: withdrawAddress, network: 'TRC20', paymentPassword: normalizedPaymentPassword }), onSuccess: (result) => { queryClient.setQueryData(['referrals', 'summary'], result.summary); queryClient.invalidateQueries({ queryKey: ['referrals', 'commissions'] }); queryClient.invalidateQueries({ queryKey: ['referrals', 'withdrawals'] }); setActiveRecordTab('withdrawals'); setIsWithdrawSheetOpen(false); resetWithdrawInputs(); showToast('提现申请已提交，等待人工审核', 'success'); }, onError: (error: any) => { const message = error?.message || '提现申请失败'; setPaymentError(message); showToast(message, 'error'); } });
  const canSetPaymentPassword = normalizedNewPaymentPassword.length >= 6 && normalizedNewPaymentPassword === normalizedConfirmPaymentPassword;
  const baseWithdrawalBusy = isSavingPaymentPassword || withdrawalMutation.isPending;
  const baseConversionBusy = convertMutation.isPending;

  function resetWithdrawInputs() { setWithdrawAmount(''); setWithdrawAddress(''); setPaymentPassword(''); setNewPaymentPassword(''); setConfirmPaymentPassword(''); setPaymentError(''); setPaymentPasswordSetupDone(false); }
  const warmReferralRulesSheet = () => { void loadReferralRulesSheet(); };
  const warmReferralInviteSheets = () => { void loadReferralInviteSheets(); };
  const openWithdrawSheet = () => { warmReferralInviteSheets(); if (!summary || summary.availableCommission <= 0) return showToast('暂无可提现返佣', 'info'); if (summary.availableCommission < summary.settings.minWithdrawAmount) return showToast(`最低提现 ${formatMoney(summary.settings.minWithdrawAmount)}U，当前可提现 ${formatMoney(summary.availableCommission)}U`, 'info'); setPaymentError(''); setWithdrawAmount(''); setIsWithdrawSheetOpen(true); };
  const openConvertSheet = () => { warmReferralInviteSheets(); if (!summary || summary.availableCommission <= 0) return showToast('暂无可转换返佣', 'info'); setConvertError(''); setConvertAmount(''); setIsConvertSheetOpen(true); };
  const closeWithdrawSheet = () => { if (baseWithdrawalBusy) return; setIsWithdrawSheetOpen(false); resetWithdrawInputs(); };
  const closeConvertSheet = () => { if (baseConversionBusy) return; setIsConvertSheetOpen(false); setConvertAmount(''); setConvertError(''); };
  const goFullRecords = (tab: ReferralRecordTab) => { navigate(`${APP_ROUTES.inviteRecords}?tab=${tab}`, { state: { from: APP_ROUTES.invite } }); };
  const handleConfirmWithdrawal = async () => {
    if (baseWithdrawalBusy) return;
    setPaymentError('');
    if (!summary || summary.availableCommission <= 0) return setPaymentError('暂无可提现返佣');
    if (parsedWithdrawAmount <= 0) return setPaymentError('请输入提现金额');
    if (parsedWithdrawAmount < summary.settings.minWithdrawAmount) return setPaymentError(`最低提现 ${formatMoney(summary.settings.minWithdrawAmount)}U`);
    if (parsedWithdrawAmount > summary.availableCommission) return setPaymentError(`最多可提现 ${formatMoney(summary.availableCommission)}U`);
    if (!withdrawAddress.trim()) return setPaymentError('请输入提现地址');
    if (needsPaymentPasswordSetup) {
      if (normalizedNewPaymentPassword.length < 6) return setPaymentError('支付密码至少需要6位');
      if (normalizedNewPaymentPassword !== normalizedConfirmPaymentPassword) return setPaymentError('两次输入的支付密码不一致');
      setIsSavingPaymentPassword(true);
      try {
        await updatePaymentPassword({ password: normalizedNewPaymentPassword });
        patchUser({ hasPaymentPassword: true });
        setPaymentPassword(normalizedNewPaymentPassword);
        setNewPaymentPassword('');
        setConfirmPaymentPassword('');
        setPaymentPasswordSetupDone(true);
        showToast('支付密码已设置，请确认本次提现', 'success');
      } catch (error: any) {
        const message = error?.message || '支付密码设置失败，请重试';
        setPaymentError(message);
        showToast(message, 'error');
      } finally {
        setIsSavingPaymentPassword(false);
      }
      return;
    }
    if (normalizedPaymentPassword.length < 6) return setPaymentError('请输入支付密码');
    await withdrawalMutation.mutateAsync().catch((): void => undefined);
  };
  const handleConfirmConversion = async () => {
    if (baseConversionBusy) return;
    setConvertError('');
    if (!summary || summary.availableCommission <= 0) return setConvertError('暂无可转换返佣');
    if (parsedConvertAmount <= 0) return setConvertError('请输入转换金额');
    if (parsedConvertAmount > summary.availableCommission) return setConvertError(`最多可转换 ${formatMoney(summary.availableCommission)}U`);
    if (previewConvertPoints <= 0) return setConvertError('转换金额不足以生成积分');
    await convertMutation.mutateAsync().catch((): void => undefined);
  };
  const { guarded: guardedConfirmWithdrawal, isPending: withdrawalGuardPending } = useInteractionGuard(handleConfirmWithdrawal, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 180,
    mode: 'drop',
  });
  const { guarded: guardedConfirmConversion, isPending: conversionGuardPending } = useInteractionGuard(handleConfirmConversion, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 180,
    mode: 'drop',
  });
  const refetchReferralSummary = async () => {
    await summaryQuery.refetch();
  };
  const { guarded: guardedRefetchReferralSummary, isPending: summaryRefetchGuardPending } = useInteractionGuard(refetchReferralSummary, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const withdrawalBusy = baseWithdrawalBusy || withdrawalGuardPending;
  const conversionBusy = baseConversionBusy || conversionGuardPending;
  const summaryRetryBusy = summaryQuery.isRefetching || summaryRefetchGuardPending;
  const canSubmitWithdrawal = Boolean(summary) && parsedWithdrawAmount >= (summary?.settings.minWithdrawAmount || 0) && parsedWithdrawAmount <= (summary?.availableCommission || 0) && Boolean(withdrawAddress.trim()) && !withdrawalBusy && (needsPaymentPasswordSetup ? canSetPaymentPassword : normalizedPaymentPassword.length >= 6);
  const canSubmitConversion = Boolean(summary) && parsedConvertAmount > 0 && parsedConvertAmount <= (summary?.availableCommission || 0) && previewConvertPoints > 0 && !conversionBusy;
  const copyValue = async (value: string, label: string) => { if (!value) return; try { await navigator.clipboard.writeText(value); showToast(`${label}已复制`, 'success'); } catch { showToast('复制失败，请手动复制', 'error'); } };

  if (summaryQuery.isLoading) return <LoadingBlock compact text="正在加载邀请数据" className="referral-page-loading" />;
  if (summaryQuery.isError || !summary) return <StateBlock title="邀请数据加载失败" description="网络恢复后可重新加载邀请页面。" tone="error" compact className="referral-page-state" action={<ActionButton type="button" variant="muted" size="sm" disabled={summaryRetryBusy} state={summaryRetryBusy ? 'loading' : 'idle'} onClick={() => void guardedRefetchReferralSummary()}>{summaryRetryBusy ? '加载中' : '重新加载'}</ActionButton>} />;

  const rateText = formatRate(summary.settings.commissionRate);
  const recordContent = activeRecordTab === 'relations'
    ? relationsQuery.isLoading
      ? <LoadingBlock compact text="正在加载邀请记录" />
      : visibleRelations.length
        ? <div className="record-list referral-record-list">{visibleRelations.map((item) => <RelationRow key={item.id} item={item} />)}</div>
        : <EmptyStateCard title="暂无记录" compact />
    : activeRecordTab === 'commissions'
      ? commissionsQuery.isLoading
        ? <LoadingBlock compact text="正在加载返佣记录" />
        : visibleCommissions.length
          ? <div className="record-list referral-record-list">{visibleCommissions.map((item) => <CommissionRow key={item.id} item={item} />)}</div>
          : <EmptyStateCard title="暂无记录" compact />
      : withdrawalsQuery.isLoading
        ? <LoadingBlock compact text="正在加载提现记录" />
        : visibleWithdrawals.length
          ? <div className="record-list referral-record-list">{visibleWithdrawals.map((item) => <WithdrawalRow key={item.id} item={item} />)}</div>
          : <EmptyStateCard title="暂无记录" compact />;

  return (
    <div className="referral-page-content">
      <section className="referral-hero-card" aria-label="邀请返佣概览">
        <div className="referral-hero-copy">
          <h1>邀请注册，返现{rateText}</h1>
          <p>通过你的邀请注册后，后续每笔充值成功都会返佣。</p>
        </div>
        <div className="referral-available-row">
          <div className="referral-available-copy">
            <strong className="referral-available-amount"><MoneyValue value={summary.availableCommission} /></strong>
          </div>
          <div className="referral-available-actions">
            <ActionButton type="button" variant="brand" size="sm" disabled={summary.availableCommission <= 0 || withdrawalBusy} onPointerEnter={warmReferralInviteSheets} onFocus={warmReferralInviteSheets} onClick={openWithdrawSheet}>去提现</ActionButton>
            <ActionButton type="button" variant="muted" size="sm" disabled={summary.availableCommission <= 0 || conversionBusy} onPointerEnter={warmReferralInviteSheets} onFocus={warmReferralInviteSheets} onClick={openConvertSheet}>换积分</ActionButton>
          </div>
        </div>
        <HeroStats summary={summary} />
      </section>

      <SurfaceSectionCard as="section" compact className="referral-share-card" aria-label="邀请链接">
        <div className="referral-code-panel">
          <div><span>邀请码</span><strong>{summary.inviteCode}</strong></div>
          <ActionButton type="button" variant="muted" size="sm" onClick={() => void copyValue(summary.inviteCode, '邀请码')}><Copy aria-hidden="true" /> 复制</ActionButton>
        </div>
        <div className="referral-link-panel">
          <span className="referral-link-text">{inviteLink}</span>
          <ActionButton type="button" variant="muted" size="sm" onClick={() => void copyValue(inviteLink, '邀请链接')}><Copy aria-hidden="true" /> 复制</ActionButton>
        </div>
      </SurfaceSectionCard>

      <section className="referral-record-section" aria-label="邀请与返佣记录">
        <div className="referral-record-tabs-section ui-page-tabs-section scrollbar-hide">
          <SegmentTabs items={REFERRAL_RECORD_TABS} activeKey={activeRecordTab} onChange={(key) => setActiveRecordTab(key as ReferralRecordTab)} ariaLabel="邀请记录分类" className="ui-page-tabs-bar referral-record-tabbar" showLabels labelDisplay="full" />
        </div>
        <div className="referral-record-panel">
          {recordContent}
          {hasMoreActiveRecords ? <RecordMoreLink label={referralRecordMoreLabel(activeRecordTab)} onClick={() => goFullRecords(activeRecordTab)} /> : null}
        </div>
      </section>

      {isRulesOpen ? (
        <Suspense fallback={null}>
          <LazyReferralRulesSheet summary={summary} onClose={onCloseRules} />
        </Suspense>
      ) : null}

      {isConvertSheetOpen ? (
        <Suspense fallback={null}>
          <LazyReferralConvertSheet open={isConvertSheetOpen} summary={summary} amount={convertAmount} error={convertError} isBusy={conversionBusy} canSubmit={canSubmitConversion} previewPoints={previewConvertPoints} onAmountChange={(value) => { setConvertAmount(value); if (convertError) setConvertError(''); }} onClose={closeConvertSheet} onConfirm={() => void guardedConfirmConversion()} />
        </Suspense>
      ) : null}

      {isWithdrawSheetOpen ? (
        <Suspense fallback={null}>
          <LazyReferralWithdrawSheet open={isWithdrawSheetOpen} summary={summary} amount={withdrawAmount} address={withdrawAddress} paymentPassword={paymentPassword} newPaymentPassword={newPaymentPassword} confirmPaymentPassword={confirmPaymentPassword} paymentError={paymentError} isBusy={withdrawalBusy} isSavingPaymentPassword={isSavingPaymentPassword} needsPaymentPasswordSetup={needsPaymentPasswordSetup} canSubmit={canSubmitWithdrawal} onAmountChange={(value) => { setWithdrawAmount(value); if (paymentError) setPaymentError(''); }} onAddressChange={(value) => { setWithdrawAddress(value); if (paymentError) setPaymentError(''); }} onPaymentPasswordChange={(value) => { setPaymentPassword(value); if (paymentError) setPaymentError(''); }} onNewPaymentPasswordChange={(value) => { setNewPaymentPassword(value); if (paymentError) setPaymentError(''); }} onConfirmPaymentPasswordChange={(value) => { setConfirmPaymentPassword(value); if (paymentError) setPaymentError(''); }} onClose={closeWithdrawSheet} onConfirm={() => void guardedConfirmWithdrawal()} />
        </Suspense>
      ) : null}
    </div>
  );
}
