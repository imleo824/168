import type { AdminTab } from './adminTypes';

const headerCellClass = 'admin-table-head-cell';
const actionHeaderCellClass = `${headerCellClass} admin-table-head-cell--right`;

export function AdminTableHeader({ activeTab }: { activeTab: AdminTab }) {
  return (
    <thead>
      <tr className="admin-table-head-row">
        {activeTab === 'content' ? (
          <>
            <th className={headerCellClass}>标题</th>
            <th className={headerCellClass}>分类</th>
            <th className={headerCellClass}>发布者</th>
            <th className={headerCellClass}>Source</th>
            <th className={headerCellClass}>状态</th>
            <th className={headerCellClass}>发布时间</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : activeTab === 'promotions' ? (
          <>
            <th className={headerCellClass}>类型</th>
            <th className={headerCellClass}>展示位</th>
            <th className={headerCellClass}>用户</th>
            <th className={headerCellClass}>发布时间/状态</th>
            <th className={headerCellClass}>跳转链接</th>
            <th className={headerCellClass}>广告图片</th>
            <th className={headerCellClass}>效果分析</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : activeTab === 'users' ? (
          <>
            <th className={headerCellClass}>用户</th>
            <th className={headerCellClass}>积分余额</th>
            <th className={headerCellClass}>用户类型</th>
            <th className={headerCellClass}>角色</th>
            <th className={headerCellClass}>注册时间</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : activeTab === 'orders' ? (
          <>
            <th className={headerCellClass}>用户</th>
            <th className={headerCellClass}>链上哈希</th>
            <th className={headerCellClass}>订单号</th>
            <th className={headerCellClass}>充值金额</th>
            <th className={headerCellClass}>兑换积分</th>
            <th className={headerCellClass}>状态</th>
            <th className={headerCellClass}>申请时间</th>
            <th className={headerCellClass}>完成时间</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : activeTab === 'deposit-addresses' ? (
          <>
            <th className={headerCellClass}>收款地址</th>
            <th className={headerCellClass}>状态</th>
            <th className={headerCellClass}>来源</th>
            <th className={headerCellClass}>绑定用户</th>
            <th className={headerCellClass}>分配时间</th>
            <th className={headerCellClass}>最近归集</th>
            <th className={headerCellClass}>创建时间</th>
            <th className={headerCellClass}>更新时间</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : activeTab === 'chat' ? (
          <>
            <th className={headerCellClass}>作者</th>
            <th className={headerCellClass}>类型</th>
            <th className={headerCellClass}>消息</th>
            <th className={headerCellClass}>状态</th>
            <th className={headerCellClass}>时间</th>
            <th className={actionHeaderCellClass}>操作</th>
          </>
        ) : (
          <>
            <th className={headerCellClass}>用户</th>
            <th className={headerCellClass}>订单号</th>
            <th className={headerCellClass}>交易类型</th>
            <th className={headerCellClass}>交易</th>
            <th className={headerCellClass}>交易时间</th>
          </>
        )}
      </tr>
    </thead>
  );
}
