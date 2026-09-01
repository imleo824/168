export type TuiPlusBenefitKey =
  | 'rankingBoost'
  | 'postContact'
  | 'postPromotionLink'
  | 'promotionBooking'
  | 'profileWebsite'
  | 'profileTelegramChannel'
  | 'officialTelegramSync'
  | 'memberIdentity';

export type TuiPlusBenefitItem = {
  key: TuiPlusBenefitKey;
  title: string;
  description: string;
};

export const TUI_PLUS_BENEFIT_ITEMS: TuiPlusBenefitItem[];
export const TUI_PLUS_BENEFIT_TITLES: string[];
