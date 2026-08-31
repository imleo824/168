import { format, startOfDay } from 'date-fns';
import { PromotionType, getPromotionTypeLabel } from '@/types';

export const DAILY_SLOT_INDEX = 0;
export const HOME_AD_SLOTS = [
  { index: 0, label: '第1位置', desc: '顶部核心位' },
  { index: 1, label: '第2位置', desc: '首屏黄金位' },
  { index: 2, label: '第3位置', desc: '高频轮播位' },
];

export const BOOKING_WINDOW_DAYS = 35;
export const PROMOTE_RETURN_PATH_KEY = 'promote-return-path';
export const STEP_TITLE_CLASS = 'promote-step-title x-nav-title ui-text-strong';
export const PROMOTION_PLATFORM_TIMEZONE = 'Asia/Shanghai';

export const SLOT_OWNER_BADGE_LABELS = {
  mine: '已购买',
  others: '已占用',
};

export type SlotOwnershipState = {
  slots: number[];
  ownSlots: number[];
};

export type SlotsApiPayload = Record<string, number[] | SlotOwnershipState | undefined>;

export type PromotionTypeId = 'PIN_HOME' | 'PIN_CATEGORY' | 'PIN_CHAT' | 'AD_HOME';

export function toDateKey(date: Date) {
  return format(startOfDay(date), 'yyyy-MM-dd');
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: 'year' | 'month' | 'day') {
  return parts.find((part) => part.type === type)?.value || '';
}

export function getPlatformDateKey(date = new Date(), timeZone = PROMOTION_PLATFORM_TIMEZONE) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = getDatePart(parts, 'year');
    const month = getDatePart(parts, 'month');
    const day = getDatePart(parts, 'day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to local date only when the runtime cannot format the platform timezone.
  }

  return toDateKey(date);
}

export function dateKeyToLocalDate(dateKey: string) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return startOfDay(new Date());
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
}

export function promotionTypeLabel(type: string) {
  return getPromotionTypeLabel(type);
}

export function getPostThumbnail(post: any) {
  return post?.images?.[0] || post?.image || post?.coverImage || post?.media?.[0] || '';
}

export function normalizeSlotList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => Number(item))
    .filter((slot) => Number.isFinite(slot) && Number.isInteger(slot));
}

export function normalizePromotionPrice(value: unknown): number {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Math.max(1, Math.ceil(price)) : 0;
}

export function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const path = value.trim();

  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\u0000-\u001F\u007F\\]/.test(path)) {
    return null;
  }

  return path;
}

export function getSlotStatusLabel(isBooked: boolean, isMine: boolean) {
  if (!isBooked) return '';
  return isMine ? SLOT_OWNER_BADGE_LABELS.mine : SLOT_OWNER_BADGE_LABELS.others;
}

export function resolvePromotionType(type?: PromotionTypeId | string) {
  if (type === PromotionType.PIN_CATEGORY || type === 'PIN_CATEGORY') return 'PIN_CATEGORY' as const;
  if (type === PromotionType.PIN_HOME || type === 'PIN_HOME') return 'PIN_HOME' as const;
  if (type === PromotionType.AD_HOME || type === 'AD_HOME') return 'AD_HOME' as const;
  return undefined;
}

export function normalizeText(value?: string | null) {
  return (value || '').trim();
}

export function homeAdSlotLabel(slotIndex: number) {
  return HOME_AD_SLOTS.find((slot) => slot.index === slotIndex)?.label || `第${slotIndex + 1}位置`;
}

export function normalizeHomeAdSlotIndex(value: unknown) {
  const slotIndex = Number(value);
  return HOME_AD_SLOTS.some((slot) => slot.index === slotIndex) ? slotIndex : 0;
}

export function buildSlotStateMap(dateKeys: string[], payload: SlotsApiPayload): Record<string, SlotOwnershipState> {
  const next = Object.fromEntries(
    dateKeys.map((dateKey) => [
      dateKey,
      { slots: [] as number[], ownSlots: [] as number[] },
    ] as const),
  ) as Record<string, SlotOwnershipState>;

  for (const dateKey of dateKeys) {
    const raw = payload[dateKey];

    if (!raw) continue;

    if (Array.isArray(raw)) {
      next[dateKey] = {
        slots: normalizeSlotList(raw),
        ownSlots: [],
      };
      continue;
    }

    if (typeof raw === 'object') {
      next[dateKey] = {
        slots: normalizeSlotList((raw as { slots?: unknown }).slots),
        ownSlots: normalizeSlotList((raw as { ownSlots?: unknown }).ownSlots),
      };
    }
  }

  return next;
}
