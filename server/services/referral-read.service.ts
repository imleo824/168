import { Prisma } from '@prisma/client';

import prisma from '../db';
import {
  ensureReferralInviteForUser,
  getReferralSettings,
  settleAvailableReferralCommissions,
} from './referral.service';

const TECHNICAL_COMMISSION_ORDER_PREFIX = 'referral-convert-';
const ACTIVE_PAYOUT_STATUSES = ['PENDING', 'WITHDRAWING', 'APPROVED', 'PAID', 'WITHDRAWN'];
const ACTIVE_LEDGER_STATUSES = ['PENDING', 'CONVERTED', 'WITHDRAWING', 'WITHDRAWN', 'APPROVED', 'PAID'];

function numberFromRow(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed * 1_000_000) / 1_000_000;
}

async function readReferralWalletBalances(userId: string, db: any = prisma) {
  const commissionRows = await db.$queryRaw(Prisma.sql`
    SELECT
      COALESCE(SUM("commissionAmount"), 0)::text AS "totalCommission",
      COALESCE(SUM(CASE WHEN "status" = 'PENDING' THEN "commissionAmount" ELSE 0 END), 0)::text AS "pendingCommission",
      COALESCE(SUM(CASE WHEN "status" <> 'PENDING' THEN "commissionAmount" ELSE 0 END), 0)::text AS "settledCommission"
    FROM "ReferralCommission"
    WHERE "referrerId" = ${userId}
      AND "orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
  `) as Array<any>;
  const conversionRows = await db.$queryRaw(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::text AS "convertedCommission"
    FROM "ReferralConversion"
    WHERE "userId" = ${userId} AND "status" IN (${Prisma.join(ACTIVE_LEDGER_STATUSES)})
  `) as Array<{ convertedCommission: string }>;
  const withdrawalRows = await db.$queryRaw(Prisma.sql`
    SELECT COALESCE(SUM("amount"), 0)::text AS "withdrawCommission"
    FROM "ReferralWithdrawal"
    WHERE "userId" = ${userId} AND "status" IN (${Prisma.join(ACTIVE_PAYOUT_STATUSES)})
  `) as Array<{ withdrawCommission: string }>;

  const commission = commissionRows[0] || {};
  const convertedCommission = numberFromRow(conversionRows[0]?.convertedCommission);
  const withdrawCommission = numberFromRow(withdrawalRows[0]?.withdrawCommission);
  const settledCommission = numberFromRow(commission.settledCommission);
  const availableCommission = Math.max(0, normalizeMoney(settledCommission - convertedCommission - withdrawCommission));
  return {
    totalCommission: numberFromRow(commission.totalCommission),
    pendingCommission: numberFromRow(commission.pendingCommission),
    settledCommission,
    convertedCommission,
    withdrawCommission,
    availableCommission,
  };
}

export async function getReferralSummaryReadModel(userId: string) {
  await settleAvailableReferralCommissions(userId);
  const [inviteCode, settings, relationStats, wallet] = await Promise.all([
    ensureReferralInviteForUser(userId),
    getReferralSettings(),
    prisma.$queryRaw<Array<{ inviteCount: number; activeInviteeCount: number }>>(Prisma.sql`
      SELECT
        COUNT(DISTINCT rr."inviteeId")::int AS "inviteCount",
        COUNT(DISTINCT CASE WHEN rc."id" IS NOT NULL THEN rr."inviteeId" END)::int AS "activeInviteeCount"
      FROM "ReferralRelation" rr
      LEFT JOIN "ReferralCommission" rc
        ON rc."inviteeId" = rr."inviteeId"
       AND rc."referrerId" = rr."referrerId"
       AND rc."orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
      WHERE rr."referrerId" = ${userId}
    `),
    readReferralWalletBalances(userId),
  ]);
  const relation = relationStats[0] || { inviteCount: 0, activeInviteeCount: 0 };
  return {
    inviteCode,
    settings,
    inviteCount: Number(relation.inviteCount || 0),
    activeInviteeCount: Number(relation.activeInviteeCount || 0),
    totalCommission: wallet.totalCommission,
    pendingCommission: wallet.pendingCommission,
    availableCommission: wallet.availableCommission,
    convertedCommission: wallet.convertedCommission,
    withdrawCommission: wallet.withdrawCommission,
  };
}

export async function listReferralRelationsReadModel(userId: string, limit = 30) {
  await settleAvailableReferralCommissions(userId);
  return prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT rr."id", rr."inviteeId", rr."inviteCode", rr."source", rr."registeredAt", invitee."displayName", invitee."photoUrl",
      COALESCE(SUM(rc."rechargeAmount"), 0)::text AS "totalRechargeAmount",
      COALESCE(SUM(rc."commissionAmount"), 0)::text AS "totalCommissionAmount",
      MAX(rc."createdAt") AS "lastCommissionAt"
    FROM "ReferralRelation" rr
    INNER JOIN "User" invitee ON invitee."id" = rr."inviteeId"
    LEFT JOIN "ReferralCommission" rc
      ON rc."inviteeId" = rr."inviteeId"
     AND rc."referrerId" = rr."referrerId"
     AND rc."orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
    WHERE rr."referrerId" = ${userId}
    GROUP BY rr."id", rr."inviteeId", rr."inviteCode", rr."source", rr."registeredAt", invitee."displayName", invitee."photoUrl"
    ORDER BY rr."registeredAt" DESC, rr."id" DESC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `);
}

export async function listReferralCommissionsReadModel(userId: string, limit = 30) {
  await settleAvailableReferralCommissions(userId);
  return prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT rc."id", rc."inviteeId", rc."orderId", rc."rechargeAmount"::text AS "rechargeAmount", rc."commissionRate"::text AS "commissionRate",
           rc."commissionAmount"::text AS "commissionAmount",
           rc."status", rc."availableAt", rc."createdAt", invitee."displayName" AS "inviteeDisplayName", invitee."photoUrl" AS "inviteePhotoUrl"
    FROM "ReferralCommission" rc
    INNER JOIN "User" invitee ON invitee."id" = rc."inviteeId"
    WHERE rc."referrerId" = ${userId}
      AND rc."orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
    ORDER BY rc."createdAt" DESC, rc."id" DESC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `);
}
