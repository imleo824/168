import { PromotionType, getPromotionTypeLabel } from '../shared/domain';
import { DAY_MS, getPlatformDateKey, getPlatformDateKeyRange, getPlatformDayRange } from './platform-time';

export const DAILY_SLOT_INDEX = 0;
export const HOME_AD_SLOT_INDICES = new Set([0, 1, 2]);
export const GLOBAL_PROMOTION_SCOPE = 'GLOBAL';
export const ACTIVE_HOME_ADS_CACHE_TTL_MS = 5_000;
export const ACTIVE_PROMOTED_POST_IDS_CACHE_TTL_MS = 5_000;

const MAX_BOOKING_DAYS = 35;
const MAX_AD_URL_LENGTH = 2048;
const CATEGORY_PROMOTION_PREFIX = 'CATEGORY:';
const AD_TARGET_URL_FORMAT_HINT = '跳转地址格式不正确，请输入 https://example.com、t.me/xxx、@telegramID 或站内 / 路径';

const PROMOTION_TYPES = new Set<string>([
  PromotionType.AD_HOME,
  PromotionType.PIN_HOME,
  PromotionType.PIN_CATEGORY,
]);

export type SlotOwnership = {
  slots: number[];
  ownSlots: number[];
};

export type BookingCandidate = {
  campaignId: string;
  type: PromotionType;
  targetDate: Date;
  startsAt: Date;
  endsAt: Date;
  slotIndex: number;
  scopeKey: string;
  categoryId: string | null;
  postId: string | null;
  adImageUrl: string | null;
  adMobileImageUrl: string | null;
  adTargetUrl: string | null;
  userId: string;
  pricePaid: number;
};

export type ActiveHomeAdsCache = {
  expiresAt: number;
  data: any[];
};

export type ActivePromotedPostIdOptions = {
  type?: PromotionType | PromotionType[];
  categoryId?: string | null;
  categoryIds?: string[];
};

export type PromotionEffectStats = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  quotes: number;
};

export type PromotionEffectDailyItem = {
  date: string;
  metrics: PromotionEffectStats;
};

export const EMPTY_PROMOTION_EFFECT_STATS: PromotionEffectStats = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  quotes: 0,
};

export function normalizePromotionType(type: string): PromotionType {
  if (!PROMOTION_TYPES.has(type)) {
    throw new Error('推广类型无效');
  }
  return type as PromotionType;
}

function normalizeDateKey(raw: string | Date) {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) throw new Error('预约日期无效');
    return raw.toISOString().slice(0, 10);
  }

  const text = String(raw || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error('预约日期无效');

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) {
    throw new Error('预约日期无效');
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function startOfUtcDay(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function startOfPlatformDay(dateKey: string) {
  const range = getPlatformDateKeyRange(dateKey);
  if (!range) throw new Error('预约日期无效');
  return range.start;
}

export function getTodayPlatformDay() {
  return startOfUtcDay(getPlatformDateKey());
}

export function buildPromotionActiveTimeWhere(now = new Date()) {
  const todayKey = getPlatformDateKey(now);
  const utcTodayStart = startOfUtcDay(todayKey);
  const utcTodayEnd = new Date(utcTodayStart.getTime() + DAY_MS);
  const platformRange = getPlatformDayRange(now);
  const platformStart = platformRange.start;
  const platformEnd = platformRange.end;

  return {
    OR: [
      { startsAt: { lte: now }, endsAt: { gt: now } },
      { startsAt: { lte: platformEnd }, endsAt: { gte: platformStart } },
      { targetDate: { gte: platformStart, lt: platformEnd } },
      { targetDate: { gte: utcTodayStart, lt: utcTodayEnd } },
      { targetDate: utcTodayStart },
    ],
  };
}

export function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function normalizeSlotIndices(slotIndices: unknown, type: PromotionType) {
  const rawList = Array.isArray(slotIndices) ? slotIndices : [slotIndices];
  const normalized = Array.from(new Set(rawList.map((item) => Number(item))))
    .filter((slot) => Number.isFinite(slot) && Number.isInteger(slot));

  if (type === PromotionType.AD_HOME) {
    if (normalized.length !== 1 || !HOME_AD_SLOT_INDICES.has(normalized[0])) {
      throw new Error('请选择有效的首页横幅广告位置');
    }
    return normalized;
  }

  if (normalized.length !== 1 || normalized[0] !== DAILY_SLOT_INDEX) {
    throw new Error('当前仅支持按天预约推广位');
  }

  return normalized;
}

export function homeAdSlotLabel(slotIndex: number) {
  return `第${slotIndex + 1}位置`;
}

export function isBannerAdPromotion(type: PromotionType) {
  return type === PromotionType.AD_HOME;
}

type NormalizeDateKeysOptions = {
  rejectPast?: boolean;
};

function normalizeDateKeyList(dates: unknown, options: NormalizeDateKeysOptions = {}) {
  const rawList = Array.isArray(dates) ? dates : [dates];
  const unique = Array.from(new Set(rawList.map((item) => normalizeDateKey(item as string)))).sort();

  if (unique.length === 0) throw new Error('请选择预约日期');
  if (unique.length > MAX_BOOKING_DAYS) throw new Error(`单次最多预约 ${MAX_BOOKING_DAYS} 天`);

  if (options.rejectPast) {
    const today = getTodayPlatformDay();
    for (const key of unique) {
      if (startOfUtcDay(key).getTime() < today.getTime()) {
        throw new Error('不能预约已过去的日期');
      }
    }
  }

  return unique;
}

export function normalizeDateKeys(dates: unknown) {
  return normalizeDateKeyList(dates, { rejectPast: true });
}

export function normalizeBatchDateKeys(dates: unknown) {
  const rawList = Array.isArray(dates)
    ? dates
    : String(dates || '').split(',');
  return normalizeDateKeyList(rawList.map((item) => String(item).trim()).filter(Boolean), { rejectPast: false });
}

export function buildScopeKey(type: PromotionType, categoryId?: string | null) {
  if (type === PromotionType.PIN_CATEGORY) {
    if (!categoryId) throw new Error('分类置顶必须选择分类');
    return `${CATEGORY_PROMOTION_PREFIX}${categoryId}`;
  }
  return GLOBAL_PROMOTION_SCOPE;
}

function isPersistentUploadedImageUrl(url: string) {
  if (!url) return false;
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) return true;
  if (url.startsWith('data:image/')) return true;
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeAdImageUrl(url?: string | null, label = '广告图片') {
  let value = String(url || '').trim();
  if (!value) throw new Error(`请上传${label}`);
  if (value.startsWith('uploads/')) value = `/${value}`;
  if (value.length > MAX_AD_URL_LENGTH || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(`${label}地址无效`);
  if (isPersistentUploadedImageUrl(value)) return value;
  throw new Error(`${label}必须先上传成功`);
}

function normalizeHttpAdTargetUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeTelegramAdTargetUrl(value: string) {
  const telegramPath = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+)$/i)?.[1];
  if (telegramPath && !/[\s\\]/.test(telegramPath)) {
    return `https://t.me/${telegramPath.replace(/^\/+/, '')}`;
  }

  const normalized = value
    .replace(/telegram|tg|小飞机|飞机|频道|机器人|bot/gi, ' ')
    .replace(/[:：,，;；]/g, ' ')
    .trim();
  const username = normalized.match(/^@?([a-zA-Z0-9_]{5,32})$/)?.[1];
  return username ? `https://t.me/${username}` : '';
}

function looksLikeExternalAdTargetDomain(value: string) {
  return /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/:?#].*)?$/i.test(value);
}

export function normalizeAdTargetUrl(url?: string | null) {
  const value = String(url || '').trim();
  if (!value) throw new Error('请填写广告跳转地址');
  if (value.length > MAX_AD_URL_LENGTH) throw new Error('广告跳转地址过长，请控制在 2048 个字符内');
  if (/[\u0000-\u001F\u007F]/.test(value)) throw new Error('广告跳转地址不能包含换行或特殊控制字符');

  if (/^https?:\/\//i.test(value)) {
    const normalizedUrl = normalizeHttpAdTargetUrl(value);
    if (normalizedUrl) return normalizedUrl;
    throw new Error(AD_TARGET_URL_FORMAT_HINT);
  }

  if (/^tg:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'tg:') return value;
    } catch {
      // Fall through to the consistent format hint below.
    }
    throw new Error(AD_TARGET_URL_FORMAT_HINT);
  }

  if (/^\/(?!\/)/.test(value) && !/[\s\\]/.test(value)) return value;

  const telegramUrl = normalizeTelegramAdTargetUrl(value);
  if (telegramUrl) return telegramUrl;

  if (looksLikeExternalAdTargetDomain(value)) {
    const normalizedUrl = normalizeHttpAdTargetUrl(`https://${value}`);
    if (normalizedUrl) return normalizedUrl;
  }

  throw new Error(AD_TARGET_URL_FORMAT_HINT);
}

export function isBookingEnded(booking: { endsAt?: Date | null }) {
  if (!booking.endsAt) return false;
  const endAtTime = new Date(booking.endsAt).getTime();
  if (!Number.isFinite(endAtTime)) return false;
  return endAtTime <= Date.now();
}

export function bookingDefaultEndAt(targetDate: Date, startsAt?: Date | null) {
  const startAtTime = startsAt ? new Date(startsAt).getTime() : NaN;
  if (Number.isFinite(startAtTime)) {
    return addUtcDays(new Date(startAtTime), 1);
  }

  const range = getPlatformDateKeyRange(targetDate.toISOString().slice(0, 10));
  return range?.end || addUtcDays(startOfUtcDay(targetDate.toISOString().slice(0, 10)), 1);
}

export function normalizeAdminBoolean(value: unknown, fieldLabel: string) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  throw new Error(`${fieldLabel}必须是布尔值`);
}

export function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as any).code === 'P2002');
}

export function conflictKey(date: Date, slotIndex: number) {
  return `${date.toISOString().slice(0, 10)}#${slotIndex}`;
}

function safeEffectCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function buildPostEffectStats(post: any): PromotionEffectStats {
  if (!post) return { ...EMPTY_PROMOTION_EFFECT_STATS };
  return {
    views: safeEffectCount(post.viewCount),
    likes: safeEffectCount(post.likeCount),
    comments: 0,
    shares: safeEffectCount(post.shareCount),
    quotes: safeEffectCount(post.quoteCount),
  };
}

export function mergeEffectStats(base: PromotionEffectStats, next: Partial<PromotionEffectStats> | null | undefined) {
  return {
    views: base.views + safeEffectCount(next?.views),
    likes: base.likes + safeEffectCount(next?.likes),
    comments: base.comments + safeEffectCount(next?.comments),
    shares: base.shares + safeEffectCount(next?.shares),
    quotes: base.quotes + safeEffectCount(next?.quotes),
  };
}

function addEffectStats(base: PromotionEffectStats, next: Partial<PromotionEffectStats> | null | undefined) {
  const merged = mergeEffectStats(base, next);
  base.views = merged.views;
  base.likes = merged.likes;
  base.comments = merged.comments;
  base.shares = merged.shares;
  base.quotes = merged.quotes;
}

export function addDailyEffectStat(dailyStats: Map<string, PromotionEffectStats>, createdAt: Date, increment: Partial<PromotionEffectStats>) {
  const day = getPlatformDateKey(createdAt);
  const current = dailyStats.get(day);
  if (!current) return;
  addEffectStats(current, increment);
}

export function buildDailyEffectStats(startDate: string, endDate: string) {
  const stats = new Map<string, PromotionEffectStats>();
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    stats.set(cursor.toISOString().slice(0, 10), { ...EMPTY_PROMOTION_EFFECT_STATS });
  }
  return stats;
}

export function toDailyEffectItems(dailyStats: Map<string, PromotionEffectStats>): PromotionEffectDailyItem[] {
  return Array.from(dailyStats.entries()).map(([date, metrics]) => ({ date, metrics }));
}

export function normalizeEffectRange(startDate?: unknown, endDate?: unknown) {
  const todayKey = getPlatformDateKey();
  const fallbackEnd = startOfUtcDay(todayKey);
  const fallbackStart = addUtcDays(fallbackEnd, -29);
  const startKey = startDate ? normalizeDateKey(startDate as string) : fallbackStart.toISOString().slice(0, 10);
  const endKey = endDate ? normalizeDateKey(endDate as string) : todayKey;
  const start = startOfUtcDay(startKey);
  const end = startOfUtcDay(endKey);
  if (start.getTime() > end.getTime()) throw new Error('开始日期不能晚于结束日期');
  return {
    startDate: startKey,
    endDate: endKey,
    targetStart: start,
    targetEnd: end,
    startAt: startOfPlatformDay(startKey),
    endAt: addUtcDays(startOfPlatformDay(endKey), 1),
  };
}

export function bookingDateText(bookings: any[]) {
  const dateKeys = bookings
    .map((booking) => new Date(booking.targetDate).toISOString().slice(0, 10))
    .sort();
  if (dateKeys.length === 0) return '';
  if (dateKeys.length === 1) return dateKeys[0];
  return `${dateKeys[0]} 至 ${dateKeys[dateKeys.length - 1]}`;
}

export function bookingStatusText(bookings: any[]) {
  if (bookings.length === 0) return '未开始';
  const now = new Date();
  if (bookings.some((booking) => new Date(booking.startsAt).getTime() <= now.getTime() && new Date(booking.endsAt).getTime() > now.getTime())) return '投放中';
  if (bookings.every((booking) => new Date(booking.endsAt).getTime() <= now.getTime())) return '已结束';
  return '未开始';
}

export function promotionEffectTitle(booking: any) {
  const type = normalizePromotionType(booking.type);
  if (isBannerAdPromotion(type)) return getPromotionTypeLabel(type);
  const postTitle = String(booking.post?.title || booking.post?.content || '').trim();
  if (postTitle) return postTitle;
  if (type === PromotionType.PIN_CATEGORY) return booking.category?.name || booking.campaign?.categoryName || '分类置顶';
  return getPromotionTypeLabel(type);
}

export function buildPromotionEffectGroupKey(booking: any) {
  return String(booking.campaignId || booking.id);
}
