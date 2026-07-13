import { PromotionType } from './domain';

export const PROMOTION_PRICE_KEYS = {
  homeAdSlots: ['ad_home_slot_1', 'ad_home_slot_2', 'ad_home_slot_3'],
  chatAdSlots: ['pin_chat_slot_1', 'pin_chat_slot_2', 'pin_chat_slot_3'],
  chatAdFallback: 'pin_chat',
  homePin: 'pin_home',
  categoryPinMap: 'pin_category_map',
} as const;

export type PromotionPriceConfig = {
  prices?: Record<string, unknown> & {
    ad_home_slot_1?: unknown;
    ad_home_slot_2?: unknown;
    ad_home_slot_3?: unknown;
    pin_chat?: unknown;
    pin_chat_slot_1?: unknown;
    pin_chat_slot_2?: unknown;
    pin_chat_slot_3?: unknown;
    pin_home?: unknown;
    pin_category_map?: Record<string, unknown>;
  };
};

export function normalizePromotionPointPrice(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(1, Math.ceil(parsed));
}

export function getPromotionHomeAdSlotPrice(configs: PromotionPriceConfig | undefined, slotIndex: number) {
  const key = PROMOTION_PRICE_KEYS.homeAdSlots[slotIndex as 0 | 1 | 2];
  return key ? normalizePromotionPointPrice(configs?.prices?.[key]) : 0;
}

export function getPromotionChatAdSlotPrice(configs: PromotionPriceConfig | undefined, slotIndex: number) {
  const fallback = normalizePromotionPointPrice(configs?.prices?.[PROMOTION_PRICE_KEYS.chatAdFallback]);
  const key = PROMOTION_PRICE_KEYS.chatAdSlots[slotIndex as 0 | 1 | 2];
  return key ? normalizePromotionPointPrice(configs?.prices?.[key]) || fallback : fallback;
}

export function getPromotionCategoryPinPrice(configs: PromotionPriceConfig | undefined, categorySlug?: string | null) {
  const map = configs?.prices?.[PROMOTION_PRICE_KEYS.categoryPinMap] || {};
  const normalizedSlug = String(categorySlug || '').trim();
  if (!normalizedSlug) return 0;
  return normalizePromotionPointPrice(map[normalizedSlug]);
}

export function getPromotionSlotPrice(params: {
  configs?: PromotionPriceConfig;
  type: PromotionType | string;
  slotIndex: number;
  categorySlug?: string | null;
}) {
  if (params.type === PromotionType.AD_HOME) return getPromotionHomeAdSlotPrice(params.configs, params.slotIndex);
  if (params.type === PromotionType.PIN_CHAT) return getPromotionChatAdSlotPrice(params.configs, params.slotIndex);
  if (params.type === PromotionType.PIN_HOME) return normalizePromotionPointPrice(params.configs?.prices?.[PROMOTION_PRICE_KEYS.homePin]);
  if (params.type === PromotionType.PIN_CATEGORY) return getPromotionCategoryPinPrice(params.configs, params.categorySlug);
  return 0;
}
