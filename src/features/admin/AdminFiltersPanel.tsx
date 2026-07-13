import { RefreshCcw } from 'lucide-react';
import {
  ADMIN_TRANSACTION_TYPE_OPTIONS,
  ADMIN_USER_TYPE_FILTER_OPTIONS,
  PROMOTION_TYPE_OPTIONS,
} from '@/types';
import type { AdminTab, DepositAddressSection, DepositAddressStats } from './adminTypes';

type AdminFiltersPanelProps = {
  activeTab: AdminTab;
  activeDepositAddressSection: DepositAddressSection;
  categories: any[] | undefined;
  searchKeyword: string;
  setSearchKeyword: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  publishFilter: string;
  setPublishFilter: (value: string) => void;
  userTypeFilter: string;
  setUserTypeFilter: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  promotionTypeFilter: string;
  setPromotionTypeFilter: (value: string) => void;
  actionFilter: string;
  setActionFilter: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  depositAddressStats: DepositAddressStats | null;
  isCreatingSweepJob: boolean;
  createSweepJob: () => void;
  fetchDepositAddressStats: () => void;
  isImportingAddresses: boolean;
  addressImportText: string;
  setAddressImportText: (value: string) => void;
  handleImportAddresses: () => void;
  isLoadingList: boolean;
  fetchData: () => void;
  applyFilterChange: () => void;
};

export function AdminFiltersPanel({
  activeTab,
  activeDepositAddressSection,
  categories,
  searchKeyword,
  setSearchKeyword,
  categoryFilter,
  setCategoryFilter,
  publishFilter,
  setPublishFilter,
  userTypeFilter,
  setUserTypeFilter,
  statusFilter,
  setStatusFilter,
  promotionTypeFilter,
  setPromotionTypeFilter,
  actionFilter,
  setActionFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  depositAddressStats,
  isCreatingSweepJob,
  createSweepJob,
  fetchDepositAddressStats,
  isImportingAddresses,
  addressImportText,
  setAddressImportText,
  handleImportAddresses,
  isLoadingList,
  fetchData,
  applyFilterChange,
}: AdminFiltersPanelProps) {
  return (
<div className="admin-filter-bar">
{activeTab === 'content' && (
  <div className="admin-filter-grid admin-filter-grid--four">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索标题或正文"
    />
    <select
      className="admin-filter-control"
      value={categoryFilter}
      onChange={(e) => {
        setCategoryFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">所有分类</option>
      {categories?.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
    <select
      className="admin-filter-control"
      value={publishFilter}
      onChange={(e) => {
        setPublishFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">所有状态</option>
      <option value="1">已上架</option>
      <option value="0">已下架</option>
    </select>
    <select
      className="admin-filter-control"
      value={userTypeFilter}
      onChange={(e) => {
        setUserTypeFilter(e.target.value);
        applyFilterChange();
      }}
    >
      {ADMIN_USER_TYPE_FILTER_OPTIONS.map((option) => (
        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
)}
{activeTab === 'users' && (
  <div className="admin-filter-grid admin-filter-grid--four">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索昵称或ID"
    />
    <select
      className="admin-filter-control"
      value={userTypeFilter}
      onChange={(e) => {
        setUserTypeFilter(e.target.value);
        applyFilterChange();
      }}
    >
      {ADMIN_USER_TYPE_FILTER_OPTIONS.map((option) => (
        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
      ))}
    </select>
    <input
      type="date"
      className="admin-filter-control"
      value={startDate}
      onChange={(e) => {
        setStartDate(e.target.value);
        applyFilterChange();
      }}
    />
    <input
      type="date"
      className="admin-filter-control"
      value={endDate}
      onChange={(e) => {
        setEndDate(e.target.value);
        applyFilterChange();
      }}
    />
  </div>
)}
{activeTab === 'orders' && (
  <div className="admin-filter-grid admin-filter-grid--four">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索用户/订单/哈希"
    />
    <select
      className="admin-filter-control"
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部状态</option>
      <option value="WAITING_PAYMENT">自动扫描中</option>
      <option value="MANUAL_REVIEW">兜底待处理</option>
      <option value="CREDITED">已到账</option>
      <option value="EXPIRED">已过期</option>
      <option value="BELOW_MINIMUM">低于最低入账</option>
      <option value="CANCELLED">已取消</option>
      <option value="FAILED">失败</option>
    </select>
    <input
      type="date"
      className="admin-filter-control"
      value={startDate}
      onChange={(e) => {
        setStartDate(e.target.value);
        applyFilterChange();
      }}
    />
    <input
      type="date"
      className="admin-filter-control"
      value={endDate}
      onChange={(e) => {
        setEndDate(e.target.value);
        applyFilterChange();
      }}
    />
  </div>
)}
{activeTab === 'deposit-addresses' && activeDepositAddressSection === 'monitor' && (
  <div className="admin-filter-stack">
    <div className="admin-filter-stats-grid">
      {[
        ['pendingSweepUsdt', '待归集 USDT', Number(depositAddressStats?.pendingSweepUsdt ?? 0).toFixed(2)],
        ['pendingSweepOrders', '待归集订单', depositAddressStats?.pendingSweepOrders ?? 0],
        ['todayRechargeUsdt', '今日充值', Number(depositAddressStats?.todayRechargeUsdt ?? 0).toFixed(2)],
        ['todayRechargeCount', '今日笔数', depositAddressStats?.todayRechargeCount ?? 0],
        ['assigned', '充值地址', depositAddressStats?.assigned ?? 0],
        ['hdAssigned', 'HD 地址', depositAddressStats?.hdAssigned ?? 0],
      ].map(([key, label, value]) => (
        <div key={String(key)} className="admin-filter-stat-card">
          <div className="admin-filter-stat-label">{label}</div>
          <div className="admin-filter-stat-value">{value}</div>
        </div>
      ))}
    </div>
    <div className="admin-filter-card">
      <div className="admin-filter-card-header">
        <div>
          <div className="admin-filter-card-title">归集控制</div>
          <div className="admin-filter-card-text">
            后台只创建归集任务，链上转账由独立归集服务执行
          </div>
        </div>
        <button
          type="button"
          onClick={createSweepJob}
          disabled={
            isCreatingSweepJob ||
            !depositAddressStats?.sweepTargetConfigured ||
            !depositAddressStats?.pendingSweepOrders
          }
          className="pressable admin-filter-action"
        >
          {isCreatingSweepJob ? '创建中' : '一键立即归集'}
        </button>
      </div>
      <div className="admin-filter-meta-grid">
        <div>目标地址：{depositAddressStats?.sweepTargetConfigured ? '已配置' : '未配置'}</div>
        <div>自动扫描：{depositAddressStats?.pendingAutoCreditOrders ?? 0} 笔</div>
        <div>兜底订单：{depositAddressStats?.fallbackOrders ?? 0} 笔</div>
        <div className="admin-filter-meta-wide">
          最近任务：{depositAddressStats?.lastSweepJob
            ? `${depositAddressStats.lastSweepJob.status} · ${depositAddressStats.lastSweepJob.orderCount} 笔 · ${Number(depositAddressStats.lastSweepJob.totalUsdt || 0).toFixed(2)} USDT`
            : '-'}
        </div>
      </div>
    </div>
    <div className="admin-filter-refresh-row">
      <button
        type="button"
        onClick={fetchDepositAddressStats}
        title="刷新统计"
        className="pressable admin-filter-icon-button"
      >
        <RefreshCcw className="admin-filter-icon" aria-hidden="true" />
      </button>
    </div>
  </div>
)}
{activeTab === 'deposit-addresses' && activeDepositAddressSection === 'import' && (
  <div className="admin-filter-card">
    <div className="admin-filter-card-header">
      <div>
        <div className="admin-filter-card-title">批量导入地址</div>
        <div className="admin-filter-card-text">每行一个 TRON 地址，系统自动去重</div>
      </div>
      <button
        type="button"
        onClick={handleImportAddresses}
        disabled={isImportingAddresses || !addressImportText.trim()}
        className="pressable admin-filter-action"
      >
        {isImportingAddresses ? '导入中' : '导入'}
      </button>
    </div>
    <textarea
      className="admin-filter-textarea"
      value={addressImportText}
      onChange={(e) => setAddressImportText(e.target.value)}
      placeholder="T..."
    />
  </div>
)}
{activeTab === 'deposit-addresses' && activeDepositAddressSection === 'list' && (
  <div className="admin-filter-grid admin-filter-grid--deposit-list">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索地址、用户或ID"
    />
    <select
      className="admin-filter-control"
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部状态</option>
      <option value="AVAILABLE">可用</option>
      <option value="ASSIGNED">已分配</option>
      <option value="DISABLED">停用</option>
    </select>
  </div>
)}
{activeTab === 'promotions' && (
  <div className="admin-filter-grid admin-filter-grid--four">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索ID/用户/跳转链接"
    />
    <select
      className="admin-filter-control"
      value={promotionTypeFilter}
      onChange={(e) => {
        setPromotionTypeFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部类型</option>
      {PROMOTION_TYPE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
    <select
      className="admin-filter-control"
      value={userTypeFilter}
      onChange={(e) => {
        setUserTypeFilter(e.target.value);
        applyFilterChange();
      }}
    >
      {ADMIN_USER_TYPE_FILTER_OPTIONS.map((option) => (
        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
      ))}
    </select>
    <select
      className="admin-filter-control"
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部状态</option>
      <option value="active">展示中</option>
      <option value="inactive">未展示</option>
    </select>
    <select
      className="admin-filter-control"
      value={categoryFilter}
      onChange={(e) => {
        setCategoryFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">所有分类</option>
      {categories?.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
    <input
      type="date"
      className="admin-filter-control"
      value={startDate}
      onChange={(e) => {
        setStartDate(e.target.value);
        applyFilterChange();
      }}
    />
    <input
      type="date"
      className="admin-filter-control"
      value={endDate}
      onChange={(e) => {
        setEndDate(e.target.value);
        applyFilterChange();
      }}
    />
  </div>
)}
{activeTab === 'transactions' && (
  <div className="admin-filter-grid admin-filter-grid--five">
    <input
      type="text"
      className="admin-filter-control admin-filter-control--span-2"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索交易说明或用户"
    />
    <select
      className="admin-filter-control"
      value={actionFilter}
      onChange={(e) => {
        setActionFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">所有类型</option>
      {ADMIN_TRANSACTION_TYPE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
    <select
      className="admin-filter-control"
      value={userTypeFilter}
      onChange={(e) => {
        setUserTypeFilter(e.target.value);
        applyFilterChange();
      }}
    >
      {ADMIN_USER_TYPE_FILTER_OPTIONS.map((option) => (
        <option key={option.value || 'all'} value={option.value}>{option.label}</option>
      ))}
    </select>
    <input
      type="date"
      className="admin-filter-control"
      value={startDate}
      onChange={(e) => {
        setStartDate(e.target.value);
        applyFilterChange();
      }}
    />
    <input
      type="date"
      className="admin-filter-control"
      value={endDate}
      onChange={(e) => {
        setEndDate(e.target.value);
        applyFilterChange();
      }}
    />
  </div>
)}
{activeTab === 'chat' && (
  <div className="admin-filter-grid admin-filter-grid--three">
    <input
      type="text"
      className="admin-filter-control"
      value={searchKeyword}
      onChange={(e) => setSearchKeyword(e.target.value)}
      placeholder="搜索消息、昵称或用户ID"
    />
    <select
      className="admin-filter-control"
      value={statusFilter}
      onChange={(e) => {
        setStatusFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部状态</option>
      <option value="VISIBLE">可见</option>
      <option value="HIDDEN">隐藏</option>
      <option value="DELETED">删除</option>
    </select>
    <select
      className="admin-filter-control"
      value={actionFilter}
      onChange={(e) => {
        setActionFilter(e.target.value);
        applyFilterChange();
      }}
    >
      <option value="">全部作者</option>
      <option value="USER">真人</option>
      <option value="BOT">机器人</option>
      <option value="SYSTEM">系统</option>
    </select>
  </div>
)}
<div className="admin-filter-query-row">
  {activeTab === 'deposit-addresses' ? (
    activeDepositAddressSection === 'list' ? (
      <button type="button"
        onClick={() => {
          if (isLoadingList) return;
          fetchData();
        }}
        disabled={isLoadingList}
        className="pressable admin-filter-action admin-filter-action--query"
      >
        查询
      </button>
    ) : null
  ) : (
    <button type="button"
      onClick={() => {
        if (isLoadingList) return;
        fetchData();
      }}
      disabled={isLoadingList}
      className="pressable admin-filter-action admin-filter-action--query"
    >
      查询
    </button>
  )}
</div>
         </div>

  );
}
