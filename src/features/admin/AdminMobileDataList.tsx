import AvatarImage from '@/ui/AvatarImage';
import {
  getPromotionTypeLabel,
  getTransactionActionLabel,
  getUserTypeLabel,
} from '@/types';
import PromotionEffectStatsRow from '@/features/promote/PromotionEffectStatsRow';
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

const userRoleLabel = (item: any) => (item?.role === 'ADMIN' ? '管理员' : '用户');

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
    return { label: '低于最低入账', className: 'bg-orange-50 text-orange-600', active: false };
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

type AdminMobileDataListProps = {
  activeTab: AdminTab;
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
  updatePostPublishState: (item: any, isPublished: boolean) => void;
  startEditingPostCategory: (item: any) => void;
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

export function AdminMobileDataList({
  activeTab,
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
  updatePostPublishState,
  startEditingPostCategory,
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
}: AdminMobileDataListProps) {
  return (
                <div className="admin-mobile-list lg:hidden">
                  {isLoadingList ? (
                    <div className="admin-table-state-cell text-sm">数据加载中...</div>
                  ) : listError ? (
                    <div className="admin-mobile-error-state">
                      <div>{listError}</div>
                      <button
                        type="button"
                        onClick={submitListQuery}
                        className="pressable mt-3 admin-table-action admin-table-action--comfortable admin-tone-danger"
                      >
                        重试
                      </button>
                    </div>
                  ) : dataList.length === 0 ? (
                    <div className="admin-table-state-cell text-sm">暂无相关记录</div>
                  ) : (
                    dataList.map((item) => (
                      <div key={item.id} className="admin-mobile-list-item">
                        {activeTab === 'content' && (
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="admin-text-title-sm line-clamp-2">{item.title}</div>
                                <div className="admin-table-meta admin-table-meta--muted mt-1 line-clamp-2">{item.content?.substring(0, 70)}</div>
                              </div>
                              <a
                                href={`/post/${item.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="pressable admin-table-action admin-tone-neutral"
                              >
                                详情
                              </a>
                            </div>
                            <div className="admin-table-meta-row">
                              <span>
                                分类：
                                {editingPostCategoryId === item.id ? (
                                  <span className="ml-1 inline-flex items-center gap-2">
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
                                    <button
                                      type="button"
                                      onClick={() => updatePostCategory(item)}
                                      disabled={processingAdminActionId === item.id || editingPostDraftCategoryId === (item.category?.id || '')}
                                      className={`pressable admin-table-action admin-table-action--compact ${
                                        editingPostDraftCategoryId === (item.category?.id || '')
                                          ? 'admin-tone-neutral'
                                          : 'admin-tone-primary'
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
                                  </span>
                                ) : (
                                  <span className="ml-1">{item.category?.name || '未分类'}</span>
                                )}
                              </span>
                              <span>发布者：{item.user?.displayName || '-'}</span>
                              <span>Source：{item.source || '-'}</span>
                              <span>状态：{item.isPublished !== false ? '已上架' : '已下架'}</span>
                              <span>发布时间：{renderCompactDateTime(item.createdAt)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => updatePostPublishState(item, item.isPublished === false)}
                              disabled={processingAdminActionId === item.id}
                              className={`pressable admin-table-action admin-table-action--block admin-table-action--full ${
                                item.isPublished === false
                                  ? 'admin-tone-success'
                                  : 'admin-tone-neutral-strong'
                              }`}
                            >
                              {processingAdminActionId === item.id ? '处理中' : item.isPublished === false ? '上架内容' : '下架内容'}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditingPostCategory(item)}
                              disabled={processingAdminActionId === item.id}
                              className="pressable admin-table-action admin-table-action--block admin-table-action--full admin-tone-neutral-strong"
                            >
                              {processingAdminActionId === item.id ? '处理中' : '改分类'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePostPermanently(item)}
                              disabled={processingAdminActionId === item.id}
                              className={`pressable admin-table-action admin-table-action--block admin-table-action--full ${
                                processingAdminActionId === item.id ? 'admin-tone-danger-pressed' : 'admin-tone-danger'
                              }`}
                            >
                              {processingAdminActionId === item.id ? '处理中' : '永久删除'}
                            </button>
                          </div>
                        )}
                        {activeTab === 'promotions' && (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="admin-text-title-sm">
                                  {getPromotionTypeLabel(item.type || '')} · {getPromotionSlotLabel(item.slotIndex, item.type || '')}
                                </div>
                                <div className="admin-table-meta admin-table-meta--muted mt-1">ID: {item.id}</div>
                                <div className="admin-table-meta admin-table-meta--muted">发布者：{item.user?.displayName || '-'}</div>
                              </div>
                              <span className={`admin-status-badge admin-status-badge--compact ${isPromotionActive(item) ? 'admin-tone-success' : 'admin-tone-neutral'}`}>
                                {isPromotionActive(item) ? '进行中' : '已下线'}
                              </span>
                            </div>
                            <div className="admin-table-meta admin-table-meta--muted flex flex-col gap-1">
                              <span>开始：{item.startsAt ? renderCompactDateTime(item.startsAt) : '-'}</span>
                              <span>结束：{item.endsAt ? renderCompactDateTime(item.endsAt) : '-'}</span>
                              <span>
                                链接：
                                {(() => {
                                  const targetLink = getPromotionTargetLink(item);
                                  return targetLink ? (
                                    <a href={targetLink.href} target="_blank" rel="noreferrer" className="admin-mobile-link">
                                      {targetLink.label}
                                    </a>
                                  ) : '未设置';
                                })()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.adImageUrl ? (
                                <img src={item.adImageUrl} className="admin-ad-thumb admin-ad-thumb--card-desktop" alt="电脑端广告图" />
                              ) : (
                                <span className="admin-table-meta">无电脑图</span>
                              )}
                              {item.adMobileImageUrl ? (
                                <img src={item.adMobileImageUrl} className="admin-ad-thumb admin-ad-thumb--card-mobile" alt="移动端广告图" />
                              ) : (
                                <span className="admin-table-meta">无移动图</span>
                              )}
                            </div>
                            <PromotionEffectStatsRow stats={item.effectStats} className="promotion-effect-stats--admin-card" />
                            {isAdHomePromotion(item) ? (
                              <button
                                type="button"
                                onClick={() => startEditingPromotion(item)}
                                disabled={processingAdminActionId === item.id}
                                className="pressable admin-table-action admin-table-action--block admin-table-action--full admin-tone-info"
                              >
                                编辑核心信息
                              </button>
                            ) : (
                              <div className="admin-mobile-muted-card admin-mobile-muted-card--center admin-field-label">
                                仅横幅广告支持编辑核心信息
                              </div>
                            )}
                            {isAdHomePromotion(item) && editingPromotionId === item.id ? (
                              <div className="admin-mobile-overlay">
                                <div className="admin-editor-panel">
                                  <div className="admin-editor-panel-title">编辑广告核心信息</div>
                                  <div className="grid gap-2">
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
                                  <div className="mt-4 grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updatePromotion(item)}
                                      disabled={processingAdminActionId === item.id}
                                      className={`pressable admin-table-action admin-table-action--block ${
                                        'admin-tone-primary'
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
                            <button
                              type="button"
                              onClick={() => togglePromotionActiveState(item, !isPromotionActive(item))}
                              disabled={processingAdminActionId === item.id}
                              className={`pressable admin-table-action admin-table-action--block admin-table-action--full ${
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
                              className={`pressable admin-table-action admin-table-action--block admin-table-action--full ${
                                processingAdminActionId === item.id ? 'admin-tone-danger-pressed' : 'admin-tone-danger'
                              }`}
                            >
                              {processingAdminActionId === item.id ? '处理中' : '取消投放'}
                            </button>
                          </div>
                        )}
                        {activeTab === 'users' && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <AvatarImage
                                src={item.photoUrl || ''}
                                name={item.displayName}
                                id={item.id}
                                className="admin-user-list-avatar admin-user-list-avatar--mobile"
                                variant="thumb"
                              />
                              <div className="min-w-0">
                                <div className="admin-text-title-sm">{item.displayName}</div>
                                <div className="admin-table-meta admin-table-meta--mono admin-table-meta--muted">ID: {item.id}</div>
                              </div>
                            </div>
                            <div className="admin-table-meta-row">
                              <span>积分：{item.points}</span>
                              <span>
                                类型：{getUserTypeLabel(item.userType)}
                              </span>
                              <span>角色：{userRoleLabel(item)}</span>
                              <span>状态：{item.isDisabled ? '已禁用' : '正常'}</span>
                            </div>
                            <div className="admin-table-meta">{renderCompactDateTime(item.createdAt)}</div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => updateUserPoints(item, 'INCREASE')}
                                disabled={processingAdminActionId === item.id}
                                className={`pressable admin-table-action admin-table-action--block ${
                                  'admin-tone-success'
                                }`}
                              >
                                {processingAdminActionId === item.id ? '处理中' : '上分'}
                              </button>
                              <button
                                type="button"
                                onClick={() => updateUserPoints(item, 'DECREASE')}
                                disabled={processingAdminActionId === item.id}
                                className={`pressable admin-table-action admin-table-action--block ${
                                  'admin-tone-neutral-strong'
                                }`}
                              >
                                {processingAdminActionId === item.id ? '处理中' : '下分'}
                              </button>
                            </div>
                            {item.role === 'ADMIN' ? null : (
                              <button
                                type="button"
                                onClick={() => updateUserDisabledState(item, !item.isDisabled)}
                                disabled={processingAdminActionId === item.id}
                                className={`pressable admin-table-action admin-table-action--block admin-table-action--full ${
                                  item.isDisabled
                                    ? 'admin-tone-success'
                                    : 'admin-tone-neutral-strong'
                                }`}
                              >
                                {processingAdminActionId === item.id ? '处理中' : item.isDisabled ? '启用用户' : '禁用用户'}
                              </button>
                            )}
                            {item.role === 'ADMIN' && (
                              <div className="admin-empty-note">
                                管理员账号不可禁用
                              </div>
                            )}
                          </div>
                        )}
                        {activeTab === 'orders' && (
                          <div className="space-y-3">
                            <div className="admin-text-title-sm">{item.user?.displayName || '未知用户'}</div>
                            {item.txHash ? (
                              <div className="admin-table-meta admin-table-meta--mono admin-table-meta--muted admin-table-meta--break">哈希：{item.txHash}</div>
                            ) : null}
                            <div className="admin-table-meta-row">
                              <span>订单号：{item.id}</span>
                              <span>金额：{item.usdtAmount} USDT</span>
                              <span>积分：{getAdminRechargeDisplayPoints(item)}</span>
                            </div>
                            <div className="admin-table-meta-row">
                              {(() => {
                                const meta = getRechargeStatusMeta(item);
                                return (
                                  <span className={`admin-status-badge ${meta.className}`}>
                                    {meta.label}
                                  </span>
                                );
                              })()}
                            </div>
                            {getRechargeStatusMeta(item).active && item.autoCredit !== false && (
                              <div className="admin-table-meta">扫描次数：{item.scanAttempts || 0}</div>
                            )}
                            <div className="admin-table-meta">
                              申请：{renderCompactDateTime(item.createdAt)} | 完成：{item.creditedAt || item.confirmedAt ? renderCompactDateTime(item.creditedAt || item.confirmedAt) : '-'}
                            </div>
                            {isRechargeManuallyConfirmable(item) && (
                              <button
                                type="button"
                                onClick={() => creditManualRechargeOrder(item)}
                                disabled={processingOrderId === item.id}
                                className="admin-table-action admin-table-action--block admin-table-action--full admin-tone-primary"
                              >
                                {processingOrderId === item.id ? '处理中' : '确认到账'}
                              </button>
                            )}
                          </div>
                        )}
                        {activeTab === 'deposit-addresses' && (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="admin-data-copy">{item.address}</div>
                                <div className="mt-1 admin-table-meta admin-table-meta--mono">ID: {item.id}</div>
                              </div>
                              <span className={`admin-status-badge ${
                                item.status === 'ASSIGNED'
                                  ? 'admin-tone-neutral-strong'
                                  : item.status === 'DISABLED'
                                    ? 'admin-tone-neutral'
                                    : 'admin-tone-success'
                              }`}>
                                {item.status === 'ASSIGNED' ? '已分配' : item.status === 'DISABLED' ? '停用' : '可用'}
                              </span>
                            </div>
                            <div className="admin-mobile-muted-card">
                              <div className="admin-card-kicker">绑定用户</div>
                              <div className="mt-1 admin-text-strong-xs">{item.user?.displayName || '未分配'}</div>
                              {item.userId && <div className="mt-1 break-all admin-table-meta admin-table-meta--mono admin-table-meta--strong">ID: {item.userId}</div>}
                            </div>
                            <div className="admin-table-meta-row">
                              <span>来源：{item.source === 'HD' ? '自动派生' : item.source === 'FALLBACK' ? '兜底' : '地址池'}</span>
                              {item.derivationIndex !== null && item.derivationIndex !== undefined && <span>序号：{item.derivationIndex}</span>}
                              <span>最近归集：{item.lastSweptAt ? renderCompactDateTime(item.lastSweptAt) : '-'}</span>
                            </div>
                            <div className="admin-table-meta">
                              分配：{item.assignedAt ? renderCompactDateTime(item.assignedAt) : '-'} | 创建：{renderCompactDateTime(item.createdAt)}
                            </div>
                            {!item.userId && (
                              <button
                                type="button"
                                onClick={() => updateDepositAddressStatus(item.id, item.status === 'DISABLED' ? 'AVAILABLE' : 'DISABLED')}
                                className={`pressable admin-table-action admin-table-action--compact ${
                                  item.status === 'DISABLED'
                                    ? 'admin-tone-success'
                                    : 'admin-tone-neutral-strong'
                                }`}
                              >
                                {item.status === 'DISABLED' ? '启用' : '停用'}
                              </button>
                            )}
                          </div>
                        )}
                        {activeTab === 'chat' && (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="admin-text-title-sm">{item.authorName || '-'}</div>
                                <div className="mt-1 admin-data-copy admin-data-copy--muted">
                                  ID: {item.authorUserId || item.botProfileId || 'system'}
                                </div>
                              </div>
                              <span className={`admin-status-badge ${
                                item.authorType === 'BOT'
                                  ? 'admin-tone-info'
                                  : item.authorType === 'SYSTEM'
                                    ? 'admin-tone-warning'
                                    : 'admin-tone-success'
                              }`}>
                                {item.authorType === 'BOT' ? '机器人' : item.authorType === 'SYSTEM' ? '系统' : '真人'}
                              </span>
                            </div>
                            <div className="admin-mobile-message-card">
                              {getAdminChatMessageBody(item)}
                            </div>
                            <div className="admin-table-meta-row">
                              <span>状态：{item.status === 'VISIBLE' ? '可见' : item.status === 'HIDDEN' ? '隐藏' : '删除'}</span>
                              <span>时间：{renderCompactDateTime(item.createdAt)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {item.status !== 'VISIBLE' ? (
                                <button
                                  type="button"
                                  onClick={() => updateChatMessageStatus(item, 'VISIBLE')}
                                  disabled={processingAdminActionId === item.id}
                                  className="pressable admin-table-action admin-table-action--block admin-tone-success"
                                >
                                  恢复
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => updateChatMessageStatus(item, 'HIDDEN')}
                                  disabled={processingAdminActionId === item.id}
                                  className="pressable admin-table-action admin-table-action--block admin-tone-neutral-strong"
                                >
                                  隐藏
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => updateChatMessageStatus(item, 'DELETED')}
                                disabled={processingAdminActionId === item.id}
                                className="pressable admin-table-action admin-table-action--block admin-tone-danger"
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
                                      className="pressable admin-table-action admin-table-action--block admin-tone-warning"
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </>
                              ) : null}
                            </div>
                          </div>
                        )}
                        {activeTab === 'transactions' && (
                          <div className="space-y-3">
                            <div className="admin-text-title-sm">{item.user?.displayName || '系统'}</div>
                            <div className="admin-table-meta admin-table-meta--mono admin-table-meta--muted admin-table-meta--break">订单号：{item.id}</div>
                            <div className="admin-table-meta-row">
                              <span>{getTransactionTypeLabel(item)}</span>
                              <span>说明：{item.description || '-'}</span>
                            </div>
                            <div className="admin-mobile-amount-value" data-tone={item.amount > 0 ? 'positive' : 'negative'}>
                              <span>
                                {item.amount > 0 ? `+${item.amount}` : item.amount}
                              </span>
                              <span className="admin-table-unit">积分</span>
                            </div>
                            <div className="admin-table-meta">时间：{renderCompactDateTime(item.createdAt)}</div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  </div>
  );
}
