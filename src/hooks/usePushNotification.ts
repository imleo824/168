import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  disableBrowserPush,
  enableBrowserPush,
  getNotificationPreferences,
  getPushCapability,
  getPushStatus,
  updateNotificationPreferences,
  type NotificationPreference,
  type PushStatus,
} from '@/services/pushNotification';

export function usePushNotification(active = true) {
  const queryClient = useQueryClient();
  const capability = useMemo(() => getPushCapability(), []);

  const statusQuery = useQuery({
    queryKey: ['push', 'status'],
    queryFn: getPushStatus,
    enabled: active,
    staleTime: 20_000,
  });

  const preferenceQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: getNotificationPreferences,
    enabled: active,
    staleTime: 20_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['push', 'status'] }),
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
    ]);
  };

  const syncStatus = (status: PushStatus) => {
    queryClient.setQueryData(['push', 'status'], status);
    if (status.preference) {
      queryClient.setQueryData(['notification-preferences'], status.preference);
    }
  };

  const enableMutation = useMutation({
    mutationFn: enableBrowserPush,
    onSuccess: (body) => {
      syncStatus(body.status);
      void refresh();
    },
  });

  const disableMutation = useMutation({
    mutationFn: disableBrowserPush,
    onSuccess: (body) => {
      syncStatus(body.status);
      void refresh();
    },
  });

  const preferenceMutation = useMutation({
    mutationFn: (patch: Partial<NotificationPreference>) => updateNotificationPreferences(patch),
    onMutate: (patch) => {
      const previousPreference = queryClient.getQueryData<NotificationPreference>(['notification-preferences']);
      const previousStatus = queryClient.getQueryData<PushStatus>(['push', 'status']);
      const basePreference = previousPreference || previousStatus?.preference || null;

      if (basePreference) {
        const nextPreference = { ...basePreference, ...patch };
        queryClient.setQueryData(['notification-preferences'], nextPreference);
        if (previousStatus) {
          queryClient.setQueryData(['push', 'status'], {
            ...previousStatus,
            preference: nextPreference,
          });
        }
      }

      void queryClient.cancelQueries({ queryKey: ['notification-preferences'] });
      void queryClient.cancelQueries({ queryKey: ['push', 'status'] });

      return { previousPreference, previousStatus };
    },
    onError: (_error, _patch, context) => {
      if (context?.previousPreference) queryClient.setQueryData(['notification-preferences'], context.previousPreference);
      if (context?.previousStatus) queryClient.setQueryData(['push', 'status'], context.previousStatus);
    },
    onSuccess: (nextPreference) => {
      queryClient.setQueryData(['notification-preferences'], nextPreference);
      queryClient.setQueryData<PushStatus | undefined>(['push', 'status'], (previousStatus) => previousStatus
        ? { ...previousStatus, preference: nextPreference }
        : previousStatus);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'], refetchType: 'inactive' });
      void queryClient.invalidateQueries({ queryKey: ['push', 'status'], refetchType: 'inactive' });
    },
  });

  const status = statusQuery.data;
  const preference = preferenceQuery.data || status?.preference || null;
  const activeSubscriptionCount = status?.activeSubscriptionCount || 0;
  const enabled = Boolean(preference?.pushEnabled && activeSubscriptionCount > 0);

  return {
    capability,
    status,
    preference,
    enabled,
    isLoading: active && (statusQuery.isLoading || preferenceQuery.isLoading),
    error: statusQuery.error || preferenceQuery.error,
    enable: enableMutation.mutateAsync,
    disable: disableMutation.mutateAsync,
    updatePreference: preferenceMutation.mutateAsync,
    isMutating: enableMutation.isPending || disableMutation.isPending || preferenceMutation.isPending,
  };
}
