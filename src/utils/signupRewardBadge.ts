import { safeLocalStorage } from '@/utils/storage';

const SIGNUP_REWARD_BADGE_STORAGE_KEY = 'signup_reward_badge_points_v1';
export const SIGNUP_REWARD_BADGE_EVENT = 'signup-reward-badge-change';

function normalizeRewardPoints(value: unknown) {
  const points = Number(value);
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.floor(points));
}

export function readSignupRewardBadgePoints() {
  return normalizeRewardPoints(safeLocalStorage.getItem(SIGNUP_REWARD_BADGE_STORAGE_KEY));
}

export function publishSignupRewardBadge(points: unknown) {
  const normalizedPoints = normalizeRewardPoints(points);
  if (normalizedPoints <= 0) return;
  safeLocalStorage.setItem(SIGNUP_REWARD_BADGE_STORAGE_KEY, String(normalizedPoints));
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SIGNUP_REWARD_BADGE_EVENT, {
    detail: { points: normalizedPoints },
  }));
}

export function clearSignupRewardBadge() {
  safeLocalStorage.removeItem(SIGNUP_REWARD_BADGE_STORAGE_KEY);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SIGNUP_REWARD_BADGE_EVENT, {
    detail: { points: 0 },
  }));
}
