import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { syncBrowserPushSubscription } from '@/services/pushNotification';

const PUSH_RESYNC_DELAY_MS = 1200;
const PUSH_RESYNC_MIN_INTERVAL_MS = 60_000;

export function useBrowserPushResync(userId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    let timeoutId: number | null = null;
    let lastSyncAt = 0;
    const canAttemptSync = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';
    const runSync = () => {
      if (!canAttemptSync()) return;
      const now = Date.now();
      if (now - lastSyncAt < PUSH_RESYNC_MIN_INTERVAL_MS) return;
      lastSyncAt = now;
      void syncBrowserPushSubscription({ subscribeIfMissing: true })
        .then((result) => {
          if (result.status) {
            queryClient.setQueryData(['push', 'status'], result.status);
            if (result.status.preference) queryClient.setQueryData(['notification-preferences'], result.status.preference);
          }
        })
        .catch(() => undefined);
    };
    const scheduleSync = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(runSync, PUSH_RESYNC_DELAY_MS);
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
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', scheduleSync);
    };
  }, [queryClient, userId]);
}
