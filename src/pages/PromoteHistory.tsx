import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Pin, Save } from 'lucide-react';

import SEO from '@/platform/SEO';
import AppPage from '@/ui/AppPage';
import AuthRequiredState from '@/ui/AuthRequiredState';
import PageHeader from '@/ui/PageHeader';
import HeaderSelectAction from '@/ui/HeaderSelectAction';
import ActionButton from '@/ui/ActionButton';
import ImageUpload from '@/features/upload/ImageUpload';
import RecordIdRow from '@/features/records/RecordIdRow';
import PromotionRecordCard from '@/features/promote/PromotionRecordCard';
import { useAuth } from '@/context/AuthContext';
import { useMyPromotions } from '@/hooks/useData';
import { useFocusScrollStabilizer } from '@/hooks/useFocusScrollStabilizer';
import { resolveAdTargetUrlInput } from '@/utils/adTargetUrl';
import { updatePromotionAdCreative } from '@/services/api';
import type { PromotionBooking } from '@/types';
import { LoadingBlock, StateBlock } from '@/ui/LoadingState';
import EmptyStateCard from '@/ui/EmptyStateCard';
import PageContentShell from '@/ui/PageContentShell';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import {
  bookingDateText,
  bookingStatusLabel,
  groupPromotionBookings,
  promotionRecordId,
  promotionDisplayTitle,
  type PromotionGroup,
  type PromotionStatusFilter,
} from '@/features/promote/promotionDisplayUtils';

const PROMOTION_RECORDS_TITLE = '推广记录';

type PromoteHistoryRouteState = {
  from?: string;
  sponsorEntry?: boolean;
};

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : null;
}

export default function PromoteHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as PromoteHistoryRouteState | null;
  const sponsorReturnPath = routeState?.sponsorEntry ? normalizePath(routeState.from) : null;
  const queryClient = useQueryClient();
  const { requireAuth, showToast, user, loading: isAuthLoading } = useAuth();
  const {
    rootRef,
    onFocusCapture,
    onBlurCapture,
  } = useFocusScrollStabilizer('promote-keyboard-active');
  const {
    data: promotions = [],
    isLoading,
    isError: isPromotionsError,
    refetch: refetchPromotions,
  } = useMyPromotions(Boolean(user?.id));
  const [statusFilter, setStatusFilter] = useState<PromotionStatusFilter>('ALL');
  const [editingGroup, setEditingGroup] = useState<PromotionGroup | null>(null);
  const [editForm, setEditForm] = useState({ desktopImageUrl: '', mobileImageUrl: '', targetUrl: '' });
  const [isSaving, setIsSaving] = useState(false);

  const groups = useMemo(() => groupPromotionBookings(promotions), [promotions]);
  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      const status = bookingStatusLabel(group) as PromotionStatusFilter;
      return statusFilter === 'ALL' || status === statusFilter;
    });
  }, [groups, statusFilter]);

  const startEdit = useCallback((group: PromotionGroup) => {
    setEditingGroup(group);
    setEditForm({
      desktopImageUrl: group.primary.adImageUrl || '',
      mobileImageUrl: group.primary.adMobileImageUrl || '',
      targetUrl: group.primary.adTargetUrl || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingGroup) return;

    if (!editForm.desktopImageUrl) {
      showToast('请上传电脑端广告图片', 'error');
      return;
    }

    if (!editForm.mobileImageUrl) {
      showToast('请上传移动端广告图片', 'error');
      return;
    }

    if (!editForm.targetUrl.trim()) {
      showToast('请填写广告跳转地址', 'error');
      return;
    }

    const targetUrlCheck = resolveAdTargetUrlInput(editForm.targetUrl);
    if (targetUrlCheck.error) {
      showToast(targetUrlCheck.error, 'error');
      return;
    }

    setIsSaving(true);

    try {
      const normalizedTargetUrl = targetUrlCheck.value;
      await updatePromotionAdCreative(editingGroup.primary.id, {
        adImageUrl: editForm.desktopImageUrl,
        adMobileImageUrl: editForm.mobileImageUrl,
        adTargetUrl: normalizedTargetUrl,
      });

      const editedIds = new Set(editingGroup.bookings.map((booking) => booking.id));
      const editedCampaignId = editingGroup.primary.campaignId || '';

      queryClient.setQueriesData<PromotionBooking[]>({ queryKey: ['promotions'] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((booking) => (
          editedIds.has(booking.id) || (Boolean(editedCampaignId) && booking.campaignId === editedCampaignId)
            ? {
                ...booking,
                adImageUrl: editForm.desktopImageUrl,
                adMobileImageUrl: editForm.mobileImageUrl,
                adTargetUrl: normalizedTargetUrl,
              }
            : booking
        ));
      });

      showToast('广告信息已更新', 'success');
      setEditingGroup(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['promotions'] }),
        queryClient.refetchQueries({ queryKey: ['promotions', 'home-ads'], type: 'active' }),
      ]);
    } catch (err: any) {
      showToast(err?.message || '广告更新失败', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [editForm.desktopImageUrl, editForm.mobileImageUrl, editForm.targetUrl, editingGroup, queryClient, showToast]);

  const handleCopyPromotionRecordId = useCallback((value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => showToast('单号已复制', 'success'),
      () => showToast('复制失败，请手动复制', 'error'),
    );
  }, [showToast]);

  const statusFilters: Array<{ id: PromotionStatusFilter; label: string }> = [
    { id: 'ALL', label: '全部状态' },
    { id: '投放中', label: '投放中' },
    { id: '未开始', label: '未开始' },
    { id: '已结束', label: '已结束' },
  ];

  const headerFilters = !editingGroup ? (
    <HeaderSelectAction<PromotionStatusFilter>
      value={statusFilter}
      options={statusFilters.map((item) => ({ value: item.id, label: item.label }))}
      onChange={setStatusFilter}
      selectClassName="ui-record-filter-status"
      ariaLabel="按状态筛选推广记录"
    />
  ) : undefined;

  if (!isAuthLoading && !user) {
    return (
      <AppPage bottomSafe className="promote-mobile-page promote-page surface-page">
        <SEO title={`${PROMOTION_RECORDS_TITLE}｜推推`} description="登录后查看您在推推的广告推广记录。" noindex />
        <PageHeader
          title={PROMOTION_RECORDS_TITLE}
          onBack={() => {
            if (sponsorReturnPath) {
              navigate(sponsorReturnPath, { replace: true });
              return;
            }

            navigate('/promote', { replace: true, state: location.state ? { ...location.state } : undefined });
          }}
        />
        <PageContentShell as="main" className="ui-auth-required-wrap ui-app-page-main">
          <AuthRequiredState
            icon={<Pin />}
            context="records"
            tone="panel"
            density="compact"
            title="登录后查看推广记录"
            description="推广记录只展示当前账号的广告和置顶预约。"
            actionLabel="登录 / 注册"
            previewItems={[
              { icon: <Pin aria-hidden="true" />, label: '推广记录', description: '查看每一次预约和展示状态' },
              { icon: <Pencil aria-hidden="true" />, label: '素材管理', description: '在允许时继续更新广告素材' },
              { icon: <Save aria-hidden="true" />, label: '账号归档', description: '推广明细只归属当前登录账号' },
            ]}
            onAction={() => requireAuth()}
          />
        </PageContentShell>
      </AppPage>
    );
  }

  return (
    <AppPage
      ref={rootRef}
      bottomSafe
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      className="promote-mobile-page promote-page surface-page"
    >
      <SEO title={`${PROMOTION_RECORDS_TITLE}｜推推`} description="查看和管理您在推推的广告推广记录。" noindex />
      <PageHeader
        title={editingGroup ? '编辑广告' : PROMOTION_RECORDS_TITLE}
        onBack={() => {
          if (editingGroup) {
            setEditingGroup(null);
            return;
          }

          if (sponsorReturnPath) {
            navigate(sponsorReturnPath, { replace: true });
            return;
          }

          navigate('/promote', {
            replace: true,
            state: location.state ? { ...location.state } : undefined,
          });
        }}
        right={headerFilters}
      />

      <PageContentShell className="promote-history-shell ui-app-page-main">
        {editingGroup ? (
          <div className="promote-history-edit-stack">
            <SurfaceSectionCard compact className="promote-history-edit-summary">
              <div className="promote-history-edit-summary-main">
                <p className="x-post-title">{promotionDisplayTitle(editingGroup.primary)}</p>
                <p className="promote-history-date">{bookingDateText(editingGroup)}</p>
              </div>
              <RecordIdRow label="单号" value={promotionRecordId(editingGroup)} onCopy={handleCopyPromotionRecordId} />
            </SurfaceSectionCard>

            <SurfaceSectionCard className="promote-history-edit-card">
              <section className="promote-history-edit-section" aria-labelledby="promote-history-edit-images-title">
                <h2 id="promote-history-edit-images-title" className="promote-history-edit-section-title">广告图片</h2>
                <div key={`${editingGroup.key}-desktop`} className="promote-history-field">
                  <span className="promote-history-label">电脑端广告图</span>
                  <span className="promote-history-help">建议 1920×480 或 1440×360</span>
                  <ImageUpload
                    onImagesChange={(urls) => setEditForm((prev) => ({ ...prev, desktopImageUrl: urls[0] || '' }))}
                    maxCount={1}
                    defaultImages={editForm.desktopImageUrl ? [editForm.desktopImageUrl] : []}
                    tileClassName="ad-upload-tile ad-upload-tile--desktop"
                    purpose="ad-desktop"
                  />
                </div>

                <div key={`${editingGroup.key}-mobile`} className="promote-history-field">
                  <span className="promote-history-label">移动端广告图</span>
                  <span className="promote-history-help">建议 1080×360 或 750×250</span>
                  <ImageUpload
                    onImagesChange={(urls) => setEditForm((prev) => ({ ...prev, mobileImageUrl: urls[0] || '' }))}
                    maxCount={1}
                    defaultImages={editForm.mobileImageUrl ? [editForm.mobileImageUrl] : []}
                    tileClassName="ad-upload-tile ad-upload-tile--mobile"
                    purpose="ad-mobile"
                  />
                </div>
              </section>

              <section className="promote-history-edit-section" aria-labelledby="promote-history-edit-target-title">
                <h2 id="promote-history-edit-target-title" className="promote-history-edit-section-title">跳转地址</h2>
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={editForm.targetUrl}
                  maxLength={2048}
                  placeholder="支持网址、飞机频道、飞机机器人、飞机联系方式等"
                  onChange={(event) => setEditForm((prev) => ({ ...prev, targetUrl: event.target.value }))}
                  className="ui-control promote-history-target-input"
                />
              </section>

              <div className="promote-history-actions">
                <ActionButton
                  type="button"
                  variant="brand"
                  onClick={saveEdit}
                  disabled={isSaving}
                  state={isSaving ? 'loading' : 'idle'}
                  className="promote-history-save-action"
                >
                  保存修改
                </ActionButton>
              </div>
            </SurfaceSectionCard>
          </div>
        ) : isLoading || isAuthLoading ? (
          <LoadingBlock text="正在加载推广记录" className="record-state-block" />
        ) : isPromotionsError ? (
          <StateBlock
            title="加载失败"
            description="网络恢复后可重新查看推广记录。"
            tone="error"
            action={
              <ActionButton type="button" variant="muted" size="sm" onClick={() => refetchPromotions()}>
                重新加载
              </ActionButton>
            }
            className="record-state-block"
          />
        ) : visibleGroups.length > 0 ? (
          <div className="record-list">
            {visibleGroups.map((group) => (
              <PromotionRecordCard
                key={group.key}
                group={group}
                onCopyRecordId={handleCopyPromotionRecordId}
                onEdit={startEdit}
              />
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="暂无推广记录"
            description="预约推广后，推广明细会在这里展示。"
            compact
            action={
              <ActionButton type="button" variant="muted" size="sm" onClick={() => navigate('/promote')}>
                去推广
              </ActionButton>
            }
          />
        )}
      </PageContentShell>
    </AppPage>
  );
}
