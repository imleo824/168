import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';

import SEO from '@/platform/SEO';
import { APP_ROUTES } from '@/app/routePaths';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import ActionButton from '@/ui/ActionButton';
import EmptyStateCard from '@/ui/EmptyStateCard';
import PageContentShell from '@/ui/PageContentShell';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import { getMyPromotionEffects } from '@/services/api';
import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';
import { hasAnyPromotionEffectStats } from '@/features/promote/promotionDisplayUtils';
import { dateKeyToLocalDate, getPlatformDateKey } from '@/features/promote/promoteBookingUtils';

type PromotionEffectsHistoryRouteState = {
  from?: string;
};

const EFFECT_HISTORY_DEFAULT_DAYS = 30;
const EFFECT_HISTORY_PRESETS = [7, 30, 90] as const;

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = dateKeyToLocalDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecentDateRange(days: number) {
  const end = dateKeyToLocalDate(getPlatformDateKey());
  const start = new Date(end);
  start.setDate(end.getDate() - Math.max(1, days) + 1);
  return {
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
  };
}

function isSameDateRange(range: { startDate: string; endDate: string }, days: number) {
  const preset = getRecentDateRange(days);
  return range.startDate === preset.startDate && range.endDate === preset.endDate;
}

export default function PromotionEffectsHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as PromotionEffectsHistoryRouteState | null;
  const returnTo = normalizePath(routeState?.from) || APP_ROUTES.sponsor;
  const [effectRange, setEffectRange] = useState(() => getRecentDateRange(EFFECT_HISTORY_DEFAULT_DAYS));
  const [isDatePanelOpen, setIsDatePanelOpen] = useState(false);

  const promotionEffectsQuery = useQuery({
    queryKey: ['promotion-effects-history', effectRange.startDate, effectRange.endDate],
    queryFn: () => getMyPromotionEffects({ ...effectRange, includeItems: false }),
  });

  const dailyItems = useMemo(() => {
    return [...(promotionEffectsQuery.data?.dailyItems || [])].reverse();
  }, [promotionEffectsQuery.data?.dailyItems]);

  const hasEffectData = hasAnyPromotionEffectStats(promotionEffectsQuery.data?.totals);

  const activePresetDays = EFFECT_HISTORY_PRESETS.find((days) => isSameDateRange(effectRange, days));

  const updateEffectRange = (field: 'startDate' | 'endDate', value: string) => {
    setEffectRange((prev) => {
      if (!parseDateKey(value)) return prev;
      const next = { ...prev, [field]: value };
      const start = parseDateKey(next.startDate);
      const end = parseDateKey(next.endDate);
      if (!start || !end || start.getTime() <= end.getTime()) return next;
      return { startDate: value, endDate: value };
    });
  };

  const dateFilterTrigger = (
    <button
      type="button"
      className="promotion-effects-date-trigger ui-topbar-compact-action pressable"
      aria-label="选择效果分析日期范围"
      aria-expanded={isDatePanelOpen}
      aria-controls="promotion-effects-date-panel"
      onClick={() => setIsDatePanelOpen((current) => !current)}
    >
      <CalendarDays className="promotion-effects-date-trigger-icon" aria-hidden="true" />
      <span>日期</span>
    </button>
  );

  return (
    <>
      <SEO title="效果分析｜推推" description="查看推广效果累计数据和每日明细。" noindex />
      <AppPage bottomSafe className="promote-mobile-page promote-page promotion-effects-page surface-page">
        <PageHeader
          title="效果分析"
          onBack={() => navigate(returnTo, { replace: true })}
          right={dateFilterTrigger}
          rightClassName="promotion-effects-topbar-filter-slot"
        />

        <PageContentShell className="record-page-shell ui-app-page-main">
          {isDatePanelOpen ? (
            <section
              id="promotion-effects-date-panel"
              className="promotion-effects-date-panel"
              aria-label="效果分析日期范围"
            >
              <div className="promotion-effects-date-presets" aria-label="快捷日期范围">
                {EFFECT_HISTORY_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className="promotion-effects-date-preset pressable"
                    data-state={activePresetDays === days ? 'active' : 'idle'}
                    onClick={() => setEffectRange(getRecentDateRange(days))}
                  >
                    近{days}天
                  </button>
                ))}
              </div>

              <div className="promotion-effects-date-fields">
                <label className="promotion-effects-date-field">
                  <span>开始日期</span>
                  <input
                    type="date"
                    value={effectRange.startDate}
                    max={effectRange.endDate}
                    onChange={(event) => updateEffectRange('startDate', event.target.value)}
                    className="promotion-effects-date-input ui-control"
                  />
                </label>
                <label className="promotion-effects-date-field">
                  <span>结束日期</span>
                  <input
                    type="date"
                    value={effectRange.endDate}
                    min={effectRange.startDate}
                    onChange={(event) => updateEffectRange('endDate', event.target.value)}
                    className="promotion-effects-date-input ui-control"
                  />
                </label>
              </div>
            </section>
          ) : null}

          {promotionEffectsQuery.isLoading ? (
            <LoadingBlock compact text="正在加载效果分析" className="record-state-block" />
          ) : promotionEffectsQuery.isError ? (
            <StateBlock
              title="效果分析加载失败"
              description="网络恢复后可重新查询推广效果。"
              tone="error"
              compact
              className="record-state-block"
              action={
                <ActionButton
                  type="button"
                  variant="muted"
                  size="sm"
                  onClick={() => {
                    void promotionEffectsQuery.refetch();
                  }}
                >
                  重新加载
                </ActionButton>
              }
            />
          ) : !hasEffectData ? (
            <EmptyStateCard
              title="暂无效果数据"
              description="当前日期范围内还没有可展示的推广效果。"
              className="record-empty-state"
            />
          ) : (
            <div className="record-list promotion-effects-history-list">
              <SurfaceSectionCard as="section" compact className="record-card promotion-effects-day-card promotion-effects-summary-card">
                <div className="record-card-row">
                  <div className="record-card-main">
                    <p className="record-time">历史累计数据</p>
                    <p className="record-title">{promotionEffectsQuery.data?.range.startDate} 至 {promotionEffectsQuery.data?.range.endDate}</p>
                    <PromotionEffectStatsRow stats={promotionEffectsQuery.data?.totals} className="record-effect-stats" />
                  </div>
                </div>
              </SurfaceSectionCard>

              {dailyItems.map((item) => (
                <SurfaceSectionCard key={item.date} as="article" compact className="record-card promotion-effects-day-card">
                  <div className="record-card-row">
                    <div className="record-card-main">
                      <p className="record-title">{item.date}</p>
                      <PromotionEffectStatsRow stats={item.metrics} className="record-effect-stats" />
                    </div>
                  </div>
                </SurfaceSectionCard>
              ))}
            </div>
          )}
        </PageContentShell>
      </AppPage>
    </>
  );
}
