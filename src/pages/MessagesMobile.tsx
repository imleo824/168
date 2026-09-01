import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Megaphone, MessageCircle, Pin, Repeat2, Settings2, UserPlus, WalletCards } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppPage from '@/ui/AppPage';
import PageHeader from '@/ui/PageHeader';
import PageContentShell from '@/ui/PageContentShell';
import AvatarImage from '@/ui/AvatarImage';
import EmptyStateCard from '@/ui/EmptyStateCard';
import { LoadingBlock } from '@/ui/LoadingState';
import SEO from '@/platform/SEO';
import SegmentTabs from '@/ui/SegmentTabs';
import TopbarIconButton from '@/ui/TopbarIconButton';
import { APP_ROUTES } from '@/app/routePaths';
import { getNotificationsList, markAllNotificationsAsRead, markNotificationAsRead } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import PushNotificationSetting from '@/features/notifications/PushNotificationSetting';
import { useInteractionGuard } from '@/hooks/useInteractionGuard';

import '@/features/notifications/NotificationsRoute.css';

type NotificationType = 'LIKE' | 'COMMENT' | 'QUOTE' | 'FOLLOW' | 'SYSTEM' | 'RECHARGE' | 'PROMOTION';
type NotificationFilter = 'ALL' | NotificationType;

type NotificationItem = {
  id: string;
  type: NotificationType;
  title?: string | null;
  body?: string | null;
  targetUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    photoUrl?: string | null;
    userType?: string | null;
  } | null;
  post?: {
    id: string;
    title?: string | null;
    content?: string | null;
  } | null;
  comment?: {
    id: string;
    content?: string | null;
  } | null;
  quotePost?: {
    id: string;
    title?: string | null;
    content?: string | null;
  } | null;
};

type NotificationResponse = {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
};

const NOTIFICATION_TABS: Array<{ key: NotificationFilter; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'COMMENT', label: '评论' },
  { key: 'QUOTE', label: '引用' },
  { key: 'LIKE', label: '点赞' },
  { key: 'FOLLOW', label: '关注' },
  { key: 'SYSTEM', label: '平台' },
  { key: 'RECHARGE', label: '充值' },
  { key: 'PROMOTION', label: '推广' },
];

const NOTIFICATION_COPY: Record<NotificationType, { action: string; icon: typeof Heart; fallbackTitle: string }> = {
  LIKE: { action: '点赞了你', icon: Heart, fallbackTitle: '新的点赞' },
  COMMENT: { action: '评论了你', icon: MessageCircle, fallbackTitle: '新的评论' },
  QUOTE: { action: '引用了你', icon: Repeat2, fallbackTitle: '新的引用' },
  FOLLOW: { action: '关注了你', icon: UserPlus, fallbackTitle: '新的关注' },
  SYSTEM: { action: '', icon: Megaphone, fallbackTitle: '平台通知' },
  RECHARGE: { action: '', icon: WalletCards, fallbackTitle: '充值提醒' },
  PROMOTION: { action: '', icon: Pin, fallbackTitle: '推广提醒' },
};

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function summarizeText(value?: string | null, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.length > 48 ? `${text.slice(0, 48)}...` : text;
}

function normalizeInternalPath(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '';
  return raw;
}

function getNotificationTargetPath(item: NotificationItem) {
  const explicitTarget = normalizeInternalPath(item.targetUrl);
  if (explicitTarget) return explicitTarget;
  if (item.type === 'FOLLOW' && item.actor?.id) return `/user/${item.actor.id}`;
  if (item.quotePost?.id) return `/post/${item.quotePost.id}`;
  if (item.post?.id) return `/post/${item.post.id}`;
  if (item.actor?.id) return `/user/${item.actor.id}`;
  return APP_ROUTES.messages;
}

function getNotificationTargetText(item: NotificationItem) {
  if (item.body) return summarizeText(item.body, '查看详情');
  if (item.type === 'COMMENT') {
    return summarizeText(item.comment?.content, summarizeText(item.post?.title || item.post?.content, '查看帖子'));
  }
  if (item.type === 'FOLLOW') return '查看主页';
  return summarizeText(item.post?.title || item.post?.content || item.quotePost?.title || item.quotePost?.content, '查看详情');
}

async function fetchNotifications(activeFilter: NotificationFilter): Promise<NotificationResponse> {
  return getNotificationsList({
    type: activeFilter,
    limit: 40,
  });
}

async function markAllNotificationsRead() {
  return markAllNotificationsAsRead();
}

async function markNotificationRead(notificationId: string) {
  return markNotificationAsRead(notificationId);
}

function markNotificationReadInCache(previous: NotificationResponse | undefined, notificationId: string, readAt: string) {
  if (!previous?.items?.length) return previous;
  let changed = false;
  const items = previous.items.map((item) => {
    if (item.id !== notificationId || item.readAt) return item;
    changed = true;
    return { ...item, readAt };
  });
  if (!changed) return previous;
  return {
    ...previous,
    items,
    unreadCount: Math.max(0, Number(previous.unreadCount || 0) - 1),
  };
}

function markAllNotificationsReadInCache(previous: NotificationResponse | undefined, readAt: string) {
  if (!previous) return previous;
  let changed = Number(previous.unreadCount || 0) > 0;
  const items = (previous.items || []).map((item) => {
    if (item.readAt) return item;
    changed = true;
    return { ...item, readAt };
  });
  if (!changed) return previous;
  return { ...previous, items, unreadCount: 0 };
}

export default function MessagesMobile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, showToast } = useAuth();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('ALL');
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: ['me', 'notifications', activeFilter],
    queryFn: () => fetchNotifications(activeFilter),
    enabled: Boolean(user?.id),
    staleTime: 15_000,
  });

  const items = notificationsQuery.data?.items || [];
  const unreadCount = notificationsQuery.data?.unreadCount || 0;
  const title = '消息';
  const canShowPushPrompt = notificationsQuery.isFetched || notificationsQuery.isError;

  const handleMarkAllRead = useCallback(async () => {
    if (isMarkingAllRead || unreadCount <= 0) return;
    const readAt = new Date().toISOString();
    setIsMarkingAllRead(true);
    queryClient.setQueriesData<NotificationResponse>(
      { queryKey: ['me', 'notifications'] },
      (previous) => markAllNotificationsReadInCache(previous, readAt),
    );
    try {
      await markAllNotificationsRead();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['me', 'notifications', 'unread-count'] }),
      ]);
      showToast('消息已全部标记为已读', 'success');
    } catch (error: any) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['me', 'notifications', 'unread-count'] }),
      ]);
      showToast(error?.message || '操作失败，请稍后重试', 'error');
    } finally {
      setIsMarkingAllRead(false);
    }
  }, [isMarkingAllRead, queryClient, showToast, unreadCount]);

  const openNotification = useCallback((item: NotificationItem, targetPath: string) => {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<NotificationResponse>(
        { queryKey: ['me', 'notifications'] },
        (previous) => markNotificationReadInCache(previous, item.id, readAt),
      );
      void markNotificationRead(item.id)
        .catch((): void => undefined)
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['me', 'notifications', 'unread-count'] });
        });
    }
    navigate(targetPath);
  }, [navigate, queryClient]);
  const { guarded: guardedOpenNotification } = useInteractionGuard<[NotificationItem, string]>(openNotification, {
    policy: 'optimistic',
    cooldownMs: 360,
    mode: 'drop',
  });

  const openActorSpace = useCallback((actorId: string) => {
    if (!actorId) return;
    navigate(`/user/${actorId}`);
  }, [navigate]);
  const { guarded: guardedOpenActorSpace } = useInteractionGuard<[string]>(openActorSpace, {
    policy: 'instant',
    cooldownMs: 360,
    mode: 'drop',
  });

  const goNotificationSettings = useCallback(() => {
    navigate(APP_ROUTES.notificationSettings);
  }, [navigate]);
  const { guarded: guardedGoNotificationSettings } = useInteractionGuard(goNotificationSettings, {
    policy: 'instant',
    cooldownMs: 520,
    mode: 'drop',
  });

  const renderContent = useMemo(() => {
    if (notificationsQuery.isLoading) {
      return <LoadingBlock compact text="正在加载消息" className="messages-loading" />;
    }

    if (notificationsQuery.isError) {
      return (
        <EmptyStateCard
          title="消息加载失败"
          description={(notificationsQuery.error as Error)?.message || '请稍后重试'}
        />
      );
    }

    if (items.length === 0) {
      return <EmptyStateCard title="暂无消息" />;
    }

    return (
      <div className="messages-list" role="list" aria-label="消息列表">
        {items.map((item) => {
          const meta = NOTIFICATION_COPY[item.type] || NOTIFICATION_COPY.SYSTEM;
          const Icon = meta.icon;
          const actor = item.actor || null;
          const isActorNotification = Boolean(actor?.id && meta.action);
          const isSystemRow = !isActorNotification;
          const actorName = actor?.displayName || actor?.username || meta.fallbackTitle;
          const titleText = isActorNotification ? actorName : item.title || meta.fallbackTitle;
          const targetText = getNotificationTargetText(item);
          const targetPath = getNotificationTargetPath(item);

          return (
            <div
              key={item.id}
              className={`messages-list-item${isSystemRow ? ' messages-list-item--system' : ''}`}
              data-read={item.readAt ? 'true' : 'false'}
              role="listitem"
            >
              {isActorNotification && actor?.id ? (
                <button
                  type="button"
                  className="messages-avatar-button pressable"
                  aria-label={`进入${actorName}的个人空间`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void guardedOpenActorSpace(actor.id);
                  }}
                >
                  <AvatarImage
                    src={actor.photoUrl || ''}
                    name={actorName}
                    id={actor.id}
                    alt={`${actorName} 的头像`}
                    className="messages-item-avatar"
                    variant="thumb"
                  />
                </button>
              ) : (
                <span className="messages-avatar-button messages-avatar-button--system" aria-hidden="true">
                  <Icon className="messages-system-avatar-icon" />
                </span>
              )}
              {isActorNotification ? (
                <span className="messages-item-icon" aria-hidden="true">
                  <Icon />
                </span>
              ) : null}
              <button
                type="button"
                className="messages-item-content-button pressable"
                onClick={() => void guardedOpenNotification(item, targetPath)}
              >
                <span className="messages-item-main">
                  <span className="messages-item-line">
                    <strong>{titleText}</strong>
                    {isActorNotification ? <span>{meta.action}</span> : null}
                  </span>
                  <span className="messages-item-target">{targetText}</span>
                </span>
                <span className="messages-item-time">{formatMessageTime(item.createdAt)}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }, [guardedOpenActorSpace, guardedOpenNotification, items, notificationsQuery.error, notificationsQuery.isError, notificationsQuery.isLoading]);

  return (
    <AppPage mobileAddressBarScroll bottomSafe className="messages-page surface-page">
      <SEO title="消息｜推推" description="查看点赞、评论、引用、关注和平台提醒。" noindex />
      <PageHeader
        title={title}
        showBack={false}
        titleAlign="center"
        className="messages-topbar ui-layer-header"
        right={
          <div className="messages-topbar-actions">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="messages-read-all-button pressable"
                onClick={handleMarkAllRead}
                disabled={isMarkingAllRead}
                aria-busy={isMarkingAllRead}
              >
                {isMarkingAllRead ? '处理中' : '全部已读'}
              </button>
            ) : null}
            <TopbarIconButton
              icon={<Settings2 aria-hidden="true" />}
              onClick={() => void guardedGoNotificationSettings()}
              ariaLabel="通知设置"
              title="通知设置"
              tone="default"
            />
          </div>
        }
      />
      <div className="ui-page-tabs-section ui-layer-sticky-tab scrollbar-hide">
        <SegmentTabs
          items={NOTIFICATION_TABS}
          activeKey={activeFilter}
          onChange={(key) => setActiveFilter(key as NotificationFilter)}
          ariaLabel="消息类型"
          className="messages-tabbar ui-page-tabs-bar"
          showLabels
          labelDisplay="full"
          variant="underline"
        />
      </div>
      <PageContentShell as="main" className="messages-main ui-app-page-main">
        {canShowPushPrompt ? <PushNotificationSetting /> : null}
        {renderContent}
      </PageContentShell>
    </AppPage>
  );
}
