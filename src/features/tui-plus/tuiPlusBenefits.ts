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
  description: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
};

export const TUI_PLUS_BENEFITS: Record<TuiPlusBenefitKey, TuiPlusBenefitCopy> = {
  profileLinks: {
    key: 'profileLinks',
    title: '开通会员后可添加主页链接',
    description: '开通推推会员后，可在主页展示联系方式、频道和网址。',
    detail: '主页链接会展示在你的主页顶部，适合放 Telegram、WhatsApp、Line、频道或官网，让别人更容易联系你。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  promotionBooking: {
    key: 'promotionBooking',
    title: '开通会员后可买曝光',
    description: '开通推推会员后，可预约首页、分类和聊天曝光位。',
    detail: '买曝光可以提前锁定展示位置，适合需要稳定获客和持续展示的内容。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  postContact: {
    key: 'postContact',
    title: '今天的联系方式展示次数已用完',
    description: '普通用户每天可展示 1 次帖子联系方式，会员不限次数。',
    detail: '开通推推会员后，发推时可以不限次数展示联系按钮，读者更容易直接联系你。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  postPromotionLink: {
    key: 'postPromotionLink',
    title: '推广链接是会员权益',
    description: '开通 Tui Plus 后，才能在发布帖子时设置推广链接。',
    detail: '推广链接会展示在帖子图片下方，读者可直接点击进入官网、注册页或活动页。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  officialTelegramSync: {
    key: 'officialTelegramSync',
    title: '开通会员后可同步到频道',
    description: '开通推推会员后，可以使用更多官方频道同步能力。',
    detail: '频道同步适合需要把内容分发到更多曝光入口的用户。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  activationPost: {
    key: 'activationPost',
    title: '了解推推会员功能',
    description: '推推会员可以提升曝光、展示主页链接，并使用更多增长工具。',
    detail: '适合需要长期展示、稳定获客、方便别人直接联系你的用户。',
    confirmLabel: '开通会员',
    cancelLabel: '先不了',
  },
  generic: {
    key: 'generic',
    title: '这是会员功能',
    description: '开通推推会员后可继续使用。',
    detail: '推推会员会解锁更多曝光、主页展示和推广相关功能。',
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
