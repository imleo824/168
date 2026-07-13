import AvatarImage from '@/ui/AvatarImage';
import { getUserTypeLabel } from '@/types';

const renderCompactDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

const formatMemberExpireTime = (value?: string | null) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(value).toLocaleDateString('zh-CN', { year: '2-digit', month: '2-digit', day: '2-digit' });
};

const isAdminUserTuiPlusActive = (item: any) => {
  if (typeof item?.isTuiPlus === 'boolean') return item.isTuiPlus;
  const status = String(item?.plusStatus || '').trim().toUpperCase();
  const expiresAt = item?.plusExpiresAt ? new Date(item.plusExpiresAt).getTime() : 0;
  return (status === 'TRIALING' || status === 'ACTIVE') && Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const getMemberStatusMeta = (item: any) => {
  const active = isAdminUserTuiPlusActive(item);
  if (!active) return { active: false, label: '非会员', detail: '', className: 'admin-tone-neutral-soft' };

  const plan = String(item?.plusPlan || '').trim().toUpperCase();
  const planLabel = plan === 'YEARLY' ? '年付' : plan === 'MONTHLY' ? '月付' : plan === 'TRIAL' ? '试用' : '会员';
  const expiresText = formatMemberExpireTime(item?.plusExpiresAt);
  return {
    active: true,
    label: `会员 · ${planLabel}`,
    detail: expiresText ? `到期 ${expiresText}` : '',
    className: 'admin-tone-success',
  };
};

const userRoleLabel = (item: any) => (item?.role === 'ADMIN' ? '管理员' : '用户');

type AdminUsersDataListProps = {
  isLoadingList: boolean;
  listError: string;
  submitListQuery: () => void;
  dataList: any[];
  processingAdminActionId: string;
  updateUserPoints: (item: any, changeType: 'INCREASE' | 'DECREASE') => void;
  updateUserDisabledState: (item: any, isDisabled: boolean) => void;
};

export function AdminUsersDataList({
  isLoadingList,
  listError,
  submitListQuery,
  dataList,
  processingAdminActionId,
  updateUserPoints,
  updateUserDisabledState,
}: AdminUsersDataListProps) {
  if (isLoadingList) {
    return <div className="admin-table-state-cell text-sm">数据加载中...</div>;
  }

  if (listError) {
    return (
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
    );
  }

  if (dataList.length === 0) {
    return <div className="admin-table-state-cell text-sm">暂无相关记录</div>;
  }

  return (
    <>
      <div className="admin-table-scroll admin-responsive-desktop-list overflow-x-auto scrollbar-hide pt-2">
        <div className="admin-table-width" data-admin-table="users">
          <table className="w-full text-left table whitespace-nowrap">
            <thead>
              <tr className="admin-table-head-row">
                <th className="admin-table-head-cell">用户</th>
                <th className="admin-table-head-cell">积分余额</th>
                <th className="admin-table-head-cell">用户类型</th>
                <th className="admin-table-head-cell">是否会员</th>
                <th className="admin-table-head-cell">角色</th>
                <th className="admin-table-head-cell">注册时间</th>
                <th className="admin-table-head-cell admin-table-head-cell--right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dataList.map((item) => {
                const member = getMemberStatusMeta(item);
                return (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
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
                      <span className="admin-status-badge admin-tone-neutral-soft">
                        {getUserTypeLabel(item.userType)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`admin-status-badge ${member.className}`}>
                          {member.label}
                        </span>
                        {member.detail ? <span className="admin-table-meta admin-table-meta--muted">{member.detail}</span> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`admin-status-badge ${item.role === 'ADMIN' ? 'admin-tone-warning' : 'admin-tone-neutral-soft'}`}>
                        {userRoleLabel(item)}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-mobile-list lg:hidden">
        {dataList.map((item) => {
          const member = getMemberStatusMeta(item);
          return (
            <div key={`mobile-${item.id}`} className="admin-mobile-list-item">
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
                  <span>类型：{getUserTypeLabel(item.userType)}</span>
                  <span>会员：{member.label}{member.detail ? `（${member.detail}）` : ''}</span>
                  <span>角色：{userRoleLabel(item)}</span>
                  <span>状态：{item.isDisabled ? '已禁用' : '正常'}</span>
                </div>
                <div className="admin-table-meta">注册：{renderCompactDateTime(item.createdAt)}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateUserPoints(item, 'INCREASE')}
                    disabled={processingAdminActionId === item.id}
                    className="pressable admin-table-action admin-table-action--block admin-tone-success"
                  >
                    {processingAdminActionId === item.id ? '处理中' : '上分'}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateUserPoints(item, 'DECREASE')}
                    disabled={processingAdminActionId === item.id}
                    className="pressable admin-table-action admin-table-action--block admin-tone-neutral-strong"
                  >
                    {processingAdminActionId === item.id ? '处理中' : '下分'}
                  </button>
                </div>
                {item.role === 'ADMIN' ? (
                  <div className="admin-empty-note">管理员账号不可禁用</div>
                ) : (
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
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
