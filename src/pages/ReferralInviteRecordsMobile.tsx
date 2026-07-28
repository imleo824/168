import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import EmptyStateCard from '@/ui/EmptyStateCard';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import ActionButton from '@/ui/ActionButton';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import {
  getReferralCommissions,
  getReferralRelations,
  getReferralWithdrawals,
} from '@/services/referral';
import {
  CommissionRow,
  RelationRow,
  WithdrawalRow,
} from '@/features/sponsor/ReferralInviteRecordRows';
import {
  normalizeReferralRecordTab,
  type ReferralRecordTab,
} from '@/features/sponsor/referralInviteTabs';

import '@/features/sponsor/ReferralRoute.css';

const REFERRAL_RECORD_PAGE_LIMIT = 100;

function tabTitle(tab: ReferralRecordTab) {
  if (tab === 'commissions') return '返佣记录';
  if (tab === 'withdrawals') return '提现记录';
  return '邀请记录';
}

export default function ReferralInviteRecordsMobile() {
  const [searchParams] = useSearchParams();
  const activeTab = normalizeReferralRecordTab(searchParams.get('tab'));
  const pageTitle = tabTitle(activeTab);

  const relationsQuery = useQuery({
    queryKey: ['referrals', 'relations', 'records-page'],
    queryFn: () => getReferralRelations(REFERRAL_RECORD_PAGE_LIMIT),
    staleTime: 1000 * 30,
    enabled: activeTab === 'relations',
  });
  const commissionsQuery = useQuery({
    queryKey: ['referrals', 'commissions', 'records-page'],
    queryFn: () => getReferralCommissions(REFERRAL_RECORD_PAGE_LIMIT),
    staleTime: 1000 * 30,
    enabled: activeTab === 'commissions',
  });
  const withdrawalsQuery = useQuery({
    queryKey: ['referrals', 'withdrawals', 'records-page'],
    queryFn: () => getReferralWithdrawals(REFERRAL_RECORD_PAGE_LIMIT),
    staleTime: 1000 * 30,
    enabled: activeTab === 'withdrawals',
  });

  const activeQuery = activeTab === 'commissions'
    ? commissionsQuery
    : activeTab === 'withdrawals'
      ? withdrawalsQuery
      : relationsQuery;
  const refetchActiveRecords = async () => {
    await activeQuery.refetch();
  };
  const { guarded: guardedRefetchActiveRecords, isPending: refetchGuardPending } = useInteractionGuard(refetchActiveRecords, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const retryBusy = activeQuery.isRefetching || refetchGuardPending;

  const retryAction = (
    <ActionButton
      type="button"
      variant="muted"
      size="sm"
      disabled={retryBusy}
      state={retryBusy ? 'loading' : 'idle'}
      onClick={() => void guardedRefetchActiveRecords()}
    >
      {retryBusy ? '加载中' : '重新加载'}
    </ActionButton>
  );

  const content = useMemo(() => {
    if (activeTab === 'commissions') {
      if (commissionsQuery.isLoading) return <LoadingBlock compact text="正在加载返佣记录" />;
      if (commissionsQuery.isError) return <StateBlock title="返佣记录加载失败" description="网络恢复后可重新加载。" tone="error" compact action={retryAction} />;
      if (!commissionsQuery.data?.length) return <EmptyStateCard title="暂无记录" compact />;
      return <div className="record-list referral-record-list">{commissionsQuery.data.map((item) => <CommissionRow key={item.id} item={item} />)}</div>;
    }
    if (activeTab === 'withdrawals') {
      if (withdrawalsQuery.isLoading) return <LoadingBlock compact text="正在加载提现记录" />;
      if (withdrawalsQuery.isError) return <StateBlock title="提现记录加载失败" description="网络恢复后可重新加载。" tone="error" compact action={retryAction} />;
      if (!withdrawalsQuery.data?.length) return <EmptyStateCard title="暂无记录" compact />;
      return <div className="record-list referral-record-list">{withdrawalsQuery.data.map((item) => <WithdrawalRow key={item.id} item={item} />)}</div>;
    }
    if (relationsQuery.isLoading) return <LoadingBlock compact text="正在加载邀请记录" />;
    if (relationsQuery.isError) return <StateBlock title="邀请记录加载失败" description="网络恢复后可重新加载。" tone="error" compact action={retryAction} />;
    if (!relationsQuery.data?.length) return <EmptyStateCard title="暂无记录" compact />;
    return <div className="record-list referral-record-list">{relationsQuery.data.map((item) => <RelationRow key={item.id} item={item} />)}</div>;
  }, [activeTab, commissionsQuery.data, commissionsQuery.isError, commissionsQuery.isLoading, relationsQuery.data, relationsQuery.isError, relationsQuery.isLoading, retryAction, withdrawalsQuery.data, withdrawalsQuery.isError, withdrawalsQuery.isLoading]);

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="referral-page surface-page">
      <SEO title={`${pageTitle}｜推推`} description="查看邀请好友、返佣和提现完整记录。" noindex />
      <PageHeader title={pageTitle} showBack titleAlign="center" />
      <PageContentShell as="main" className="referral-page-main referral-records-page-main ui-app-page-main">
        <section className="referral-record-section" aria-label={pageTitle} aria-busy={activeQuery.isLoading}>
          {content}
        </section>
      </PageContentShell>
    </AppPage>
  );
}
