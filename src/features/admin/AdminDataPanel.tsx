import { ADMIN_USER_TYPE_FILTER_OPTIONS, type RechargeOrder } from '@/types';
import { calculateDisplayRechargePoints } from '@/features/records/recordDisplay';
import { DEPOSIT_ADDRESS_SECTIONS } from './adminMeta';
import { AdminDesktopDataTable } from './AdminDesktopDataTable';
import { AdminFiltersPanel } from './AdminFiltersPanel';
import { AdminMobileDataList } from './AdminMobileDataList';
import { AdminPaginationBar } from './AdminPaginationBar';
import AdminReferralWithdrawalPanel from './AdminReferralWithdrawalPanel';
import { AdminUsersDataList } from './AdminUsersDataList';
import { SystemConfigHeader } from './SystemConfigHeader';
import type { AdminTab, DepositAddressSection, DepositAddressStats } from './adminTypes';

type AdminDataPanelProps = {
  activeTab: AdminTab;
  activeDepositAddressSection: DepositAddressSection;
  setActiveDepositAddressSection: (section: DepositAddressSection) => void;
  categories?: any[];
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
  submitListQuery: () => void;
  applyFilterChange: () => void;
  tableColumnCount: number;
  listError: string;
  dataList: any[];
  editingPostCategoryId: string;
  editingPostDraftCategoryId: string;
  setEditingPostDraftCategoryId: (value: string) => void;
  processingAdminActionId: string;
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
  creditManualRechargeOrder: (item: any) => void;
  processingOrderId: string;
  updateDepositAddressStatus: (id: string, status: 'AVAILABLE' | 'DISABLED') => void;
  updateChatMessageStatus: (item: any, status: 'VISIBLE' | 'HIDDEN' | 'DELETED') => void;
  muteChatAuthor: (item: any, options: { label: string; minutes?: number; permanent?: boolean }) => void;
  pageIndex: number;
  hasMorePage: boolean;
  nextCursor: string | null;
  pageSize: number;
  setPageSize: (size: number) => void;
  setPageIndex: (index: number | ((current: number) => number)) => void;
  setCursorStack: (stack: Array<string | null> | ((current: Array<string | null>) => Array<string | null>)) => void;
  localConfig: any;
};

const ADMIN_MEMBER_FILTER_OPTIONS = [
  { value: '', label: '全部会员状态' },
  { value: 'TUI_PLUS_ACTIVE', label: '会员用户' },
  { value: 'TUI_PLUS_INACTIVE', label: '非会员用户' },
];

function isMemberFilterValue(value: string) {
  return value === 'TUI_PLUS_ACTIVE' || value === 'TUI_PLUS_INACTIVE';
}

export function AdminDataPanel({
  activeTab,
  activeDepositAddressSection,
  setActiveDepositAddressSection,
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
  submitListQuery,
  applyFilterChange,
  tableColumnCount,
  listError,
  dataList,
  editingPostCategoryId,
  editingPostDraftCategoryId,
  setEditingPostDraftCategoryId,
  processingAdminActionId,
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
  creditManualRechargeOrder,
  processingOrderId,
  updateDepositAddressStatus,
  updateChatMessageStatus,
  muteChatAuthor,
  pageIndex,
  hasMorePage,
  nextCursor,
  pageSize,
  setPageSize,
  setPageIndex,
  setCursorStack,
  localConfig,
}: AdminDataPanelProps) {
  const getRechargePointsPerUsdt = () => {
    const value = Number(localConfig?.recharge_points_per_usdt);
    return Number.isFinite(value) && value > 0 ? value : 10;
  };

  const getAdminRechargeDisplayPoints = (item: any) => (
    calculateDisplayRechargePoints(item as RechargeOrder, getRechargePointsPerUsdt())
  );

  const userTypeSelectValue = isMemberFilterValue(userTypeFilter) ? '' : userTypeFilter;
  const memberSelectValue = isMemberFilterValue(userTypeFilter) ? userTypeFilter : '';

  return (
    <>
      {activeTab === 'referral-withdrawals' && <AdminReferralWithdrawalPanel />}
      {(activeTab === 'content' || activeTab === 'promotions' || activeTab === 'users' || activeTab === 'orders' || activeTab === 'deposit-addresses' || activeTab === 'transactions' || activeTab === 'chat') && (
        <div className="admin-data-panel mb-20">
          {activeTab === 'deposit-addresses' && (
            <SystemConfigHeader
              scope="deposit-addresses"
              badge="归集/监控"
              sections={DEPOSIT_ADDRESS_SECTIONS}
              activeSection={activeDepositAddressSection}
              onSwitchSection={setActiveDepositAddressSection}
            />
          )}

          {activeTab === 'users' ? (
            <div className="admin-filter-bar">
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
                  value={userTypeSelectValue}
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
                  value={memberSelectValue}
                  onChange={(e) => {
                    setUserTypeFilter(e.target.value);
                    applyFilterChange();
                  }}
                >
                  {ADMIN_MEMBER_FILTER_OPTIONS.map((option) => (
                    <option key={option.value || 'all-member'} value={option.value}>{option.label}</option>
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
            </div>
          ) : (
            <AdminFiltersPanel
              activeTab={activeTab}
              activeDepositAddressSection={activeDepositAddressSection}
              categories={categories}
              searchKeyword={searchKeyword}
              setSearchKeyword={setSearchKeyword}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              publishFilter={publishFilter}
              setPublishFilter={setPublishFilter}
              userTypeFilter={userTypeFilter}
              setUserTypeFilter={setUserTypeFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              promotionTypeFilter={promotionTypeFilter}
              setPromotionTypeFilter={setPromotionTypeFilter}
              actionFilter={actionFilter}
              setActionFilter={setActionFilter}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              depositAddressStats={depositAddressStats}
              isCreatingSweepJob={isCreatingSweepJob}
              createSweepJob={createSweepJob}
              fetchDepositAddressStats={fetchDepositAddressStats}
              isImportingAddresses={isImportingAddresses}
              addressImportText={addressImportText}
              setAddressImportText={setAddressImportText}
              handleImportAddresses={handleImportAddresses}
              isLoadingList={isLoadingList}
              fetchData={submitListQuery}
              applyFilterChange={applyFilterChange}
            />
          )}

          {(activeTab !== 'deposit-addresses' || activeDepositAddressSection === 'list') && (
            <div>
              {activeTab === 'users' ? (
                <AdminUsersDataList
                  isLoadingList={isLoadingList}
                  listError={listError}
                  submitListQuery={submitListQuery}
                  dataList={dataList}
                  processingAdminActionId={processingAdminActionId}
                  updateUserPoints={updateUserPoints}
                  updateUserDisabledState={updateUserDisabledState}
                />
              ) : (
                <>
                  <AdminDesktopDataTable
                    activeTab={activeTab}
                    tableColumnCount={tableColumnCount}
                    isLoadingList={isLoadingList}
                    listError={listError}
                    submitListQuery={submitListQuery}
                    dataList={dataList}
                    editingPostCategoryId={editingPostCategoryId}
                    editingPostDraftCategoryId={editingPostDraftCategoryId}
                    setEditingPostDraftCategoryId={setEditingPostDraftCategoryId}
                    processingAdminActionId={processingAdminActionId}
                    categories={categories}
                    updatePostCategory={updatePostCategory}
                    cancelPostCategoryEdit={cancelPostCategoryEdit}
                    startEditingPostCategory={startEditingPostCategory}
                    updatePostPublishState={updatePostPublishState}
                    deletePostPermanently={deletePostPermanently}
                    startEditingPromotion={startEditingPromotion}
                    editingPromotionId={editingPromotionId}
                    editingPromotionTargetUrl={editingPromotionTargetUrl}
                    setEditingPromotionTargetUrl={setEditingPromotionTargetUrl}
                    editingPromotionAdImageUrl={editingPromotionAdImageUrl}
                    setEditingPromotionAdImageUrl={setEditingPromotionAdImageUrl}
                    editingPromotionAdMobileImageUrl={editingPromotionAdMobileImageUrl}
                    setEditingPromotionAdMobileImageUrl={setEditingPromotionAdMobileImageUrl}
                    updatePromotion={updatePromotion}
                    cancelEditingPromotion={cancelEditingPromotion}
                    togglePromotionActiveState={togglePromotionActiveState}
                    cancelPromotionAndReleaseSlot={cancelPromotionAndReleaseSlot}
                    updateUserPoints={updateUserPoints}
                    updateUserDisabledState={updateUserDisabledState}
                    getAdminRechargeDisplayPoints={getAdminRechargeDisplayPoints}
                    creditManualRechargeOrder={creditManualRechargeOrder}
                    processingOrderId={processingOrderId}
                    updateDepositAddressStatus={updateDepositAddressStatus}
                    updateChatMessageStatus={updateChatMessageStatus}
                    muteChatAuthor={muteChatAuthor}
                  />
                  <AdminMobileDataList
                    activeTab={activeTab}
                    isLoadingList={isLoadingList}
                    listError={listError}
                    submitListQuery={submitListQuery}
                    dataList={dataList}
                    editingPostCategoryId={editingPostCategoryId}
                    editingPostDraftCategoryId={editingPostDraftCategoryId}
                    setEditingPostDraftCategoryId={setEditingPostDraftCategoryId}
                    processingAdminActionId={processingAdminActionId}
                    categories={categories}
                    updatePostCategory={updatePostCategory}
                    cancelPostCategoryEdit={cancelPostCategoryEdit}
                    updatePostPublishState={updatePostPublishState}
                    startEditingPostCategory={startEditingPostCategory}
                    deletePostPermanently={deletePostPermanently}
                    startEditingPromotion={startEditingPromotion}
                    editingPromotionId={editingPromotionId}
                    editingPromotionTargetUrl={editingPromotionTargetUrl}
                    setEditingPromotionTargetUrl={setEditingPromotionTargetUrl}
                    editingPromotionAdImageUrl={editingPromotionAdImageUrl}
                    setEditingPromotionAdImageUrl={setEditingPromotionAdImageUrl}
                    editingPromotionAdMobileImageUrl={editingPromotionAdMobileImageUrl}
                    setEditingPromotionAdMobileImageUrl={setEditingPromotionAdMobileImageUrl}
                    updatePromotion={updatePromotion}
                    cancelEditingPromotion={cancelEditingPromotion}
                    togglePromotionActiveState={togglePromotionActiveState}
                    cancelPromotionAndReleaseSlot={cancelPromotionAndReleaseSlot}
                    updateUserPoints={updateUserPoints}
                    updateUserDisabledState={updateUserDisabledState}
                    getAdminRechargeDisplayPoints={getAdminRechargeDisplayPoints}
                    creditManualRechargeOrder={creditManualRechargeOrder}
                    processingOrderId={processingOrderId}
                    updateDepositAddressStatus={updateDepositAddressStatus}
                    updateChatMessageStatus={updateChatMessageStatus}
                    muteChatAuthor={muteChatAuthor}
                  />
                </>
              )}
              <AdminPaginationBar
                pageIndex={pageIndex}
                hasMorePage={hasMorePage}
                nextCursor={nextCursor}
                pageSize={pageSize}
                isLoadingList={isLoadingList}
                setPageSize={setPageSize}
                setPageIndex={setPageIndex}
                setCursorStack={setCursorStack}
                applyFilterChange={applyFilterChange}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
