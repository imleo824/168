export enum TransactionAction {
  RECHARGE = 'RECHARGE',
  SIGNUP_REWARD = 'SIGNUP_REWARD',
  ANONYMOUS_PUBLISH = 'ANONYMOUS_PUBLISH',
  PIN_POST = 'PIN_POST',
  PIN_CHAT = 'PIN_CHAT',
  TELEGRAM_SYNC = 'TELEGRAM_SYNC',
  TUI_PLUS = 'TUI_PLUS',
  AD = 'AD'
}

export enum PromotionType {
  PIN_HOME = 'PIN_HOME',
  PIN_CATEGORY = 'PIN_CATEGORY',
  PIN_CHAT = 'PIN_CHAT',
  AD_HOME = 'AD_HOME'
}

export enum UserType {
  NORMAL = 'NORMAL',
  ROBOT = 'ROBOT',
  OFFICIAL = 'OFFICIAL'
}

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  [PromotionType.AD_HOME]: '首页横幅广告',
  [PromotionType.PIN_HOME]: '热门置顶',
  [PromotionType.PIN_CATEGORY]: '分类置顶',
  [PromotionType.PIN_CHAT]: '聊天室置顶',
};

export const PROMOTION_TYPE_OPTIONS = Object.values(PromotionType).map((value) => ({
  value,
  label: PROMOTION_TYPE_LABELS[value],
}));

export const TRANSACTION_ACTION_LABELS: Record<TransactionAction, string> = {
  [TransactionAction.RECHARGE]: '积分充值',
  [TransactionAction.SIGNUP_REWARD]: '注册赠送',
  [TransactionAction.ANONYMOUS_PUBLISH]: '匿名发推',
  [TransactionAction.PIN_POST]: PROMOTION_TYPE_LABELS[PromotionType.PIN_HOME],
  [TransactionAction.PIN_CHAT]: PROMOTION_TYPE_LABELS[PromotionType.PIN_CHAT],
  [TransactionAction.AD]: PROMOTION_TYPE_LABELS[PromotionType.AD_HOME],
  [TransactionAction.TELEGRAM_SYNC]: '频道同步',
  [TransactionAction.TUI_PLUS]: '推推会员',
};

export const TRANSACTION_ACTION_OPTIONS = Object.values(TransactionAction).map((value) => ({
  value,
  label: TRANSACTION_ACTION_LABELS[value],
}));

export const ADMIN_TRANSACTION_TYPE_OPTIONS = [
  { value: TransactionAction.RECHARGE, label: TRANSACTION_ACTION_LABELS[TransactionAction.RECHARGE] },
  { value: TransactionAction.SIGNUP_REWARD, label: TRANSACTION_ACTION_LABELS[TransactionAction.SIGNUP_REWARD] },
  { value: TransactionAction.ANONYMOUS_PUBLISH, label: TRANSACTION_ACTION_LABELS[TransactionAction.ANONYMOUS_PUBLISH] },
  { value: PromotionType.AD_HOME, label: PROMOTION_TYPE_LABELS[PromotionType.AD_HOME] },
  { value: PromotionType.PIN_HOME, label: PROMOTION_TYPE_LABELS[PromotionType.PIN_HOME] },
  { value: PromotionType.PIN_CATEGORY, label: PROMOTION_TYPE_LABELS[PromotionType.PIN_CATEGORY] },
  { value: PromotionType.PIN_CHAT, label: PROMOTION_TYPE_LABELS[PromotionType.PIN_CHAT] },
  { value: TransactionAction.TELEGRAM_SYNC, label: TRANSACTION_ACTION_LABELS[TransactionAction.TELEGRAM_SYNC] },
  { value: TransactionAction.TUI_PLUS, label: TRANSACTION_ACTION_LABELS[TransactionAction.TUI_PLUS] },
];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  [UserType.NORMAL]: '真人',
  [UserType.ROBOT]: '机器人',
  [UserType.OFFICIAL]: '官方',
};

export const USER_TYPE_OPTIONS = Object.values(UserType).map((value) => ({
  value,
  label: USER_TYPE_LABELS[value],
}));

export const ADMIN_USER_TYPE_FILTER_OPTIONS = [
  { value: '', label: '全部用户类型' },
  ...USER_TYPE_OPTIONS,
];

export function isPromotionTypeValue(value: unknown): value is PromotionType {
  return Object.values(PromotionType).includes(value as PromotionType);
}

export function isTransactionActionValue(value: unknown): value is TransactionAction {
  return Object.values(TransactionAction).includes(value as TransactionAction);
}

export function isUserTypeValue(value: unknown): value is UserType {
  return Object.values(UserType).includes(value as UserType);
}

export function getPromotionTypeLabel(type: unknown) {
  return PROMOTION_TYPE_LABELS[type as PromotionType] || String(type || '曝光服务');
}

export function getTransactionActionLabel(action: unknown, description?: unknown) {
  const normalizedAction = action as TransactionAction;
  const desc = String(description || '');

  if (normalizedAction === TransactionAction.AD && desc.includes('聊天')) {
    return PROMOTION_TYPE_LABELS[PromotionType.PIN_CHAT];
  }
  if (normalizedAction === TransactionAction.PIN_POST && desc.includes('分类')) {
    return PROMOTION_TYPE_LABELS[PromotionType.PIN_CATEGORY];
  }
  if (normalizedAction === TransactionAction.RECHARGE) {
    if (desc.includes('手动上分')) return '手动上分';
    if (desc.includes('手动下分')) return '手动下分';
    if (desc.includes('注册')) return TRANSACTION_ACTION_LABELS[TransactionAction.SIGNUP_REWARD];
  }

  return TRANSACTION_ACTION_LABELS[normalizedAction] || String(action || '积分变动');
}

export function getUserTypeLabel(userType: unknown) {
  return USER_TYPE_LABELS[userType as UserType] || String(userType || '未知');
}
