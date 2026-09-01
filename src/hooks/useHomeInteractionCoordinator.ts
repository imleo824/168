import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useInteractionGuard } from './useInteractionGuard';
import type { RefreshState, RefreshUiSource } from '@/features/home/homeTypes';

const TAB_SWITCH_SETTLE_MS = 180;
const PULL_REFRESH_COOLDOWN_MS = 260;
const LOAD_MORE_COOLDOWN_MS = 280;
const BROWSE_ALL_COOLDOWN_MS = 280;

interface RunRefreshOptions {
  source?: RefreshUiSource;
}

interface UseHomeInteractionCoordinatorOptions {
  activeTabKey: string;
  refreshState: RefreshState;
  refreshUiSource: RefreshUiSource | null;
  runManualRefresh: (options?: RunRefreshOptions) => Promise<void> | void;
  onLoadMore: () => void | Promise<void>;
  onBrowseAll: () => void;
  /**
   * The active tab's feed query is still resolving. Tab loading dots must stay
   * visible until this becomes false; otherwise the UI reports “done” before
   * the new feed actually arrives.
   */
  isActiveTabFeedPending?: boolean;
}

export function useHomeInteractionCoordinator({
  activeTabKey,
  refreshState,
  refreshUiSource,
  runManualRefresh,
  onLoadMore,
  onBrowseAll,
  isActiveTabFeedPending = false,
}: UseHomeInteractionCoordinatorOptions) {
  const [isTabTransitionPending, startTabTransition] = useTransition();
  const [switchingTabKey, setSwitchingTabKey] = useState<string | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === null) return;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!switchingTabKey) return undefined;
    if (activeTabKey !== switchingTabKey) return undefined;

    // Keep the tab dots visible until the target feed has actually resolved.
    // The old 180ms-only timer made the dots disappear while the network
    // request was still in flight.
    if (isActiveTabFeedPending || isTabTransitionPending) {
      clearSettleTimer();
      return undefined;
    }

    clearSettleTimer();
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      setSwitchingTabKey((current) => (current === switchingTabKey ? null : current));
    }, TAB_SWITCH_SETTLE_MS);

    return clearSettleTimer;
  }, [
    activeTabKey,
    clearSettleTimer,
    isActiveTabFeedPending,
    isTabTransitionPending,
    switchingTabKey,
  ]);

  useEffect(() => () => clearSettleTimer(), [clearSettleTimer]);

  const requestTabChange = useCallback(
    (targetTabKey: string, commit: () => void) => {
      if (targetTabKey === activeTabKey) {
        return runManualRefresh({ source: 'tab' });
      }

      clearSettleTimer();
      setSwitchingTabKey(targetTabKey);
      startTabTransition(commit);
      return undefined;
    },
    [activeTabKey, clearSettleTimer, runManualRefresh],
  );

  const { guarded: refreshFromPull } = useInteractionGuard(
    useCallback(() => runManualRefresh({ source: 'pull' }), [runManualRefresh]),
    PULL_REFRESH_COOLDOWN_MS,
  );

  const { guarded: loadMore } = useInteractionGuard(onLoadMore, LOAD_MORE_COOLDOWN_MS);
  const { guarded: browseAll } = useInteractionGuard(onBrowseAll, BROWSE_ALL_COOLDOWN_MS);

  const loadingTabKey =
    switchingTabKey ||
    (refreshState === 'refreshing' && refreshUiSource === 'tab' ? activeTabKey : null);

  return {
    loadingTabKey,
    requestTabChange,
    refreshFromPull,
    loadMore,
    browseAll,
  } as const;
}
