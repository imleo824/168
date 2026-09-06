import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  Heart,
  Megaphone,
  MessageCircle,
  Pin,
  Repeat2,
  ShieldCheck,
  UserPlus,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import SettingRow from '@/ui/SettingRow';
import SurfaceSectionCard from '@/ui/SurfaceSectionCard';
import SEO from '@/platform/SEO';
import { useAuth } from '@/context/AuthContext';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';
import { usePushNotification } from '@/hooks/usePushNotification';
import type { NotificationPreference } from '@/services/pushNotification';

import '@/features/notifications/NotificationsRoute.css';

type PreferenceKey = keyof Pick<
  NotificationPreference,
  'commentEnabled' | 'followEnabled' | 'quoteEnabled' | 'likeEnabled' | 'systemEnabled' | 'rechargeEnabled' | 'promotionEnabled'
>;

interface PreferenceGroup {
  id: string;
  groupTitle: string;
  items: Array<{
    key: PreferenceKey;
    title: string;
    description: string;
    icon: LucideIcon;
    colorClass: string;
  }>;
}

const PREFERENCE_GROUPS: PreferenceGroup[] = [
  {
    id: 'interactions',
    groupTitle: '互动消息提醒',
    items: [
      { key: 'commentEnabled', title: '评论通知', description: '当有人评论你的帖子时提醒', icon: MessageCircle, colorClass: 'notif-icon-blue' },
      { key: 'quoteEnabled', title: '引用通知', description: '当你的内容被他人引用或转发时提醒', icon: Repeat2, colorClass: 'notif-icon-purple' },
      { key: 'followEnabled', title: '关注通知', description: '当有新用户关注你时提醒', icon: UserPlus, colorClass: 'notif-icon-green' },
      { key: 'likeEnabled', title: '点赞通知', description: '当有人点赞你的动态时提醒', icon: Heart, colorClass: 'notif-icon-rose' },
    ],
  },
  {
    id: 'assets',
    groupTitle: '资产与业务变动',
    items: [
      { key: 'rechargeEnabled', title: '充值与积分', description: '积分到账及余额变动提醒', icon: WalletCards, colorClass: 'notif-icon-emerald' },
      { key: 'promotionEnabled', title: '推广状态', description: '推广上线、置顶及套餐状态更新', icon: Pin, colorClass: 'notif-icon-amber' },
    ],
  },
  {
    id: 'system',
    groupTitle: '平台与系统通告',
    items: [
      { key: 'systemEnabled', title: '平台公告', description: '重要官方通告与账号安全提醒', icon: Megaphone, colorClass: 'notif-icon-indigo' },
    ],
  },
];

export default function NotificationSettings() {
  const { user, showToast } = useAuth();
  const {
    capability,
    status,
    preference,
    enabled,
    isMutating,
    enable,
    disable,
    updatePreference,
  } = usePushNotification(Boolean(user?.id));
  const [visualPreference, setVisualPreference] = useState<NotificationPreference | null>(null);
  const [visualEnabled, setVisualEnabled] = useState<boolean | null>(null);

  const isConfigured = status?.configured !== false;
  const canUse = capability.supported && isConfigured;
  const displayedPreference = visualPreference || preference;
  const displayedEnabled = visualEnabled ?? enabled;

  useEffect(() => {
    if (!preference) return;
    setVisualPreference((current) => current || preference);
  }, [preference]);

  useEffect(() => {
    setVisualEnabled((current) => (current === null || current === enabled ? null : current));
  }, [enabled]);

  const handleMasterToggle = useCallback(async () => {
    if (!canUse) return;
    const previousEnabled = displayedEnabled;
    const nextEnabled = !previousEnabled;
    setVisualEnabled(nextEnabled);
    try {
      if (previousEnabled) {
        await disable();
        showToast('系统提醒已关闭', 'success');
      } else {
        await enable();
        showToast('系统提醒已开启', 'success');
      }
    } catch (error: any) {
      setVisualEnabled(previousEnabled);
      showToast(error?.message || '操作失败，请稍后重试', 'error');
    }
  }, [canUse, disable, displayedEnabled, enable, showToast]);

  const handlePreferenceToggle = useCallback(async (key: PreferenceKey) => {
    if (!displayedPreference) return;
    const previousPreference = displayedPreference;
    const nextPreference = {
      ...previousPreference,
      [key]: !previousPreference[key],
    };
    setVisualPreference(nextPreference);
    try {
      const savedPreference = await updatePreference({ [key]: nextPreference[key] } as Partial<NotificationPreference>);
      setVisualPreference(savedPreference);
    } catch (error: any) {
      setVisualPreference(previousPreference);
      showToast(error?.message || '更新失败，请稍后重试', 'error');
    }
  }, [displayedPreference, showToast, updatePreference]);

  const { guarded: guardedMasterToggle, isPending: masterTogglePending } = useInteractionGuard(handleMasterToggle, {
    policy: 'critical',
    cooldownMs: 560,
    minPendingMs: 160,
    mode: 'drop',
  });
  const { guarded: guardedPreferenceToggle, isPending: preferenceTogglePending } = useInteractionGuard<[PreferenceKey]>(handlePreferenceToggle, {
    policy: 'critical',
    cooldownMs: 560,
    minPendingMs: 160,
    mode: 'drop',
  });
  const settingsBusy = isMutating || masterTogglePending || preferenceTogglePending;

  return (
    <AppPage surface="workspace" mobileAddressBarScroll bottomSafe className="notification-settings-page surface-page">
      <SEO title="通知设置｜推推" description="管理推推系统提醒和消息通知类型。" noindex />
      <PageHeader
        title="通知设置"
        showBack
        titleAlign="center"
        className="notification-settings-topbar ui-layer-header"
      />
      <PageContentShell as="main" className="notification-settings-main ui-app-page-main">
        {/* 设备与推送状态概览 */}
        <SurfaceSectionCard
          as="section"
          tone="solid"
          paddingClassName="notification-status-banner-surface"
          className="notification-status-banner"
          ariaLabel="通知服务状态"
        >
          <div className="notification-status-header">
            <div className="notification-status-icon-wrap">
              {displayedEnabled ? (
                <BellRing className="notification-status-icon notification-status-icon--active" />
              ) : (
                <Bell className="notification-status-icon" />
              )}
            </div>
            <div className="notification-status-text">
              <h3 className="notification-status-title">
                {displayedEnabled ? '全站系统提醒已激活' : '全站系统提醒已关闭'}
              </h3>
              <p className="notification-status-desc">
                {displayedEnabled
                  ? '推送服务运行正常，重要业务、社交流水与互动将实时送达'
                  : '开启后，您将不会错过互动评论、充值到账与推广状态更新'}
              </p>
            </div>
            <span className={`notification-status-pill ${displayedEnabled ? 'notification-status-pill--active' : ''}`}>
              <ShieldCheck className="notification-pill-icon" />
              <span>{displayedEnabled ? '接收中' : '未开启'}</span>
            </span>
          </div>
        </SurfaceSectionCard>

        {/* 总开关卡片 */}
        <SurfaceSectionCard
          as="section"
          tone="solid"
          paddingClassName="notification-settings-section-surface"
          className="notification-settings-section"
          ariaLabel="总设置"
        >
          <SettingRow
            title="系统提醒总开关"
            description="开启后，重要消息会收到系统提醒。"
            className="notification-settings-item notification-settings-item--master pressable"
            disabled={!canUse || settingsBusy}
            onClick={() => void guardedMasterToggle()}
            contentClassName="notification-settings-item-content"
            titleClassName="notification-settings-item-title"
            descriptionClassName="notification-settings-item-description"
            showChevron={false}
            buttonProps={{
              role: 'switch',
              'aria-checked': displayedEnabled,
              'aria-disabled': !canUse || settingsBusy,
              'data-pending': settingsBusy ? 'true' : 'false',
            }}
            trailing={(
              <span className="notification-settings-switch" data-checked={displayedEnabled ? 'true' : 'false'} aria-hidden="true">
                <span className="notification-settings-switch-thumb" />
              </span>
            )}
          />
        </SurfaceSectionCard>

        {/* 分组细节设置 */}
        {PREFERENCE_GROUPS.map((group) => (
          <SurfaceSectionCard
            key={group.id}
            as="section"
            tone="solid"
            paddingClassName="notification-settings-section-surface"
            className="notification-settings-section"
            ariaLabel={group.groupTitle}
          >
            <h4 className="notification-group-title">{group.groupTitle}</h4>
            <div className="notification-settings-list" role="list">
              {group.items.map((item) => {
                const Icon = item.icon;
                const checked = Boolean(displayedPreference?.[item.key]);
                return (
                  <SettingRow
                    key={item.key}
                    title={item.title}
                    description={item.description}
                    icon={(
                      <span className={`notification-icon-badge ${item.colorClass}`}>
                        <Icon className="notification-icon-svg" />
                      </span>
                    )}
                    className="notification-settings-item pressable"
                    disabled={!displayedPreference || settingsBusy}
                    onClick={() => void guardedPreferenceToggle(item.key)}
                    contentClassName="notification-settings-item-content"
                    titleClassName="notification-settings-item-title"
                    descriptionClassName="notification-settings-item-description"
                    showChevron={false}
                    buttonProps={{
                      role: 'switch',
                      'aria-checked': checked,
                      'aria-disabled': !displayedPreference || settingsBusy,
                      'data-pending': settingsBusy ? 'true' : 'false',
                    }}
                    trailing={(
                      <span className="notification-settings-switch notification-settings-switch--sm" data-checked={checked ? 'true' : 'false'} aria-hidden="true">
                        <span className="notification-settings-switch-thumb" />
                      </span>
                    )}
                  />
                );
              })}
            </div>
          </SurfaceSectionCard>
        ))}
      </PageContentShell>
    </AppPage>
  );
}
