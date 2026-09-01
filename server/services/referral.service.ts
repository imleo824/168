import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

import prisma from '../db';

const DEFAULT_COMMISSION_RATE = 0.5;
const DEFAULT_SETTLEMENT_DAYS = 1;
const DEFAULT_MIN_WITHDRAW_AMOUNT = 10;
const INVITE_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
const TRC20_ADDRESS_PATTERN = /^T[A-Za-z0-9]{33}$/;
const TECHNICAL_COMMISSION_ORDER_PREFIX = 'referral-convert-';
const ACTIVE_PAYOUT_STATUSES = ['PENDING', 'WITHDRAWING', 'APPROVED', 'PAID', 'WITHDRAWN'];
const ACTIVE_LEDGER_STATUSES = ['PENDING', 'CONVERTED', 'WITHDRAWING', 'WITHDRAWN', 'APPROVED', 'PAID'];
const REFERRAL_WITHDRAWAL_STATUSES = ['PENDING', 'WITHDRAWING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELED'];
const FINAL_REFERRAL_WITHDRAWAL_STATUSES = ['PAID', 'REJECTED', 'CANCELED'];

export type ReferralSettings = {
  enabled: boolean;
  commissionRate: number;
  settlementDays: number;
  minWithdrawAmount: number;
  pointsPerUsdt: number;
};

type ReferralWalletBalances = {
  totalCommission: number;
  pendingCommission: number;
  settledCommission: number;
  convertedCommission: number;
  withdrawCommission: number;
  availableCommission: number;
};

function normalizeBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return defaultValue;
}

function normalizeRate(value: unknown, defaultValue = DEFAULT_COMMISSION_RATE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeNumber(value: unknown, defaultValue: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

export function normalizeInviteCode(value: unknown) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return INVITE_CODE_PATTERN.test(code) ? code : '';
}

function normalizeMoney(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed * 1_000_000) / 1_000_000;
}

function toMoneyString(value: unknown) {
  return normalizeMoney(value).toFixed(6);
}

function numberFromRow(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatReferralLedgerAmount(value: unknown) {
  const amount = normalizeMoney(value);
  if (amount <= 0) return '0';
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount < 1 ? 6 : 2,
  });
}

function generateInviteCode() {
  return crypto.randomBytes(5).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);
}

function normalizeWithdrawalNetwork(value: unknown) {
  const network = String(value || 'TRC20').trim().toUpperCase();
  if (network !== 'TRC20') throw Object.assign(new Error('当前仅支持 USDT-TRC20 提现'), { statusCode: 400 });
  return network;
}

function normalizeWithdrawalAddress(value: unknown) {
  const address = String(value || '').trim();
  if (!address) throw Object.assign(new Error('请输入提现地址'), { statusCode: 400 });
  if (!TRC20_ADDRESS_PATTERN.test(address)) throw Object.assign(new Error('请输入有效的 USDT-TRC20 地址'), { statusCode: 400 });
  return address;
}

function normalizeAdminWithdrawalStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  return REFERRAL_WITHDRAWAL_STATUSES.includes(status) ? status : '';
}

function normalizeAdminNote(value: unknown) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 240);
}

async function lockReferralWallet(db: any, userId: string) {
  await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`referral-wallet:${userId}`}))`);
}

async function readConfigMap(db: any) {
  const rows = await db.$queryRaw(Prisma.sql`
    SELECT "key", "value" FROM "SystemConfig"
    WHERE "key" IN ('referral_enabled', 'referral_commission_rate', 'referral_settlement_days', 'referral_min_withdraw_usdt', 'recharge_points_per_usdt')
  `) as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function getReferralSettings(db: any = prisma): Promise<ReferralSettings> {
  const config = await readConfigMap(db);
  return {
    enabled: normalizeBoolean(config.referral_enabled, true),
    commissionRate: normalizeRate(config.referral_commission_rate, DEFAULT_COMMISSION_RATE),
    settlementDays: Math.floor(normalizeNumber(config.referral_settlement_days, DEFAULT_SETTLEMENT_DAYS, 0, 90)),
    minWithdrawAmount: normalizeNumber(config.referral_min_withdraw_usdt, DEFAULT_MIN_WITHDRAW_AMOUNT, 0, 1_000_000),
    pointsPerUsdt: Math.max(1, Math.floor(normalizeNumber(config.recharge_points_per_usdt, 10, 1, 1_000_000))),
  };
}

export async function ensureReferralInviteForUser(userId: string) {
  const existing = await prisma.$queryRaw<Array<{ inviteCode: string }>>(Prisma.sql`
    SELECT "inviteCode" FROM "ReferralInvite"
    WHERE "userId" = ${userId} AND "disabledAt" IS NULL
    LIMIT 1
  `);
  if (existing[0]?.inviteCode) return existing[0].inviteCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = generateInviteCode();
    try {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ReferralInvite" ("id", "userId", "inviteCode", "createdAt", "updatedAt")
        VALUES (${crypto.randomUUID()}, ${userId}, ${inviteCode}, now(), now())
      `);
      return inviteCode;
    } catch (error: any) {
      if (!/duplicate key/i.test(String(error?.message || ''))) throw error;
    }
  }
  throw new Error('邀请码生成失败，请稍后重试');
}

export async function bindReferralRelationOnRegistration(db: any, params: { inviteeId: string; inviteCode?: unknown; source?: 'link' | 'manual'; sourceIp?: string; sourceUserAgent?: string }) {
  const inviteCode = normalizeInviteCode(params.inviteCode);
  if (!inviteCode) return null;

  const inviteRows = await db.$queryRaw(Prisma.sql`
    SELECT ri."userId" AS "referrerId"
    FROM "ReferralInvite" ri
    INNER JOIN "User" u ON u."id" = ri."userId"
    WHERE ri."inviteCode" = ${inviteCode}
      AND ri."disabledAt" IS NULL
      AND u."isDisabled" = false
      AND u."userType" <> 'ROBOT'
    LIMIT 1
  `) as Array<{ referrerId: string }>;
  const referrerId = inviteRows[0]?.referrerId || '';
  if (!referrerId) throw Object.assign(new Error('邀请码无效，请确认后重试'), { statusCode: 400 });
  if (referrerId === params.inviteeId) throw Object.assign(new Error('不能填写自己的邀请码'), { statusCode: 400 });

  await db.$executeRaw(Prisma.sql`
    INSERT INTO "ReferralRelation" ("id", "referrerId", "inviteeId", "inviteCode", "source", "sourceIp", "sourceUserAgent", "registeredAt", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${referrerId}, ${params.inviteeId}, ${inviteCode}, ${params.source || 'manual'}, ${params.sourceIp || null}, ${params.sourceUserAgent || null}, now(), now(), now())
    ON CONFLICT ("inviteeId") DO NOTHING
  `);
  return { referrerId, inviteCode };
}

export async function createReferralCommissionForCreditedOrder(params: { orderId: string; userId: string; usdtAmount: unknown }) {
  const amount = normalizeMoney(params.usdtAmount);
  if (!params.orderId || !params.userId || amount <= 0) return { created: false, reason: 'invalid_order' };

  const settings = await getReferralSettings();
  if (!settings.enabled || settings.commissionRate <= 0) return { created: false, reason: 'disabled' };

  const relationRows = await prisma.$queryRaw<Array<{ referrerId: string }>>(Prisma.sql`
    SELECT rr."referrerId"
    FROM "ReferralRelation" rr
    INNER JOIN "User" referrer ON referrer."id" = rr."referrerId"
    WHERE rr."inviteeId" = ${params.userId}
      AND referrer."isDisabled" = false
      AND referrer."userType" <> 'ROBOT'
    LIMIT 1
  `);
  const referrerId = relationRows[0]?.referrerId || '';
  if (!referrerId || referrerId === params.userId) return { created: false, reason: 'no_referrer' };

  const commissionAmount = normalizeMoney(amount * settings.commissionRate);
  if (commissionAmount <= 0) return { created: false, reason: 'zero_commission' };
  const availableAt = new Date(Date.now() + settings.settlementDays * 24 * 60 * 60 * 1000);

  const inserted = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ReferralCommission" ("id", "referrerId", "inviteeId", "orderId", "rechargeAmount", "commissionRate", "commissionAmount", "status", "availableAt", "createdAt", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${referrerId}, ${params.userId}, ${params.orderId}, ${toMoneyString(amount)}::numeric, ${String(settings.commissionRate)}::numeric, ${toMoneyString(commissionAmount)}::numeric, 'PENDING', ${availableAt}, now(), now())
    ON CONFLICT ("orderId") DO NOTHING
  `);
  return { created: inserted > 0, referrerId, commissionAmount };
}

export async function settleAvailableReferralCommissions(userId: string, db: any = prisma) {
  await db.$executeRaw(Prisma.sql`
    UPDATE "ReferralCommission"
    SET "status" = 'AVAILABLE', "settledAt" = COALESCE("settledAt", now()), "updatedAt" = now()
    WHERE "referrerId" = ${userId}
      AND "status" = 'PENDING'
      AND "availableAt" <= now()
      AND "orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
  `);
}

async function verifyReferralWithdrawalPaymentPassword(userId: string, paymentPassword: unknown) {
  const normalizedPassword = String(paymentPassword || '').trim();
  if (normalizedPassword.length < 6) throw Object.assign(new Error('请输入支付密码'), { statusCode: 400 });
  const user = await (prisma as any).user.findUnique({ where: { id: userId }, select: { paymentPasswordHash: true } });
  if (!user?.paymentPasswordHash) throw Object.assign(new Error('请先设置支付密码'), { statusCode: 400 });
  const isMatch = await bcrypt.compare(normalizedPassword, user.paymentPasswordHash);
  if (!isMatch) throw Object.assign(new Error('支付密码错误'), { statusCode: 400 });
}

async function readReferralWalletBalances(userId: string, db: any = prisma): Promise<ReferralWalletBalances> {
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

export async function getReferralSummary(userId: string) {
  await settleAvailableReferralCommissions(userId);
  const [inviteCode, settings, relationStats, wallet] = await Promise.all([
    ensureReferralInviteForUser(userId),
    getReferralSettings(),
    prisma.$queryRaw<Array<{ inviteCount: number; activeInviteeCount: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "inviteCount", COUNT(DISTINCT CASE WHEN rc."id" IS NOT NULL THEN rr."inviteeId" END)::int AS "activeInviteeCount"
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

export async function listReferralRelations(userId: string, limit = 30) {
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

export async function listReferralCommissions(userId: string, limit = 30) {
  await settleAvailableReferralCommissions(userId);
  return prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT rc."id", rc."inviteeId", rc."orderId", rc."rechargeAmount"::text AS "rechargeAmount", rc."commissionRate"::text AS "commissionRate", rc."commissionAmount"::text AS "commissionAmount", rc."status", rc."availableAt", rc."createdAt", invitee."displayName" AS "inviteeDisplayName", invitee."photoUrl" AS "inviteePhotoUrl"
    FROM "ReferralCommission" rc
    INNER JOIN "User" invitee ON invitee."id" = rc."inviteeId"
    WHERE rc."referrerId" = ${userId}
      AND rc."orderId" NOT LIKE ${`${TECHNICAL_COMMISSION_ORDER_PREFIX}%`}
    ORDER BY rc."createdAt" DESC, rc."id" DESC
    LIMIT ${Math.max(1, Math.min(100, limit))}
  `);
}

export async function listReferralWithdrawals(userId: string, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, limit));
  return prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT * FROM (
      SELECT "id", "amount"::text AS "amount", "currency", "network", "address", "status", "adminNote", "createdAt", "updatedAt", "paidAt", NULL::int AS "points", 'withdrawal' AS "kind"
      FROM "ReferralWithdrawal"
      WHERE "userId" = ${userId}
      UNION ALL
      SELECT "id", "amount"::text AS "amount", 'POINTS' AS "currency", 'POINTS' AS "network", '' AS "address", "status", "adminNote", "createdAt", "updatedAt", "convertedAt" AS "paidAt", "points", 'conversion' AS "kind"
      FROM "ReferralConversion"
      WHERE "userId" = ${userId}
    ) records
    ORDER BY records."createdAt" DESC, records."id" DESC
    LIMIT ${safeLimit}
  `);
}

export async function listAdminReferralWithdrawals(params: { status?: unknown; search?: unknown; cursor?: unknown; limit?: unknown } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(params.limit) || 50));
  const status = normalizeAdminWithdrawalStatus(params.status);
  const search = String(params.search || '').trim().slice(0, 80);
  const cursor = String(params.cursor || '').trim();
  const cursorRows = cursor
    ? await prisma.$queryRaw<Array<{ createdAt: Date; id: string }>>(Prisma.sql`SELECT "createdAt", "id" FROM "ReferralWithdrawal" WHERE "id" = ${cursor} LIMIT 1`)
    : [];
  const cursorRow = cursorRows[0] || null;
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT w."id", w."userId", w."amount"::text AS "amount", w."currency", w."network", w."address", w."status", w."adminNote", w."createdAt", w."updatedAt", w."paidAt",
           u."displayName", u."loginAccount", u."photoUrl", u."userType"
    FROM "ReferralWithdrawal" w
    INNER JOIN "User" u ON u."id" = w."userId"
    WHERE (${status || ''} = '' OR w."status" = ${status || ''})
      AND (${search} = '' OR w."id" ILIKE ${`%${search}%`} OR w."userId" ILIKE ${`%${search}%`} OR w."address" ILIKE ${`%${search}%`} OR u."displayName" ILIKE ${`%${search}%`} OR COALESCE(u."loginAccount", '') ILIKE ${`%${search}%`})
      AND (${cursorRow ? 1 : 0} = 0 OR (w."createdAt", w."id") < (${cursorRow?.createdAt || new Date(0)}, ${cursorRow?.id || ''}))
    ORDER BY w."createdAt" DESC, w."id" DESC
    LIMIT ${safeLimit + 1}
  `);
  const hasMore = rows.length > safeLimit;
  const items = hasMore ? rows.slice(0, safeLimit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id || null : null, hasMore };
}

export async function updateAdminReferralWithdrawal(params: { id: string; status: unknown; adminUserId?: string; adminNote?: unknown }) {
  const id = String(params.id || '').trim();
  if (!id) throw Object.assign(new Error('提现申请不存在'), { statusCode: 404 });
  const nextStatus = normalizeAdminWithdrawalStatus(params.status);
  if (!['PAID', 'REJECTED'].includes(nextStatus)) {
    throw Object.assign(new Error('提现状态只支持已打款或拒绝'), { statusCode: 400 });
  }
  const note = normalizeAdminNote(params.adminNote);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT "id", "userId", "status", "amount"::text AS "amount" FROM "ReferralWithdrawal" WHERE "id" = ${id} FOR UPDATE
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('提现申请不存在'), { statusCode: 404 });
    if (FINAL_REFERRAL_WITHDRAWAL_STATUSES.includes(current.status)) {
      throw Object.assign(new Error('该提现申请已完结，不能重复处理'), { statusCode: 409 });
    }
    const auditNote = [
      note,
      params.adminUserId ? `operator:${params.adminUserId}` : '',
    ].filter(Boolean).join(' · ');
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ReferralWithdrawal"
      SET "status" = ${nextStatus},
          "adminNote" = ${auditNote || null},
          "paidAt" = CASE WHEN ${nextStatus} = 'PAID' THEN now() ELSE "paidAt" END,
          "updatedAt" = now()
      WHERE "id" = ${id}
    `);
    const updated = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT w."id", w."userId", w."amount"::text AS "amount", w."currency", w."network", w."address", w."status", w."adminNote", w."createdAt", w."updatedAt", w."paidAt",
             u."displayName", u."loginAccount", u."photoUrl", u."userType"
      FROM "ReferralWithdrawal" w
      INNER JOIN "User" u ON u."id" = w."userId"
      WHERE w."id" = ${id}
      LIMIT 1
    `);
    return updated[0];
  });
}

export async function convertAvailableReferralCommissionToPoints(userId: string, params: { amount?: unknown } = {}) {
  const requestedAmount = normalizeMoney(params.amount);
  if (requestedAmount <= 0) throw Object.assign(new Error('请输入转换金额'), { statusCode: 400 });

  return prisma.$transaction(async (tx) => {
    await lockReferralWallet(tx, userId);
    await settleAvailableReferralCommissions(userId, tx);
    const settings = await getReferralSettings(tx);
    const wallet = await readReferralWalletBalances(userId, tx);
    if (wallet.availableCommission <= 0) throw Object.assign(new Error('暂无可转换返佣'), { statusCode: 400 });
    if (requestedAmount > wallet.availableCommission + 0.000001) {
      throw Object.assign(new Error(`最多可转换 ${formatReferralLedgerAmount(wallet.availableCommission)} USDT`), { statusCode: 400 });
    }

    const convertedAmount = normalizeMoney(requestedAmount);
    const points = Math.floor(convertedAmount * settings.pointsPerUsdt + 1e-9);
    if (points <= 0) throw Object.assign(new Error('转换金额不足以生成积分'), { statusCode: 400 });

    const displayAmount = formatReferralLedgerAmount(convertedAmount);
    const conversionId = crypto.randomUUID();
    await tx.user.update({ where: { id: userId }, data: { points: { increment: points } } });
    await tx.pointTransaction.create({ data: { userId, amount: points, action: 'RECHARGE' as any, description: `邀请返佣换积分 ${displayAmount} USDT` } });
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ReferralConversion" ("id", "userId", "amount", "points", "status", "adminNote", "createdAt", "updatedAt", "convertedAt")
      VALUES (${conversionId}, ${userId}, ${toMoneyString(convertedAmount)}::numeric, ${points}, 'CONVERTED', ${`邀请返佣换积分 ${displayAmount} USDT，到账 ${points} 积分`}, now(), now(), now())
    `);
    return { conversionId, convertedAmount, points };
  });
}

export async function createReferralWithdrawalFromAvailable(userId: string, params: { amount?: unknown; address: string; network?: string; paymentPassword?: unknown }) {
  await verifyReferralWithdrawalPaymentPassword(userId, params.paymentPassword);
  const requestedAmount = normalizeMoney(params.amount);
  if (requestedAmount <= 0) throw Object.assign(new Error('请输入提现金额'), { statusCode: 400 });
  const network = normalizeWithdrawalNetwork(params.network);
  const address = normalizeWithdrawalAddress(params.address);

  return prisma.$transaction(async (tx) => {
    await lockReferralWallet(tx, userId);
    await settleAvailableReferralCommissions(userId, tx);
    const settings = await getReferralSettings(tx);
    const wallet = await readReferralWalletBalances(userId, tx);
    if (wallet.availableCommission <= 0) throw Object.assign(new Error('暂无可提现返佣'), { statusCode: 400 });
    if (requestedAmount > wallet.availableCommission + 0.000001) {
      throw Object.assign(new Error(`最多可提现 ${formatReferralLedgerAmount(wallet.availableCommission)} USDT`), { statusCode: 400 });
    }
    if (requestedAmount < settings.minWithdrawAmount) {
      throw Object.assign(new Error(`最低提现 ${formatReferralLedgerAmount(settings.minWithdrawAmount)} USDT`), { statusCode: 400 });
    }
    const amount = normalizeMoney(requestedAmount);
    const withdrawalId = crypto.randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ReferralWithdrawal" ("id", "userId", "amount", "currency", "network", "address", "status", "createdAt", "updatedAt")
      VALUES (${withdrawalId}, ${userId}, ${toMoneyString(amount)}::numeric, 'USDT', ${network}, ${address}, 'PENDING', now(), now())
    `);
    return { withdrawalId, amount, network, address, status: 'PENDING' };
  });
}
