import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

import prisma, { isDbConfigured } from '../db';
import { PromotionType, TransactionAction, getPromotionTypeLabel } from '../../shared/domain';
import { getPromotionSlotPrice, type PromotionPriceConfig } from '../../shared/promotionPricing';
import {
  addUtcDays,
  buildScopeKey,
  conflictKey,
  homeAdSlotLabel,
  isBannerAdPromotion,
  isUniqueConflict,
  normalizeAdImageUrl,
  normalizeAdTargetUrl,
  normalizeDateKeys,
  normalizePromotionType,
  normalizeSlotIndices,
  startOfPlatformDay,
  startOfUtcDay,
  type BookingCandidate,
} from '../promotion-utils';

const TUI_PLUS_ACTIVE_STATUSES = new Set(['TRIALING', 'ACTIVE']);
const PROMOTION_BOOKING_MEMBER_MESSAGE = '推广预约为会员权益，开通会员后才能使用';

type PromotionBookingParams = {
  userId: string;
  type: string;
  dates: unknown;
  slotIndices: unknown;
  configs?: PromotionPriceConfig;
  categoryId?: unknown;
  postId?: unknown;
  adImageUrl?: unknown;
  adMobileImageUrl?: unknown;
  adTargetUrl?: unknown;
  paymentPassword?: unknown;
};

type LockedPromotionUser = {
  points: number;
  isDisabled: boolean;
  plusStatus: string | null;
  plusExpiresAt: Date | string | null;
  paymentPasswordHash: string | null;
};

type VerifiedPaymentPasswordSnapshot = {
  paymentPasswordHash: string;
};

function assertPositivePrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('推广价格配置无效');
  return value;
}

function isActiveTuiPlusForBooking(user: Pick<LockedPromotionUser, 'plusStatus' | 'plusExpiresAt'>, now = new Date()) {
  const status = String(user.plusStatus || '').trim().toUpperCase();
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  return Boolean(expiresAt && expiresAt > now.getTime() && TUI_PLUS_ACTIVE_STATUSES.has(status));
}

function normalizePaymentPasswordForBooking(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请输入支付密码');
  return value.trim();
}

async function readPromotionUserSnapshot(userId: string): Promise<LockedPromotionUser | null> {
  const rows = await prisma.$queryRaw<LockedPromotionUser[]>`
    SELECT "points", "isDisabled", "plusStatus", "plusExpiresAt", "paymentPasswordHash"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function verifyPaymentPasswordBeforeBooking(userId: string, paymentPassword: unknown): Promise<VerifiedPaymentPasswordSnapshot> {
  const normalizedPaymentPassword = normalizePaymentPasswordForBooking(paymentPassword);
  const user = await readPromotionUserSnapshot(userId);

  if (!user) throw new Error('用户不存在');
  if (user.isDisabled) throw new Error('您的账号已被禁用，无法预约推广');
  if (!isActiveTuiPlusForBooking(user)) throw new Error(PROMOTION_BOOKING_MEMBER_MESSAGE);
  if (!user.paymentPasswordHash) throw new Error('请先设置支付密码');

  const paymentPasswordMatched = await bcrypt.compare(normalizedPaymentPassword, user.paymentPasswordHash);
  if (!paymentPasswordMatched) throw new Error('支付密码错误');

  return { paymentPasswordHash: user.paymentPasswordHash };
}

function assertPaymentPasswordSnapshotStillValid(user: LockedPromotionUser, snapshot: VerifiedPaymentPasswordSnapshot) {
  if (!user.paymentPasswordHash) throw new Error('请先设置支付密码');
  if (user.paymentPasswordHash !== snapshot.paymentPasswordHash) {
    throw new Error('支付密码已变更，请重新输入');
  }
}

function buildPromotionTransactionDescription(params: {
  type: PromotionType;
  slotIndices: number[];
  categoryName: string | null;
  dateKeys: string[];
  bookedCount: number;
}) {
  const promotionLabel = isBannerAdPromotion(params.type)
    ? `${getPromotionTypeLabel(params.type)} · ${homeAdSlotLabel(params.slotIndices[0])}`
    : params.type === PromotionType.PIN_HOME
      ? getPromotionTypeLabel(params.type)
      : `${getPromotionTypeLabel(params.type)}${params.categoryName ? ` · ${params.categoryName}` : ''}`;
  return `推广预约支付: ${promotionLabel} · ${params.dateKeys[0]}${params.dateKeys.length > 1 ? ` 至 ${params.dateKeys[params.dateKeys.length - 1]}` : ''} · ${params.bookedCount}天`;
}

export class PromotionBookingService {
  static async bookBatch(params: PromotionBookingParams) {
    if (!isDbConfigured()) throw new Error('数据库未配置');

    const userId = String(params.userId || '').trim();
    if (!userId) throw new Error('用户不存在');

    const type = normalizePromotionType(params.type);
    const dateKeys = normalizeDateKeys(params.dates);
    const slotIndices = normalizeSlotIndices(params.slotIndices, type);
    const categoryId = type === PromotionType.PIN_CATEGORY ? String(params.categoryId || '').trim() : null;
    const scopeKey = buildScopeKey(type, categoryId);
    const campaignId = randomUUID();
    const verifiedPaymentSnapshot = await verifyPaymentPasswordBeforeBooking(userId, params.paymentPassword);

    let adImageUrl: string | null = null;
    let adMobileImageUrl: string | null = null;
    let adTargetUrl: string | null = null;
    if (isBannerAdPromotion(type)) {
      adImageUrl = normalizeAdImageUrl(String(params.adImageUrl || ''), '电脑端广告图片');
      adMobileImageUrl = normalizeAdImageUrl(String(params.adMobileImageUrl || ''), '移动端广告图片');
      adTargetUrl = normalizeAdTargetUrl(String(params.adTargetUrl || ''));
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const users = await tx.$queryRaw<LockedPromotionUser[]>`
          SELECT "points", "isDisabled", "plusStatus", "plusExpiresAt", "paymentPasswordHash"
          FROM "User"
          WHERE "id" = ${userId}
          FOR UPDATE
        `;
        const user = users[0];
        if (!user) throw new Error('用户不存在');
        if (user.isDisabled) throw new Error('您的账号已被禁用，无法预约推广');
        if (!isActiveTuiPlusForBooking(user)) throw new Error(PROMOTION_BOOKING_MEMBER_MESSAGE);
        assertPaymentPasswordSnapshotStillValid(user, verifiedPaymentSnapshot);

        let categoryName: string | null = null;
        let categorySlug: string | null = null;
        if (type === PromotionType.PIN_CATEGORY) {
          if (!categoryId) throw new Error('分类置顶必须选择分类');
          const category = await tx.category.findUnique({
            where: { id: categoryId },
            select: { name: true, slug: true },
          });
          if (!category) throw new Error('分类不存在');
          categoryName = category.name;
          categorySlug = category.slug;
        }

        let postId: string | null = null;
        if (type === PromotionType.PIN_HOME || type === PromotionType.PIN_CATEGORY) {
          postId = String(params.postId || '').trim();
          if (!postId) throw new Error('请选择要推广的信息');

          const post = await tx.post.findFirst({
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
              pricePaid: assertPositivePrice(getPromotionSlotPrice({ configs: params.configs, type, slotIndex, categorySlug })),
            });
          }
        }

        const totalPrice = candidates.reduce((sum, item) => sum + item.pricePaid, 0);
        if (!Number.isFinite(totalPrice) || totalPrice <= 0) throw new Error('推广价格配置无效');

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
        if (chargeResult.count === 0) throw new Error(`账户积分不足，本次需要 ${totalPrice} 积分`);

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

        await (tx as any).promotionBooking.createMany({ data: candidates });

        await (tx as any).pointTransaction.create({
          data: {
            userId,
            amount: -totalPrice,
            action: isBannerAdPromotion(type) ? TransactionAction.AD as any : TransactionAction.PIN_POST as any,
            description: buildPromotionTransactionDescription({
              type,
              slotIndices,
              categoryName,
              dateKeys,
              bookedCount: candidates.length,
            }),
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
