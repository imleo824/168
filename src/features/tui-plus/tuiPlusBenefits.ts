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
    title: '开通会员解锁主页专属外链',
    detail: '开通推推会员后，可在个人主页挂载专属网站、Telegram 频道与联系方式，打造个人品牌。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  promotionBooking: {
    key: 'promotionBooking',
    title: '开通会员解锁广告置顶',
    detail: '付费广告置顶为推推会员专属权益。开通会员后即可购买首页与分类频道广告位。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  postContact: {
    key: 'postContact',
    title: '解锁无限次联系方式展示',
    detail: '非会员展示次数已达上限。开通推推会员，享受帖子无限制展示 Telegram 联系入口。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  postPromotionLink: {
    key: 'postPromotionLink',
    title: '开通会员解锁推广外链',
    detail: '开通推推会员后，发布帖子可附加独立推广链接，直达你的产品或网页。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  officialTelegramSync: {
    key: 'officialTelegramSync',
    title: '开通会员解锁频道自动同步',
    detail: '开通推推会员，发布的帖子将自动同步推送到官方 Telegram 频道，实现跨平台联动。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  activationPost: {
    key: 'activationPost',
    title: '解锁推推会员尊享权益',
    detail: '开通推推会员，立即享有全站曝光提权、主页专属外链、无限制联系入口及尊贵标识。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
  },
  generic: {
    key: 'generic',
    title: '该功能为推推会员专属权益',
    detail: '开通推推会员，解锁全站曝光提权、专属外链挂载等多项尊享高级功能。',
    confirmLabel: '开通会员',
    cancelLabel: '暂不开通',
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
