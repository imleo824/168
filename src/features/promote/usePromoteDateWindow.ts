import { useEffect, useMemo, useState } from 'react';
import { addDays, startOfDay } from 'date-fns';

import {
  BOOKING_WINDOW_DAYS,
  dateKeyToLocalDate,
  getPlatformDateKey,
  toDateKey,
} from './promoteBookingUtils';

function getTodayStart() {
  return dateKeyToLocalDate(getPlatformDateKey());
}

export function usePromoteDateWindow() {
  const [today, setToday] = useState(() => getTodayStart());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refreshToday = () => {
      setToday((current) => {
        const next = getTodayStart();
        return toDateKey(next) === toDateKey(current) ? current : next;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshToday();
      }
    };

    const timer = window.setInterval(refreshToday, 60_000);
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return useMemo(() => {
    return Array.from({ length: BOOKING_WINDOW_DAYS }).map((_, index) => startOfDay(addDays(today, index)));
  }, [today]);
}
