import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import {
  queueWebPushDelivery,
} from './pwa-push.service';
import {
  createInteractionNotification,
  createUserNotification,
} from './user-notification.service';

const PUSH_EXTRA_POLL_INTERVAL_DEFAULT_MS = 20_000;
const PUSH_EXTRA_POLL_BATCH_SIZE = 50;
const TUI_PLUS_EXPIRY_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
let extraPollTimer: NodeJS.Timeout | null = null;
let extraPollRunning = false;

function truncateText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

function shouldQueuePushAfterStationNotification(result: { created?: boolean; reason?: string } | null | undefined) {
  return Boolean(result?.created || result?.reason === 'duplicate');
}

function actorName(row: any) {
  return truncateText(row.actorDisplayName || row.actorLoginAccount || '用户', 32) || '用户';
}

function formatUsdt(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount < 1 ? 6 : 2,
  });
}

async function getCursor(eventType: string) {
  const rows = await prisma.$queryRaw<Array<{ cursorCreatedAt: Date; cursorKey: string }>>(Prisma.sql`
    SELECT "cursorCreatedAt", "cursorKey"
    FROM "WebPushCursor"
    WHERE "eventType" = ${eventType}
    LIMIT 1
  `);
  if (rows[0]) return rows[0];

  const now = new Date();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "WebPushCursor" ("eventType", "cursorCreatedAt", "cursorKey", "updatedAt")
    VALUES (${eventType}, ${now}, '', now())
    ON CONFLICT ("eventType") DO NOTHING
  `);
  return { cursorCreatedAt: now, cursorKey: '' };
}

async function setCursor(eventType: string, cursorCreatedAt: Date, cursorKey: string) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "WebPushCursor" ("eventType", "cursorCreatedAt", "cursorKey", "updatedAt")
    VALUES (${eventType}, ${cursorCreatedAt}, ${cursorKey}, now())
    ON CONFLICT ("eventType") DO UPDATE SET
      "cursorCreatedAt" = EXCLUDED."cursorCreatedAt",
      "cursorKey" = EXCLUDED."cursorKey",
      "updatedAt" = now()
  `);
}

async function processFollowPushEvents() {
  const cursor = await getCursor('FOLLOW');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      f."followerId",
      f."followingId",
      f."createdAt",
      (f."followerId" || ':' || f."followingId") AS "cursorKey",
      actor."displayName" AS "actorDisplayName",
      actor."loginAccount" AS "actorLoginAccount"
    FROM "Follow" f
    INNER JOIN "User" actor ON actor."id" = f."followerId"
    WHERE f."createdAt" > ${cursor.cursorCreatedAt}
      OR (f."createdAt" = ${cursor.cursorCreatedAt} AND (f."followerId" || ':' || f."followingId") > ${cursor.cursorKey})
    ORDER BY f."createdAt" ASC, "cursorKey" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.followingId || row.followingId === row.followerId) continue;
    const stationResult = await createInteractionNotification(prisma, {
      receiverId: row.followingId,
      actorId: row.followerId,
      type: 'FOLLOW',
      createdAt: row.createdAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.followingId,
      eventKey: `follow:${row.followerId}:${row.followingId}`,
      type: 'FOLLOW',
      title: '推推',
      body: `${actorName(row)} 关注了你`,
      targetUrl: `/user/${row.followerId}`,
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('FOLLOW', last.createdAt, last.cursorKey);
}

async function processCommentPushEvents() {
  const cursor = await getCursor('COMMENT');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      pc."id",
      pc."postId",
      pc."userId" AS "actorId",
      pc."content" AS "commentContent",
      pc."createdAt",
      p."userId" AS "recipientId",
      p."title" AS "postTitle",
      actor."displayName" AS "actorDisplayName",
      actor."loginAccount" AS "actorLoginAccount"
    FROM "PostComment" pc
    INNER JOIN "Post" p ON p."id" = pc."postId"
    INNER JOIN "User" actor ON actor."id" = pc."userId"
    WHERE (pc."createdAt" > ${cursor.cursorCreatedAt}
      OR (pc."createdAt" = ${cursor.cursorCreatedAt} AND pc."id" > ${cursor.cursorKey}))
      AND pc."deletedAt" IS NULL
      AND pc."status" = 'VISIBLE'
      AND p."deletedAt" IS NULL
      AND p."isPublished" = true
      AND p."userId" <> pc."userId"
    ORDER BY pc."createdAt" ASC, pc."id" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.recipientId || row.recipientId === row.actorId) continue;
    const preview = truncateText(row.commentContent || row.postTitle, 64);
    const stationResult = await createInteractionNotification(prisma, {
      receiverId: row.recipientId,
      actorId: row.actorId,
      type: 'COMMENT',
      postId: row.postId,
      commentId: row.id,
      createdAt: row.createdAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.recipientId,
      eventKey: `comment:${row.id}`,
      type: 'COMMENT',
      title: '推推',
      body: preview ? `${actorName(row)} 评论了你：${preview}` : `${actorName(row)} 评论了你的帖子`,
      targetUrl: `/post/${row.postId}`,
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('COMMENT', last.createdAt, last.id);
}

async function processLikePushEvents() {
  const cursor = await getCursor('LIKE');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      l."userId" AS "actorId",
      l."postId",
      l."createdAt",
      (l."userId" || ':' || l."postId") AS "cursorKey",
      p."userId" AS "recipientId",
      p."title" AS "postTitle",
      p."content" AS "postContent",
      actor."displayName" AS "actorDisplayName",
      actor."loginAccount" AS "actorLoginAccount"
    FROM "Like" l
    INNER JOIN "Post" p ON p."id" = l."postId"
    INNER JOIN "User" actor ON actor."id" = l."userId"
    WHERE (l."createdAt" > ${cursor.cursorCreatedAt}
      OR (l."createdAt" = ${cursor.cursorCreatedAt} AND (l."userId" || ':' || l."postId") > ${cursor.cursorKey}))
      AND p."deletedAt" IS NULL
      AND p."isPublished" = true
      AND p."userId" <> l."userId"
    ORDER BY l."createdAt" ASC, "cursorKey" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.recipientId || row.recipientId === row.actorId) continue;
    const stationResult = await createInteractionNotification(prisma, {
      receiverId: row.recipientId,
      actorId: row.actorId,
      type: 'LIKE',
      postId: row.postId,
      createdAt: row.createdAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.recipientId,
      eventKey: `like:${row.actorId}:${row.postId}:${new Date(row.createdAt).getTime()}`,
      type: 'LIKE',
      title: '推推',
      body: `${actorName(row)} 点赞了你`,
      targetUrl: `/post/${row.postId}`,
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('LIKE', last.createdAt, last.cursorKey);
}

async function processQuotePushEvents() {
  const cursor = await getCursor('QUOTE');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      quote."id",
      quote."userId" AS "actorId",
      quote."quotedPostId",
      quote."title" AS "quoteTitle",
      quote."content" AS "quoteContent",
      quote."createdAt",
      original."userId" AS "recipientId",
      actor."displayName" AS "actorDisplayName",
      actor."loginAccount" AS "actorLoginAccount"
    FROM "Post" quote
    INNER JOIN "Post" original ON original."id" = quote."quotedPostId"
    INNER JOIN "User" actor ON actor."id" = quote."userId"
    WHERE quote."quotedPostId" IS NOT NULL
      AND (quote."createdAt" > ${cursor.cursorCreatedAt}
        OR (quote."createdAt" = ${cursor.cursorCreatedAt} AND quote."id" > ${cursor.cursorKey}))
      AND quote."deletedAt" IS NULL
      AND quote."isPublished" = true
      AND original."deletedAt" IS NULL
      AND original."isPublished" = true
      AND original."userId" <> quote."userId"
    ORDER BY quote."createdAt" ASC, quote."id" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.recipientId || row.recipientId === row.actorId) continue;
    const preview = truncateText(row.quoteContent || row.quoteTitle, 64);
    const stationResult = await createInteractionNotification(prisma, {
      receiverId: row.recipientId,
      actorId: row.actorId,
      type: 'QUOTE',
      postId: row.quotedPostId,
      quotePostId: row.id,
      createdAt: row.createdAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.recipientId,
      eventKey: `quote:${row.id}`,
      type: 'QUOTE',
      title: '推推',
      body: preview ? `${actorName(row)} 引用了你：${preview}` : `${actorName(row)} 引用了你的帖子`,
      targetUrl: `/post/${row.id}`,
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('QUOTE', last.createdAt, last.id);
}

async function processTuiPlusExpiryReminderEvents() {
  const now = new Date();
  const until = new Date(now.getTime() + TUI_PLUS_EXPIRY_REMINDER_WINDOW_MS);
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT "id", "plusPlan", "plusStatus", "plusExpiresAt"
    FROM "User"
    WHERE "plusStatus" IN ('TRIALING', 'ACTIVE')
      AND "plusExpiresAt" IS NOT NULL
      AND "plusExpiresAt" > ${now}
      AND "plusExpiresAt" <= ${until}
      AND "isDisabled" = false
      AND "userType" <> 'ROBOT'
    ORDER BY "plusExpiresAt" ASC, "id" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    const expiresAt = row.plusExpiresAt ? new Date(row.plusExpiresAt) : null;
    if (!expiresAt || !Number.isFinite(expiresAt.getTime())) continue;
    const isTrial = String(row.plusStatus || '').toUpperCase() === 'TRIALING' || String(row.plusPlan || '').toUpperCase() === 'TRIAL';
    const body = isTrial ? '你的会员试用将在 1 天内到期，续费后可继续使用会员权益。' : '你的会员将在 1 天内到期，续费后可继续使用会员权益。';
    const eventKey = `tui-plus-expiring:${row.id}:${expiresAt.getTime()}`;
    const stationResult = await createUserNotification(prisma, {
      receiverId: row.id,
      sourceKey: `SYSTEM:${eventKey}`,
      type: 'SYSTEM',
      title: '会员到期提醒',
      body,
      targetUrl: '/tui-plus',
      metadata: { source: 'tui_plus_expiry_reminder', plusStatus: row.plusStatus, plusPlan: row.plusPlan },
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.id,
      eventKey,
      type: 'SYSTEM',
      title: '推推',
      body,
      targetUrl: '/tui-plus',
    });
  }
}

async function processReferralInvitePushEvents() {
  const cursor = await getCursor('REFERRAL_INVITE');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      rr."id",
      rr."referrerId",
      rr."inviteeId",
      rr."createdAt",
      invitee."displayName" AS "actorDisplayName",
      invitee."loginAccount" AS "actorLoginAccount"
    FROM "ReferralRelation" rr
    INNER JOIN "User" invitee ON invitee."id" = rr."inviteeId"
    WHERE rr."createdAt" > ${cursor.cursorCreatedAt}
      OR (rr."createdAt" = ${cursor.cursorCreatedAt} AND rr."id" > ${cursor.cursorKey})
    ORDER BY rr."createdAt" ASC, rr."id" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.referrerId || row.referrerId === row.inviteeId) continue;
    const body = `${actorName(row)} 已通过你的邀请成功注册`;
    const stationResult = await createUserNotification(prisma, {
      receiverId: row.referrerId,
      sourceKey: `SYSTEM:referral-invite:${row.id}`,
      type: 'SYSTEM',
      title: '邀请成功',
      body,
      targetUrl: '/invite/records',
      metadata: { source: 'referral_invite', inviteeId: row.inviteeId },
      createdAt: row.createdAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.referrerId,
      eventKey: `referral-invite:${row.id}`,
      type: 'SYSTEM',
      title: '推推',
      body,
      targetUrl: '/invite/records',
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('REFERRAL_INVITE', last.createdAt, last.id);
}

async function processReferralCommissionAvailablePushEvents() {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ReferralCommission"
    SET "status" = 'AVAILABLE', "settledAt" = COALESCE("settledAt", now()), "updatedAt" = now()
    WHERE "status" = 'PENDING'
      AND "availableAt" <= now()
      AND "orderId" NOT LIKE 'referral-convert-%'
  `);

  const cursor = await getCursor('REFERRAL_COMMISSION_AVAILABLE');
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      rc."id",
      rc."referrerId",
      rc."inviteeId",
      rc."commissionAmount"::text AS "commissionAmount",
      COALESCE(rc."settledAt", rc."updatedAt", rc."createdAt") AS "eventAt",
      invitee."displayName" AS "actorDisplayName",
      invitee."loginAccount" AS "actorLoginAccount"
    FROM "ReferralCommission" rc
    INNER JOIN "User" invitee ON invitee."id" = rc."inviteeId"
    WHERE rc."status" = 'AVAILABLE'
      AND rc."orderId" NOT LIKE 'referral-convert-%'
      AND (COALESCE(rc."settledAt", rc."updatedAt", rc."createdAt") > ${cursor.cursorCreatedAt}
        OR (COALESCE(rc."settledAt", rc."updatedAt", rc."createdAt") = ${cursor.cursorCreatedAt} AND rc."id" > ${cursor.cursorKey}))
    ORDER BY "eventAt" ASC, rc."id" ASC
    LIMIT ${PUSH_EXTRA_POLL_BATCH_SIZE}
  `);

  for (const row of rows) {
    if (!row.referrerId || row.referrerId === row.inviteeId) continue;
    const body = `有一笔 ${formatUsdt(row.commissionAmount)} USDT 佣金已到账`;
    const stationResult = await createUserNotification(prisma, {
      receiverId: row.referrerId,
      sourceKey: `SYSTEM:referral-commission-available:${row.id}`,
      type: 'SYSTEM',
      title: '佣金到账',
      body,
      targetUrl: '/invite/records',
      metadata: { source: 'referral_commission_available', inviteeId: row.inviteeId, commissionAmount: row.commissionAmount },
      createdAt: row.eventAt,
    });
    if (!shouldQueuePushAfterStationNotification(stationResult)) continue;
    await queueWebPushDelivery({
      userId: row.referrerId,
      eventKey: `referral-commission-available:${row.id}`,
      type: 'SYSTEM',
      title: '推推',
      body,
      targetUrl: '/invite/records',
    });
  }

  const last = rows[rows.length - 1];
  if (last) await setCursor('REFERRAL_COMMISSION_AVAILABLE', last.eventAt, last.id);
}

async function runExtraPushPollOnce() {
  if (!isDbConfigured()) return;
  await processFollowPushEvents();
  await processCommentPushEvents();
  await processLikePushEvents();
  await processQuotePushEvents();
  await processTuiPlusExpiryReminderEvents();
  await processReferralInvitePushEvents();
  await processReferralCommissionAvailablePushEvents();
}

export function startPwaPushExtraEventPoller() {
  if (extraPollTimer || process.env.PWA_PUSH_POLLER === '0') return;
  if (!isDbConfigured()) return;
  const intervalMs = Math.max(10_000, Number(process.env.PWA_PUSH_POLLER_INTERVAL_MS || PUSH_EXTRA_POLL_INTERVAL_DEFAULT_MS));
  const tick = async () => {
    if (extraPollRunning) return;
    extraPollRunning = true;
    try {
      await runExtraPushPollOnce();
    } catch (error: any) {
      console.warn('[pwa-push-extra] poll failed:', truncateText(error?.message || error, 240));
    } finally {
      extraPollRunning = false;
    }
  };
  setTimeout(tick, 5_000).unref?.();
  extraPollTimer = setInterval(tick, intervalMs);
  extraPollTimer.unref?.();
}
