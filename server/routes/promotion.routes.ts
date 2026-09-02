import type { Express } from 'express';
import { promotionLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore, setPublicCache } from '../http-cache';
import { PromotionService } from '../promotion.service';
import { PromotionBookingService } from '../services/promotion-booking.service';
import { toPublicPromotionAdPayloads } from '../services/promotion-public-ad-payload.service';
import { getTuiPlusStatus } from '../services/tui-plus.service';

export type PromotionRoutesDeps = {
  POST_ID_PATTERN: RegExp;
  getConfigs: () => Promise<any>;
  normalizePromotionErrorMessage: (error: unknown) => string;
  markPromotionDataChanged: () => void;
};

const PROMOTION_BOOKING_MEMBER_MESSAGE = '推广预约为会员权益，开通会员后才能使用';
const PUBLIC_ACTIVE_AD_CACHE_SECONDS = 5;
const PUBLIC_ACTIVE_AD_STALE_SECONDS = 15;

async function ensurePromotionBookingMember(userId: string, res: any) {
  const status = await getTuiPlusStatus(userId);
  if (status.active) return true;
  res.status(403).json({ error: PROMOTION_BOOKING_MEMBER_MESSAGE });
  return false;
}

export function registerPromotionRoutes(app: Express, deps: PromotionRoutesDeps) {
  app.get('/api/promotion/slots-batch', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { type, dates, categoryId } = req.query as any;
    if (!type || !dates) {
      return res.status(400).json({ error: '缺少推广类型或日期' });
    }
    if (!await ensurePromotionBookingMember(req.user.id, res)) return res;

    try {
      const slots = await PromotionService.getBookedSlotsBatch(type, dates, categoryId, req.user?.id);
      setNoStore(res);
      return res.json(slots);
    } catch (err) {
      return res.status(400).json({ error: deps.normalizePromotionErrorMessage(err) });
    }
  }));

  app.get('/api/promotions/home-ads', catchAsync(async (_req, res) => {
    const bookings = await PromotionService.getActiveHomeAds();
    setPublicCache(res, PUBLIC_ACTIVE_AD_CACHE_SECONDS, PUBLIC_ACTIVE_AD_STALE_SECONDS, PUBLIC_ACTIVE_AD_STALE_SECONDS);
    return res.json(toPublicPromotionAdPayloads(bookings));
  }));

  app.get('/api/promotions/active', catchAsync(async (_req, res) => {
    const bookings = await PromotionService.getAllActivePromotions();
    setPublicCache(res, PUBLIC_ACTIVE_AD_CACHE_SECONDS, PUBLIC_ACTIVE_AD_STALE_SECONDS, PUBLIC_ACTIVE_AD_STALE_SECONDS);
    return res.json(bookings);
  }));

  app.get('/api/me/promotions', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const bookings = await PromotionService.listUserBookings(req.user.id);
    setNoStore(res);
    return res.json(bookings);
  }));

  app.get('/api/me/promotion-effects', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const result = await PromotionService.getUserPromotionEffects(req.user.id, {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        includeItems: req.query.includeItems,
      });
      setNoStore(res);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: deps.normalizePromotionErrorMessage(err) });
    }
  }));

  app.post('/api/promotion/book-batch', promotionLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { type, dates, slotIndices, categoryId, postId, adImageUrl, adMobileImageUrl, adTargetUrl, paymentPassword } = req.body;
    const user = req.user;

    const hasDates = Array.isArray(dates) ? dates.length > 0 : dates !== undefined && dates !== null;
    const hasSlotIndices = Array.isArray(slotIndices) ? slotIndices.length > 0 : slotIndices !== undefined && slotIndices !== null;
    if (!type || !hasDates || !hasSlotIndices) {
      return res.status(400).json({ error: '参数不完整' });
    }
    if (!await ensurePromotionBookingMember(user.id, res)) return res;

    try {
      const result = await PromotionBookingService.bookBatch({
        userId: user.id,
        type,
        dates,
        slotIndices,
        configs: await deps.getConfigs(),
        categoryId,
        postId,
        adImageUrl,
        adMobileImageUrl,
        adTargetUrl,
        paymentPassword,
      });
      deps.markPromotionDataChanged();
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: deps.normalizePromotionErrorMessage(err) });
    }
  }));

  app.put('/api/promotion/bookings/:id/ad-creative', promotionLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!deps.POST_ID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: '投放记录不存在' });
    }

    try {
      const result = await PromotionService.updateHomeAdCreative({
        userId: req.user.id,
        bookingId: req.params.id,
        adImageUrl: req.body?.adImageUrl,
        adMobileImageUrl: req.body?.adMobileImageUrl,
        adTargetUrl: req.body?.adTargetUrl,
      });
      deps.markPromotionDataChanged();
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: deps.normalizePromotionErrorMessage(err) });
    }
  }));
}
