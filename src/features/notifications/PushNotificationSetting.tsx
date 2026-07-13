import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import EmptyStateCard from '@/ui/EmptyStateCard';
import { useAuth } from '@/context/AuthContext';
import { usePushNotification } from '@/hooks/usePushNotification';

const PROMPT_DISMISS_PREFIX = 'tuitui:pwa-push-prompt-dismissed:v2';

function getDismissKey(userId?: string | null) {
  return `${PROMPT_DISMISS_PREFIX}:${userId || 'guest'}`;
}

function hasDismissedPrompt(userId?: string | null) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(getDismissKey(userId)) === '1';
}

function dismissPrompt(userId?: string | null) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getDismissKey(userId), '1');
}

function getUnavailableDescription(capability: ReturnType<typeof usePushNotification>['capability'], configured?: boolean) {
  if (configured === false) return '系统推送服务未配置，站内消息不受影响。';
  if (capability.reason === 'insecure_context') return '当前页面不是 HTTPS 安全环境，暂时不能开启系统提醒。';
  if (capability.reason === 'missing_push_manager') return '当前浏览器不支持系统提醒。iPhone 需要先添加到主屏幕。';
  return '当前环境暂不支持系统提醒，站内消息不受影响。';
}

export default function PushNotificationSetting() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { capability, status, enabled } = usePushNotification(Boolean(user?.id));
  const [dismissed, setDismissed] = useState(() => hasDismissedPrompt(user?.id));
  const userId = user?.id || '';

  useEffect(() => {
    setDismissed(hasDismissedPrompt(userId));
  }, [userId]);

  const isConfigured = status?.configured !== false;
  const canUse = capability.supported && isConfigured;
  const title = useMemo(() => {
    if (!isConfigured) return '系统提醒待配置';
    if (!capability.supported) return '系统提醒暂不可用';
    return '不错过重要消息';
  }, [capability.supported, isConfigured]);
  const description = canUse
    ? '开启后，评论、关注、会员、邀请和平台重要提醒会额外收到系统通知；站内消息会一直保留。'
    : getUnavailableDescription(capability, status?.configured);

  if (!user || enabled || dismissed) return null;

  const handleDismiss = () => {
    dismissPrompt(user.id);
    setDismissed(true);
  };

  return (
    <EmptyStateCard
      compact
      tone="info"
      className="messages-push-setting-card messages-push-setting-card--prompt"
      title={title}
      description={description}
      action={
        <div className="ui-state-actions">
          <button
            type="button"
            className="messages-read-all-button pressable"
            disabled={!canUse}
            onClick={() => navigate('/settings/notifications')}
          >
            去开启
          </button>
          <button
            type="button"
            className="messages-read-all-button pressable"
            onClick={handleDismiss}
          >
            暂不需要
          </button>
        </div>
      }
    />
  );
}
