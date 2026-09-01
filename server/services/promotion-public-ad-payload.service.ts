import { HOME_AD_SLOT_INDICES, normalizeAdTargetUrl } from '../promotion-utils';

const MAX_PUBLIC_AD_URL_LENGTH = 2048;

type PublicPromotionAdPayload = {
  id: string;
  type: string;
  startsAt: Date | string;
  endsAt: Date | string;
  slotIndex: number;
  adImageUrl: string | null;
  adMobileImageUrl: string | null;
  adTargetUrl: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function normalizePublicImageUrl(value: unknown) {
  const url = String(value || '').trim();
  if (!url || url.length > MAX_PUBLIC_AD_URL_LENGTH || /[\u0000-\u001F\u007F]/.test(url)) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (process.env.NODE_ENV !== 'production' && url.startsWith('/uploads/')) return url;
  return null;
}

function normalizePublicTargetUrl(value: unknown) {
  try {
    return normalizeAdTargetUrl(String(value || ''));
  } catch {
    return '/';
  }
}

export function toPublicPromotionAdPayload(booking: any): PublicPromotionAdPayload | null {
  const id = String(booking?.id || '').trim();
  const type = String(booking?.type || '').trim();
  const slotIndex = Number(booking?.slotIndex);
  const adImageUrl = normalizePublicImageUrl(booking?.adImageUrl);
  const adMobileImageUrl = normalizePublicImageUrl(booking?.adMobileImageUrl);

  if (!id || !type || !Number.isInteger(slotIndex) || !HOME_AD_SLOT_INDICES.has(slotIndex)) return null;
  if (!adImageUrl && !adMobileImageUrl) return null;

  return {
    id,
    type,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    slotIndex,
    adImageUrl,
    adMobileImageUrl,
    adTargetUrl: normalizePublicTargetUrl(booking?.adTargetUrl),
    createdAt: booking.createdAt ?? null,
    updatedAt: booking.updatedAt ?? null,
  };
}

export function toPublicPromotionAdPayloads(bookings: any[]) {
  return (Array.isArray(bookings) ? bookings : [])
    .map(toPublicPromotionAdPayload)
    .filter((item): item is PublicPromotionAdPayload => Boolean(item));
}
