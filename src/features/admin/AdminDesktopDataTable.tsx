import AvatarImage from '@/ui/AvatarImage';
import {
  getPromotionTypeLabel,
  getTransactionActionLabel,
  getUserTypeLabel,
} from '@/types';
import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';
import { AdminTableHeader } from './AdminTableHeader';
import type { AdminTab } from './adminTypes';

function getAdminChatMessageBody(item: any) {
  const body = String(item?.body || '').trim();
  if (body) return body;
  const metadata = item?.metadata;
  const imageCount = Array.isArray(metadata?.images)
    ? metadata.images.length
    : Number(metadata?.imageCount || 0);
  if (metadata?.kind === 'post_created' && imageCount > 0) return '图片动态';
  return '-';
}

const renderCompactDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

const isPromotionActive = (item: any) => {
  const now = Date.now();
  const startsAt = item?.startsAt ? new Date(item.startsAt).getTime() : NaN;
  const endsAt = item?.endsAt ? new Date(item.endsAt).getTime() : NaN;
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && endsAt > now;
};

const isAdHomePromotion = (item: any) => item?.type === 'AD_HOME' || item?.type === 'PIN_CHAT';

const getPromotionTargetLink = (item: any) => {
  const postId = String(item?.postId || item?.post?.id || '').trim();
  if (postId) {
    return {
      href: '/post/' + postId,
      label: '/post/' + postId,
    };
  }
  const adTargetUrl = String(item?.adTargetUrl || '').trim();
  return adTargetUrl
    ? {
        href: adTargetUrl,
        label: adTargetUrl,
      }
    : null;
};

const getPromotionSlotLabel = (slotIndex: number, type: string) => {
  if (type === 'AD_HOME' || type === 'PIN_CHAT') {
    if (slotIndex === 0) return '第1位';
    if (slotIndex === 1) return '第2位';
    if (slotIndex === 2) return '第3位';
  }
  return '#' + (Number.isFinite(slotIndex) ? slotIndex : '-');
};

const getRechargeStatusMeta = (item: any) => {
  const status = String(item?.status || '');
  if (status === 'CREDITED') {
    return { label: '已到账', className: 'admin-tone-success', active: false };
  }
  if (status === 'WAITING_PAYMENT') {
    return { label: '自动扫描中', className: 'admin-tone-warning', active: true };
  }
  if (status === 'MANUAL_REVIEW') {
    return { label: '兜底待处理', className: 'admin-tone-neutral-strong', active: false };
  }
  if (status === 'EXPIRED') {
    return { label: '已过期', className: 'admin-tone-neutral', active: false };
  }
  if (status === 'BELOW_MINIMUM') {
    return { label: '低于最低入账', className: 'admin-tone-below-minimum', active: false };
  }
  if (status === 'CANCELLED') {
    return { label: '已取消', className: 'admin-tone-neutral', active: false };
  }
  return { label: '失败', className: 'admin-tone-danger', active: false };
};

const isRechargeManuallyConfirmable = (item: any) => (
  item?.status === 'MANUAL_REVIEW' || item?.status === 'WAITING_PAYMENT'
);

const getTransactionTypeLabel = (item: any) => getTransactionActionLabel(item?.action, item?.description);

type AdminDesktopDataTableProps = {
  activeTab: AdminTab;
  tableColumnCount: number;
  isLoadingList: boolean;
  listError: string;
  submitListQuery: () => void;
  dataList: any[];
  editingPostCategoryId: string;
  editingPostDraftCategoryId: string;
  setEditingPostDraftCategoryId: (value: string) => void;
  processingAdminActionId: string;
  categories?: any[];
  updatePostCategory: (item: any) => void;
  cancelPostCategoryEdit: () => void;
  startEditingPostCategory: (item: any) => void;
  updatePostPublishState: (item: any, isPublished: boolean) => void;
  deletePostPermanently: (item: any) => void;
  startEditingPromotion: (item: any) => void;
  editingPromotionId: string;
  editingPromotionTargetUrl: string;
  setEditingPromotionTargetUrl: (value: string) => void;
  editingPromotionAdImageUrl: string;
  setEditingPromotionAdImageUrl: (value: string) => void;
  editingPromotionAdMobileImageUrl: string;
  setEditingPromotionAdMobileImageUrl: (value: string) => void;
  updatePromotion: (item: any) => void;
  cancelEditingPromotion: () => void;
  togglePromotionActiveState: (item: any, isActive: boolean) => void;
  cancelPromotionAndReleaseSlot: (item: any) => void;
  updateUserPoints: (item: any, changeType: 'INCREASE' | 'DECREASE') => void;
  updateUserDisabledState: (item: any, isDisabled: boolean) => void;
  getAdminRechargeDisplayPoints: (item: any) => number;
  creditManualRechargeOrder: (item: any) => void;
  processingOrderId: string;
  updateDepositAddressStatus: (id: string, status: 'AVAILABLE' | 'DISABLED') => void;
  updateChatMessageStatus: (item: any, status: 'VISIBLE' | 'HIDDEN' | 'DELETED') => void;
  muteChatAuthor: (item: any, options: { label: string; minutes?: number; permanent?: boolean }) => void;
};

export function AdminDesktopDataTable({
  activeTab,
  tableColumnCount,
  isLoadingList,
  listError,
  submitListQuery,
  dataList,
  editingPostCategoryId,
  editingPostDraftCategoryId,
  setEditingPostDraftCategoryId,
  processingAdminActionId,
  categories,
  updatePostCategory,
  cancelPostCategoryEdit,
  startEditingPostCategory,
  updatePostPublishState,
  deletePostPermanently,
  startEditingPromotion,
  editingPromotionId,
  editingPromotionTargetUrl,
  setEditingPromotionTargetUrl,
  editingPromotionAdImageUrl,
  setEditingPromotionAdImageUrl,
  editingPromotionAdMobileImageUrl,
  setEditingPromotionAdMobileImageUrl,
  updatePromotion,
  cancelEditingPromotion,
  togglePromotionActiveState,
  cancelPromotionAndReleaseSlot,
  updateUserPoints,
  updateUserDisabledState,
  getAdminRechargeDisplayPoints,
  creditManualRechargeOrder,
  processingOrderId,
  updateDepositAddressStatus,
  updateChatMessageStatus,
  muteChatAuthor,
}: AdminDesktopDataTableProps) {
  return (
                <div className="admin-table-scroll admin-responsive-desktop-list overflow-x-auto scrollbar-hide pt-2">
                  <div className="admin-table-width" data-admin-table={activeTab}>
                  <table className="w-full text-left table whitespace-nowrap">
                   <AdminTableHeader activeTab={activeTab} />
                   <tbody className="divide-y divide-gray-50">
                      {isLoadingList ? (
                         <tr><td colSpan={tableColumnCount} className="admin-table-state-cell">数据加载中...</td></tr>
                      ) : listError ? (
                         <tr>
                           <td colSpan={tableColumnCount} className="admin-table-state-cell admin-table-state-cell--danger">
                             <div>{listError}</div>
                          <button
                            type="button"
                            onClick={submitListQuery}
                            className="pressable mt-3 admin-table-action admin-table-action--comfortable admin-tone-danger"
                          >
                            重试
                          </button>
                           </td>
                         </tr>
                      ) : dataList.length === 0 ? (
                         <tr><td colSpan={tableColumnCount} className="admin-table-state-cell">暂无相关记录</td></tr>
                      ) : (
                        dataList.map((item) => (
                          <tr key={item.id} className="admin-table-row-interactive transition-colors">
                            {activeTab === 'content' ? (
                              <>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col max-w-xs">
                                    <span className="admin-text-title-sm line-clamp-1">{item.title}</span>
                                    <span className="admin-table-meta truncate">{(item.content || '').substring(0, 40)}...</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {editingPostCategoryId === item.id ? (
                                    <div className="space-y-2">
                                      <select
                                        className="admin-form-control admin-form-control--compact"
                                        value={editingPostDraftCategoryId}
                                        onChange={(e) => setEditingPostDraftCategoryId(e.target.value)}
                                        disabled={processingAdminActionId === item.id}
                                      >
                                        <option value="">选择分类</option>
                                        {categories?.map((category) => (
                                          <option key={category.id} value={category.id}>{category.name}</option>
                                        ))}
                                      </select>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => updatePostCategory(item)}
                                          disabled={processingAdminActionId === item.id || editingPostDraftCategoryId === (item.category?.id || '')}
                                          className={`pressable admin-table-action admin-table-action--compact ${
                                            editingPostDraftCategoryId === (item.category?.id || '')
                                              ? 'admin-tone-neutral'
                                              : 'admin-primary-action'
                                          }`}
                                        >
                                          {processingAdminActionId === item.id ? '处理中' : '保存'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelPostCategoryEdit}
                                          disabled={processingAdminActionId === item.id}
                                          className="pressable admin-table-action admin-table-action--compact admin-tone-neutral-strong"
                                        >
                                          取消
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="admin-table-meta admin-table-meta--muted admin-table-meta--strong">{item.category?.name || '未分类'}</span>
                                      <button
                                        type="button"
                                        onClick={() => startEditingPostCategory(item)}
                                        className="pressable admin-table-action admin-table-action--compact admin-tone-neutral"
                                      >
                                        改分类
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 admin-text-strong-xs">{item.user?.displayName}</td>
                                <td className="px-6 py-4">
                                  <span className="admin-table-meta admin-table-meta--mono admin-table-meta--break">{item.source || '-'}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`admin-status-badge ${item.isPublished !== false ? 'admin-tone-success' : 'admin-tone-neutral'}`}>
                                    {item.isPublished !== false ? '已上架' : '已下架'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 admin-table-meta">{new Date(item.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right">
                                   <div className="flex items-center justify-end gap-2">
                                     <a
                                       href={`/post/${item.id}`}
                                       target="_blank"
                                       rel="noreferrer"
                                       className="pressable admin-table-action admin-tone-neutral"
                                     >
                                       详情
                                     </a>
                                     <button
                                       type="button"
                                       onClick={() => updatePostPublishState(item, item.isPublished === false)}
                                       disabled={processingAdminActionId === item.id}
                                       className={`pressable admin-table-action ${
                                         item.isPublished === false
                                           ? 'admin-tone-success'
                                           : 'admin-tone-neutral-strong'
                                       }`}
                                      >
                                        {processingAdminActionId === item.id ? '处理中' : item.isPublished === false ? '上架' : '下架'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deletePostPermanently(item)}
                                        disabled={processingAdminActionId === item.id}
                                        className={`pressable admin-table-action ${
                                          processingAdminActionId === item.id ? 'admin-tone-danger-pressed' : 'admin-tone-danger'
                                        }`}
                                      >
                                        {processingAdminActionId === item.id ? '处理中' : '永久删除'}
                                      </button>
                                   </div>
                                </td>
                              </>
                            ) : activeTab === 'promotions' ? (
                              <>
                                <td className="px-6 py-4 admin-text-strong-xs">{getPromotionTypeLabel(item.type || '')}</td>
                                <td className="px-6 py-4 admin-table-unit">{getPromotionSlotLabel(item.slotIndex, item.type || '')}</td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="admin-text-strong-xs">{item.user?.displayName || '-'}</span>
                                    <span className="admin-table-meta admin-table-meta--muted">ID: {item.userId || '-'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 admin-table-state-cell">
                                  <span className={`admin-status-badge admin-status-badge--compact ${isPromotionActive(item) ? 'admin-tone-success' : 'admin-tone-neutral'}`}>
                                    {isPromotionActive(item) ? '进行中' : '已下线'}
                                  </span>
                                  <div className="mt-1 admin-table-meta">开始：{item.startsAt ? renderCompactDateTime(item.startsAt) : '-'}</div>
                                  <div className="admin-table-meta">结束：{item.endsAt ? renderCompactDateTime(item.endsAt) : '-'}</div>
                                </td>
                                <td className="px-6 py-4">
                                  {(() => {
                                    const targetLink = getPromotionTargetLink(item);
                                    return targetLink ? (
                                      <a
                                        href={targetLink.href}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-table-link"
                                      >
                                        {targetLink.label}
                                      </a>
                                    ) : (
                                      <span className="admin-table-meta">未设置</span>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-4 text-xs">
                                  <div className="flex items-center gap-2">
                                    {item.adImageUrl ? (
                                      <img src={item.adImageUrl} className="admin-ad-thumb admin-ad-thumb--table-desktop" alt="广告图片" />
                                    ) : (
                                      <span className="admin-table-meta">无电脑图</span>
                                    )}
                                    {item.adMobileImageUrl ? (
                                      <img src={item.adMobileImageUrl} className="admin-ad-thumb admin-ad-thumb--table-mobile" alt="移动广告图片" />
                                    ) : (
                                      <span className="admin-table-meta">无移动图</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <PromotionEffectStatsRow stats={item.effectStats} className="promotion-effect-stats--admin-table" />
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {isAdHomePromotion(item) ? (
                                      <button
                                        type="button"
                                        onClick={() => startEditingPromotion(item)}
                                        disabled={processingAdminActionId === item.id}
                                        className="pressable admin-table-action admin-tone-info"
                                      >
                                        编辑核心信息
                                      </button>
                                    ) : (
                                      <span className="admin-table-action admin-tone-neutral-soft">
                                        仅横幅广告可编辑核心信息
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => togglePromotionActiveState(item, !isPromotionActive(item))}
                                      disabled={processingAdminActionId === item.id}
                                      className={`pressable admin-table-action ${
                                        isPromotionActive(item)
                                          ? 'admin-tone-neutral-strong'
                                          : 'admin-tone-success'
                                      }`}
                                    >
                                      {processingAdminActionId === item.id ? '处理中' : isPromotionActive(item) ? '暂停展示' : '恢复展示'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => cancelPromotionAndReleaseSlot(item)}
                                      disabled={processingAdminActionId === item.id}
                                      className={`pressable admin-table-action ${
                                        processingAdminActionId === item.id ? 'admin-tone-danger-pressed' : 'admin-tone-danger'
                                      }`}
                                    >
                                      {processingAdminActionId === item.id ? '处理中' : '取消投放'}
                                    </button>
                                  </div>
                                  {isAdHomePromotion(item) && editingPromotionId === item.id ? (
                                    <div className="admin-dialog-overlay admin-modal-scrim-soft">
                                      <div className="admin-editor-panel">
                                        <div className="admin-editor-panel-title">编辑广告核心信息</div>
                                        <div className="admin-editor-field-stack">
                                          <input
                                            className="admin-form-control"
                                            value={editingPromotionTargetUrl}
                                            onChange={(e) => setEditingPromotionTargetUrl(e.target.value)}
                                            placeholder="广告跳转链接"
                                          />
                                          <input
                                            className="admin-form-control"
                                            value={editingPromotionAdImageUrl}
                                            onChange={(e) => setEditingPromotionAdImageUrl(e.target.value)}
                                            placeholder="电脑端广告图片地址"
                                          />
                                          <input
                                            className="admin-form-control"
                                            value={editingPromotionAdMobileImageUrl}
                                            onChange={(e) => setEditingPromotionAdMobileImageUrl(e.target.value)}
                                            placeholder="移动端广告图片地址"
                                          />
                                        </div>
                                        <div className="admin-editor-action-grid">
                                          <button
                                            type="button"
                                            onClick={() => updatePromotion(item)}
                                            disabled={processingAdminActionId === item.id}
                                            className={`pressable admin-table-action admin-table-action--block ${
                                              processingAdminActionId === item.id ? 'admin-primary-action admin-primary-action--muted' : 'admin-primary-action'
                                            }`}
                                          >
                                            {processingAdminActionId === item.id ? '处理中' : '保存'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEditingPromotion}
                                            disabled={processingAdminActionId === item.id}
                                            className="pressable admin-table-action admin-table-action--block admin-tone-neutral-strong"
                                          >
                                            取消
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </td>
                              </>
                            ) : activeTab === 'users' ? (
                              <>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                     <AvatarImage
                                       src={item.photoUrl || ''}
                                       name={item.displayName}
                                       id={item.id}
                                       className="admin-user-list-avatar"
                                       variant="thumb"
                                     />
                                     <div className="flex flex-col">
                                       <span className="admin-text-title-sm">{item.displayName}</span>
                                       <span className="admin-table-meta admin-table-meta--mono">ID: {item.id}</span>
                                       {item.isDisabled && (
                                         <span className="mt-1 admin-inline-badge admin-tone-danger">
                                           已禁用
                                         </span>
                                       )}
                                     </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 admin-text-value-sm">{item.points}</td>
                                <td className="px-6 py-4">
                                  <span className={`admin-status-badge ${
                                    item.userType === 'ROBOT'
                                      ? 'admin-tone-neutral-soft'
                                      : item.userType === 'OFFICIAL'
                                        ? 'admin-tone-neutral-soft'
                                        : 'admin-tone-neutral-soft'
                                  }`}>
                                      {getUserTypeLabel(item.userType)}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`admin-status-badge ${item.role === 'ADMIN' ? 'admin-tone-warning' : 'admin-tone-neutral-soft'}`}>
                                    {item.role === 'ADMIN' ? '管理员' : '用户'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 admin-table-meta">{new Date(item.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateUserPoints(item, 'INCREASE')}
                                      disabled={processingAdminActionId === item.id}
                                      className="pressable admin-table-action admin-tone-success"
                                    >
                                      {processingAdminActionId === item.id ? '处理中' : '上分'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateUserPoints(item, 'DECREASE')}
                                      disabled={processingAdminActionId === item.id}
                                      className="pressable admin-table-action admin-tone-neutral-strong"
                                    >
                                      {processingAdminActionId === item.id ? '处理中' : '下分'}
                                    </button>
                                    {item.role === 'ADMIN' ? (
                                      <span className="admin-table-meta admin-table-meta--strong">管理员</span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => updateUserDisabledState(item, !item.isDisabled)}
                                        disabled={processingAdminActionId === item.id}
                                        className={`pressable admin-table-action ${
                                          item.isDisabled
                                            ? 'admin-tone-success'
                                            : 'admin-tone-neutral-strong'
                                        }`}
                                      >
                                        {processingAdminActionId === item.id ? '处理中' : item.isDisabled ? '启用' : '禁用'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </>
                            ) : activeTab === 'orders' ? (
                              <>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="admin-text-title-sm">{item.user?.displayName || '未知用户'}</span>
                                    <span className="admin-table-meta admin-table-meta--mono">ID: {item.user?.id || item.userId}</span>
                                    <span className="admin-table-meta">@{item.user?.loginAccount || 'unknown'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  {item.txHash ? (
                                    <span className="admin-data-copy">{item.txHash}</span>
                                  ) : (
                                    <span className="admin-table-meta">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="admin-data-copy admin-data-copy--muted">{item.id}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="admin-text-value-sm">{item.usdtAmount}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="admin-text-value-sm admin-value-success">{getAdminRechargeDisplayPoints(item)}</span>
                                </td>
                                <td className="px-6 py-4">
                                  {(() => {
                                    const meta = getRechargeStatusMeta(item);
                                    return (
                                      <span className={`admin-status-badge ${meta.className}`}>
                                        {meta.label}
                                      </span>
                                    );
                                  })()}
                                  {getRechargeStatusMeta(item).active && item.autoCredit !== false && (
                                    <div className="mt-1 admin-table-meta">
                                      扫描 {item.scanAttempts || 0} 次
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 admin-table-meta">{new Date(item.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-4 admin-table-meta">
                                  {item.status === 'CREDITED' && (item.creditedAt || item.confirmedAt)
                                    ? new Date(item.creditedAt || item.confirmedAt).toLocaleString()
                                    : '-'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {isRechargeManuallyConfirmable(item) && (
                                    <button
                                      type="button"
                                      onClick={() => creditManualRechargeOrder(item)}
                                      disabled={processingOrderId === item.id}
                                      className="pressable admin-table-action admin-tone-primary"
                                    >
                                      {processingOrderId === item.id ? '处理中' : '确认到账'}
                                    </button>
                                  )}
                                </td>

                            </>
                          ) : activeTab === 'deposit-addresses' ? (
                              <>
                                <td className="px-6 py-4 align-top">
                                  <div className="admin-cell-user-stack">
                                    <span className="admin-data-copy">{item.address}</span>
                                    <span className="admin-table-meta admin-table-meta--mono admin-table-meta--strong">ID: {item.id}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <span className={`admin-status-badge ${
                                    item.status === 'ASSIGNED'
                                      ? 'admin-tone-neutral-strong'
                                      : item.status === 'DISABLED'
                                        ? 'admin-tone-neutral'
                                        : 'admin-tone-success'
                                  }`}>
                                    {item.status === 'ASSIGNED' ? '已分配' : item.status === 'DISABLED' ? '停用' : '可用'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <div className="flex flex-col">
                                    <span className="admin-table-meta admin-table-meta--title">
                                      {item.source === 'HD' ? '自动派生' : item.source === 'FALLBACK' ? '兜底' : '地址池'}
                                    </span>
                                    {item.derivationIndex !== null && item.derivationIndex !== undefined && (
                                      <span className="mt-1 admin-table-meta admin-table-meta--mono admin-table-meta--strong">#{item.derivationIndex}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <div className="flex flex-col">
                                    <span className="admin-text-value-sm">{item.user?.displayName || '未分配'}</span>
                                    {item.userId && <span className="mt-1 admin-table-meta admin-table-meta--mono admin-table-meta--break">ID: {item.userId}</span>}
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top admin-table-meta admin-table-meta--strong">{item.assignedAt ? new Date(item.assignedAt).toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 align-top admin-table-meta admin-table-meta--strong">{item.lastSweptAt ? new Date(item.lastSweptAt).toLocaleString() : '-'}</td>
                                <td className="px-6 py-4 align-top admin-table-meta admin-table-meta--strong">{new Date(item.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-4 align-top admin-table-meta admin-table-meta--strong">{new Date(item.updatedAt).toLocaleString()}</td>
                                <td className="px-6 py-4 text-right align-top">
                                  {item.userId ? (
                                    <span className="admin-table-meta admin-table-meta--strong">已绑定</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => updateDepositAddressStatus(item.id, item.status === 'DISABLED' ? 'AVAILABLE' : 'DISABLED')}
                                      className={`pressable admin-table-action ${
                                        item.status === 'DISABLED'
                                          ? 'admin-tone-success'
                                          : 'admin-tone-neutral'
                                      }`}
                                    >
                                      {item.status === 'DISABLED' ? '启用' : '停用'}
                                    </button>
                                  )}
                                </td>
                              </>
                            ) : activeTab === 'chat' ? (
                              <>
                                <td className="px-6 py-4 align-top">
                                  <div className="flex flex-col">
                                    <span className="admin-text-title-sm">{item.authorName || '-'}</span>
                                    <span className="admin-table-meta admin-table-meta--mono admin-table-meta--break">
                                      ID: {item.authorUserId || item.botProfileId || 'system'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <span className={`admin-status-badge ${
                                    item.authorType === 'BOT'
                                      ? 'admin-tone-bot'
                                      : item.authorType === 'SYSTEM'
                                        ? 'admin-tone-warning'
                                        : 'admin-tone-success'
                                  }`}>
                                    {item.authorType === 'BOT' ? '机器人' : item.authorType === 'SYSTEM' ? '系统' : '真人'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <div className="admin-cell-content-copy">
                                    {getAdminChatMessageBody(item)}
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <span className={`admin-status-badge ${
                                    item.status === 'VISIBLE'
                                      ? 'admin-tone-success'
                                      : item.status === 'HIDDEN'
                                        ? 'admin-tone-neutral'
                                        : 'admin-tone-danger'
                                  }`}>
                                    {item.status === 'VISIBLE' ? '可见' : item.status === 'HIDDEN' ? '隐藏' : '删除'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 align-top admin-table-meta admin-table-meta--strong">{renderCompactDateTime(item.createdAt)}</td>
                                <td className="px-6 py-4 text-right align-top">
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    {item.status !== 'VISIBLE' ? (
                                      <button
                                        type="button"
                                        onClick={() => updateChatMessageStatus(item, 'VISIBLE')}
                                        disabled={processingAdminActionId === item.id}
                                        className="pressable admin-table-action admin-tone-success"
                                      >
                                        恢复
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => updateChatMessageStatus(item, 'HIDDEN')}
                                        disabled={processingAdminActionId === item.id}
                                        className="pressable admin-table-action admin-tone-neutral-strong"
                                      >
                                        隐藏
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => updateChatMessageStatus(item, 'DELETED')}
                                      disabled={processingAdminActionId === item.id}
                                      className="pressable admin-table-action admin-tone-danger"
                                    >
                                      删除
                                    </button>
                                    {item.authorType === 'USER' && item.authorUserId ? (
                                      <>
                                        {[
                                          { label: '禁言1天', minutes: 1440 },
                                          { label: '禁言7天', minutes: 10080 },
                                          { label: '永久禁言', permanent: true },
                                        ].map((option) => (
                                          <button
                                            key={option.label}
                                            type="button"
                                            onClick={() => muteChatAuthor(item, option)}
                                            disabled={processingAdminActionId === item.id}
                                            className="pressable admin-table-action admin-tone-warning"
                                          >
                                            {option.label}
                                          </button>
                                        ))}
                                      </>
                                    ) : null}
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="admin-text-title-sm">{item.user?.displayName || '系统'}</span>
                                    <span className="admin-table-meta admin-table-meta--mono">ID: {item.userId || 'system'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="admin-data-copy admin-data-copy--muted">{item.id}</span>
                                </td>
                                <td className="px-6 py-4">
                                   <div className="flex flex-col">
                                      <span className="admin-text-strong-xs">
                                        {getTransactionTypeLabel(item)}
                                      </span>
                                      <span className="admin-table-meta">{item.description}</span>
                                   </div>
                                </td>
                                <td className="px-6 py-4">
                                   <span className={`admin-text-value-sm ${item.amount > 0 ? 'admin-value-success' : 'admin-value-danger'}`}>
                                      {item.amount > 0 ? `+${item.amount}` : item.amount}
                                   </span>
                                </td>
                                <td className="px-6 py-4 admin-table-meta">
                                  {new Date(item.createdAt).toLocaleString()}
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                   </tbody>
                </table>
                </div>
                </div>

  );
}
