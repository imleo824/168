import { useCallback, useEffect, useRef, useState } from 'react';

const LIKE_FEEDBACK_DURATION_MS = 180;
const LIKE_HAPTIC_PATTERN = 8;

function canRunMotionFeedback() {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runLikeHapticFeedback() {
  if (!canRunMotionFeedback()) return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(LIKE_HAPTIC_PATTERN);
  } catch {
    // Vibration is a progressive enhancement and may be disabled by the device.
  }
}

export function useLikeFeedback() {
  const [isLikeFeedbackActive, setIsLikeFeedbackActive] = useState(false);
  const timerRef = useRef<number | null>(null);

  const triggerLikeFeedback = useCallback(() => {
    if (!canRunMotionFeedback()) return;
    runLikeHapticFeedback();
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setIsLikeFeedbackActive(false);
    window.requestAnimationFrame(() => {
      setIsLikeFeedbackActive(true);
      timerRef.current = window.setTimeout(() => {
        setIsLikeFeedbackActive(false);
        timerRef.current = null;
      }, LIKE_FEEDBACK_DURATION_MS);
    });
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return { isLikeFeedbackActive, triggerLikeFeedback };
}
