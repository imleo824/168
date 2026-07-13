import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAsyncFlow } from '@/hooks/useAsyncFlow';
import { apiFetch } from '@/services/api';

import {
  buildSlotStateMap,
  toDateKey,
  type PromotionTypeId,
  type SlotOwnershipState,
  type SlotsApiPayload,
} from './promoteBookingUtils';

type UsePromoteSlotsArgs = {
  activeSlotIndex: number;
  availabilityDates: Date[];
  canLoadSlots: boolean;
  selectedCategoryId: string;
  selectedHomeAdSlot: number;
  selectedType: PromotionTypeId;
  slotsPrerequisiteMessage: string;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onPaymentError: (message: string) => void;
};

export function usePromoteSlots({
  activeSlotIndex,
  availabilityDates,
  canLoadSlots,
  selectedCategoryId,
  selectedHomeAdSlot,
  selectedType,
  slotsPrerequisiteMessage,
  showToast,
  onPaymentError,
}: UsePromoteSlotsArgs) {
  const [selectedDateKeys, setSelectedDateKeys] = useState<Set<string>>(new Set());
  const [bookedSlots, setBookedSlots] = useState<Record<string, SlotOwnershipState>>({});
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [hasLoadedSlots, setHasLoadedSlots] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState('');
  const slotsLoadingTimerRef = useRef<number | null>(null);
  const slotsRequestSeqRef = useRef(0);
  const lastSlotsErrorToastAtRef = useRef(0);
  const availableDateKeys = useMemo(() => availabilityDates.map(toDateKey), [availabilityDates]);
  const availableDateKeySignature = useMemo(() => availableDateKeys.join(','), [availableDateKeys]);
  const availableDateKeySet = useMemo(() => new Set(availableDateKeys), [availableDateKeys]);

  const clearSelectedDates = useCallback(() => {
    setSelectedDateKeys((current) => (current.size ? new Set<string>() : current));
  }, []);

  const getSlotsPayload = useCallback(async (signal: AbortSignal): Promise<Record<string, SlotOwnershipState>> => {
    if (!canLoadSlots) {
      throw new Error(slotsPrerequisiteMessage || '排期正在准备，请稍后再试');
    }

    const params = new URLSearchParams({
      type: selectedType,
      dates: availableDateKeySignature,
    });

    if (selectedType === 'PIN_CATEGORY' && selectedCategoryId) {
      params.set('categoryId', selectedCategoryId);
    }

    const res = await apiFetch(`/api/promotion/slots-batch?${params.toString()}`, {
      signal,
    });

    if (!res.ok) {
      let message = res.status === 429 ? '请求过于频繁，请稍后再试' : '排期加载失败';

      try {
        const data = await res.json() as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        // Keep the stable user-facing fallback above.
      }

      throw new Error(message);
    }

    const data = await res.json() as SlotsApiPayload;

    return buildSlotStateMap(availableDateKeys, data);
  }, [
    availableDateKeys,
    availableDateKeySignature,
    canLoadSlots,
    selectedCategoryId,
    selectedType,
    slotsPrerequisiteMessage,
  ]);

  const {
    run: runLoadSlots,
    abort: abortSlotsFlow,
  } = useAsyncFlow(async ({ isActive, signal }, options?: { silent?: boolean }) => {
    const requestSeq = slotsRequestSeqRef.current + 1;
    slotsRequestSeqRef.current = requestSeq;

    if (slotsLoadingTimerRef.current) {
      window.clearTimeout(slotsLoadingTimerRef.current);
    }

    setSlotsLoadError('');

    slotsLoadingTimerRef.current = window.setTimeout(() => {
      if (requestSeq === slotsRequestSeqRef.current && isActive()) {
        setIsLoadingSlots(true);
      }
    }, 180);

    try {
      const latestSlots = await getSlotsPayload(signal);

      if (requestSeq !== slotsRequestSeqRef.current || !isActive()) {
        return null;
      }

      setBookedSlots(latestSlots);
      setHasLoadedSlots(true);
      setSlotsLoadError('');
      return latestSlots;
    } catch (err: any) {
      const isSilent = Boolean(options?.silent);

      if (!isActive() || requestSeq !== slotsRequestSeqRef.current) {
        return null;
      }

      const message = err?.message || '排期加载失败，请稍后重试';
      const now = Date.now();

      if (!isSilent && now - lastSlotsErrorToastAtRef.current > 2500) {
        lastSlotsErrorToastAtRef.current = now;
        showToast(message, 'error');
      }

      setBookedSlots({});
      setHasLoadedSlots(false);
      setSlotsLoadError(message);

      return null;
    } finally {
      if (slotsLoadingTimerRef.current) {
        window.clearTimeout(slotsLoadingTimerRef.current);
        slotsLoadingTimerRef.current = null;
      }

      if (requestSeq === slotsRequestSeqRef.current && isActive()) {
        setIsLoadingSlots(false);
      }
    }
  }, {
    cooldownMs: 180,
  });

  const fetchSlots = useCallback(async (options?: { silent?: boolean }) => {
    abortSlotsFlow();

    if (!canLoadSlots) {
      if (slotsLoadingTimerRef.current) {
        window.clearTimeout(slotsLoadingTimerRef.current);
        slotsLoadingTimerRef.current = null;
      }

      setBookedSlots({});
      setHasLoadedSlots(false);
      setIsLoadingSlots(false);
      setSlotsLoadError('');
      return null;
    }

    return runLoadSlots(options);
  }, [abortSlotsFlow, canLoadSlots, runLoadSlots]);

  const handleRetrySlots = useCallback(() => {
    if (!canLoadSlots) {
      if (slotsPrerequisiteMessage) showToast(slotsPrerequisiteMessage, 'error');
      return;
    }

    void fetchSlots({ silent: false });
  }, [canLoadSlots, fetchSlots, showToast, slotsPrerequisiteMessage]);

  const {
    run: runEnsureSelectedSlotsStillAvailable,
    isBusy: isConfirmingAvailability,
    abort: abortEnsureSlotsFlow,
  } = useAsyncFlow(async ({ isActive, signal }) => {
    if (!canLoadSlots) {
      const message = slotsPrerequisiteMessage || '排期正在准备，请稍后再试';
      if (isActive()) {
        onPaymentError(message);
        showToast(message, 'error');
      }
      return false;
    }

    const selectedKeys = Array.from(selectedDateKeys, (dateKey) => String(dateKey))
      .filter((dateKey) => availableDateKeySet.has(dateKey))
      .sort();

    if (selectedKeys.length !== selectedDateKeys.size) {
      setSelectedDateKeys((current) => new Set(Array.from(current).filter((dateKey) => availableDateKeySet.has(String(dateKey)))));
    }

    if (selectedKeys.length === 0) {
      return false;
    }

    let latestSlots: Record<string, SlotOwnershipState> | null = null;

    try {
      latestSlots = await getSlotsPayload(signal);
    } catch (err: any) {
      if (!isActive()) return false;

      const message = err?.message || '排期确认失败，请稍后再试';
      setHasLoadedSlots(false);
      setSlotsLoadError(message);
      showToast(message, 'error');
      if (isActive()) {
        onPaymentError(message);
      }
      return false;
    }

    if (!latestSlots) return false;
    if (!isActive()) return false;

    const confirmedSlots = latestSlots;
    setBookedSlots(confirmedSlots);
    setHasLoadedSlots(true);
    setSlotsLoadError('');

    const conflicts = selectedKeys.filter((dateKey) => confirmedSlots[dateKey]?.slots.includes(activeSlotIndex));

    if (conflicts.length === 0) return true;

    if (!isActive()) return false;

    setSelectedDateKeys((current) => {
      const next = new Set(current);
      conflicts.forEach((dateKey) => next.delete(dateKey));
      return next;
    });

    const message = `以下日期已被预约：${conflicts.join('、')}`;

    if (isActive()) {
      onPaymentError(message);
      showToast(message, 'error');
    }

    return false;
  }, {
    cooldownMs: 220,
  });

  const ensureSelectedSlotsStillAvailable = useCallback(async () => {
    abortEnsureSlotsFlow();

    const result = await runEnsureSelectedSlotsStillAvailable() as boolean | undefined;

    return Boolean(result);
  }, [abortEnsureSlotsFlow, runEnsureSelectedSlotsStillAvailable]);

  useEffect(() => {
    setSelectedDateKeys((current) => {
      if (!current.size) return current;
      const next = new Set(Array.from(current).filter((dateKey) => availableDateKeySet.has(String(dateKey))));
      return next.size === current.size ? current : next;
    });
  }, [availableDateKeySet]);

  useEffect(() => {
    setSelectedDateKeys((current) => (current.size ? new Set() : current));
    setBookedSlots({});
    setHasLoadedSlots(false);
    setSlotsLoadError('');

    if (!canLoadSlots) {
      abortSlotsFlow();
      abortEnsureSlotsFlow();
      setIsLoadingSlots(false);
      return () => {
        if (slotsLoadingTimerRef.current) {
          window.clearTimeout(slotsLoadingTimerRef.current);
          slotsLoadingTimerRef.current = null;
        }
      };
    }

    const timer = window.setTimeout(() => {
      void fetchSlots({ silent: true });
    }, 160);

    return () => {
      window.clearTimeout(timer);

      if (slotsLoadingTimerRef.current) {
        window.clearTimeout(slotsLoadingTimerRef.current);
        slotsLoadingTimerRef.current = null;
      }

      abortSlotsFlow();
      abortEnsureSlotsFlow();
    };
  }, [abortEnsureSlotsFlow, abortSlotsFlow, availableDateKeySignature, canLoadSlots, fetchSlots, selectedType, selectedCategoryId, selectedHomeAdSlot]);

  const slotIsBooked = useCallback((dateKey: string) => {
    return bookedSlots[dateKey]?.slots.includes(activeSlotIndex) ?? false;
  }, [activeSlotIndex, bookedSlots]);

  const slotIsMine = useCallback((dateKey: string) => {
    return bookedSlots[dateKey]?.ownSlots.includes(activeSlotIndex) ?? false;
  }, [activeSlotIndex, bookedSlots]);

  return {
    bookedSlots,
    clearSelectedDates,
    ensureSelectedSlotsStillAvailable,
    fetchSlots,
    handleRetrySlots,
    hasLoadedSlots,
    isConfirmingAvailability,
    isLoadingSlots,
    selectedDateKeys,
    setSelectedDateKeys,
    slotIsBooked,
    slotIsMine,
    slotsLoadError,
  };
}
