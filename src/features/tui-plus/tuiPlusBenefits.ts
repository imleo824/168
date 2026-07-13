export type TuiPlusBenefitKey =
  | 'profileLinks'
  | 'promotionBooking'
  | 'postContact'
  | 'postPromotionLink'
  | 'officialTelegramSync'
  | 'activationPost'
  | 'generic';

export type TuiPlusBenefitCopy = {
  key: TuiPlusBenefitKey;
  title: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
};

export const TUI_PLUS_BENEFITS: Record<TuiPlusBenefitKey, TuiPlusBenefitCopy> = {
  profileLinks: {
    key: 'profileLinks',
    title: '开通会员后可添加主页链接',
    detail: '可在主页展示联系方式、频道和网址。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  promotionBooking: {
    key: 'promotionBooking',
    title: '开通会员后可买曝光',
    detail: '可购买首页、分类和聊天曝光。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  postContact: {
    key: 'postContact',
    title: '今天的联系方式展示次数已用完',
    detail: '会员不限次数展示联系方式。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  postPromotionLink: {
    key: 'postPromotionLink',
    title: '推广链接是会员权益',
    detail: '会员可在帖子中添加推广链接。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  officialTelegramSync: {
    key: 'officialTelegramSync',
    title: '开通会员后可同步到频道',
    detail: '会员可同步内容到官方频道。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  activationPost: {
    key: 'activationPost',
    title: '了解推推会员功能',
    detail: '开通会员，获得曝光和主页展示权益。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  generic: {
    key: 'generic',
    title: '这是会员功能',
    detail: '开通会员后可使用。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
};

export function normalizeTuiPlusBenefitKey(raw: unknown): TuiPlusBenefitKey {
  const key = String(raw || '').trim() as TuiPlusBenefitKey;
  return Object.prototype.hasOwnProperty.call(TUI_PLUS_BENEFITS, key) ? key : 'generic';
}

export function getTuiPlusBenefitCopy(raw: unknown): TuiPlusBenefitCopy {
  return TUI_PLUS_BENEFITS[normalizeTuiPlusBenefitKey(raw)];
}

export function isTuiPlusActive(user: any) {
  if (!user) return false;
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  const status = String(user.plusStatus || '').trim().toUpperCase();

  if (expiresAt && expiresAt <= Date.now()) return false;
  if (status) return Boolean(expiresAt && expiresAt > Date.now() && (status === 'TRIALING' || status === 'ACTIVE'));

  return Boolean(user.isTuiPlus);
}

export function buildTuiPlusBenefitRouteState(benefit: unknown, from?: string) {
  return {
    from,
    requiredBenefit: normalizeTuiPlusBenefitKey(benefit),
  };
}
