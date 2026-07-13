import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getRechargeOrdersPage, getTransactionsPage } from '@/services/api';
import {
  TRANSACTION_ACTION_LABELS,
  TransactionAction,
} from '@/types';
import { type RechargeStatusGroup } from '@/features/records/recordDisplay';
import {
  buildLedgerRecords,
  type UnifiedLedgerRecord,
} from '@/features/records/ledgerDisplay';
import LedgerRecordCard from '@/features/records/LedgerRecordCard';
import { useAuth } from '@/context/AuthContext';
import { useConfig } from '@/hooks/useData';
import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import HeaderSelectAction from '@/ui/HeaderSelectAction';
import SEO from '@/platform/SEO';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import ListLoadMoreState from '@/ui/ListLoadMoreState';
import ActionButton from '@/ui/ActionButton';
import EmptyStateCard from '@/ui/EmptyStateCard';
import PageContentShell from '@/ui/PageContentShell';

type RechargeStatusFilter = '' | RechargeStatusGroup;
type UnifiedRecordType =
  | ''
  | TransactionAction.RECHARGE
  | TransactionAction.SIGNUP_REWARD
  | TransactionAction.AD
  | TransactionAction.PIN_CHAT
  | TransactionAction.PIN_POST
  | TransactionAction.ANONYMOUS_PUBLISH
  | TransactionAction.TELEGRAM_SYNC;

type TransactionHistoryRouteState = {
  from?: string;
};

const RECORD_TYPE_FILTER_OPTIONS: Array<{ value: UnifiedRecordType; label: string }> = [
  { value: '', label: '全部' },
  { value: TransactionAction.RECHARGE, label: TRANSACTION_ACTION_LABELS[TransactionAction.RECHARGE] },
  { value: TransactionAction.SIGNUP_REWARD, label: TRANSACTION_ACTION_LABELS[TransactionAction.SIGNUP_REWARD] },
  { value: TransactionAction.AD, label: TRANSACTION_ACTION_LABELS[TransactionAction.AD] },
  { value: TransactionAction.PIN_CHAT, label: TRANSACTION_ACTION_LABELS[TransactionAction.PIN_CHAT] },
  { value: TransactionAction.PIN_POST, label: TRANSACTION_ACTION_LABELS[TransactionAction.PIN_POST] },
  { value: TransactionAction.ANONYMOUS_PUBLISH, label: TRANSACTION_ACTION_LABELS[TransactionAction.ANONYMOUS_PUBLISH] },
  { value: TransactionAction.TELEGRAM_SYNC, label: TRANSACTION_ACTION_LABELS[TransactionAction.TELEGRAM_SYNC] },
];

const RECHARGE_STATUS_FILTER_OPTIONS: Array<{ value: RechargeStatusFilter; label: string }> = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '确认中' },
  { value: 'CREDITED', label: '已到账' },
  { value: 'NOT_CREDITED', label: '未到账' },
];

function normalizeRechargeStatusFilter(value: string | null): RechargeStatusFilter {
  const normalized = (value || '').toUpperCase();
  if (RECHARGE_STATUS_FILTER_OPTIONS.some((item) => item.value === normalized)) {
    return normalized as RechargeStatusFilter;
  }
  if (normalized === 'WAITING_PAYMENT' || normalized === 'MANUAL_REVIEW') return 'PENDING';
  if (normalized === 'EXPIRED' || normalized === 'BELOW_MINIMUM' || normalized === 'CANCELLED' || normalized === 'FAILED') {
    return 'NOT_CREDITED';
  }
  return '';
}

function normalizeRecordTypeFilter(value: string | null): UnifiedRecordType {
  const normalized = (value || '').toUpperCase();
  if (RECORD_TYPE_FILTER_OPTIONS.some((item) => item.value === normalized)) {
    return normalized as UnifiedRecordType;
  }
  return '';
}

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

function isRechargeRecordType(type: UnifiedRecordType) {
  return type === TransactionAction.RECHARGE;
}

function shouldQueryRechargeOrders(type: UnifiedRecordType) {
  return type === '' || isRechargeRecordType(type);
}

function getTransactionActionParam(type: UnifiedRecordType) {
  if (!type) return undefined;
  return type;
}

function getRechargePointsPerUsdt(config: unknown) {
  const raw = (config as { recharge_points_per_usdt?: unknown } | null | undefined)?.recharge_points_per_usdt;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

export default function TransactionHistoryMobile() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as TransactionHistoryRouteState | null;
  const returnTo = normalizePath(routeState?.from) || '/profile';
  const { showToast } = useAuth();
  const { data: config } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawType = searchParams.get('type');
  const recordType = normalizeRecordTypeFilter(rawType);
  const rechargeStatusFilter = normalizeRechargeStatusFilter(searchParams.get('status'));
  const transactionAction = getTransactionActionParam(recordType);
  const includeTransactions = true;
  const includeRechargeOrders = shouldQueryRechargeOrders(recordType);
  const pointsPerUsdt = getRechargePointsPerUsdt(config);

  const {
    data: transactionData,
    isLoading: isTransactionsLoading,
    hasNextPage: hasNextTransactionPage,
    fetchNextPage: fetchNextTransactionPage,
    isFetchingNextPage: isFetchingNextTransactionPage,
    isError: isTransactionsError,
    refetch: refetchTransactions,
  } = useInfiniteQuery({
    queryKey: ['transactions', { action: transactionAction || '' }],
    queryFn: ({ pageParam }) =>
      getTransactionsPage({ limit: 50, cursor: pageParam, action: transactionAction }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: includeTransactions,
  });

  const {
    data: orderData,
    isLoading: isOrdersLoading,
    hasNextPage: hasNextOrderPage,
    fetchNextPage: fetchNextOrderPage,
    isFetchingNextPage: isFetchingNextOrderPage,
    isError: isOrdersError,
    refetch: refetchOrders,
  } = useInfiniteQuery({
    queryKey: ['recharge-orders', { status: rechargeStatusFilter }],
    queryFn: ({ pageParam }) =>
      getRechargeOrdersPage({ limit: 30, cursor: pageParam, statusGroup: rechargeStatusFilter || undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: includeRechargeOrders,
  });

  const unifiedRecords = useMemo<UnifiedLedgerRecord[]>(() => {
    return buildLedgerRecords(
      includeTransactions ? transactionData?.pages.flatMap((page) => page.items) : [],
      includeRechargeOrders ? orderData?.pages.flatMap((page) => page.items) : [],
    );
  }, [includeRechargeOrders, includeTransactions, orderData, transactionData]);

  const isLoading = (includeTransactions && isTransactionsLoading) || (includeRechargeOrders && isOrdersLoading);
  const hasNextPage = (includeTransactions && hasNextTransactionPage) || (includeRechargeOrders && hasNextOrderPage);
  const isFetchingNextPage = (includeTransactions && isFetchingNextTransactionPage) || (includeRechargeOrders && isFetchingNextOrderPage);
  const isError = (includeTransactions && isTransactionsError) || (includeRechargeOrders && isOrdersError);

  const fetchNextPage = async () => {
    const tasks: Array<Promise<unknown>> = [];
    if (includeTransactions && hasNextTransactionPage) tasks.push(fetchNextTransactionPage());
    if (includeRechargeOrders && hasNextOrderPage) tasks.push(fetchNextOrderPage());
    await Promise.all(tasks);
  };

  const refetchCurrentPage = async () => {
    const tasks: Array<Promise<unknown>> = [];
    if (includeTransactions) tasks.push(refetchTransactions());
    if (includeRechargeOrders) tasks.push(refetchOrders());
    await Promise.all(tasks);
  };

  const handleRecordTypeChange = (value: UnifiedRecordType) => {
    const nextType = normalizeRecordTypeFilter(value);
    const next = new URLSearchParams();
    if (nextType) next.set('type', nextType);
    setSearchParams(next, { replace: true });
  };

  const handleCopyRecordId = (value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => showToast('订单号已复制', 'success'),
      () => showToast('复制失败，请手动复制', 'error'),
    );
  };

  return (
    <>
      <SEO title="交易记录｜推推" description="查看推推账号积分、充值与推广消费记录。" noindex />
      <AppPage mobileAddressBarScroll bottomSafe className="record-page">
        <PageHeader
          title="交易记录"
          onBack={() => navigate(returnTo, { replace: true })}
          right={
            <HeaderSelectAction<UnifiedRecordType>
              value={recordType}
              options={RECORD_TYPE_FILTER_OPTIONS}
              onChange={handleRecordTypeChange}
              selectClassName="ui-record-filter-action"
              ariaLabel="筛选交易类型"
            />
          }
        />

        <PageContentShell className="record-page-shell ui-app-page-main">
          {isLoading ? (
            <LoadingBlock compact text="正在加载交易记录" className="record-state-block" />
          ) : isError ? (
            <StateBlock
              title="记录加载失败"
              description="网络恢复后可重新查询"
              tone="error"
              compact
              className="record-state-block"
              action={
                <ActionButton
                  variant="muted"
                  size="sm"
                  onClick={() => void refetchCurrentPage()}
                >
                  重新加载
                </ActionButton>
              }
            />
          ) : (
            <div className="record-list">
              {unifiedRecords.length > 0 ? (
                unifiedRecords.map((record) => (
                  <LedgerRecordCard
                    key={`${record.kind}-${record.id}`}
                    record={record}
                    pointsPerUsdt={pointsPerUsdt}
                    onCopyRecordId={handleCopyRecordId}
                  />
                ))
              ) : (
                <EmptyStateCard title="暂无记录" className="record-empty-state" />
              )}

              <ListLoadMoreState
                loading={Boolean(isFetchingNextPage)}
                hasMore={Boolean(hasNextPage)}
                onLoadMore={() => void fetchNextPage()}
                loadingText="加载中"
                loadMoreText="加载更多"
                doneText=""
                className={hasNextPage || isFetchingNextPage ? 'record-load-more' : 'hidden'}
              />
            </div>
          )}
        </PageContentShell>
      </AppPage>
    </>
  );
}
