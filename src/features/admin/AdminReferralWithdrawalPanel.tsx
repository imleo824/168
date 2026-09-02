import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { apiFetch } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useAdminDialogs } from './AdminDialogs';

type ReferralWithdrawalStatus = 'PENDING' | 'WITHDRAWING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELED';

type AdminReferralWithdrawalItem = {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  network: string;
  address: string;
  status: ReferralWithdrawalStatus;
  adminNote?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  paidAt?: string | null;
  displayName?: string | null;
  loginAccount?: string | null;
  photoUrl?: string | null;
  userType?: string | null;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'PENDING', label: '待处理' },
  { value: 'PAID', label: '已打款' },
  { value: 'REJECTED', label: '已拒绝' },
];

function formatMoney(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toFixed(parsed > 0 && parsed < 1 ? 4 : 2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statusMeta(status: ReferralWithdrawalStatus | string) {
  if (status === 'PAID') return { label: '已打款', className: 'admin-tone-success' };
  if (status === 'REJECTED' || status === 'CANCELED') return { label: '已拒绝', className: 'admin-tone-danger' };
  if (status === 'WITHDRAWING' || status === 'APPROVED') return { label: '处理中', className: 'admin-tone-warning' };
  return { label: '待处理', className: 'admin-tone-neutral-strong' };
}

function canProcess(item: AdminReferralWithdrawalItem) {
  return !['PAID', 'REJECTED', 'CANCELED'].includes(item.status);
}

export default function AdminReferralWithdrawalPanel() {
  const { showToast } = useAuth();
  const { confirm, prompt } = useAdminDialogs();
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AdminReferralWithdrawalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '80' });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/admin/referral-withdrawals?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch((): never[] => []);
      if (!res.ok) throw new Error(payload?.error || '邀请提现加载失败');
      setItems(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      const message = err?.message || '邀请提现加载失败';
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, [status]);

  const updateStatus = async (item: AdminReferralWithdrawalItem, nextStatus: 'PAID' | 'REJECTED') => {
    if (!item?.id || processingId) return;
    const isPaid = nextStatus === 'PAID';
    const actionText = isPaid ? '已打款' : '拒绝';
    const note = await prompt({
      title: `${actionText}提现订单`,
      message: `${actionText}：可填写备注（选填）`,
      placeholder: '请输入备注',
      required: false,
    });
    if (note === null) return;
    const confirmed = await confirm({
      title: `确认${actionText}`,
      message: `确认${actionText} ${formatMoney(item.amount)} USDT？`,
      danger: !isPaid,
    });
    if (!confirmed) return;

    setProcessingId(item.id);
    try {
      const res = await apiFetch(`/api/admin/referral-withdrawals/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, adminNote: note }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '提现审核失败');
      showToast(isPaid ? '已标记打款完成' : '已拒绝，订单已取消', 'success');
      await fetchItems();
    } catch (err: any) {
      showToast(err?.message || '提现审核失败', 'error');
    } finally {
      setProcessingId('');
    }
  };

  return (
    <section className="admin-data-panel mb-20 space-y-4">
      <div className="admin-section-card">
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto_auto]">
          <select className="admin-form-control" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
          <input className="admin-form-control" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索用户、地址、申请ID" />
          <button type="button" onClick={fetchItems} disabled={loading} className="pressable admin-submit-button admin-submit-button--compact">查询</button>
          <button type="button" onClick={fetchItems} disabled={loading} className="pressable admin-table-action admin-tone-neutral-strong">
            <RefreshCw size={14} /> {loading ? '刷新中' : '刷新'}
          </button>
        </div>
      </div>

      <div className="admin-table-scroll admin-responsive-desktop-list overflow-x-auto scrollbar-hide">
        <table className="w-full text-left table whitespace-nowrap">
          <thead><tr><th>用户</th><th>金额</th><th>提款地址</th><th>状态</th><th>申请时间</th><th>备注</th><th className="text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={7} className="admin-table-state-cell">加载中...</td></tr>
            ) : error ? (
              <tr><td colSpan={7} className="admin-table-state-cell admin-table-state-cell--danger">{error}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="admin-table-state-cell">暂无提现申请</td></tr>
            ) : items.map((item) => {
              const meta = statusMeta(item.status);
              return (
                <tr key={item.id} className="admin-table-row-interactive transition-colors align-top">
                  <td className="px-6 py-4"><div className="flex flex-col"><span className="admin-text-title-sm">{item.displayName || item.loginAccount || '推推用户'}</span><span className="admin-table-meta admin-table-meta--mono">ID: {item.userId}</span></div></td>
                  <td className="px-6 py-4"><span className="admin-text-value-sm">{formatMoney(item.amount)} {item.currency || 'USDT'}</span></td>
                  <td className="px-6 py-4"><div className="admin-withdrawal-address-cell flex flex-col whitespace-normal break-all"><span className="admin-data-copy">{item.address || '-'}</span><span className="admin-table-meta">{item.network || 'TRC20'}</span></div></td>
                  <td className="px-6 py-4"><span className={`admin-status-badge ${meta.className}`}>{meta.label}</span></td>
                  <td className="px-6 py-4 admin-table-meta">{formatDateTime(item.createdAt)}</td>
                  <td className="px-6 py-4 admin-table-meta">{item.adminNote || '-'}</td>
                  <td className="px-6 py-4 text-right"><div className="flex flex-wrap items-center justify-end gap-2">
                    {canProcess(item) ? (
                      <>
                        <button type="button" disabled={processingId === item.id} onClick={() => updateStatus(item, 'PAID')} className="pressable admin-table-action admin-tone-success">已打款</button>
                        <button type="button" disabled={processingId === item.id} onClick={() => updateStatus(item, 'REJECTED')} className="pressable admin-table-action admin-tone-danger">拒绝</button>
                      </>
                    ) : <span className="admin-table-meta admin-table-meta--strong">已完结</span>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
