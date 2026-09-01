import prisma, { isDbConfigured } from './db';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PromotionType, TransactionAction, getPromotionTypeLabel } from '../shared/domain';
import { PLATFORM_TIMEZONE } from './platform-time';
import {
  ACTIVE_HOME_ADS_CACHE_TTL_MS,
  ACTIVE_PROMOTED_POST_IDS_CACHE_TTL_MS,
  EMPTY_PROMOTION_EFFECT_STATS,
  GLOBAL_PROMOTION_SCOPE,
  HOME_AD_SLOT_INDICES,
  addDailyEffectStat,
  addUtcDays,
  bookingDateText,
  bookingDefaultEndAt,
  bookingStatusText,
  buildDailyEffectStats,
  buildPostEffectStats,
  buildPromotionEffectGroupKey,
  buildScopeKey,
  conflictKey,
  getTodayPlatformDay,
  homeAdSlotLabel,
  isBannerAdPromotion,
  isBookingEnded,
  isUniqueConflict,
  mergeEffectStats,
  normalizeAdImageUrl,
  normalizeAdTargetUrl,
  normalizeAdminBoolean,
  normalizeBatchDateKeys,
  normalizeDateKeys,
  normalizeEffectRange,
  normalizePromotionType,
  normalizeSlotIndices,
  promotionEffectTitle,
  startOfPlatformDay,
  startOfUtcDay,
  toDailyEffectItems,
  type ActiveHomeAdsCache,
  type ActivePromotedPostIdOptions,
  type BookingCandidate,
  type PromotionEffectStats,
  type SlotOwnership,
} from './promotion-utils';

let activeHomeAdsCache: ActiveHomeAdsCache | null = null;
let activeChatAdsCache: ActiveHomeAdsCache | null = null;
let activePromotedPostIdsCache: { expiresAt: number; data: string[] } | null = null;

export class PromotionService {
  static readonly GLOBAL_SCOPE = GLOBAL_PROMOTION_SCOPE;

  static clearCache() {
    activeHomeAdsCache = null;
    activeChatAdsCache = null;
    activePromotedPostIdsCache = null;
  }

  static getScopeKey(type: string, categoryId?: string | null) {
    return buildScopeKey(normalizePromotionType(type), categoryId || null);
  }

  static async getBookedSlotsBatch(type: string, dates: unknown, categoryId?: string, currentUserId?: string | null) {
    const dateKeys = normalizeBatchDateKeys(dates);
    const emptyResult = Object.fromEntries(
      dateKeys.map((dateKey) => [dateKey, { slots: [] as number[], ownSlots: [] as number[] }] as const)
    );
    if (!isDbConfigured()) return emptyResult;

    const promotionType = normalizePromotionType(type);
    const scopeKey = buildScopeKey(promotionType, categoryId || null);
    const targetDates = dateKeys.map(startOfUtcDay);

    const bookings = await (prisma as any).promotionBooking.findMany({
      where: {
        type: promotionType,
        targetDate: { in: targetDates },
        scopeKey,
      },
      select: { targetDate: true, slotIndex: true, userId: true },
    });

    const grouped: Record<string, SlotOwnership> = { ...emptyResult };
    for (const booking of bookings) {
      const dateKey = booking.targetDate.toISOString().slice(0, 10);
      const dateSlots = grouped[dateKey] || { slots: [], ownSlots: [] };
      dateSlots.slots.push(booking.slotIndex);
      if (currentUserId && booking.userId === currentUserId) {
        dateSlots.ownSlots.push(booking.slotIndex);
      }
      grouped[dateKey] = dateSlots;
    }

    return grouped;
  }

  static async getActiveHomeAds() {
    if (!isDbConfigured()) return [];
    if (activeHomeAdsCache && activeHomeAdsCache.expiresAt > Date.now()) {
      return activeHomeAdsCache.data;
    }

    const now = new Date();

    const bookings = await (prisma as any).promotionBooking.findMany({
      where: {
        type: PromotionType.AD_HOME,
        scopeKey: GLOBAL_PROMOTION_SCOPE,
        startsAt: { lte: now },
        endsAt: { gt: now },
        OR: [
          { adImageUrl: { not: null } },
          { adMobileImageUrl: { not: null } },
        ],
      },
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
      take: 12,
      select: {
        id: true,
        campaignId: true,
        type: true,
        targetDate: true,
        startsAt: true,
        endsAt: true,
        slotIndex: true,
        postId: true,
        adImageUrl: true,
        adMobileImageUrl: true,
        adTargetUrl: true,
        categoryId: true,
        userId: true,
        pricePaid: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const seenSlots = new Set<number>();
    const visibleBookings = [];
    for (const booking of bookings) {
      if (!HOME_AD_SLOT_INDICES.has(booking.slotIndex) || seenSlots.has(booking.slotIndex)) continue;
      seenSlots.add(booking.slotIndex);
      visibleBookings.push(booking);
      if (visibleBookings.length >= HOME_AD_SLOT_INDICES.size) break;
    }

    activeHomeAdsCache = {
      expiresAt: Date.now() + ACTIVE_HOME_ADS_CACHE_TTL_MS,
      data: visibleBookings,
    };

    return visibleBookings;
  }

  static async getActiveChatAds() {
    if (!isDbConfigured()) return [];
    if (activeChatAdsCache && activeChatAdsCache.expiresAt > Date.now()) {
      return activeChatAdsCache.data;
    }

    const now = new Date();

    const bookings = await (prisma as any).promotionBooking.findMany({
      where: {
        type: PromotionType.PIN_CHAT,
        scopeKey: GLOBAL_PROMOTION_SCOPE,
        startsAt: { lte: now },
        endsAt: { gt: now },
        OR: [
          { adImageUrl: { not: null } },
          { adMobileImageUrl: { not: null } },
        ],
      },
      orderBy: [{ slotIndex: 'asc' }, { createdAt: 'asc' }],
      take: 12,
      select: {
        id: true,
        campaignId: true,
        type: true,
        targetDate: true,
        startsAt: true,
        endsAt: true,
        slotIndex: true,
        postId: true,
        adImageUrl: true,
        adMobileImageUrl: true,
        adTargetUrl: true,
        categoryId: true,
        userId: true,
        pricePaid: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const seenSlots = new Set<number>();
    const visibleBookings = [];
    for (const booking of bookings) {
      if (!HOME_AD_SLOT_INDICES.has(booking.slotIndex) || seenSlots.has(booking.slotIndex)) continue;
      seenSlots.add(booking.slotIndex);
      visibleBookings.push(booking);
      if (visibleBookings.length >= HOME_AD_SLOT_INDICES.size) break;
    }

    activeChatAdsCache = {
      expiresAt: Date.now() + ACTIVE_HOME_ADS_CACHE_TTL_MS,
      data: visibleBookings,
    };

    return visibleBookings;
  }

  static async getActivePromotedPostIds(options: ActivePromotedPostIdOptions = {}): Promise<string[]> {
    if (!isDbConfigured()) return [];
    const hasScopedOptions = Boolean(
      options.type ||
      options.categoryId ||
      (Array.isArray(options.categoryIds) && options.categoryIds.length > 0),
    );
    if (!hasScopedOptions && activePromotedPostIdsCache && activePromotedPostIdsCache.expiresAt > Date.now()) {
      return activePromotedPostIdsCache.data;
    }

    const now = new Date();
    const typeFilter = options.type
      ? Array.isArray(options.type) ? { in: options.type } : options.type
      : { in: [PromotionType.PIN_HOME, PromotionType.PIN_CATEGORY] };
    const categoryIds = Array.from(new Set([
      ...(Array.isArray(options.categoryIds) ? options.categoryIds : []),
      ...(options.categoryId ? [options.categoryId] : []),
    ].map((categoryId) => String(categoryId || '').trim()).filter(Boolean)));
    const rows = await (prisma as any).promotionBooking.findMany({
      where: {
        type: typeFilter,
        ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
        startsAt: { lte: now },
        endsAt: { gt: now },
        postId: { not: null },
      },
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: { postId: true },
    });

    const postIds = Array.from(new Set<string>(
      rows
        .map((row: any) => String(row.postId || '').trim())
        .filter((postId: string): postId is string => Boolean(postId)),
    ));
    if (!hasScopedOptions) {
      activePromotedPostIdsCache = {
        expiresAt: Date.now() + ACTIVE_PROMOTED_POST_IDS_CACHE_TTL_MS,
        data: postIds,
      };
    }
    return postIds;
  }

  static async listUserBookings(userId: string) {
    if (!isDbConfigured()) return [];
    const since = addUtcDays(getTodayPlatformDay(), -7);

    const bookings = await (prisma as any).promotionBooking.findMany({
      where: {
        userId,
        targetDate: { gte: since },
      },
      orderBy: [{ targetDate: 'desc' }, { createdAt: 'desc' }],
      take: 40,
      select: {
        id: true,
        campaignId: true,
        type: true,
        targetDate: true,
        startsAt: true,
        endsAt: true,
        slotIndex: true,
        pricePaid: true,
        postId: true,
        adImageUrl: true,
        adMobileImageUrl: true,
        adTargetUrl: true,
        categoryId: true,
        createdAt: true,
        updatedAt: true,
        campaign: { select: { categoryName: true } },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            images: true,
            viewCount: true,
            likeCount: true,
            shareCount: true,
            quoteCount: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    return bookings.map((booking: any) => {
      const effectStats = buildPostEffectStats(booking.post);
      return {
        ...booking,
        effectStats,
        post: booking.post ? { ...booking.post, effectStats } : booking.post,
      };
    });
  }

  static async getUserPromotionEffects(userId: string, params: { startDate?: unknown; endDate?: unknown; includeItems?: unknown } = {}) {
    const range = normalizeEffectRange(params.startDate, params.endDate);
    const includeItems = params.includeItems !== false && params.includeItems !== 'false';
    const dailyStats = buildDailyEffectStats(range.startDate, range.endDate);
    if (!isDbConfigured()) {
      return {
        range: { startDate: range.startDate, endDate: range.endDate, timezone: PLATFORM_TIMEZONE },
        totals: { ...EMPTY_PROMOTION_EFFECT_STATS },
        dailyItems: toDailyEffectItems(dailyStats),
        items: [],
      };
    }

    const bookings = await (prisma as any).promotionBooking.findMany({
      where: {
        userId,
        targetDate: {
          gte: range.targetStart,
          lte: range.targetEnd,
        },
      },
      orderBy: [{ targetDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        campaignId: true,
        type: true,
        targetDate: true,
        startsAt: true,
        endsAt: true,
        slotIndex: true,
        pricePaid: true,
        postId: true,
        categoryId: true,
        adTargetUrl: true,
        createdAt: true,
        campaign: { select: { categoryName: true } },
        post: {
          select: {
            id: true,
            title: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    const postIds: string[] = Array.from(new Set<string>(
      bookings
        .map((booking: any) => String(booking.postId || booking.post?.id || '').trim())
        .filter((postId: string) => Boolean(postId)),
    ));
    const emptyByPost = new Map<string, PromotionEffectStats>();
    for (const postId of postIds) {
      emptyByPost.set(postId, { ...EMPTY_PROMOTION_EFFECT_STATS });
    }

    const [
      viewRows,
      likeRows,
      shareRows,
      quoteRows,
      viewDailyRows,
      likeDailyRows,
      shareDailyRows,
      quoteDailyRows,
    ] = postIds.length > 0 ? await Promise.all([
      (prisma as any).postView.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        _count: { _all: true },
      }),
      (prisma as any).like.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        _count: { _all: true },
      }),
      (prisma as any).postShare.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        _count: { _all: true },
      }),
      (prisma as any).post.groupBy({
        by: ['quotedPostId'],
        where: {
          quotedPostId: { in: postIds },
          isPublished: true,
          deletedAt: null,
          createdAt: { gte: range.startAt, lt: range.endAt },
        },
        _count: { _all: true },
      }),
      (prisma as any).postView.findMany({
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        select: { createdAt: true },
      }),
      (prisma as any).like.findMany({
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        select: { createdAt: true },
      }),
      (prisma as any).postShare.findMany({
        where: { postId: { in: postIds }, createdAt: { gte: range.startAt, lt: range.endAt } },
        select: { createdAt: true },
      }),
      (prisma as any).post.findMany({
        where: {
          quotedPostId: { in: postIds },
          isPublished: true,
          deletedAt: null,
          createdAt: { gte: range.startAt, lt: range.endAt },
        },
        select: { createdAt: true },
      }),
    ]) : [[], [], [], [], [], [], [], []];

    const statsByPost = new Map(emptyByPost);
    for (const row of viewRows as any[]) {
      const postId = String(row.postId || '');
      statsByPost.set(postId, mergeEffectStats(statsByPost.get(postId) || { ...EMPTY_PROMOTION_EFFECT_STATS }, { views: row._count?._all }));
    }
    for (const row of likeRows as any[]) {
      const postId = String(row.postId || '');
      statsByPost.set(postId, mergeEffectStats(statsByPost.get(postId) || { ...EMPTY_PROMOTION_EFFECT_STATS }, { likes: row._count?._all }));
    }
    for (const row of shareRows as any[]) {
      const postId = String(row.postId || '');
      statsByPost.set(postId, mergeEffectStats(statsByPost.get(postId) || { ...EMPTY_PROMOTION_EFFECT_STATS }, { shares: row._count?._all }));
    }
    for (const row of quoteRows as any[]) {
      const postId = String(row.quotedPostId || '');
      statsByPost.set(postId, mergeEffectStats(statsByPost.get(postId) || { ...EMPTY_PROMOTION_EFFECT_STATS }, { quotes: row._count?._all }));
    }

    for (const row of viewDailyRows as any[]) {
      addDailyEffectStat(dailyStats, row.createdAt, { views: 1 });
    }
    for (const row of likeDailyRows as any[]) {
      addDailyEffectStat(dailyStats, row.createdAt, { likes: 1 });
    }
    for (const row of shareDailyRows as any[]) {
      addDailyEffectStat(dailyStats, row.createdAt, { shares: 1 });
    }
    for (const row of quoteDailyRows as any[]) {
      addDailyEffectStat(dailyStats, row.createdAt, { quotes: 1 });
    }

    const grouped = new Map<string, any[]>();
    for (const booking of bookings) {
      const key = buildPromotionEffectGroupKey(booking);
      const existing = grouped.get(key);
      if (existing) existing.push(booking);
      else grouped.set(key, [booking]);
    }

    const totals = postIds.reduce<PromotionEffectStats>(
      (sum, postId) => mergeEffectStats(sum, statsByPost.get(postId)),
      { ...EMPTY_PROMOTION_EFFECT_STATS },
    );
    const items = includeItems ? Array.from(grouped.entries()).map(([key, groupBookings]) => {
      const sorted = [...groupBookings].sort((a, b) => {
        const aTime = new Date(a.targetDate).getTime() || 0;
        const bTime = new Date(b.targetDate).getTime() || 0;
        return aTime - bTime;
      });
      const primary = sorted[0];
      const postId = String(primary?.postId || primary?.post?.id || '').trim();
      const metrics = postId ? (statsByPost.get(postId) || { ...EMPTY_PROMOTION_EFFECT_STATS }) : { ...EMPTY_PROMOTION_EFFECT_STATS };
      return {
        key,
        campaignId: primary?.campaignId || null,
        bookingIds: sorted.map((booking) => booking.id),
        type: primary?.type,
        title: promotionEffectTitle(primary),
        status: bookingStatusText(sorted),
        dateText: bookingDateText(sorted),
        postId: postId || null,
        categoryId: primary?.categoryId || null,
        metrics,
      };
    }) : [];

    return {
      range: { startDate: range.startDate, endDate: range.endDate, timezone: PLATFORM_TIMEZONE },
      totals,
      dailyItems: toDailyEffectItems(dailyStats),
      items,
    };
  }

  static async updateHomeAdCreative(params: {
    userId: string;
    bookingId: string;
    adImageUrl?: string;
    adMobileImageUrl?: string;
    adTargetUrl?: string;
  }) {
    if (!isDbConfigured()) return { success: true, updatedCount: 0 };

    const booking = await (prisma as any).promotionBooking.findFirst({
      where: {
        id: params.bookingId,
        userId: params.userId,
      },
      select: {
        id: true,
        campaignId: true,
        type: true,
        endsAt: true,
        createdAt: true,
        adImageUrl: true,
        adMobileImageUrl: true,
        adTargetUrl: true,
      },
    });

    if (!booking) throw new Error('投放记录不存在');
    const bookingType = normalizePromotionType(booking.type);
    if (!isBannerAdPromotion(bookingType)) throw new Error('只有横幅广告支持编辑素材');
    if (isBookingEnded(booking)) throw new Error('该广告已结束，不支持编辑');

    const adImageUrl = normalizeAdImageUrl(params.adImageUrl, '电脑端广告图片');
    const adMobileImageUrl = normalizeAdImageUrl(params.adMobileImageUrl, '移动端广告图片');
    const adTargetUrl = normalizeAdTargetUrl(params.adTargetUrl);
    const where = booking.campaignId
      ? { userId: params.userId, type: bookingType, campaignId: booking.campaignId }
      : {
          userId: params.userId,
          type: bookingType,
          createdAt: booking.createdAt,
          adImageUrl: booking.adImageUrl,
          adMobileImageUrl: booking.adMobileImageUrl,
          adTargetUrl: booking.adTargetUrl,
        };

    return prisma.$transaction(async (tx) => {
      if (booking.campaignId) {
        await (tx as any).promotionCampaign.updateMany({
          where: {
            id: booking.campaignId,
            userId: params.userId,
            type: bookingType,
          },
          data: {
            adImageUrl,
            adMobileImageUrl,
            adTargetUrl,
          },
        });
      }

      const result = await (tx as any).promotionBooking.updateMany({
        where: {
          ...where,
          endsAt: { gt: new Date() },
        },
        data: {
          adImageUrl,
          adMobileImageUrl,
          adTargetUrl,
        },
      });

      return { success: true, updatedCount: result.count || 0 };
    });
  }

  static async updateHomeAdCreativeByAdmin(params: {
    bookingId: string;
    adImageUrl?: string;
    adMobileImageUrl?: string;
    adTargetUrl?: string;
  }) {
    if (!isDbConfigured()) return { success: true, updatedCount: 0, bookingId: params.bookingId };

    const booking = await (prisma as any).promotionBooking.findUnique({
      where: { id: params.bookingId },
      select: {
        id: true,
        campaignId: true,
        type: true,
        targetDate: true,
        startsAt: true,
        endsAt: true,
        adImageUrl: true,
        adMobileImageUrl: true,
        adTargetUrl: true,
      },
    });

    if (!booking) throw new Error('投放记录不存在');
    const shouldUpdateCreative = [
      params.adImageUrl !== undefined,
      params.adMobileImageUrl !== undefined,
      params.adTargetUrl !== undefined,
    ].some(Boolean);

    const bookingType = normalizePromotionType(booking.type);
    if (shouldUpdateCreative && !isBannerAdPromotion(bookingType)) {
      throw new Error('该广告类型暂不支持编辑素材信息');
    }

    if (!shouldUpdateCreative) {
      return { success: true, updatedCount: 0, bookingId: booking.id };
    }

    const creativeData: Record<string, string> = {};
    if (params.adImageUrl !== undefined) {
      creativeData.adImageUrl = normalizeAdImageUrl(params.adImageUrl, '电脑端广告图片');
    }
    if (params.adMobileImageUrl !== undefined) {
      creativeData.adMobileImageUrl = normalizeAdImageUrl(params.adMobileImageUrl, '移动端广告图片');
    }
    if (params.adTargetUrl !== undefined) {
      creativeData.adTargetUrl = normalizeAdTargetUrl(params.adTargetUrl);
    }

    return prisma.$transaction(async (tx) => {
      let updatedCount = 0;

      if (Object.keys(creativeData).length > 0 && booking.campaignId) {
        const campaignResult = await (tx as any).promotionCampaign.updateMany({
          where: {
            id: booking.campaignId,
            type: bookingType,
          },
          data: creativeData,
        });
        updatedCount += campaignResult.count || 0;
      }

      if (Object.keys(creativeData).length > 0 && isBannerAdPromotion(bookingType)) {
        const bookingWhere = booking.campaignId
          ? { campaignId: booking.campaignId, type: bookingType }
          : { id: booking.id, type: bookingType };
        const bookingResult = await (tx as any).promotionBooking.updateMany({
          where: bookingWhere,
          data: creativeData,
        });
        updatedCount += bookingResult.count || 0;
      }

      return {
        success: true,
        updatedCount,
        bookingId: booking.id,
      };
    });
  }

  static async setBookingDisplayStateByAdmin(params: {
    bookingId: string;
    isActive: boolean;
  }) {
    if (!isDbConfigured()) return { success: true, updatedCount: 0, bookingId: params.bookingId };

    const booking = await (prisma as any).promotionBooking.findUnique({
      where: { id: params.bookingId },
      select: {
        id: true,
        targetDate: true,
        startsAt: true,
      },
    });
    if (!booking) throw new Error('投放记录不存在');

    const normalizedIsActive = normalizeAdminBoolean(params.isActive, 'isActive');
    if (normalizedIsActive === undefined) throw new Error('isActive 必须是布尔值');

    const now = new Date();
    const targetDateEndAt = bookingDefaultEndAt(new Date(booking.targetDate), booking.startsAt);
    if (normalizedIsActive && targetDateEndAt <= now) {
      throw new Error('已结束的投放不能恢复展示');
    }
    const endsAt = normalizedIsActive
      ? targetDateEndAt
      : new Date(now.getTime() - 1);

    const updated = await (prisma as any).promotionBooking.update({
      where: { id: booking.id },
      data: { endsAt },
    });

    return {
      success: true,
      updatedCount: updated ? 1 : 0,
      bookingId: booking.id,
    };
  }

  static async deleteBookingByAdmin(bookingId: string) {
    if (!isDbConfigured()) return { success: true, deletedBookingCount: 0, deletedCampaignCount: 0 };

    const booking = await (prisma as any).promotionBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, campaignId: true },
    });
    if (!booking) throw new Error('投放记录不存在');

    return prisma.$transaction(async (tx) => {
      const deletedBooking = await (tx as any).promotionBooking.delete({ where: { id: booking.id } });
      if (!booking.campaignId) {
        return {
          success: true,
          deletedBookingCount: deletedBooking ? 1 : 0,
          deletedCampaignCount: 0,
        };
      }

      let deletedCampaignCount = 0;
      const remaining = await (tx as any).promotionBooking.count({
        where: { campaignId: booking.campaignId },
      });
      if (!remaining) {
        await (tx as any).promotionCampaign.delete({ where: { id: booking.campaignId } });
        deletedCampaignCount = 1;
      }

      return {
        success: true,
        deletedBookingCount: deletedBooking ? 1 : 0,
        deletedCampaignCount,
      };
    });
  }

  static async bookBatch(params: {
    userId: string;
    type: string;
    dates: string[];
    slotIndices: number[];
    pricePerSlot: number;
    slotPrices?: Record<number, number>;
    categoryId?: string;
    postId?: string;
    adImageUrl?: string;
    adMobileImageUrl?: string;
    adTargetUrl?: string;
    paymentPassword?: string;
  }) {
    const { userId } = params;
    const type = normalizePromotionType(params.type);
    const dateKeys = normalizeDateKeys(params.dates);
    const slotIndices = normalizeSlotIndices(params.slotIndices, type);
    const slotPriceMap = params.slotPrices || {};
    const resolveSlotPrice = (slotIndex: number) => {
      const value = isBannerAdPromotion(type)
        ? Number(slotPriceMap[slotIndex])
        : Number(params.pricePerSlot);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('推广价格配置无效');
      }
      return value;
    };
    slotIndices.forEach(resolveSlotPrice);

    const pricePerSlot = Number(params.pricePerSlot);
    if (!isBannerAdPromotion(type) && (!Number.isFinite(pricePerSlot) || pricePerSlot <= 0)) {
      throw new Error('推广价格配置无效');
    }

    const categoryId = type === PromotionType.PIN_CATEGORY ? String(params.categoryId || '').trim() : null;
    const scopeKey = buildScopeKey(type, categoryId);
    let categoryName: string | null = null;
    let postId: string | null = null;
    let adImageUrl: string | null = null;
    let adMobileImageUrl: string | null = null;
    let adTargetUrl: string | null = null;
    const campaignId = randomUUID();

    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: { paymentPasswordHash: true },
    });
    if (!user?.paymentPasswordHash) {
      throw new Error('请先设置支付密码');
    }
    if (typeof params.paymentPassword !== 'string' || !params.paymentPassword) {
      throw new Error('请输入支付密码');
    }
    const paymentPasswordMatched = await bcrypt.compare(params.paymentPassword, user.paymentPasswordHash);
    if (!paymentPasswordMatched) {
      throw new Error('支付密码错误');
    }

    if (type === PromotionType.PIN_CATEGORY && categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true },
      });
      if (!category) throw new Error('分类不存在');
      categoryName = category.name;
    }

    if (type === PromotionType.PIN_HOME || type === PromotionType.PIN_CATEGORY) {
      postId = String(params.postId || '').trim();
      if (!postId) throw new Error('请选择要推广的信息');

      const post = await prisma.post.findFirst({
        where: {
          id: postId,
          userId,
          deletedAt: null,
          isPublished: true,
          ...(type === PromotionType.PIN_CATEGORY ? { categoryId } : {}),
        },
        select: { id: true },
      });

      if (!post) {
        throw new Error(type === PromotionType.PIN_CATEGORY ? '请选择该分类下可推广的已发布帖子' : '请选择可推广的已发布帖子');
      }
    }

    if (isBannerAdPromotion(type)) {
      adImageUrl = normalizeAdImageUrl(params.adImageUrl, '电脑端广告图片');
      adMobileImageUrl = normalizeAdImageUrl(params.adMobileImageUrl, '移动端广告图片');
      adTargetUrl = normalizeAdTargetUrl(params.adTargetUrl);
    }

    const candidates: BookingCandidate[] = [];
    for (const dateKey of dateKeys) {
      const targetDate = startOfUtcDay(dateKey);
      const startsAt = startOfPlatformDay(dateKey);
      const endsAt = addUtcDays(startsAt, 1);
      for (const slotIndex of slotIndices) {
        candidates.push({
          campaignId,
          type,
          targetDate,
          startsAt,
          endsAt,
          slotIndex,
          scopeKey,
          categoryId,
          postId,
          adImageUrl,
          adMobileImageUrl,
          adTargetUrl,
          userId,
          pricePaid: resolveSlotPrice(slotIndex),
        });
      }
    }

    const totalPrice = candidates.reduce((sum, item) => sum + item.pricePaid, 0);

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await (tx as any).promotionBooking.findMany({
          where: {
            type,
            scopeKey,
            targetDate: { in: candidates.map((item) => item.targetDate) },
            slotIndex: { in: slotIndices },
          },
          select: { targetDate: true, slotIndex: true },
        });

        if (existing.length > 0) {
          const conflicts = Array.from<string>(new Set(existing.map((item: any) => conflictKey(item.targetDate, item.slotIndex))));
          throw new Error(`以下日期已被预约：${conflicts.map((item) => item.split('#')[0]).join('、')}`);
        }

        const chargeResult = await tx.user.updateMany({
          where: { id: userId, points: { gte: totalPrice } },
          data: { points: { decrement: totalPrice } },
        });

        if (chargeResult.count === 0) {
          throw new Error(`账户积分不足，本次需要 ${totalPrice} 积分`);
        }

        await (tx as any).promotionCampaign.create({
          data: {
            id: campaignId,
            type,
            scopeKey,
            userId,
            postId: postId || undefined,
            categoryId: categoryId || undefined,
            categoryName: categoryName || undefined,
            adImageUrl: adImageUrl || undefined,
            adMobileImageUrl: adMobileImageUrl || undefined,
            adTargetUrl: adTargetUrl || undefined,
            startsAt: candidates[0]?.startsAt,
            endsAt: candidates[candidates.length - 1]?.endsAt,
            totalPrice,
          },
        });

        await (tx as any).promotionBooking.createMany({
          data: candidates,
        });

        await (tx as any).pointTransaction.create({
          data: {
            userId,
            amount: -totalPrice,
            action: isBannerAdPromotion(type) ? TransactionAction.AD as any : TransactionAction.PIN_POST as any,
            description: `推广预约支付: ${
              isBannerAdPromotion(type)
                ? `${getPromotionTypeLabel(type)} · ${homeAdSlotLabel(slotIndices[0])}`
                : type === PromotionType.PIN_HOME
                  ? getPromotionTypeLabel(type)
                  : `${getPromotionTypeLabel(type)}${categoryName ? ` · ${categoryName}` : ''}`
            } · ${dateKeys[0]}${dateKeys.length > 1 ? ` 至 ${dateKeys[dateKeys.length - 1]}` : ''} · ${candidates.length}天`,
          },
        });

        const updatedUser = await tx.user.findUnique({
          where: { id: userId },
          select: { points: true },
        });

        return {
          success: true,
          bookedCount: candidates.length,
          totalPrice,
          remainingPoints: updatedUser?.points ?? 0,
          startsAt: candidates[0]?.startsAt,
          endsAt: candidates[candidates.length - 1]?.endsAt,
        };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new Error('所选日期刚刚被其他用户预约，请刷新排期后重新选择');
      }
      throw error;
    }
  }
}
