import { useEffect, useState } from 'react';

import { buildOnlineCount, ONLINE_COUNT_REFRESH_INTERVAL_MS } from './onlinePresence';

let lastStableOnlineCount: number | null = null;

function commitStableOnlineCount(next: number) {
  if (!Number.isFinite(next) || next <= 0) return lastStableOnlineCount;
  lastStableOnlineCount = next;
  return next;
}

export function useHomeOnlineCount({
  min,
  max,
  enabled = true,
}: {
  min?: number | null;
  max?: number | null;
  enabled?: boolean;
}) {
  const [count, setCount] = useState<number | null>(() => (
    enabled ? commitStableOnlineCount(buildOnlineCount(min, max)) : lastStableOnlineCount
  ));

  useEffect(() => {
    if (!enabled) {
      setCount(lastStableOnlineCount);
      return undefined;
    }

    const syncCount = () => {
      const next = commitStableOnlineCount(buildOnlineCount(min, max));
      if (next == null) return;
      setCount((current) => (current === next ? current : next));
    };

    syncCount();
    const timer = window.setInterval(syncCount, ONLINE_COUNT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, min, max]);

  return count;
}
