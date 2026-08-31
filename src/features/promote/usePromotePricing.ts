import { useCallback, useMemo } from 'react';

import { PromotionType } from '../../../shared/domain';
import {
  getPromotionCategoryPinPrice,
  getPromotionHomeAdSlotPrice,
  getPromotionSlotPrice,
  normalizePromotionPointPrice,
  type PromotionPriceConfig,
} from '../../../shared/promotionPricing';
import {
  promotionTypeLabel,
  type PromotionTypeId,
} from './promoteBookingUtils';
import type { PromotionTypeChoice } from './promotePageSections';

type PromotePricingCategory = {
  id?: string;
  slug?: string | null;
  name?: string | null;
};

type PromotePricingConfig = PromotionPriceConfig;

function categorySlugForId(rootCategories: PromotePricingCategory[], categoryId?: string) {
  return (rootCategories.find((item) => item.id === categoryId)?.slug || '').trim();
}

export function usePromotePricing({
  config,
  rootCategories,
  selectedCategoryId,
  selectedHomeAdSlot,
  selectedType,
}: {
  config: PromotePricingConfig | undefined;
  rootCategories: PromotePricingCategory[];
  selectedCategoryId: string;
  selectedHomeAdSlot: number;
  selectedType: PromotionTypeId;
}) {
  const priceForHomeAdSlot = useCallback((slotIndex: number) => getPromotionHomeAdSlotPrice(config, slotIndex), [config]);

  const priceForCategoryPin = useCallback((categoryId?: string) => {
    const resolvedCategoryId = categoryId || rootCategories[0]?.id || '';
    return getPromotionCategoryPinPrice(config, categorySlugForId(rootCategories, resolvedCategoryId));
  }, [config, rootCategories]);

  const pricePerSlot = useMemo(() => getPromotionSlotPrice({
    configs: config,
    type: selectedType,
    slotIndex: selectedHomeAdSlot,
    categorySlug: selectedType === PromotionType.PIN_CATEGORY
      ? categorySlugForId(rootCategories, selectedCategoryId || rootCategories[0]?.id)
      : null,
  }), [config, rootCategories, selectedCategoryId, selectedHomeAdSlot, selectedType]);

  const selectedCategoryLabel = useMemo(
    () => rootCategories.find((category) => category.id === selectedCategoryId)?.name || '',
    [rootCategories, selectedCategoryId],
  );

  const checkoutContextLabel = selectedType === PromotionType.PIN_CATEGORY
    ? `${selectedCategoryLabel || '分类置顶'} · ${pricePerSlot || 0} 积分/天`
    : `${promotionTypeLabel(selectedType)} · ${pricePerSlot || 0} 积分/天`;

  const promotionTypeChoices: PromotionTypeChoice[] = [
    {
      id: 'PIN_HOME',
      desc: '首页热门置顶',
      price: normalizePromotionPointPrice(config?.prices?.pin_home),
    },
    {
      id: 'PIN_CATEGORY',
      desc: '分类频道置顶',
      price: priceForCategoryPin(selectedCategoryId || rootCategories[0]?.id),
    },
    {
      id: 'AD_HOME',
      desc: '首页顶部横幅',
      price: priceForHomeAdSlot(selectedHomeAdSlot),
    },
  ];

  return {
    checkoutContextLabel,
    priceForCategoryPin,
    priceForHomeAdSlot,
    pricePerSlot,
    promotionTypeChoices,
  };
}
