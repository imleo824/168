import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAsyncFlow } from '@/hooks/useAsyncFlow';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageHeader from '@/ui/PageHeader';
import ActionButton from '@/ui/ActionButton';
import { apiFetch } from '@/services/api';
import { PaymentInfoSkeleton, Skeleton } from '@/ui/Skeleton';
import type { RechargeOrder } from '@/types';
import { InlineSpinner } from '@/ui/LoadingState';
import PageContentShell from '@/ui/PageContentShell';
import { useAuth } from '@/context/AuthContext';

type DepositInfo = {
  address: string;
  autoCredit?: boolean;
  depositSource?: 'pool' | 'fallback';
  chain: string;
  token: string;
  network: string;
  contractAddress: string;
  pointsPerUsdt: number;
  minUsdt: number;
};

type ReturnPathState = {
  from?: string;
  returnState?: unknown;
};

type OrdersLoadOptions = {
  showBusyHint?: boolean;
};

function parseRechargeOrdersPayload(raw: unknown): RechargeOrder[] {
  return Array.isArray(raw) ? raw : [];
}

function isRechargeOrderActive(order: RechargeOrder) {
  return order.status === 'WAITING_PAYMENT' || order.status === 'MANUAL_REVIEW';
}

function isRechargeOrderCredited(order: RechargeOrder) {
  return order.status === 'CREDITED';
}

function getTronAddressQrUrl(address: string) {
  const encodedAddress = encodeURIComponent(address.trim());
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodedAddress}&margin=16&color=111111&bgcolor=ffffff`;
}

function normalizeReturnPath(value: unknown) {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

export default function RechargeMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as ReturnPathState | null;
  const returnTo = normalizeReturnPath(routeState?.from) || '/profile';
  const returnFromState = normalizeReturnPath(
    routeState?.returnState && typeof routeState.returnState === 'object'
      ? (routeState.returnState as { from?: string }).from
      : null,
  );
  const returnState = routeState?.returnState && typeof routeState.returnState === 'object'
    ? routeState.returnState
    : null;
  const returnToState = returnState && returnTo
    ? {
      ...returnState,
      from: returnFromState || returnTo,
    }
    : { from: returnTo };

  const { user, requireAuth, showToast, refreshUser } = useAuth();
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'AMOUNT' | 'INSTRUCTIONS'>('AMOUNT');
  const [depositInfo, setDepositInfo] = useState<DepositInfo | null>(null);
  const [depositError, setDepositError] = useState('');
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [rechargeConfig, setRechargeConfig] = useState({ minUsdt: 1, pointsPerUsdt: 10 });
  const [currentOrderId, setCurrentOrderId] = useState('');
  const knownOrderStatusRef = useRef(new Map<string, string>());
  const hasLoadedOrdersRef = useRef(false);
  const copiedResetTimerRef = useRef<number | null>(null);

  const usdtAddress = depositInfo?.address || '';
  const currentMinUsdt = useMemo(
    () => Number(depositInfo?.minUsdt ?? rechargeConfig.minUsdt ?? 1),
    [depositInfo?.minUsdt, rechargeConfig.minUsdt],
  );
  const currentPointsPerUsdt = useMemo(
    () => Number(depositInfo?.pointsPerUsdt ?? rechargeConfig.pointsPerUsdt ?? 10),
    [depositInfo?.pointsPerUsdt, rechargeConfig.pointsPerUsdt],
  );
  const goBackToSource = () => navigate(returnTo, { replace: true, state: returnToState });

  const {
    run: runLoadOrders,
    isBusy: isLoadingOrders,
    abort: abortLoadOrders,
  } = useAsyncFlow(async ({ isActive, signal }, options?: OrdersLoadOptions) => {
    if (!user) return;

    try {
      const res = await apiFetch('/api/me/orders?limit=5', { signal });
      const raw = await res.text();
      const payload = raw ? JSON.parse(raw) : null;

      if (!res.ok) {
        throw new Error(payload?.error || '订单记录加载失败');
      }

      const nextOrders = parseRechargeOrdersPayload(payload);

      if (!isActive()) return;

      if (nextOrders.length > 0 && !depositError) {
        setDepositError('');
      }

      const activeOrder = nextOrders.find((item) => isRechargeOrderActive(item));
      if (activeOrder && !currentOrderId) {
        setCurrentOrderId(activeOrder.id);
      }

      let hasNewCreditedOrder = false;
      nextOrders.forEach((item: RechargeOrder) => {
        const previousStatus = knownOrderStatusRef.current.get(item.id);
        if (previousStatus && previousStatus !== item.status && isRechargeOrderCredited(item)) {
          hasNewCreditedOrder = true;
        }
        knownOrderStatusRef.current.set(item.id, item.status);
      });

      if (!hasLoadedOrdersRef.current) {
        hasLoadedOrdersRef.current = true;
        return;
      }

      if (hasNewCreditedOrder) {
        await refreshUser(true);
        if (isActive()) {
          showToast('积分已到账', 'success');
        }
      }
    } catch (error: any) {
      if (!isActive() || !options?.showBusyHint) return;

      const message = error?.message || '订单记录加载失败';
      setDepositError(message);
      showToast(message, 'error');
    }
  }, {
    cooldownMs: 220,
  });

  const loadOrders = useCallback((options?: OrdersLoadOptions) => {
    abortLoadOrders();
    return runLoadOrders(options);
  }, [abortLoadOrders, runLoadOrders]);

  const {
    run: runCreateOrder,
    isBusy: isCreatingOrder,
  } = useAsyncFlow(async ({ isActive, signal }) => {
    const numericAmount = Number(amount);

    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      showToast('请输入整数金额', 'error');
      return;
    }

    if (numericAmount < currentMinUsdt) {
      showToast(`最低金额 ${currentMinUsdt} USDT`, 'error');
      return;
    }

    setLoadingDeposit(true);
    setDepositError('');

    try {
      const res = await apiFetch('/api/me/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usdtAmount: numericAmount }),
        signal,
      });
      const raw = await res.text();
      const payload = raw ? JSON.parse(raw) : null;

      if (!res.ok) {
        throw new Error(payload?.error || '收款信息生成失败，请重试');
      }

      if (!isActive()) return;

      setDepositInfo(payload as DepositInfo);
      setCurrentOrderId(payload?.order?.id || '');

      if (payload?.order?.usdtAmount !== undefined && payload?.order?.usdtAmount !== null) {
        setAmount(String(payload.order.usdtAmount));
      }

      setStep('INSTRUCTIONS');
      await loadOrders({ showBusyHint: true });
    } catch (error: any) {
      if (!isActive()) return;

      setDepositError(error?.message || '收款信息生成失败，请重试');
      showToast(error?.message || '收款信息生成失败，请重试', 'error');
    } finally {
      if (isActive()) {
        setLoadingDeposit(false);
      }
    }
  }, {
    cooldownMs: 320,
  });

  const {
    run: runRefreshOrderStatus,
    isBusy: isRefreshingOrder,
  } = useAsyncFlow(async ({ isActive, signal }) => {
    let scanError = '';

    if (currentOrderId) {
      try {
        const scanRes = await apiFetch(`/api/me/orders/${currentOrderId}/scan`, {
          method: 'POST',
          signal,
        });

        if (!scanRes.ok) {
          const payloadText = await scanRes.text();
          const payload = payloadText ? JSON.parse(payloadText) : null;
          scanError = payload?.error || '到账状态刷新失败，请重试';
        }
      } catch (error: any) {
        if (error?.name !== 'AbortError') {
          scanError = '到账状态刷新失败，请重试';
        } else {
          scanError = '刷新超时，请重试';
        }
      }
    }

    if (!isActive()) return;

    await loadOrders();
    if (scanError) {
      showToast(scanError, 'error');
    }
  }, {
    cooldownMs: 300,
  });

  const currentFlowBusy = isCreatingOrder || isRefreshingOrder || isLoadingOrders;
  const createOrderBusy = isCreatingOrder || loadingDeposit;

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();

    if (step === 'AMOUNT') {
      if (currentFlowBusy || createOrderBusy) return;
      void runCreateOrder();
      return;
    }

    if (currentFlowBusy) return;
    void runRefreshOrderStatus();
  }, [createOrderBusy, currentFlowBusy, runCreateOrder, runRefreshOrderStatus, step]);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadOrders();
  }, [loadOrders, user]);

  useEffect(() => {
    if (!user) return;

    void (async () => {
      try {
        const res = await apiFetch('/api/config');
        const payloadText = await res.text();
        const payload = payloadText ? JSON.parse(payloadText) : null;
        if (!res.ok) return;

        setRechargeConfig({
          minUsdt: Number(payload?.tron_deposit_min_usdt || 1),
          pointsPerUsdt: Number(payload?.recharge_points_per_usdt || 10),
        });
      } catch {
        // 保留服务端主数据
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!user || step !== 'INSTRUCTIONS') return;

    const timer = window.setInterval(() => {
      void loadOrders();
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadOrders, step, user]);

  useEffect(() => {
    if (step === 'AMOUNT') {
      setDepositError('');
    }
  }, [step]);

  if (!user) {
    return (
      <AppPage mobileAddressBarScroll className="recharge-page">
        <SEO title="充积分｜推推" description="登录后在推推充积分，用于买曝光、置顶和会员功能。" noindex />
        <PageHeader title="充积分" onBack={goBackToSource} />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <AuthRequiredState
            icon={<ArrowRight />}
            context="recharge"
            tone="panel"
            density="compact"
            title="登录后充积分"
            description="登录后可生成专属收款地址，查看订单状态和积分到账记录。"
            actionLabel="登录 / 注册"
            previewItems={[
              { icon: <Copy aria-hidden="true" />, label: '专属地址', description: '为当前账号生成收款信息' },
              { icon: <ArrowRight aria-hidden="true" />, label: '到账跟踪', description: '查看待支付、审核中和已到账状态' },
              { icon: <CheckCircle2 aria-hidden="true" />, label: '积分到账', description: '到账后自动更新积分余额' },
            ]}
            onAction={() => requireAuth()}
          />
        </PageContentShell>
      </AppPage>
    );
  }

  const handleCopy = () => {
    if (!usdtAddress) {
      showToast('收款地址还没准备好', 'error');
      return;
    }

    navigator.clipboard.writeText(usdtAddress).then(() => {
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }

      setCopied(true);
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copiedResetTimerRef.current = null;
      }, 2000);
    }).catch(() => {
      showToast('复制失败，请手动复制地址', 'error');
    });
  };

  const onAmountChange = (value: string) => {
    setAmount(value.replace(/\D/g, ''));
  };

  const quickSelectAmount = (value: number) => {
    setAmount(value.toString());
  };

  return (
    <AppPage mobileAddressBarScroll className="recharge-page">
      <SEO title="充积分｜推推" description="推推充积分，支持通过 TRC-20 USDT 兑换积分。" noindex />

      <PageHeader
        title="充积分"
        onBack={step === 'INSTRUCTIONS' ? () => setStep('AMOUNT') : goBackToSource}
      />

      <PageContentShell className="recharge-shell ui-app-page-main">
        <section className="recharge-form-card" aria-label={step === 'AMOUNT' ? '充值金额' : '等待到账'}>
          <form onSubmit={handleSubmit} className="recharge-form">
            {step === 'AMOUNT' ? (
              <div className="recharge-step recharge-step--amount">
                <div className="recharge-field">
                  <div className="recharge-section-heading">
                    <label className="recharge-label">充值金额</label>
                    <span className="recharge-section-hint">{currentPointsPerUsdt} 积分 / USDT</span>
                  </div>

                  <div className="recharge-amount-field">
                    <input
                      required
                      type="number"
                      min={currentMinUsdt}
                      step="1"
                      inputMode="numeric"
                      placeholder="输入整数，如 100"
                      className="recharge-amount-input ui-input-focus-ring"
                      value={amount}
                      onChange={(e) => onAmountChange(e.target.value)}
                      disabled={createOrderBusy}
                    />
                    {amount && (
                      <div className="recharge-estimate">
                        <span className="recharge-estimate-value">
                          +{Math.floor(parseFloat(amount) * currentPointsPerUsdt)}
                        </span>
                        <span className="recharge-estimate-label">预计获得</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="recharge-preset-grid" aria-label="快捷金额">
                  {[100, 500, 1000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => quickSelectAmount(val)}
                      disabled={createOrderBusy}
                      className={`ui-amount-option ${amount === val.toString() ? 'ui-amount-option-active' : 'ui-amount-option-idle'}`}
                    >
                      {val} U
                    </button>
                  ))}
                </div>

                <p className="recharge-note">仅支持 TRC-20 USDT，请确认金额和网络。</p>

                <ActionButton disabled={currentFlowBusy || createOrderBusy} type="submit" variant="brand" className="recharge-submit">
                  {createOrderBusy ? (
                    <span className="recharge-action-status">
                      <InlineSpinner size="md" className="recharge-action-spinner" />
                      生成中
                    </span>
                  ) : (
                    <>
                      <span>生成收款信息</span>
                      <ArrowRight className="recharge-submit-icon" />
                    </>
                  )}
                </ActionButton>
              </div>
            ) : loadingDeposit && !usdtAddress && !depositError ? (
              <PaymentInfoSkeleton />
            ) : (
              <div className="recharge-step recharge-step--instructions">
                <div className="recharge-payment-panel">
                  <div className="recharge-token-panel">
                    <div className="recharge-token-row">
                      <div className="recharge-token-main">
                        <span className="ui-token-panel-label">应付金额</span>
                        <span className="ui-token-amount recharge-token-amount">
                          {amount}
                        </span>
                        <span className="ui-token-panel-unit">USDT</span>
                      </div>
                      <span className="recharge-token-network-badge">
                        TRC-20
                      </span>
                    </div>
                  </div>

                  <div className="recharge-instruction-body">
                    <div className="recharge-qr-wrap">
                      <div className="ui-token-qr-card recharge-qr-card">
                        {usdtAddress ? (
                          <img
                            src={getTronAddressQrUrl(usdtAddress)}
                            alt="收款地址二维码"
                            className="recharge-qr-image"
                            loading="lazy"
                          />
                        ) : loadingDeposit ? (
                          <Skeleton className="recharge-qr-skeleton" />
                        ) : (
                          <div className="recharge-qr-empty">
                            暂无可用收款地址
                          </div>
                        )}
                      </div>
                      <p className="recharge-network-note">扫码或复制地址完成转账</p>
                    </div>

                    <div className="recharge-address-row">
                      <div className="ui-mono-value recharge-address-value">
                        {depositError || usdtAddress || '暂无可用收款地址'}
                      </div>
                      <ActionButton
                        type="button"
                        onClick={handleCopy}
                        disabled={!usdtAddress || Boolean(depositError)}
                        variant={usdtAddress && !depositError ? 'primary' : 'disabled'}
                        size="sm"
                        className="recharge-copy-button recharge-copy-button--icon-only"
                        aria-label={copied ? '收款地址已复制' : '复制收款地址'}
                        title={copied ? '收款地址已复制' : '复制收款地址'}
                      >
                        {copied ? <CheckCircle2 className="recharge-copy-icon recharge-copy-icon--success" /> : <Copy className="recharge-copy-icon" />}
                      </ActionButton>
                    </div>
                  </div>
                </div>

                <div className="recharge-footer-action">
                  <ActionButton
                    disabled={currentFlowBusy}
                    type="submit"
                    variant="brand"
                    className="recharge-submit"
                  >
                    {currentFlowBusy ? (
                      <span className="recharge-action-status">
                        <InlineSpinner size="md" className="recharge-action-spinner" />
                        查询中
                      </span>
                    ) : '刷新到账状态'}
                  </ActionButton>
                </div>
              </div>
            )}
          </form>
        </section>
      </PageContentShell>
    </AppPage>
  );
}
