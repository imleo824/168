import type { ReactElement } from 'react';
import type { PublishCategoryMetaFieldConfig } from '@/types';

export type OpsMetrics = {
  registeredUsers: number;
  memberCount: number;
  chatUserCount: number;
  rechargeAmount: number;
  consumedPoints: number;
  postCount: number;
  likeCount: number;
  shareCount: number;
  followCount: number;
  postUserCount: number;
  quoteUserCount: number;
  commentUserCount: number;
  likeUserCount: number;
  shareUserCount: number;
};

export type OpsTrendItem = OpsMetrics & {
  date: string;
};

export type OpsReport = {
  today: OpsMetrics;
  trend: OpsTrendItem[];
  historical: OpsMetrics;
  generatedAt: string;
  timezone: string;
};

export type AdminTab = 'report' | 'content' | 'promotions' | 'users' | 'orders' | 'transactions' | 'referral-withdrawals' | 'chat' | 'model-config' | 'interaction-config' | 'comment-publish' | 'quote-publish' | 'auto-post' | 'auto-crawl' | 'auto-like' | 'chat-config' | 'ad' | 'telegram' | 'ops' | 'deposit-addresses';
export type ConfigScope = 'ad' | 'telegram' | 'ops' | 'deposit-addresses';
export type AdConfigSection = 'pricing' | 'placement' | 'publish';
export type TelegramConfigSection = 'connection' | 'filter' | 'template';
export type OpsConfigSection = 'reward' | 'location-presets' | 'publish-category' | 'recharge';
export type DepositAddressSection = 'monitor' | 'import' | 'list';
export type PublishCategoryFieldType = PublishCategoryMetaFieldConfig['type'];

export type DepositAddressStats = {
  available: number;
  assigned: number;
  hdAssigned: number;
  disabled: number;
  fallbackOrders: number;
  pendingAutoCreditOrders: number;
  pendingSweepOrders: number;
  pendingSweepUsdt: number;
  todayRechargeCount: number;
  todayRechargeUsdt: number;
  sweepTargetConfigured: boolean;
  lastSweepJob?: {
    id: string;
    status: string;
    totalUsdt: string | number;
    orderCount: number;
    addressCount: number;
    createdAt: string;
    finishedAt?: string | null;
  } | null;
};

export type SystemConfigMeta = {
  title: string;
  icon: (size?: number) => ReactElement;
  summary: string;
};
