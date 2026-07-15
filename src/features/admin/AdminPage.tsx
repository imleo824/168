import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useCategories } from '@/hooks/useData';
import SEO from '@/platform/SEO';
import { apiFetch } from '@/services/api';
import { Navigate } from 'react-router-dom';

import type {
  OpsMetrics,
  OpsReport,
  AdminTab,
  TelegramConfigSection,
  OpsConfigSection,
  DepositAddressSection,
  DepositAddressStats,
} from './adminTypes';

import {
  getDefaultDateRange,
  normalizeAdminPublishCategorySchema,
  normalizeAdminLocationPresets,
} from './adminConfigSchema';

import {
  OPS_CONFIG_SECTIONS,
  TELEGRAM_CONFIG_SECTIONS,
  adminNavigationTabs,
  interactionSubTabs,
} from './adminMeta';

import {
  AdminMobileTopBar,
  AdminSidebar,
  AdminTabStrip,
} from './adminChrome';
import { AdminChatPanel } from './AdminChatPanel';
import { AdminDataPanel } from './AdminDataPanel';
import { AdminInteractionConfigPanel } from './AdminInteractionConfigPanel';
import { AdminModelConfigPanel } from './AdminModelConfigPanel';
import { AdminOpsReportPanel } from './AdminOpsReportPanel';
import { AdminSystemConfigSections } from './AdminSystemConfigSections';
import { SystemConfigHeader } from './SystemConfigHeader';
import { useAdminSystemConfigEditor } from './useAdminSystemConfigEditor';

export default function Admin() {
  const { user, showToast } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminTab>('report');
  const [activeTelegramConfigSection, setActiveTelegramConfigSection] = useState<TelegramConfigSection>('connection');
  const [activeOpsConfigSection, setActiveOpsConfigSection] = useState<OpsConfigSection>('reward');
  const [activeDepositAddressSection, setActiveDepositAddressSection] = useState<DepositAddressSection>('monitor');
  const { data: categories } = useCategories();
  const [localConfig, setLocalConfig] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [publishFilter, setPublishFilter] = useState('');
  const [promotionTypeFilter, setPromotionTypeFilter] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dataList, setDataList] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState('');
  const [configSaveError, setConfigSaveError] = useState('');
  const [opsReportError, setOpsReportError] = useState('');
  const [opsReport, setOpsReport] = useState<OpsReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<keyof OpsMetrics>('registeredUsers');
  const [depositAddressStats, setDepositAddressStats] = useState<DepositAddressStats | null>(null);
  const [addressImportText, setAddressImportText] = useState('');
  const [isImportingAddresses, setIsImportingAddresses] = useState(false);
  const [isCreatingSweepJob, setIsCreatingSweepJob] = useState(false);
  const [chatConfigDraft, setChatConfigDraft] = useState<any>({});
  const [isLoadingChatControls, setIsLoadingChatControls] = useState(false);
  const [processingAdminActionId, setProcessingAdminActionId] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState('');
  const [editingPostCategoryId, setEditingPostCategoryId] = useState('');
  const [editingPostDraftCategoryId, setEditingPostDraftCategoryId] = useState('');
  const [editingPromotionId, setEditingPromotionId] = useState('');
  const [editingPromotionAdImageUrl, setEditingPromotionAdImageUrl] = useState('');
  const [editingPromotionAdMobileImageUrl, setEditingPromotionAdMobileImageUrl] = useState('');
  const [editingPromotionTargetUrl, setEditingPromotionTargetUrl] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMorePage, setHasMorePage] = useState(false);
  const listRequestIdRef = useRef(0);
  const reportRequestIdRef = useRef(0);
  const {
    publishCategorySchema,
    locationPresets,
    addLocationPreset,
    moveLocationPreset,
    updateLocationPreset,
    removeLocationPreset,
    addPublishCategory,
    movePublishCategory,
    updatePublishCategory,
    removePublishCategory,
    addPublishCategoryField,
    updatePublishCategoryField,
    removePublishCategoryField,
  } = useAdminSystemConfigEditor({ localConfig, setLocalConfig });

  const fetchAdminConfig = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    try {
      const res = await apiFetch('/api/admin/config');
      if (!res.ok) {
        setConfigSaveError('配置加载失败，请刷新重试');
        return;
      }
      setLocalConfig(await res.json());
    } catch {
      setConfigSaveError('配置加载失败，请刷新重试');
    }
  }, [user?.role]);

  const refreshPublicConfigCaches = useCallback(async (savedConfig?: any, savedCategories?: any[]) => {
    const cacheBust = Date.now();
    const readJson = async <T,>(path: string): Promise<T> => {
      const separator = path.includes('?') ? '&' : '?';
      const res = await apiFetch(`${path}${separator}adminRefresh=${cacheBust}`, {
        cache: 'no-store',
        retry: false,
      });
      if (!res.ok) throw new Error('refresh failed');
      return await res.json();
    };

    const [config, categories, homeBootstrap] = await Promise.all([
      savedConfig ? Promise.resolve(savedConfig) : readJson<any>('/api/config'),
      savedCategories ? Promise.resolve(savedCategories) : readJson<any[]>('/api/categories'),
      readJson<any>('/api/home/bootstrap'),
    ]);
    const nextHomeBootstrap = {
      ...homeBootstrap,
      config,
      categories,
    };

    queryClient.setQueryData(['config'], config);
    queryClient.setQueryData(['categories'], categories);
    queryClient.setQueryData(['home', 'bootstrap'], nextHomeBootstrap);
    queryClient.setQueryData(['promotions', 'home-ads'], nextHomeBootstrap.homeAds || []);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['config'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['categories'], refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: ['home', 'bootstrap'], refetchType: 'none' }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    void fetchAdminConfig();
  }, [fetchAdminConfig]);

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const currentCursor = cursorStack[pageIndex] || null;

  const fetchOpsReport = async () => {
    const requestId = ++reportRequestIdRef.current;
    setOpsReportError('');
    setIsLoadingReport(true);
    try {
      const res = await apiFetch('/api/admin/ops-report');
      if (requestId !== reportRequestIdRef.current) return;
      if (!res.ok) {
        setOpsReportError('报表加载失败，请重试');
        setOpsReport(null);
        return;
      }
      const data = await res.json();
      if (requestId !== reportRequestIdRef.current) return;
      setOpsReport(data || null);
    } catch {
      setOpsReportError('报表加载失败，请重试');
      setOpsReport(null);
    } finally {
      if (requestId === reportRequestIdRef.current) {
        setIsLoadingReport(false);
      }
    }
  };

  const refreshReportDashboard = () => {
    void fetchOpsReport();
  };

  const fetchDepositAddressStats = useCallback(async () => {
    if (user?.role !== 'ADMIN') return;
    try {
      const res = await apiFetch('/api/admin/deposit-addresses/stats');
      if (!res.ok) return;
      setDepositAddressStats(await res.json());
    } catch {
      // 地址池统计不阻断主列表。
    }
  }, [user?.role]);

  const handleImportAddresses = async () => {
    const text = addressImportText.trim();
    if (!text || isImportingAddresses) return;
    setIsImportingAddresses(true);
    try {
      const res = await apiFetch('/api/admin/deposit-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || '地址导入失败');
      setAddressImportText('');
      showToast(`已导入 ${payload.created || 0} 个，跳过 ${payload.skipped || 0} 个`, 'success');
      await fetchDepositAddressStats();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '地址导入失败', 'error');
    } finally {
      setIsImportingAddresses(false);
    }
  };

  const updateDepositAddressStatus = async (id: string, status: 'AVAILABLE' | 'DISABLED') => {
    try {
      const res = await apiFetch(`/api/admin/deposit-addresses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '状态更新失败');
      showToast('地址状态已更新', 'success');
      await fetchDepositAddressStats();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '状态更新失败', 'error');
    }
  };

  const createSweepJob = async () => {
    if (isCreatingSweepJob) return;
    if (!depositAddressStats?.sweepTargetConfigured) {
      showToast('请先在系统配置中设置归集目标地址', 'error');
      return;
    }
    if (!depositAddressStats?.pendingSweepOrders) {
      showToast('暂无待归集订单', 'error');
      return;
    }
    setIsCreatingSweepJob(true);
    try {
      const res = await apiFetch('/api/admin/deposit-sweep-jobs', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '创建归集任务失败');
      showToast(`已创建归集任务：${payload?.job?.orderCount || 0} 笔`, 'success');
      await fetchDepositAddressStats();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '创建归集任务失败', 'error');
    } finally {
      setIsCreatingSweepJob(false);
    }
  };

  const creditManualRechargeOrder = async (item: any) => {
    if (!item?.id || processingOrderId) return;
    const canForce = item.status === 'WAITING_PAYMENT' || item.status === 'MANUAL_REVIEW';
    const confirmed = window.confirm(`确认已收到 ${item.usdtAmount} USDT，并给该用户入账积分？`);
    if (!confirmed) return;

    const customPointsText = window.prompt('可选：输入手动入账积分（留空按系统规则计算）');
    if (customPointsText === null) return;
    const normalizedCustomPoints = customPointsText.trim();

    const requestBody: Record<string, any> = {
      force: canForce,
    };
    if (normalizedCustomPoints) {
      const parsedPoints = Number(normalizedCustomPoints);
      if (!Number.isInteger(parsedPoints) || parsedPoints <= 0) {
        showToast('请输入正整数积分', 'error');
        return;
      }
      requestBody.points = parsedPoints;
    }

    setProcessingOrderId(item.id);
    try {
      const res = await apiFetch(`/api/admin/orders/${item.id}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '确认到账失败');
      showToast('已确认到账并入账积分', 'success');
      await fetchDepositAddressStats();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '确认到账失败', 'error');
    } finally {
      setProcessingOrderId('');
    }
  };

  const updateUserPoints = async (item: any, changeType: 'INCREASE' | 'DECREASE') => {
    if (!item?.id || processingAdminActionId) return;
    const actionText = changeType === 'INCREASE' ? '上分' : '下分';
    const displayName = item.displayName || item.loginAccount || item.id || '该用户';
    const amountText = window.prompt(`请输入要为 ${displayName} ${actionText} 的积分（正整数）`);
    if (!amountText) return;

    const amount = Number(amountText.trim());
    if (!Number.isInteger(amount) || amount <= 0) {
      showToast('积分数量必须是正整数', 'error');
      return;
    }

    if (!window.confirm(`确认执行${actionText} ${amount} 积分？`)) return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/users/${item.id}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeType,
          amount,
          remark: `${actionText}操作`,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '用户积分调整失败');
      showToast(`已为 ${displayName} 执行${actionText}`, 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '用户积分调整失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const updatePostPublishState = async (item: any, isPublished: boolean) => {
    if (!item?.id || processingAdminActionId) return;
    if (!isPublished && !window.confirm('确认下架这条内容？下架后前台不会展示。')) return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/posts/${item.id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '内容状态更新失败');
      showToast(isPublished ? '内容已上架' : '内容已下架', 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '内容状态更新失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const deletePostPermanently = async (item: any) => {
    if (!item?.id || processingAdminActionId) return;
    const confirmText = window.prompt(`确认删除该内容后将永久移除，且无法恢复。请输入“永久删除”继续：`);
    if (confirmText !== '永久删除') return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/posts/${item.id}/permanent`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '内容永久删除失败');
      showToast('内容已永久删除', 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '内容永久删除失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const startEditingPostCategory = (item: any) => {
    if (!item?.id) return;
    setEditingPostCategoryId(item.id);
    setEditingPostDraftCategoryId(item.category?.id || '');
  };

  const cancelPostCategoryEdit = () => {
    setEditingPostCategoryId('');
    setEditingPostDraftCategoryId('');
  };

  const updatePostCategory = async (item: any) => {
    if (!item?.id || processingAdminActionId) return;
    if (editingPostCategoryId !== item.id) return;
    if (!editingPostDraftCategoryId) {
      showToast('请选择分类', 'error');
      return;
    }
    if (editingPostDraftCategoryId === item.category?.id) {
      cancelPostCategoryEdit();
      return;
    }

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/posts/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: editingPostDraftCategoryId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '内容分类更新失败');
      showToast('分类已更新', 'success');
      cancelPostCategoryEdit();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '内容分类更新失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const startEditingPromotion = (item: any) => {
    if (!item?.id) return;
    if (!isAdHomePromotion(item)) {
      showToast('仅横幅广告支持编辑核心信息', 'error');
      return;
    }
    setEditingPromotionId(item.id);
    setEditingPromotionAdImageUrl(item.adImageUrl || '');
    setEditingPromotionAdMobileImageUrl(item.adMobileImageUrl || '');
    setEditingPromotionTargetUrl(item.adTargetUrl || '');
  };

  const cancelEditingPromotion = () => {
    setEditingPromotionId('');
    setEditingPromotionAdImageUrl('');
    setEditingPromotionAdMobileImageUrl('');
    setEditingPromotionTargetUrl('');
  };

  const updatePromotion = async (item: any) => {
    if (!item?.id || processingAdminActionId) return;
    if (editingPromotionId !== item.id) return;
    if (!isAdHomePromotion(item)) {
      showToast('仅横幅广告支持编辑核心信息', 'error');
      cancelEditingPromotion();
      return;
    }
    const payload: Record<string, string | boolean> = {};
    if (editingPromotionAdImageUrl !== undefined && editingPromotionAdImageUrl !== (item.adImageUrl || '')) {
      payload.adImageUrl = editingPromotionAdImageUrl.trim();
    }
    if (editingPromotionAdMobileImageUrl !== undefined && editingPromotionAdMobileImageUrl !== (item.adMobileImageUrl || '')) {
      payload.adMobileImageUrl = editingPromotionAdMobileImageUrl.trim();
    }
    if (editingPromotionTargetUrl !== undefined && editingPromotionTargetUrl !== (item.adTargetUrl || '')) {
      payload.adTargetUrl = editingPromotionTargetUrl.trim();
    }

    if (!Object.keys(payload).length) {
      showToast('请先修改广告内容再保存', 'error');
      return;
    }

    if (!window.confirm('确认更新该广告的核心信息吗？')) return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/promotions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const payloadData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payloadData?.error || '广告更新失败');
      showToast('广告信息已更新', 'success');
      cancelEditingPromotion();
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '广告更新失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const togglePromotionActiveState = async (item: any, isActive: boolean) => {
    if (!item?.id || processingAdminActionId) return;
    if (!window.confirm(isActive ? '确认恢复展示该投放？' : '确认暂停展示该投放？暂停不会释放已预约位置。')) return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/promotions/${item.id}/display-state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const payloadData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payloadData?.error || '投放展示状态更新失败');
      showToast(isActive ? '已恢复展示' : '已暂停展示，排期仍保留', 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '投放展示状态更新失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const cancelPromotionAndReleaseSlot = async (item: any) => {
    if (!item?.id || processingAdminActionId) return;
    const confirmText = window.prompt('确认取消该投放并释放预约位置？输入“取消投放”继续：');
    if (confirmText !== '取消投放') return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/promotions/${item.id}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '投放取消失败');
      showToast('投放已取消，预约位置已释放', 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '投放取消失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const updateUserDisabledState = async (item: any, isDisabled: boolean) => {
    if (!item?.id || processingAdminActionId) return;
    if (isDisabled && !window.confirm('确认禁用该用户？禁用后用户无法登录和进行写操作。')) return;

    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/users/${item.id}/disabled`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '用户状态更新失败');
      showToast(isDisabled ? '用户已禁用' : '用户已启用', 'success');
      await fetchData();
    } catch (error: any) {
      showToast(error?.message || '用户状态更新失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const fetchChatControls = useCallback(async () => {
    setIsLoadingChatControls(true);
    try {
      const configRes = await apiFetch('/api/admin/chat/config');
      if (!configRes.ok) throw new Error('聊天控制台加载失败');
      const config = await configRes.json();
      setChatConfigDraft(config);
    } catch (error: any) {
      showToast(error?.message || '聊天控制台加载失败', 'error');
    } finally {
      setIsLoadingChatControls(false);
    }
  }, [showToast]);

  const saveChatConfig = async () => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/admin/chat/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatConfigDraft),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '聊天配置保存失败');
      setChatConfigDraft(payload);
      showToast('聊天配置已保存', 'success');
    } catch (error: any) {
      showToast(error?.message || '聊天配置保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateChatMessageStatus = async (item: any, status: 'VISIBLE' | 'HIDDEN' | 'DELETED') => {
    if (!item?.id) return;
    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch(`/api/admin/chat/messages/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '消息处理失败');
      setDataList((current) => current.map((message) => message.id === item.id ? payload : message));
      showToast(status === 'VISIBLE' ? '消息已恢复' : '消息已处理', 'success');
    } catch (error: any) {
      showToast(error?.message || '消息处理失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const muteChatAuthor = async (item: any, options: { label: string; minutes?: number; permanent?: boolean }) => {
    if (!item?.authorUserId) return;
    setProcessingAdminActionId(item.id);
    try {
      const res = await apiFetch('/api/admin/chat/mutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: item.authorUserId,
          minutes: options.minutes,
          permanent: Boolean(options.permanent),
          reason: '后台聊天管理禁言',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || '禁言失败');
      showToast(`已禁言该用户：${options.label}`, 'success');
    } catch (error: any) {
      showToast(error?.message || '禁言失败', 'error');
    } finally {
      setProcessingAdminActionId('');
    }
  };

  const resetListPagination = useCallback(() => {
    setDataList([]);
    setCursorStack([null]);
    setPageIndex(0);
    setNextCursor(null);
    setHasMorePage(false);
    setListError('');
  }, []);

  const isSystemConfigTab = (tab: AdminTab): tab is 'ad' | 'telegram' | 'ops' => (
    tab === 'ad' || tab === 'telegram' || tab === 'ops'
  );
  const isInteractionAutomationTab = (tab: AdminTab) => (
    tab === 'interaction-config' ||
    tab === 'quote-publish' ||
    tab === 'comment-publish' ||
    tab === 'auto-like' ||
    tab === 'auto-post' ||
    tab === 'auto-crawl'
  );
  const hasConfigSections = (tab: AdminTab | null): tab is 'ad' | 'telegram' | 'ops' => (
    tab === 'ad' || tab === 'telegram' || tab === 'ops'
  );

  const applyFilterChange = useCallback(() => {
    if (isSystemConfigTab(activeTab) || isInteractionAutomationTab(activeTab) || activeTab === 'report' || activeTab === 'model-config') return;
    resetListPagination();
  }, [activeTab, resetListPagination]);

  const fetchData = async (options: { cursor?: string | null; search?: string; limit?: number } = {}) => {
    if (activeTab === 'report') {
      fetchOpsReport();
      return;
    }
    if (activeTab === 'model-config') return;
    if (isInteractionAutomationTab(activeTab)) return;

    setIsLoadingList(true);
    const requestId = ++listRequestIdRef.current;
    setListError('');
    let url = '/api/admin';
    if (activeTab === 'content') url += '/posts';
    else if (activeTab === 'promotions') url += '/promotions';
    else url += `/${activeTab}`;
    const requestCursor = options.cursor !== undefined ? options.cursor : currentCursor;
    const requestSearch = options.search !== undefined ? options.search : debouncedSearchKeyword;
    const requestLimit = options.limit || pageSize;
    const params = new URLSearchParams();
    params.append('limit', String(requestLimit));
    if (requestCursor) params.append('cursor', requestCursor);
    if (activeTab === 'content') {
      if (categoryFilter) params.append('categoryId', categoryFilter);
      if (publishFilter) params.append('published', publishFilter);
      if (userTypeFilter) params.append('userType', userTypeFilter);
      if (requestSearch) params.append('search', requestSearch);
    } else if (activeTab === 'promotions') {
      if (promotionTypeFilter) params.append('type', promotionTypeFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('categoryId', categoryFilter);
      if (userTypeFilter) params.append('userType', userTypeFilter);
      if (requestSearch) params.append('search', requestSearch);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    } else if (activeTab === 'users') {
      if (userTypeFilter) params.append('userType', userTypeFilter);
      if (requestSearch) params.append('search', requestSearch);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    } else if (activeTab === 'orders') {
      if (statusFilter) params.append('status', statusFilter);
      if (userTypeFilter) params.append('userType', userTypeFilter);
      if (requestSearch) params.append('search', requestSearch);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    } else if (activeTab === 'deposit-addresses') {
      if (statusFilter) params.append('status', statusFilter);
      if (requestSearch) params.append('search', requestSearch);
    } else if (activeTab === 'transactions') {
      if (actionFilter) params.append('action', actionFilter);
      if (userTypeFilter) params.append('userType', userTypeFilter);
      if (requestSearch) params.append('search', requestSearch);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
    } else if (activeTab === 'chat') {
      if (statusFilter) params.append('status', statusFilter);
      if (actionFilter) params.append('authorType', actionFilter);
      if (requestSearch) params.append('search', requestSearch);
    }

    try {
      const res = await apiFetch(`${url}?${params.toString()}`);
      if (requestId !== listRequestIdRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setDataList(Array.isArray(data) ? data : []);
        setNextCursor(res.headers.get('X-Next-Cursor') || null);
        setHasMorePage(res.headers.get('X-Has-More') === 'true');
      } else {
        setListError(res.status === 400 ? '请求参数有误，请重试' : '列表加载失败，请重试');
        setDataList([]);
        setNextCursor(null);
        setHasMorePage(false);
      }
    } catch {
      if (requestId !== listRequestIdRef.current) return;
      setListError('网络波动，请检查后重试');
      setDataList([]);
      setNextCursor(null);
      setHasMorePage(false);
    } finally {
      if (requestId === listRequestIdRef.current) {
        setIsLoadingList(false);
      }
    }
  };

  const submitListQuery = () => {
    if (isLoadingList) return;
    if (isSystemConfigTab(activeTab) || isInteractionAutomationTab(activeTab) || activeTab === 'report' || activeTab === 'model-config') return;
    const nextSearch = searchKeyword.trim();
    resetListPagination();
    setDebouncedSearchKeyword(nextSearch);
    void fetchData({ cursor: null, search: nextSearch });
  };

  useEffect(() => {
    if (isSystemConfigTab(activeTab) || isInteractionAutomationTab(activeTab) || activeTab === 'report' || activeTab === 'model-config') return;
    applyFilterChange();
  }, [debouncedSearchKeyword, activeTab, applyFilterChange]);

  useEffect(() => {
    if (activeTab === 'report') {
      fetchOpsReport();
      return;
    }
    if (activeTab === 'model-config') {
      return;
    }
    if (isInteractionAutomationTab(activeTab)) {
      return;
    }
    if (isSystemConfigTab(activeTab)) return;
    if (activeTab === 'deposit-addresses') {
      void fetchDepositAddressStats();
    }
    fetchData();
  }, [
    activeTab,
    promotionTypeFilter,
    statusFilter,
    categoryFilter,
    publishFilter,
    userTypeFilter,
    actionFilter,
    debouncedSearchKeyword,
    startDate,
    endDate,
    pageIndex,
    pageSize,
    fetchDepositAddressStats,
    fetchChatControls,
  ]);

  const resetListStateForTab = useCallback((tab: AdminTab) => {
    setStatusFilter('');
    setCategoryFilter('');
    setPromotionTypeFilter('');
    setPublishFilter('');
    setUserTypeFilter('');
    setActionFilter('');
    setSearchKeyword('');
    if (tab === 'users' || tab === 'orders' || tab === 'transactions') {
      const { startDate, endDate } = getDefaultDateRange();
      setStartDate(startDate);
      setEndDate(endDate);
    } else {
      setStartDate('');
      setEndDate('');
    }
    resetListPagination();
  }, [resetListPagination]);

  const switchTab = useCallback((tab: typeof activeTab) => {
    if (activeTab === tab) return;
    resetListStateForTab(tab);
    if (tab === 'ad') {
      void fetchAdminConfig();
    } else if (tab === 'telegram') {
      setActiveTelegramConfigSection('connection');
    } else if (tab === 'ops') {
      setActiveOpsConfigSection('reward');
    } else if (tab === 'deposit-addresses') {
      setActiveDepositAddressSection('monitor');
    }
    setActiveTab(tab);
  }, [activeTab, fetchAdminConfig, resetListStateForTab]);

  const tableColumnCount =
    activeTab === 'users'
      ? 6
      : activeTab === 'orders'
        ? 9
      : activeTab === 'deposit-addresses'
          ? 9
          : activeTab === 'transactions'
            ? 5
            : activeTab === 'chat'
              ? 6
            : activeTab === 'content'
              ? 7
              : activeTab === 'promotions'
                ? 8
              : 5;

  const isAdHomePromotion = (item: any) => item?.type === 'AD_HOME' || item?.type === 'PIN_CHAT';

  const handleSaveConfig = async () => {
     setConfigSaveError('');
     setIsSaving(true);
     try {
       const sanitizedConfig = JSON.parse(JSON.stringify(localConfig || {}));
       sanitizedConfig.publish_category_schema = normalizeAdminPublishCategorySchema(sanitizedConfig.publish_category_schema);
       sanitizedConfig.location_presets = normalizeAdminLocationPresets(sanitizedConfig.location_presets);
       const res = await apiFetch('/api/admin/config', {
         method: 'PATCH',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(sanitizedConfig)
       });
       if (res.ok) {
         const payload = await res.json().catch(() => null);
         await Promise.all([
           fetchAdminConfig(),
           refreshPublicConfigCaches(payload?.config, payload?.categories),
         ]);
         showToast('配置已保存', 'success');
       } else {
         const fallbackMessage = '配置保存失败';
         try {
           const payload = await res.json();
           setConfigSaveError((payload && typeof payload.error === 'string' && payload.error) || fallbackMessage);
         } catch {
           setConfigSaveError(fallbackMessage);
         }
       }
     } catch {
       setConfigSaveError('保存失败，请检查网络后重试');
     } finally {
       setIsSaving(false);
     }
  };

  const telegramSyncRequireImage = String(localConfig?.telegram_sync_require_image ?? 'false').trim().toLowerCase() === 'true';
  const activeConfigTab = isSystemConfigTab(activeTab) ? activeTab : null;
  const activeSectionConfigTab = hasConfigSections(activeConfigTab) ? activeConfigTab : null;
  const activeTabMeta = [...adminNavigationTabs, ...interactionSubTabs].find((tab) => tab.id === activeTab) || adminNavigationTabs[0];
  const configSectionItems =
    activeSectionConfigTab === 'ad'
      ? []
      : activeSectionConfigTab === 'telegram'
        ? TELEGRAM_CONFIG_SECTIONS
        : OPS_CONFIG_SECTIONS;
  const configSectionId =
    activeSectionConfigTab === 'ad'
      ? 'pricing'
      : activeSectionConfigTab === 'telegram'
        ? activeTelegramConfigSection
        : activeOpsConfigSection;
  const setActiveConfigSection = (section: TelegramConfigSection | OpsConfigSection) => {
    if (activeSectionConfigTab === 'telegram') {
      setActiveTelegramConfigSection(section as TelegramConfigSection);
    } else if (activeSectionConfigTab === 'ops') {
      setActiveOpsConfigSection(section as OpsConfigSection);
    }
  };

  return (
    <div className="admin-console-page min-h-screen w-full">
      <SEO title="旺财" description="管理员控制台" noindex />

      <div className="flex w-full lg:min-h-screen">
          <AdminSidebar
            activeTab={activeTab}
            onSwitchTab={switchTab}
          />

        <main className="min-w-0 flex-1 px-2 py-3 sm:px-4 lg:px-5 lg:py-4 xl:px-6 2xl:px-8">
        <AdminMobileTopBar activeTabMeta={activeTabMeta} />
        <AdminTabStrip activeTab={activeTab} onSwitch={switchTab} />

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 lg:py-4">
        {activeConfigTab && (
          <div className="space-y-6 pb-20">
            {!activeSectionConfigTab ? (
              <AdminChatPanel
                chatConfigDraft={chatConfigDraft}
                isSaving={isSaving}
                saveChatConfig={saveChatConfig}
                setChatConfigDraft={setChatConfigDraft}
              />
            ) : activeSectionConfigTab !== 'ad' ? (
              <SystemConfigHeader
                scope={activeSectionConfigTab}
                badge="即时生效"
                sections={configSectionItems}
                activeSection={configSectionId}
                onSwitchSection={setActiveConfigSection}
              />
            ) : null}

            {activeSectionConfigTab && (
              <AdminSystemConfigSections
                activeSectionConfigTab={activeSectionConfigTab}
                configSectionId={configSectionId}
                localConfig={localConfig}
                setLocalConfig={setLocalConfig}
                categories={categories}
                telegramSyncRequireImage={telegramSyncRequireImage}
                locationPresets={locationPresets}
                addLocationPreset={addLocationPreset}
                moveLocationPreset={moveLocationPreset}
                updateLocationPreset={updateLocationPreset}
                removeLocationPreset={removeLocationPreset}
                publishCategorySchema={publishCategorySchema}
                addPublishCategory={addPublishCategory}
                movePublishCategory={movePublishCategory}
                updatePublishCategory={updatePublishCategory}
                removePublishCategory={removePublishCategory}
                addPublishCategoryField={addPublishCategoryField}
                updatePublishCategoryField={updatePublishCategoryField}
                removePublishCategoryField={removePublishCategoryField}
              />
            )}

            {activeSectionConfigTab && (
              <>
                {/* Global Actions */}
                {configSaveError && (
                  <div className="admin-alert admin-alert--danger">
                    {configSaveError}
                  </div>
                )}
                <div className="flex justify-center pt-8 sm:pt-10">
                   <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={isSaving}
                      className="pressable admin-submit-button"
                   >
                      <Save size={20} /> {isSaving ? '正在保存...' : '确认并保存'}
                   </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <AdminOpsReportPanel
            opsReport={opsReport}
            opsReportError={opsReportError}
            isLoadingReport={isLoadingReport}
            selectedTrendMetric={selectedTrendMetric}
            setSelectedTrendMetric={setSelectedTrendMetric}
            refreshReportDashboard={refreshReportDashboard}
          />
        )}

        {activeTab === 'model-config' && (
          <AdminModelConfigPanel />
        )}

        {isInteractionAutomationTab(activeTab) && (
          <AdminInteractionConfigPanel
            initialTab={activeTab === 'interaction-config' ? 'quote-publish' : activeTab as any}
          />
        )}

          <AdminDataPanel
            activeTab={activeTab}
            activeDepositAddressSection={activeDepositAddressSection}
            setActiveDepositAddressSection={setActiveDepositAddressSection}
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
            submitListQuery={submitListQuery}
            applyFilterChange={applyFilterChange}
            tableColumnCount={tableColumnCount}
            listError={listError}
            dataList={dataList}
            editingPostCategoryId={editingPostCategoryId}
            editingPostDraftCategoryId={editingPostDraftCategoryId}
            setEditingPostDraftCategoryId={setEditingPostDraftCategoryId}
            processingAdminActionId={processingAdminActionId}
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
            creditManualRechargeOrder={creditManualRechargeOrder}
            processingOrderId={processingOrderId}
            updateDepositAddressStatus={updateDepositAddressStatus}
            updateChatMessageStatus={updateChatMessageStatus}
            muteChatAuthor={muteChatAuthor}
            pageIndex={pageIndex}
            hasMorePage={hasMorePage}
            nextCursor={nextCursor}
            pageSize={pageSize}
            setPageSize={setPageSize}
            setPageIndex={setPageIndex}
            setCursorStack={setCursorStack}
            localConfig={localConfig}
          />
          </div>
        </main>
      </div>
    </div>
  );
}
