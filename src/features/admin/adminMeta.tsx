import type { ReactElement } from 'react';
import { BookOpenCheck, Bot, Coins, Database, FileText, Heart, Image, MessageSquare, Quote, Settings, ShieldCheck, Users, Wallet } from 'lucide-react';
import type {
  AdminTab,
  ConfigScope,
  DepositAddressSection,
  OpsConfigSection,
  OpsMetrics,
  SystemConfigMeta,
  TelegramConfigSection,
} from './adminTypes';

export const adminTabs: Array<{ id: AdminTab; label: string; icon: (size?: number) => ReactElement }> = [
  { id: 'report', label: '运营报表', icon: (size = 16) => <ShieldCheck size={size} /> },
  { id: 'content', label: '内容管理', icon: (size = 16) => <FileText size={size} /> },
  { id: 'promotions', label: '广告管理', icon: (size = 16) => <Image size={size} /> },
  { id: 'users', label: '用户管理', icon: (size = 16) => <Users size={size} /> },
  { id: 'orders', label: '充值管理', icon: (size = 16) => <ShieldCheck size={size} /> },
  { id: 'transactions', label: '交易管理', icon: (size = 16) => <Coins size={size} /> },
  { id: 'referral-withdrawals', label: '邀请提现', icon: (size = 16) => <Wallet size={size} /> },
  { id: 'chat', label: '聊天管理', icon: (size = 16) => <MessageSquare size={size} /> },
];

export const systemConfigTabs: Array<{ id: AdminTab; label: string; icon: (size?: number) => ReactElement }> = [
  { id: 'interaction-config', label: '互动配置', icon: (size = 16) => <MessageSquare size={size} /> },
  { id: 'ad', label: '广告配置', icon: (size = 16) => <Image size={size} /> },
  { id: 'telegram', label: '飞机配置', icon: (size = 16) => <Settings size={size} /> },
  { id: 'ops', label: '运营配置', icon: (size = 16) => <ShieldCheck size={size} /> },
  { id: 'deposit-addresses', label: '地址管理', icon: (size = 16) => <Wallet size={size} /> },
  { id: 'model-config', label: '模型配置', icon: (size = 16) => <Bot size={size} /> },
];

export const interactionSubTabs: Array<{ id: AdminTab; label: string; icon: (size?: number) => ReactElement }> = [
  { id: 'chat-config', label: '自动聊天', icon: (size = 16) => <MessageSquare size={size} /> },
  { id: 'quote-publish', label: '自动引用', icon: (size = 16) => <Quote size={size} /> },
  { id: 'comment-publish', label: '自动评论', icon: (size = 16) => <MessageSquare size={size} /> },
  { id: 'auto-like', label: '自动点赞', icon: (size = 16) => <Heart size={size} /> },
  { id: 'auto-post', label: '自动发帖', icon: (size = 16) => <BookOpenCheck size={size} /> },
  { id: 'auto-crawl', label: '自动抓取', icon: (size = 16) => <Database size={size} /> },
];

export const adminNavigationTabs = [...adminTabs, ...systemConfigTabs];

export const metricLabelMap: Array<{ key: keyof OpsMetrics; label: string }> = [
  { key: 'registeredUsers', label: '注册用户' },
  { key: 'memberCount', label: '会员数量' },
  { key: 'chatUserCount', label: '聊天用户' },
  { key: 'postUserCount', label: '发帖用户' },
  { key: 'quoteUserCount', label: '引用用户' },
  { key: 'commentUserCount', label: '评论用户' },
  { key: 'likeUserCount', label: '点赞用户' },
  { key: 'shareUserCount', label: '分享用户' },
  { key: 'rechargeAmount', label: '充值金额' },
  { key: 'consumedPoints', label: '消耗积分' },
  { key: 'postCount', label: '发帖数量' },
  { key: 'likeCount', label: '点赞数量' },
  { key: 'shareCount', label: '分享数量' },
  { key: 'followCount', label: '关注数量' },
];

export const systemConfigMeta: Record<ConfigScope, SystemConfigMeta> = {
  ad: { title: '广告配置', icon: (size = 17) => <Image size={size} />, summary: '控制列表置顶、首页横幅广告位与发布积分的计费策略。' },
  telegram: { title: '飞机配置', icon: (size = 17) => <Settings size={size} />, summary: '管理 Telegram Bot、频道与同步规则，支持内容过滤。' },
  ops: { title: '运营配置', icon: (size = 17) => <ShieldCheck size={size} />, summary: '管理奖励参数、在线人数曲线与充值链上参数。' },
  'deposit-addresses': { title: '地址管理', icon: (size = 17) => <Wallet size={size} />, summary: '管理归集地址池、状态监控与批量导入。' },
};

export const TELEGRAM_CONFIG_SECTIONS: Array<{ id: TelegramConfigSection; label: string }> = [
  { id: 'connection', label: '连接配置' },
  { id: 'filter', label: '同步规则' },
  { id: 'template', label: '消息模板' },
];

export const OPS_CONFIG_SECTIONS: Array<{ id: OpsConfigSection; label: string }> = [
  { id: 'reward', label: '奖励与在线展示' },
  { id: 'location-presets', label: '地点预设' },
  { id: 'publish-category', label: '发布分类' },
  { id: 'recharge', label: '链上充值配置' },
];

export const DEPOSIT_ADDRESS_SECTIONS: Array<{ id: DepositAddressSection; label: string }> = [
  { id: 'monitor', label: '归集监控' },
  { id: 'import', label: '批量导入' },
  { id: 'list', label: '地址列表' },
];
