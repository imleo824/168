import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import {
  createReferralCommissionForCreditedOrder,
} from './referral.service';

const REFERRAL_POLLER_DEFAULT_INTERVAL_MS = 20_000;
const REFERRAL_POLLER_BATCH_SIZE = 80;
let referralPollTimer: NodeJS.Timeout | null = null;
let referralPollRunning = false;

async function runReferralCommissionPollOnce() {
  if (!isDbConfigured()) return;
  const rows = await prisma.$queryRaw<Array<{ id: string; userId: string; usdtAmount: string }>>(Prisma.sql`
    SELECT o."id", o."userId", o."usdtAmount"::text AS "usdtAmount"
    FROM "Order" o
    INNER JOIN "ReferralRelation" rr ON rr."inviteeId" = o."userId"
    INNER JOIN "User" referrer ON referrer."id" = rr."referrerId"
    INNER JOIN "User" invitee ON invitee."id" = rr."inviteeId"
    LEFT JOIN "ReferralCommission" rc ON rc."orderId" = o."id"
    WHERE o."status" = 'CREDITED'
      AND rc."id" IS NULL
      AND rr."referrerId" <> o."userId"
      AND referrer."isDisabled" = false
      AND referrer."userType" <> 'ROBOT'
      AND invitee."isDisabled" = false
      AND invitee."userType" <> 'ROBOT'
    ORDER BY COALESCE(o."creditedAt", o."updatedAt", o."createdAt") ASC, o."id" ASC
    LIMIT ${REFERRAL_POLLER_BATCH_SIZE}
  `);

  for (const row of rows) {
    try {
      await createReferralCommissionForCreditedOrder({
        orderId: row.id,
        userId: row.userId,
        usdtAmount: row.usdtAmount,
      });
    } catch (error: any) {
      console.warn('[referral] commission order failed:', {
        orderId: row.id,
        userId: row.userId,
        reason: error?.message || error,
      });
    }
  }
}

export function startReferralCommissionPoller() {
  if (referralPollTimer || process.env.REFERRAL_POLLER === '0' || !isDbConfigured()) return;
  const intervalMs = Math.max(10_000, Number(process.env.REFERRAL_POLLER_INTERVAL_MS || REFERRAL_POLLER_DEFAULT_INTERVAL_MS));
  const tick = async () => {
    if (referralPollRunning) return;
    referralPollRunning = true;
    try {
      await runReferralCommissionPollOnce();
    } catch (error: any) {
      console.warn('[referral] commission poll failed:', error?.message || error);
    } finally {
      referralPollRunning = false;
    }
  };

  setTimeout(tick, 5_000).unref?.();
  referralPollTimer = setInterval(tick, intervalMs);
  referralPollTimer.unref?.();
}
