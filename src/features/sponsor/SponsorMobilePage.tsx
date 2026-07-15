import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HandCoins,
  Plus,
  ReceiptText,
} from 'lucide-react';

import SEO from '@/platform/SEO';
import { APP_ROUTES } from '@/app/routePaths';
import AppPage from '@/ui/AppPage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageHeader from '@/ui/PageHeader';
import ActionButton from '@/ui/ActionButton';
import EmptyStateCard from '@/ui/EmptyStateCard';
import { PageLoadingState, StateBlock } from '@/ui/LoadingState';
import PageContentShell from '@/ui/PageContentShell';
import SegmentTabs from '@/ui/SegmentTabs';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import RecordMoreLink from '@/ui/RecordMoreLink';
import { Skeleton } from '@/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/hooks/useData';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { getMyPromotionEffects, getMyPromotions, getRechargeOrdersPage, getTransactionsPage } from '@/services/api';
import LedgerRecordCard from '@/features/records/LedgerRecordCard';
import { buildLedgerRecords } from '@/features/records/ledgerDisplay';
import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';
import PromotionRecordCard from '@/features/promote/PromotionRecordCard';
import ReferralInviteBanner from '@/features/sponsor/ReferralInviteBanner';
import TuiPlusBenefitPromptDialog from '@/features/tui-plus/TuiPlusBenefitPromptDialog';
import { buildTuiPlusBenefitRouteState, isTuiPlusActive } from '@/features/tui-plus/tuiPlusBenefits';
import {
  groupPromotionBookings,
  hasAnyPromotionEffectStats,
} from '@/features/promote/promotionDisplayUtils';
import {
  dateKeyToLocalDate,
  getPlatformDateKey,
} from '@/features/promote/promoteBookingUtils';

type SponsorRecordTab = 'effects' | 'ledger' | 'promotions';

const SPONSOR_PREVIEW_STALE_TIME = 1000 * 30;
const SPONSOR_PREVIEW_LIMIT = 4;
const SPONSOR_EFFECT_PREVIEW_DAYS = 5;
const DEFAULT_RECORD_TAB: SponsorRecordTab = 'effects';
const SPONSOR_NAV_GUARD = {
  policy: 'critical' as const,
  cooldownMs: 520,
  minPendingMs: 120,
  mode: 'drop' as const,
};
const SPONSOR_RECORD_TABS: Array<{ key: SponsorRecordTab; label: string }> = [
  { key: 'effects', label: '效果分析' },
  { key: 'ledger', label: '积分记录' },
  { key: 'promotions', label: '曝光记录' },
];

function getRechargePointsPerUsdt(config: unknown) {
  const raw = (config as { recharge_points_per_usdt?: unknown } | null | undefined)?.recharge_points_per_usdt;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecentPromotionEffectRange(days: number) {
  const end = dateKeyToLocalDate(getPlatformDateKey());
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, days) + 1);
  return {
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
  };
}

export default function SponsorMobilePage() {
  const navigate = useNavigate();
  const { user, requireAuth, loading: isAuthLoading, showToast } = useAuth();
  const { data: config } = useConfig();
  const isLoggedIn = Boolean(user?.id);
  const sponsorReturnState = { from: APP_ROUTES.sponsor };
  const [activeRecordTab, setActiveRecordTab] = useState<SponsorRecordTab>(DEFAULT_RECORD_TAB);
  const [isTuiPlusPromptOpen, setIsTuiPlusPromptOpen] = useState(false);
  const pointsPerUsdt = getRechargePointsPerUsdt(config);
  const effectPreviewRange = useMemo(() => getRecentPromotionEffectRange(SPONSOR_EFFECT_PREVIEW_DAYS), []);

  const transactionsQuery = useQuery({
    queryKey: ['sponsor', 'transactions-preview'],
    queryFn: () => getTransactionsPage({ limit: SPONSOR_PREVIEW_LIMIT + 1 }),
    enabled: isLoggedIn,
    staleTime: SPONSOR_PREVIEW_STALE_TIME,
  });

  const rechargeOrdersQuery = useQuery({
    queryKey: ['sponsor', 'recharge-orders-preview'],
    queryFn: () => getRechargeOrdersPage({ limit: SPONSOR_PREVIEW_LIMIT + 1 }),
    enabled: isLoggedIn,
    staleTime: SPONSOR_PREVIEW_STALE_TIME,
  });

  const promotionsQuery = useQuery({
    queryKey: ['sponsor', 'promotions-preview'],
    queryFn: getMyPromotions,
    enabled: isLoggedIn,
    staleTime: SPONSOR_PREVIEW_STALE_TIME,
  });

  const promotionEffectsQuery = useQuery({
    queryKey: ['sponsor', 'promotion-effects', effectPreviewRange.startDate, effectPreviewRange.endDate],
    queryFn: () => getMyPromotionEffects({ ...effectPreviewRange, includeItems: false }),
    enabled: isLoggedIn,
    staleTime: SPONSOR_PREVIEW_STALE_TIME,
  });

  const recentLedgerRecords = useMemo(() => buildLedgerRecords(transactionsQuery.data?.items, rechargeOrdersQuery.data?.items), [rechargeOrdersQuery.data?.items, transactionsQuery.data?.items]);
  const visibleLedgerRecords = useMemo(() => recentLedgerRecords.slice(0, SPONSOR_PREVIEW_LIMIT), [recentLedgerRecords]);
  const hasMoreLedgerRecords = recentLedgerRecords.length > SPONSOR_PREVIEW_LIMIT;
  const promotionGroups = useMemo(() => groupPromotionBookings(promotionsQuery.data || []), [promotionsQuery.data]);
  const recentPromotionGroups = useMemo(() => promotionGroups.slice(0, SPONSOR_PREVIEW_LIMIT), [promotionGroups]);
  const hasMorePromotionGroups = promotionGroups.length > SPONSOR_PREVIEW_LIMIT;
  const recordsLoading = transactionsQuery.isLoading || rechargeOrdersQuery.isLoading;
  const recordsError = transactionsQuery.isError || rechargeOrdersQuery.isError;
  const hasEffectTotals = hasAnyPromotionEffectStats(promotionEffectsQuery.data?.totals);
  const visibleEffectDailyItems = useMemo(() => [...(promotionEffectsQuery.data?.dailyItems || [])].reverse(), [promotionEffectsQuery.data?.dailyItems]);

  const goRecharge = () => navigate(APP_ROUTES.recharge, { state: sponsorReturnState });
  const goPromote = () => {
    if (!isTuiPlusActive(user)) {
      setIsTuiPlusPromptOpen(true);
      return;
    }
    navigate(APP_ROUTES.promote, { state: sponsorReturnState });
  };
  const goInvite = () => navigate(APP_ROUTES.invite, { state: sponsorReturnState });
  const goPromoteHistory = () => navigate(APP_ROUTES.promotions, { state: { ...sponsorReturnState, sponsorEntry: true } });
  const goPromotionEffects = () => navigate(APP_ROUTES.promotionEffects, { state: sponsorReturnState });
  const goTransactions = () => navigate(APP_ROUTES.transactions, { state: sponsorReturnState });
  const closeTuiPlusPrompt = () => setIsTuiPlusPromptOpen(false);
  const confirmTuiPlusPrompt = () => {
    setIsTuiPlusPromptOpen(false);
    navigate(APP_ROUTES.tuiPlus, { state: buildTuiPlusBenefitRouteState('promotionBooking', APP_ROUTES.sponsor) });
  };
  const { guarded: guardedGoRecharge } = useInteractionGuard(goRecharge, SPONSOR_NAV_GUARD);
  const { guarded: guardedGoPromote } = useInteractionGuard(goPromote, SPONSOR_NAV_GUARD);
  const { guarded: guardedGoInvite } = useInteractionGuard(goInvite, SPONSOR_NAV_GUARD);
  const { guarded: guardedGoPromoteHistory } = useInteractionGuard(goPromoteHistory, SPONSOR_NAV_GUARD);
  const { guarded: guardedGoPromotionEffects } = useInteractionGuard(goPromotionEffects, SPONSOR_NAV_GUARD);
  const { guarded: guardedGoTransactions } = useInteractionGuard(goTransactions, SPONSOR_NAV_GUARD);
  const refetchActiveSponsorRecords = async () => {
    if (activeRecordTab === 'effects') {
      await promotionEffectsQuery.refetch();
      return;
    }
    if (activeRecordTab === 'promotions') {
      await promotionsQuery.refetch();
      return;
    }
    await Promise.all([
      transactionsQuery.refetch(),
      rechargeOrdersQuery.refetch(),
    ]);
  };
  const { guarded: guardedRefetchActiveSponsorRecords, isPending: refetchRecordsGuardPending } = useInteractionGuard(refetchActiveSponsorRecords, {
    policy: 'optimistic',
    cooldownMs: 520,
    minPendingMs: 160,
    mode: 'drop',
  });
  const activeRecordRefetching = activeRecordTab === 'effects'
    ? promotionEffectsQuery.isRefetching
    : activeRecordTab === 'promotions'
      ? promotionsQuery.isRefetching
      : transactionsQuery.isRefetching || rechargeOrdersQuery.isRefetching;
  const retryRecordsBusy = activeRecordRefetching || refetchRecordsGuardPending;
  const retryRecordsAction = (
    <ActionButton
      type="button"
      variant="muted"
      size="sm"
      disabled={retryRecordsBusy}
      state={retryRecordsBusy ? 'loading' : 'idle'}
      onClick={() => void guardedRefetchActiveSponsorRecords()}
    >
      {retryRecordsBusy ? '加载中' : '重新加载'}
    </ActionButton>
  );
  const handleCopyRecordId = (value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => showToast('订单号已复制', 'success'),
      () => showToast('复制失败，请手动复制', 'error'),
    );
  };

  if (!isAuthLoading && !user) {
    return (
      <AppPage mobileAddressBarScroll bottomSafe className="sponsor-page surface-page">
        <SEO title="买曝光｜推推" description="登录后管理推推积分、充积分、买曝光和曝光效果。" noindex />
        <PageHeader title="买曝光" showBack={false} titleAlign="center" />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <AuthRequiredState
            icon={<HandCoins />}
            context="sponsor"
            density="compact"
            title="登录后买曝光"
            description="查看积分余额、充积分入口、曝光服务和积分记录。"
            actionLabel="登录 / 注册"
            previewItems={[
              { icon: <HandCoins aria-hidden="true" />, label: '积分余额', description: '查看当前积分和近期变化' },
              { icon: <Plus aria-hidden="true" />, label: '充积分', description: '快速进入充积分流程' },
              { icon: <ReceiptText aria-hidden="true" />, label: '积分记录', description: '追踪充积分、买曝光和消费记录' },
            ]}
            onAction={() => requireAuth()}
            tone="open"
          />
        </PageContentShell>
      </AppPage>
    );
  }

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="sponsor-page surface-page">
      <SEO title="买曝光｜推推" description="管理推推积分、充积分、买曝光和曝光效果。" noindex />
      <PageHeader title="买曝光" showBack={false} titleAlign="center" />

      <PageContentShell as="main" className="sponsor-workbench ui-app-page-main">
        <section className="sponsor-hero" aria-label="买曝光工具台">
          <div className="sponsor-balance-block">
            {isAuthLoading ? <Skeleton className="sponsor-balance-skeleton" /> : (
              <p className="sponsor-balance-value">{user?.points ?? 0}<span>积分</span></p>
            )}
          </div>

          <div className="sponsor-primary-actions">
            <ActionButton type="button" variant="brand" onClick={() => void guardedGoRecharge()} className="sponsor-primary-action">充积分</ActionButton>
            <ActionButton type="button" variant="brand" onClick={() => void guardedGoPromote()} className="sponsor-primary-action">买曝光</ActionButton>
          </div>
        </section>

        <ReferralInviteBanner onClick={() => void guardedGoInvite()} />

        <div className="ui-page-tabs-section ui-layer-sticky-tab scrollbar-hide">
          <SegmentTabs items={SPONSOR_RECORD_TABS} activeKey={activeRecordTab} onChange={(key) => setActiveRecordTab(key as SponsorRecordTab)} ariaLabel="曝光记录分类" className="ui-page-tabs-bar" showLabels labelDisplay="full" />
        </div>

        <section className="sponsor-record-section" aria-label="曝光记录内容">
          {activeRecordTab === 'effects' ? (
            <div id="sponsor-effects-panel" role="tabpanel" className="sponsor-record-panel">
              {promotionEffectsQuery.isLoading || isAuthLoading ? <PageLoadingState text="正在加载曝光效果" className="sponsor-state-block" /> : promotionEffectsQuery.isError ? (
                <StateBlock title="曝光效果加载失败" description="网络恢复后可重新查看曝光效果。" tone="error" compact className="sponsor-state-block" action={retryRecordsAction} />
              ) : promotionEffectsQuery.data && hasEffectTotals ? (
                <>
                  <div className="record-list sponsor-record-list sponsor-effect-list" aria-label={`最近${SPONSOR_EFFECT_PREVIEW_DAYS}天曝光效果`}>
                    {visibleEffectDailyItems.map((item) => (
                      <SurfaceSectionCard key={item.date} as="article" compact className="record-card promotion-effects-day-card sponsor-effect-card">
                        <div className="record-card-row"><div className="record-card-main"><p className="record-title record-card-line record-card-line--title">{item.date}</p><PromotionEffectStatsRow stats={item.metrics} className="sponsor-row-effect-stats" /></div></div>
                      </SurfaceSectionCard>
                    ))}
                  </div>
                  <RecordMoreLink label="查看更多效果分析" onClick={() => void guardedGoPromotionEffects()} />
                </>
              ) : <EmptyStateCard title="暂无曝光效果" description={`最近${SPONSOR_EFFECT_PREVIEW_DAYS}天还没有曝光数据。`} compact className="sponsor-empty-state" />}
            </div>
          ) : activeRecordTab === 'promotions' ? (
            <div id="sponsor-promotions-panel" role="tabpanel" className="sponsor-record-panel">
              {promotionsQuery.isLoading || isAuthLoading ? <PageLoadingState text="正在加载曝光记录" className="sponsor-state-block" /> : promotionsQuery.isError ? (
                <StateBlock title="曝光记录加载失败" description="网络恢复后可重新查看投放记录。" tone="error" compact className="sponsor-state-block" action={retryRecordsAction} />
              ) : recentPromotionGroups.length > 0 ? (
                <>
                  <div className="record-list sponsor-record-list">{recentPromotionGroups.map((group) => <PromotionRecordCard key={group.key} group={group} onCopyRecordId={handleCopyRecordId} />)}</div>
                  {hasMorePromotionGroups ? <RecordMoreLink label="查看更多曝光记录" onClick={() => void guardedGoPromoteHistory()} /> : null}
                </>
              ) : <EmptyStateCard title="暂无曝光记录" description="买曝光后会在这里展示。" compact className="sponsor-empty-state" action={<ActionButton type="button" variant="muted" size="sm" onClick={() => void guardedGoPromote()}>买曝光</ActionButton>} />}
            </div>
          ) : (
            <div id="sponsor-ledger-panel" role="tabpanel" className="sponsor-record-panel">
              {recordsLoading || isAuthLoading ? <PageLoadingState text="正在加载积分记录" className="sponsor-state-block" /> : recordsError ? (
                <StateBlock title="积分记录加载失败" description="网络恢复后可重新查看充积分和消费记录。" tone="error" compact className="sponsor-state-block" action={retryRecordsAction} />
              ) : visibleLedgerRecords.length > 0 ? (
                <>
                  <div className="record-list sponsor-record-list">{visibleLedgerRecords.map((record) => <LedgerRecordCard key={`${record.kind}-${record.id}`} record={record} pointsPerUsdt={pointsPerUsdt} onCopyRecordId={handleCopyRecordId} />)}</div>
                  {hasMoreLedgerRecords ? <RecordMoreLink label="查看更多积分记录" onClick={() => void guardedGoTransactions()} /> : null}
                </>
              ) : <EmptyStateCard title="暂无积分记录" description="充积分到账或买曝光消费后会在这里展示。" compact className="sponsor-empty-state" action={<ActionButton type="button" variant="muted" size="sm" onClick={() => void guardedGoRecharge()}>充积分</ActionButton>} />}
            </div>
          )}
        </section>
      </PageContentShell>

      <TuiPlusBenefitPromptDialog
        open={isTuiPlusPromptOpen}
        benefit="promotionBooking"
        onClose={closeTuiPlusPrompt}
        onConfirm={confirmTuiPlusPrompt}
      />
    </AppPage>
  );
}
