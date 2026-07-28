import { apiFetch } from '@/services/apiCore';

export type PushPermissionState = NotificationPermission | 'unsupported';
export type PushUnsupportedReason =
  | 'server'
  | 'insecure_context'
  | 'missing_service_worker'
  | 'missing_push_manager'
  | 'missing_notification';

export type NotificationPreference = {
  userId: string;
  pushEnabled: boolean;
  followEnabled: boolean;
  commentEnabled: boolean;
  quoteEnabled: boolean;
  likeEnabled: boolean;
  systemEnabled: boolean;
  rechargeEnabled: boolean;
  promotionEnabled: boolean;
};

export type PushStatus = {
  configured: boolean;
  vapidPublicKey: string;
  activeSubscriptionCount: number;
  preference: NotificationPreference | null;
};

type PushSyncResult = {
  success: boolean;
  reason?: string;
  status?: PushStatus;
};

function readNotificationPermission(): PushPermissionState {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function getPushCapability() {
  const hasWindow = typeof window !== 'undefined';
  if (!hasWindow) {
    return { supported: false, permission: 'unsupported' as PushPermissionState, reason: 'server' as PushUnsupportedReason };
  }
  if (!window.isSecureContext) {
    return { supported: false, permission: readNotificationPermission(), reason: 'insecure_context' as PushUnsupportedReason };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, permission: readNotificationPermission(), reason: 'missing_service_worker' as PushUnsupportedReason };
  }
  if (!('PushManager' in window)) {
    return { supported: false, permission: readNotificationPermission(), reason: 'missing_push_manager' as PushUnsupportedReason };
  }
  if (!('Notification' in window)) {
    return { supported: false, permission: 'unsupported' as PushPermissionState, reason: 'missing_notification' as PushUnsupportedReason };
  }
  return {
    supported: true,
    permission: readNotificationPermission(),
    reason: null,
  };
}

function normalizeBase64Url(value: string) {
  return String(value || '').trim().replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null | undefined) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return normalizeBase64Url(window.btoa(binary));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as any)?.error || (body as any)?.message || '系统推送操作失败');
  }
  return body as T;
}

async function postBrowserPushSubscription(subscription: PushSubscription) {
  const res = await apiFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      platform: navigator.platform || '',
    }),
  });
  return readJson<{ success: boolean; status: PushStatus }>(res);
}

export async function getPushStatus(): Promise<PushStatus> {
  const res = await apiFetch('/api/push/status', { cache: 'no-store' });
  return readJson<PushStatus>(res);
}

export async function getNotificationPreferences(): Promise<NotificationPreference> {
  const res = await apiFetch('/api/notification-preferences', { cache: 'no-store' });
  return readJson<NotificationPreference>(res);
}

export async function updateNotificationPreferences(patch: Partial<NotificationPreference>): Promise<NotificationPreference> {
  const res = await apiFetch('/api/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<NotificationPreference>(res);
}

async function getVapidPublicKey() {
  const res = await apiFetch('/api/push/vapid-public-key', { cache: 'no-store' });
  const body = await readJson<{ configured: boolean; publicKey: string }>(res);
  if (!body.configured || !body.publicKey) throw new Error('系统推送服务未配置，请先在 Railway 添加 VAPID 环境变量。');
  return body.publicKey;
}

function subscriptionUsesVapidPublicKey(subscription: PushSubscription, publicKey: string) {
  const subscriptionKey = arrayBufferToBase64Url(subscription.options?.applicationServerKey || null);
  if (!subscriptionKey) return true;
  return subscriptionKey === normalizeBase64Url(publicKey);
}

async function getFreshBrowserPushSubscription(registration: ServiceWorkerRegistration, publicKey: string, subscribeIfMissing: boolean) {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionUsesVapidPublicKey(subscription, publicKey)) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  if (!subscription && subscribeIfMissing) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  return subscription;
}

export async function syncBrowserPushSubscription({ subscribeIfMissing = true } = {}): Promise<PushSyncResult> {
  const capability = getPushCapability();
  if (!capability.supported) return { success: false, reason: capability.reason || 'unsupported' };
  if (Notification.permission !== 'granted') return { success: false, reason: 'permission_not_granted' };

  const publicKey = await getVapidPublicKey();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await getFreshBrowserPushSubscription(registration, publicKey, subscribeIfMissing);
  if (!subscription) return { success: false, reason: 'no_subscription' };

  const body = await postBrowserPushSubscription(subscription);
  return { success: true, status: body.status };
}

export async function enableBrowserPush() {
  const capability = getPushCapability();
  if (!capability.supported) {
    if (capability.reason === 'insecure_context') throw new Error('当前页面不是安全 HTTPS 环境，无法开启系统推送。');
    if (capability.reason === 'missing_push_manager') throw new Error('当前浏览器没有 PushManager。iPhone 请先添加到主屏幕，再从桌面图标打开推推。');
    throw new Error('当前浏览器暂不支持系统推送，请换 Chrome/Edge 或使用已添加到主屏幕的 iPhone PWA。');
  }

  if (Notification.permission === 'denied') {
    throw new Error('你已拒绝浏览器通知权限，请在浏览器/系统设置里重新允许推推通知。');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('未获得通知权限，无法开启系统推送');

  const result = await syncBrowserPushSubscription({ subscribeIfMissing: true });
  if (!result.success || !result.status) {
    throw new Error('系统推送订阅同步失败，请稍后重试');
  }
  return { success: true, status: result.status };
}

export async function disableBrowserPush() {
  const capability = getPushCapability();
  let endpoint = '';
  if (capability.supported) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    endpoint = subscription?.endpoint || '';
    await subscription?.unsubscribe().catch(() => undefined);
  }

  const res = await apiFetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  return readJson<{ success: boolean; status: PushStatus }>(res);
}
