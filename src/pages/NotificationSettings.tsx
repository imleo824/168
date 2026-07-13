import { useEffect, useState } from 'react';
import {
  Heart,
  Megaphone,
  MessageCircle,
  Pin,
  Repeat2,
  UserPlus,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import SEO from '@/platform/SEO';
import { useAuth } from '@/context/AuthContext';
import { usePushNotification } from '@/hooks/usePushNotification';
import type { NotificationPreference } from '@/services/pushNotification';

type PreferenceKey = keyof Pick<
  NotificationPreference,
  'commentEnabled' | 'followEnabled' | 'quoteEnabled' | 'likeEnabled' | 'systemEnabled' | 'rechargeEnabled' | 'promotionEnabled'
>;

const PREFERENCE_ITEMS: Array<{
  key: PreferenceKey;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  { key: 'commentEnabled', title: '评论', description: '有人评论你', icon: MessageCircle },
  { key: 'followEnabled', title: '关注', description: '有人关注你', icon: UserPlus },
  { key: 'quoteEnabled', title: '引用', description: '内容被引用', icon: Repeat2 },
  { key: 'systemEnabled', title: '平台', description: '公告与账号提醒', icon: Megaphone },
  { key: 'rechargeEnabled', title: '充值', description: '到账与积分变动', icon: WalletCards },
  { key: 'promotionEnabled', title: '推广', description: '推广状态变化', icon: Pin },
  { key: 'likeEnabled', title: '点赞', description: '默认关闭', icon: Heart },
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

  const handleMasterToggle = async () => {
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
  };

  const handlePreferenceToggle = async (key: PreferenceKey) => {
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
  };

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="notification-settings-page surface-page">
      <SEO title="通知设置｜推推" description="管理推推系统提醒和消息通知类型。" noindex />
      <PageHeader
        title="通知设置"
        showBack
        titleAlign="center"
        className="notification-settings-topbar ui-layer-header"
      />
      <PageContentShell as="main" className="notification-settings-main ui-app-page-main">
        <section className="notification-settings-section notification-settings-section--single" aria-label="通知设置">
          <button
            type="button"
            role="switch"
            aria-checked={displayedEnabled}
            className="notification-settings-item notification-settings-item--master pressable"
            aria-disabled={!canUse || isMutating}
            data-pending={isMutating ? 'true' : 'false'}
            onClick={handleMasterToggle}
          >
            <span className="notification-settings-item-copy">
              <span className="notification-settings-item-title">系统提醒</span>
              <span className="notification-settings-item-description">开启后，重要消息会收到系统提醒。</span>
            </span>
            <span className="notification-settings-switch notification-settings-switch--sm" data-checked={displayedEnabled ? 'true' : 'false'} aria-hidden="true">
              <span className="notification-settings-switch-thumb" />
            </span>
          </button>

          <div className="notification-settings-list" role="list">
            {PREFERENCE_ITEMS.map((item) => {
              const Icon = item.icon;
              const checked = Boolean(displayedPreference?.[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  className="notification-settings-item pressable"
                  aria-disabled={!displayedPreference}
                  onClick={() => handlePreferenceToggle(item.key)}
                >
                  <span className="notification-settings-item-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="notification-settings-item-copy">
                    <span className="notification-settings-item-title">{item.title}</span>
                    <span className="notification-settings-item-description">{item.description}</span>
                  </span>
                  <span className="notification-settings-switch notification-settings-switch--sm" data-checked={checked ? 'true' : 'false'} aria-hidden="true">
                    <span className="notification-settings-switch-thumb" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </PageContentShell>
    </AppPage>
  );
}
