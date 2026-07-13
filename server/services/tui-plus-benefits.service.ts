import { getTuiPlusStatus, TuiPlusError } from './tui-plus.service';

export const TUI_PLUS_BENEFIT_FLAGS = {
  officialTelegramSync: 'officialTelegramSync',
  ownTelegramAutoCrawl: 'ownTelegramAutoCrawl',
  profileWebsite: 'profileWebsite',
  profileContact: 'profileContact',
  promotionBooking: 'promotionBooking',
  postContactUnlimited: 'postContactUnlimited',
  postPromotionLink: 'postPromotionLink',
  avatarRing: 'avatarRing',
} as const;

const TUI_PLUS_MEMBER_REQUIRED_MESSAGE = '开通推推会员后才能使用该权益';

function normalizeRankingBoostPercent(payload: any, active: boolean) {
  if (!active) return 0;
  const value = Number(payload?.benefits?.rankingBoostPercent);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function completeTuiPlusStatusPayload(payload: any) {
  const active = Boolean(payload?.active);
  return {
    ...payload,
    benefits: {
      ...(payload?.benefits || {}),
      [TUI_PLUS_BENEFIT_FLAGS.officialTelegramSync]: active,
      [TUI_PLUS_BENEFIT_FLAGS.ownTelegramAutoCrawl]: active,
      [TUI_PLUS_BENEFIT_FLAGS.profileWebsite]: active,
      [TUI_PLUS_BENEFIT_FLAGS.profileContact]: active,
      [TUI_PLUS_BENEFIT_FLAGS.promotionBooking]: active,
      [TUI_PLUS_BENEFIT_FLAGS.postContactUnlimited]: active,
      [TUI_PLUS_BENEFIT_FLAGS.postPromotionLink]: active,
      rankingBoostPercent: normalizeRankingBoostPercent(payload, active),
      [TUI_PLUS_BENEFIT_FLAGS.avatarRing]: active,
    },
  };
}

export async function assertTuiPlusActive(userId: string, message = TUI_PLUS_MEMBER_REQUIRED_MESSAGE) {
  const status = await getTuiPlusStatus(userId);
  if (!status.active) throw new TuiPlusError(403, message);
  return status;
}
