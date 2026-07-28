import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const PUSH_RESYNC_DELAY_MS = 1200;
const PUSH_RESYNC_MIN_INTERVAL_MS = 60_000;

export function useBrowserPushResync(userId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    let timeoutId: number | null = null;
    let disposed = false;
    let lastSyncAt = 0;
    const canAttemptSync = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';
    const runSync = async () => {
      if (!canAttemptSync()) return;
      const now = Date.now();
      if (now - lastSyncAt < PUSH_RESYNC_MIN_INTERVAL_MS) return;
      lastSyncAt = now;

      try {
        const { syncBrowserPushSubscription } = await import('@/services/pushNotification');
        if (disposed) return;
        const result = await syncBrowserPushSubscription({ subscribeIfMissing: true });
        if (disposed || !result.status) return;
        queryClient.setQueryData(['push', 'status'], result.status);
        if (result.status.preference) queryClient.setQueryData(['notification-preferences'], result.status.preference);
      } catch {
        // Push resync is opportunistic; notification settings can retry explicitly.
      }
    };
    const scheduleSync = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        void runSync();
      }, PUSH_RESYNC_DELAY_MS);
    };
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | undefined)?.type === 'tuitui:pushsubscriptionchange') {
        lastSyncAt = 0;
        scheduleSync();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleSync();
    };

    scheduleSync();
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', scheduleSync);

    return () => {
      disposed = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', scheduleSync);
    };
  }, [queryClient, userId]);
}
