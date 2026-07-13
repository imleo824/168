import { Image, LayoutGrid, Pin, type LucideIcon } from 'lucide-react';

import {
  PromotionType,
  getPromotionTypeLabel,
  type PromotionBooking,
  type PromotionEffectStats,
} from '@/types';

export type PromotionStatusFilter = 'ALL' | '未开始' | '投放中' | '已结束';

export type PromotionGroup = {
  key: string;
  bookings: PromotionBooking[];
  primary: PromotionBooking;
  dates: string[];
};

export const PROMOTION_EFFECT_METRICS: Array<{ key: keyof PromotionEffectStats; label: string }> = [
  { key: 'views', label: '浏览' },
  { key: 'likes', label: '点赞' },
  { key: 'comments', label: '评论' },
  { key: 'shares', label: '分享' },
  { key: 'quotes', label: '引用' },
];

export const EMPTY_PROMOTION_EFFECT_STATS: PromotionEffectStats = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  quotes: 0,
};

function normalizeEffectCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function normalizePromotionEffectStats(value: unknown): PromotionEffectStats {
  const stats = value as Partial<PromotionEffectStats> | null | undefined;
  return {
    views: normalizeEffectCount(stats?.views),
    likes: normalizeEffectCount(stats?.likes),
    comments: normalizeEffectCount(stats?.comments),
    shares: normalizeEffectCount(stats?.shares),
    quotes: normalizeEffectCount(stats?.quotes),
  };
}

export function hasAnyPromotionEffectStats(value?: Partial<PromotionEffectStats> | null) {
  const stats = normalizePromotionEffectStats(value);
  return stats.views > 0 || stats.likes > 0 || stats.comments > 0 || stats.shares > 0 || stats.quotes > 0;
}

export function parseDateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function getPostThumbnail(post: any) {
  return post?.images?.[0] || post?.image || post?.coverImage || post?.media?.[0] || '';
}

export function promotionTypeLabel(type: string) {
  return getPromotionTypeLabel(type);
}

export function homeAdSlotLabel(slotIndex?: number | null) {
  const value = Number(slotIndex);
  if (!Number.isFinite(value) || value < 0) return '第1位置';
  return `第${value + 1}位置`;
}

export function promotionDisplayTitle(booking: PromotionBooking) {
  if (booking.type === PromotionType.AD_HOME || booking.type === PromotionType.PIN_CHAT) {
    return `${promotionTypeLabel(booking.type)} · ${homeAdSlotLabel(booking.slotIndex)}`;
  }

  if (booking.type === PromotionType.PIN_CATEGORY) {
    const categoryName = String(
      booking.campaign?.categoryName ||
      booking.post?.category?.name ||
      (booking as any).category?.name ||
      '',
    ).trim();
    return categoryName ? `${categoryName}置顶贴` : promotionTypeLabel(booking.type);
  }

  return promotionTypeLabel(booking.type);
}

export function promotionIcon(type: string): LucideIcon {
  if (type === PromotionType.AD_HOME || type === PromotionType.PIN_CHAT) return Image;
  if (type === PromotionType.PIN_CATEGORY) return LayoutGrid;
  return Pin;
}

function buildPromotionGroupKey(booking: PromotionBooking) {
  if (booking.campaignId) return booking.campaignId;
  return [
    booking.type,
    booking.slotIndex ?? 0,
    booking.createdAt,
    booking.postId || '',
    booking.categoryId || '',
    booking.adTargetUrl || '',
  ].join('|');
}

export function groupPromotionBookings(bookings: PromotionBooking[]): PromotionGroup[] {
  const grouped = new Map<string, PromotionBooking[]>();

  for (const booking of bookings) {
    const key = buildPromotionGroupKey(booking);
    const existing = grouped.get(key);
    if (existing) existing.push(booking);
    else grouped.set(key, [booking]);
  }

  return Array.from(grouped.entries())
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => parseDateOnly(a.targetDate).localeCompare(parseDateOnly(b.targetDate)));
      const primary = sorted[0];

      return {
        key,
        bookings: sorted,
        primary,
        dates: Array.from(new Set(sorted.map((item) => parseDateOnly(item.targetDate)).filter(Boolean))),
      };
    })
    .filter((group): group is PromotionGroup => Boolean(group.primary))
    .sort((a, b) => new Date(b.primary.createdAt).getTime() - new Date(a.primary.createdAt).getTime());
}

export function bookingStatusLabel(group: PromotionGroup) {
  const now = Date.now();
  const start = group.bookings[0]?.startsAt ? new Date(group.bookings[0].startsAt).getTime() : 0;
  const end = group.bookings[group.bookings.length - 1]?.endsAt
    ? new Date(group.bookings[group.bookings.length - 1].endsAt as string).getTime()
    : 0;

  if (start && now < start) return '未开始';
  if (end && now >= end) return '已结束';
  return '投放中';
}

export function promotionRecordId(group: PromotionGroup) {
  return group.primary.campaignId || group.primary.id || group.key;
}

export function getPromotionRecordPostId(group: PromotionGroup) {
  return group.primary.postId || group.primary.post?.id || '';
}

export function getPromotionTotalPrice(group: PromotionGroup) {
  return group.bookings.reduce((total, booking) => {
    const value = Number(booking.pricePaid || 0);
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export function getPromotionEffectStats(group: PromotionGroup): PromotionEffectStats {
  const primaryStats = group.primary.effectStats || group.primary.post?.effectStats;
  if (primaryStats) return normalizePromotionEffectStats(primaryStats);

  const post = group.primary.post;
  if (!post) return EMPTY_PROMOTION_EFFECT_STATS;
  return normalizePromotionEffectStats({
    views: post.viewCount,
    likes: post.likeCount,
    comments: 0,
    shares: post.shareCount,
    quotes: post.quoteCount,
  });
}

export function isPromotionEditable(group: PromotionGroup) {
  if (group.primary.type !== PromotionType.AD_HOME && group.primary.type !== PromotionType.PIN_CHAT) return false;
  const lastBooking = group.bookings[group.bookings.length - 1];
  if (!lastBooking?.endsAt) return true;
  const endAt = new Date(lastBooking.endsAt).getTime();
  if (!Number.isFinite(endAt)) return true;
  return endAt > Date.now();
}

export function bookingDateText(group: PromotionGroup) {
  if (group.dates.length === 0) return '未设置日期';
  if (group.dates.length === 1) return group.dates[0];
  return `${group.dates[0]} 至 ${group.dates[group.dates.length - 1]} · ${group.dates.length}天`;
}
