import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, CalendarClock, CheckCircle2, Crown, Globe2, Link2, Radio, Send, Sparkles, TrendingUp } from 'lucide-react';

import { APP_ROUTES } from '@/app/routePaths';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import SEO from '@/platform/SEO';
import { ApiError, getTuiPlusStatus, purchaseTuiPlus, startTuiPlusTrial } from '@/services/api';
import type { TuiPlusStatusPayload } from '@/types';
import ActionButton from '@/ui/ActionButton';
import AppPage from '@/ui/AppPage';
import PageContentShell from '@/ui/PageContentShell';
import PageHeader from '@/ui/PageHeader';
import { InlineSpinner, LoadingBlock } from '@/ui/LoadingState';
import { TUI_PLUS_BENEFIT_ITEMS } from '../../shared/tuiPlusBenefits.mjs';

import '@/features/tui-plus/TuiPlusRoute.css';

const fallbackStatus: TuiPlusStatusPayload = {
  active: false,
  status: 'NONE',
  plan: null,
  expiresAt: null,
  trialUsed: false,
  benefits: {
    officialTelegramSync: false,
    ownTelegramAutoCrawl: false,
    profileWebsite: false,
    profileContact: false,
    promotionBooking: false,
    postContactUnlimited: false,
    postPromotionLink: false,
    rankingBoostPercent: 0,
    avatarRing: false,
  },
  usage: { ownedChannelsUsed: 0, ownedChannelsLimit: 0, ownedWebsitesUsed: 0, ownedWebsitesLimit: 0, ownedContactsUsed: 0, ownedContactsLimit: 0 },
  channels: [],
  websites: [],
  contacts: [],
};

type PaidPlan = 'MONTHLY' | 'YEARLY';
type PlanCard = {
  plan: PaidPlan;
  label: string;
  pricePoints: number;
  priceUsdt: number;
  pointsPerUsdt: number;
  durationDays: number;
  discountPercent?: number;
};

const benefitIconMap = {
  rankingBoost: <TrendingUp aria-hidden="true" />,
  postContact: <AtSign aria-hidden="true" />,
  postPromotionLink: <Link2 aria-hidden="true" />,
  promotionBooking: <CalendarClock aria-hidden="true" />,
  profileWebsite: <Globe2 aria-hidden="true" />,
  profileTelegramChannel: <Radio aria-hidden="true" />,
  officialTelegramSync: <Send aria-hidden="true" />,
  memberIdentity: <Sparkles aria-hidden="true" />,
} as const;

const benefitRows = TUI_PLUS_BENEFIT_ITEMS.map((item) => ({
  ...item,
  icon: benefitIconMap[item.key as keyof typeof benefitIconMap] || <Sparkles aria-hidden="true" />,
}));
const SINGLE_PROFILE_LINK_LIMIT = 1;

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function numberValue(raw: unknown, fallback: number) {
  const next = Number(raw);
  return Number.isFinite(next) ? next : fallback;
}

function positiveNumber(raw: unknown, fallback: number) {
  const value = numberValue(raw, fallback);
  return value > 0 ? value : fallback;
}

function hasPlanPayload(status: TuiPlusStatusPayload | null) {
  const plans = asObject(status?.plans);
  const monthly = asObject(plans.monthly);
  const yearly = asObject(plans.yearly);
  return Number(monthly.pricePoints) > 0 && Number(yearly.pricePoints) > 0;
}

function normalizeStatusPayload(payload: TuiPlusStatusPayload): TuiPlusStatusPayload {
  return {
    ...fallbackStatus,
    ...payload,
    benefits: { ...fallbackStatus.benefits, ...(payload?.benefits || {}) },
    usage: { ...fallbackStatus.usage, ...(payload?.usage || {}) },
    channels: Array.isArray(payload?.channels) ? payload.channels.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
    websites: Array.isArray(payload?.websites) ? payload.websites.slice(0, SINGLE_PROFILE_LINK_LIMIT) : [],
    contacts: Array.isArray(payload?.contacts) ? payload.contacts : [],
  };
}

function planFromPayload(status: TuiPlusStatusPayload | null, key: 'monthly' | 'yearly'): PlanCard {
  const raw = asObject(asObject(status?.plans)[key]);
  const fallback = key === 'yearly'
    ? { plan: 'YEARLY' as const, label: '年付', pricePoints: 19900, priceUsdt: 1990, pointsPerUsdt: 10, durationDays: 365, discountPercent: 13 }
    : { plan: 'MONTHLY' as const, label: '月付', pricePoints: 1900, priceUsdt: 190, pointsPerUsdt: 10, durationDays: 30 };
  const pricePoints = positiveNumber(raw.pricePoints, fallback.pricePoints);
  const pointsPerUsdt = positiveNumber(raw.pointsPerUsdt, fallback.pointsPerUsdt);
  const priceUsdt = numberValue(raw.priceUsdt, Math.floor((pricePoints / pointsPerUsdt) * 100) / 100);
  return {
    plan: raw.plan === 'YEARLY' ? 'YEARLY' : raw.plan === 'MONTHLY' ? 'MONTHLY' : fallback.plan,
    label: typeof raw.label === 'string' ? raw.label : fallback.label,
    pricePoints,
    priceUsdt,
    pointsPerUsdt,
    durationDays: positiveNumber(raw.durationDays, fallback.durationDays),
    discountPercent: key === 'yearly' ? numberValue(raw.discountPercent, fallback.discountPercent || 0) : undefined,
  };
}

function trialDaysFromPayload(status: TuiPlusStatusPayload | null) {
  const rawTrial = asObject(asObject(status?.plans).trial);
  return Math.max(1, Math.floor(positiveNumber(rawTrial.durationDays, 7)));
}

function trialActionLabel(trialDays: number) {
  return trialDays === 7 ? '免费试用7天' : `免费试用${trialDays}天`;
}

function formatUsdtValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatPlanPriceLabel(plan: PlanCard) {
  const price = formatUsdtValue(plan.priceUsdt);
  return plan.plan === 'MONTHLY' ? `${price} U` : `${price}U`;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusLabel(status: TuiPlusStatusPayload, trialDays: number) {
  if (!status.active) return status.trialUsed ? '已到期 · 随时续费' : `可免费试用 ${trialDays} 天`;
  if (status.status === 'TRIALING') return `免费试用中${status.expiresAt ? ` · ${formatDate(status.expiresAt)} 到期` : ''}`;
  return `会员生效中${status.expiresAt ? ` · ${formatDate(status.expiresAt)} 到期` : ''}`;
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(payload?.error || payload?.message || `Status: ${res.status}`, res.status);
  return payload as T;
}

function getPlanBadge(plan: PlanCard) {
  if (plan.plan === 'YEARLY') return plan.discountPercent ? `立省 ${plan.discountPercent}%` : '推荐';
  return '';
}

function getPlanPeriod(plan: PlanCard) {
  return plan.plan === 'YEARLY' ? '年付' : '月付';
}

function PlanOptionCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const planBadge = getPlanBadge(plan);
  return (
    <button
      type="button"
      className="tui-plus-plan-card"
      data-selected={selected ? 'true' : 'false'}
      data-plan={plan.plan.toLowerCase()}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="tui-plus-plan-card-body">
        <span className="tui-plus-plan-card-top">
          <strong>{getPlanPeriod(plan)}</strong>
        </span>
        <span className="tui-plus-plan-card-price">
          <b>{formatPlanPriceLabel(plan)}</b>
        </span>
        <span className="tui-plus-plan-card-meta">
          <span>{plan.pricePoints} 积分</span>
        </span>
      </span>
      {planBadge ? <span className="tui-plus-plan-card-badge" aria-hidden="true">{planBadge}</span> : null}
      <span className="tui-plus-plan-card-radio" aria-hidden="true" />
    </button>
  );
}

export default function TuiPlusMobile() {
  const navigate = useNavigate();
  const { refreshUser, patchUser, showToast } = useAuth();
  const [status, setStatus] = useState<TuiPlusStatusPayload | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan>('YEARLY');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const monthlyPlan = useMemo(() => planFromPayload(status, 'monthly'), [status]);
  const yearlyPlan = useMemo(() => planFromPayload(status, 'yearly'), [status]);
  const trialDays = useMemo(() => trialDaysFromPayload(status), [status]);
  const hasPlans = hasPlanPayload(status);
  const selectedPlanConfig = selectedPlan === 'YEARLY' ? yearlyPlan : monthlyPlan;
  const currentStatus = status || fallbackStatus;
  const canStartTrial = !isLoading && !loadError && hasPlans && !currentStatus.active && !currentStatus.trialUsed;
  const shouldShowCheckout = !isLoading && Boolean(status);
  const primaryActionLabel = currentStatus.active ? `续费${selectedPlanConfig.label}` : '立即开通';
  const trialBusy = busyAction === 'trial';
  const planBusy = busyAction === selectedPlan;
  const actionLocked = Boolean(busyAction);
  const membershipStatusText = statusLabel(currentStatus, trialDays);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await getTuiPlusStatus();
      const payload = normalizeStatusPayload(data);
      setStatus(payload);
      patchUser({
        plusStatus: payload.status,
        plusPlan: payload.plan,
        plusExpiresAt: payload.expiresAt,
        plusTrialUsed: payload.trialUsed,
        isTuiPlus: payload.active,
        tuiPlusChannels: payload.channels,
        tuiPlusWebsites: payload.websites || [],
        tuiPlusContacts: payload.contacts || [],
      });
    } catch (error: any) {
      const message = error?.message || '会员信息加载失败，请重试';
      setStatus(null);
      setLoadError(message);
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [patchUser, showToast]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const afterMembershipMutation = useCallback(async (message: string) => {
    showToast(message, 'success');
    await Promise.allSettled([
      refreshUser(true),
      loadStatus(),
    ]);
  }, [loadStatus, refreshUser, showToast]);

  const startTrial = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('trial');
    try {
      await startTuiPlusTrial();
      setStatus({ ...(status || fallbackStatus), trialUsed: true });
      await afterMembershipMutation('免费会员已成功领取，尊享权益已生效');
    } catch (error: any) {
      showToast(error?.message || '开启试用遇到问题，请重试', 'error');
    } finally {
      setBusyAction(null);
    }
  }, [afterMembershipMutation, busyAction, showToast, status]);

  const purchasePlan = useCallback(async (plan: PaidPlan) => {
    if (busyAction || !hasPlans) return;
    setBusyAction(plan);
    try {
      await purchaseTuiPlus({ plan });
      await afterMembershipMutation(plan === 'YEARLY' ? '已成功开通年度会员，尊享权益已生效' : '已成功开通月度会员，尊享权益已生效');
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 402) {
        showToast('积分余额不足，正在前往充值', 'info');
        navigate(APP_ROUTES.recharge, { state: { from: APP_ROUTES.tuiPlus, returnState: { from: APP_ROUTES.tuiPlus } } });
      } else {
        showToast(error?.message || '开通会员遇到问题，请重试', 'error');
      }
    } finally {
      setBusyAction(null);
    }
  }, [afterMembershipMutation, busyAction, hasPlans, navigate, showToast]);

  const runPrimaryAction = useCallback(() => purchasePlan(selectedPlan), [purchasePlan, selectedPlan]);
  const { guarded: guardedStartTrial, isPending: trialGuardPending } = useInteractionGuard(startTrial, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 180,
    mode: 'drop',
  });
  const { guarded: guardedRunPrimaryAction, isPending: planGuardPending } = useInteractionGuard(runPrimaryAction, {
    policy: 'critical',
    cooldownMs: 720,
    minPendingMs: 180,
    mode: 'drop',
  });
  const guardedActionLocked = actionLocked || trialGuardPending || planGuardPending;

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="tui-plus-page surface-page">
      <SEO title="开通推推会员｜推推" description="开通推推会员，立享全站曝光提权、主页专属外链、无限制联系方式及频道自动同步等多项尊享特权。" noindex />
      <PageHeader
        title="推推会员"
        showBack
        titleAlign="center"
        className="tui-plus-topbar"
        titleNode={(
          <span className="tui-plus-topbar-title-node">
            <Crown aria-hidden="true" />
            <span>推推会员</span>
          </span>
        )}
      />
      <PageContentShell as="main" className="tui-plus-main ui-app-page-main">
        {isLoading ? <LoadingBlock text="正在加载会员信息..." className="tui-plus-loading" /> : loadError ? (
          <LoadingBlock text="会员信息加载失败，请稍后重试" className="tui-plus-loading" />
        ) : (
          <>
            <section className="tui-plus-x-benefits" aria-label="会员权益清单">
              <div className="tui-plus-x-benefits-heading">
                <h2>会员权益</h2>
                <span className="tui-plus-x-status">{membershipStatusText}</span>
              </div>
              <div className="tui-plus-x-benefit-grid">
                {benefitRows.map((item) => (
                  <article key={item.key} className="tui-plus-x-benefit-item">
                    <span className="tui-plus-x-benefit-icon" aria-hidden="true">{item.icon}</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className="tui-plus-x-plans" aria-label="会员套餐">
              <div className="tui-plus-x-plan-grid" role="radiogroup" aria-label="会员套餐">
                <PlanOptionCard plan={monthlyPlan} selected={selectedPlan === 'MONTHLY'} onSelect={() => setSelectedPlan('MONTHLY')} />
                <PlanOptionCard plan={yearlyPlan} selected={selectedPlan === 'YEARLY'} onSelect={() => setSelectedPlan('YEARLY')} />
              </div>
            </section>
          </>
        )}
      </PageContentShell>

      {shouldShowCheckout ? (
        <section className="tui-plus-checkout-bar ui-checkout-bar" aria-label="开通推推会员">
          <div className="tui-plus-checkout-shell">
            <div className="tui-plus-checkout-row" data-layout={canStartTrial ? 'trial-and-plan' : 'single-action'}>
              <div className="tui-plus-checkout-actions" data-actions={canStartTrial ? 'two' : 'one'}>
                {canStartTrial ? (
                  <ActionButton
                    type="button"
                    variant="muted"
                    className="tui-plus-x-action tui-plus-x-trial-action"
                    disabled={guardedActionLocked || isLoading}
                    state={trialBusy || trialGuardPending ? 'loading' : guardedActionLocked || isLoading ? 'disabled' : 'idle'}
                    onClick={() => void guardedStartTrial()}
                  >
                    {trialBusy || trialGuardPending ? <InlineSpinner /> : null}
                    {trialActionLabel(trialDays)}
                  </ActionButton>
                ) : null}
                <ActionButton
                  type="button"
                  variant="brand"
                  className="tui-plus-x-primary"
                  disabled={guardedActionLocked || isLoading || !hasPlans}
                  state={planBusy || planGuardPending ? 'loading' : guardedActionLocked || isLoading || !hasPlans ? 'disabled' : 'idle'}
                  onClick={() => void guardedRunPrimaryAction()}
                >
                  {planBusy || planGuardPending ? <InlineSpinner /> : <CheckCircle2 />}
                  {planBusy || planGuardPending ? '处理中...' : primaryActionLabel}
                </ActionButton>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </AppPage>
  );
}
