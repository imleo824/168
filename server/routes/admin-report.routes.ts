import type { Express } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { setNoStore } from '../http-cache';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import {
  PLATFORM_TIMEZONE,
  getPlatformDayRange,
  getPlatformSqlDateKeyExpression,
} from '../platform-time';
import { RECHARGE_STATUS } from '../services/deposit-scanner.service';

const OPS_REPORT_CACHE_TTL_MS = 30_000;
const ACTIVE_TUI_PLUS_STATUSES = ['TRIALING', 'ACTIVE'];

let opsReportCache: { expiresAt: number; payload: any } | null = null;
let recommendationReportCache: { expiresAt: number; payload: any } | null = null;

type RegisterAdminReportRoutesOptions = {
  consumedPointActions: readonly string[];
};

export function clearAdminReportCache() {
  opsReportCache = null;
  recommendationReportCache = null;
}

async function runAdminReportQuery<T>(label: string, query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error: any) {
    console.warn(`[admin-report:${label}]`, error?.message || error);
    return fallback;
  }
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const asNumber = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

function toRate(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

type RecommendationMetricBucket = {
  date?: string;
  exposures: number;
  viewers: number;
  interactions: number;
  likes: number;
  shares: number;
  dwellMs: number;
  dwellSamples: number;
  avgDwellMs: number;
  quickSkips: number;
  quickSkipRate: number;
  reductions: number;
  reduceRate: number;
  blocks: number;
  blockRate: number;
  interactionRate: number;
};

function createRecommendationBucket(date?: string): RecommendationMetricBucket {
  return {
    ...(date ? { date } : {}),
    exposures: 0,
    viewers: 0,
    interactions: 0,
    likes: 0,
    shares: 0,
    dwellMs: 0,
    dwellSamples: 0,
    avgDwellMs: 0,
    quickSkips: 0,
    quickSkipRate: 0,
    reductions: 0,
    reduceRate: 0,
    blocks: 0,
    blockRate: 0,
    interactionRate: 0,
  };
}

type OpsMetricBucket = {
  date?: string;
  registeredUsers: number;
  memberCount: number;
  chatUserCount: number;
  rechargeAmount: number;
  consumedPoints: number;
  postCount: number;
  likeCount: number;
  shareCount: number;
  followCount: number;
};

function createOpsBucket(date?: string): OpsMetricBucket {
  return {
    ...(date ? { date } : {}),
    registeredUsers: 0,
    memberCount: 0,
    chatUserCount: 0,
    rechargeAmount: 0,
    consumedPoints: 0,
    postCount: 0,
    likeCount: 0,
    shareCount: 0,
    followCount: 0,
  };
}

export function registerAdminReportRoutes(app: Express, options: RegisterAdminReportRoutesOptions) {
  const { consumedPointActions } = options;

  app.get('/api/admin/recommendation-report', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    if (!isDbConfigured()) return res.json(null);
    if (recommendationReportCache && recommendationReportCache.expiresAt > Date.now()) {
      setNoStore(res);
      return res.json(recommendationReportCache.payload);
    }

    const now = new Date();
    const trendRanges = Array.from({ length: 30 }, (_, idx) => getPlatformDayRange(now, idx - 29));
    const todayRange = getPlatformDayRange(now, 0);
    const trendStart = trendRanges[0].start;
    const reportEnd = todayRange.end;
    const trendByDate = new Map<string, RecommendationMetricBucket>(
      trendRanges.map((range) => [range.label, createRecommendationBucket(range.label)]),
    );

    const applyRows = (
      rows: Array<Record<string, unknown>>,
      apply: (bucket: RecommendationMetricBucket, row: Record<string, unknown>) => void,
    ) => {
      rows.forEach((row) => {
        const date = String(row.date || '');
        const bucket = trendByDate.get(date);
        if (!bucket) return;
        apply(bucket, row);
      });
    };

    const [viewRows, viewSummaryRows, reduceRows, blockRows, likeRows, shareRows] = await Promise.all([
      runAdminReportQuery('recommendation-views', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`pv."createdAt"`)} AS date,
          COUNT(*)::int AS exposures,
          COUNT(DISTINCT pv."viewerKey")::int AS viewers,
          COUNT(*) FILTER (WHERE pv."quickSkip" = true)::int AS "quickSkips",
          COALESCE(SUM(pv."dwellMs"), 0)::bigint AS "dwellMs",
          COUNT(*) FILTER (WHERE pv."dwellMs" > 0)::int AS "dwellSamples"
        FROM "PostView" pv
        INNER JOIN "Post" p ON p."id" = pv."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        WHERE pv."source" = 'feed'
          AND author."userType"::text <> 'ROBOT'
          AND pv."createdAt" >= ${trendStart}
          AND pv."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('recommendation-view-summary', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT COUNT(DISTINCT pv."viewerKey")::int AS viewers
        FROM "PostView" pv
        INNER JOIN "Post" p ON p."id" = pv."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        WHERE pv."source" = 'feed'
          AND author."userType"::text <> 'ROBOT'
          AND pv."createdAt" >= ${trendStart}
          AND pv."createdAt" < ${reportEnd}
      `), []),
      runAdminReportQuery('recommendation-reductions', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`urf."updatedAt"`)} AS date,
          COUNT(*)::int AS reductions
        FROM "UserRecommendationFeedback" urf
        INNER JOIN "User" actor ON actor."id" = urf."userId"
        INNER JOIN "Post" p ON p."id" = urf."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        WHERE urf."action" = 'REDUCE'
          AND actor."userType"::text <> 'ROBOT'
          AND author."userType"::text <> 'ROBOT'
          AND urf."updatedAt" >= ${trendStart}
          AND urf."updatedAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('recommendation-blocks', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`b."createdAt"`)} AS date,
          COUNT(*)::int AS blocks
        FROM "Block" b
        INNER JOIN "User" blocker ON blocker."id" = b."blockerId"
        INNER JOIN "User" blocked ON blocked."id" = b."blockedId"
        WHERE blocker."userType"::text <> 'ROBOT'
          AND blocked."userType"::text <> 'ROBOT'
          AND b."createdAt" >= ${trendStart}
          AND b."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('recommendation-likes', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`l."createdAt"`)} AS date,
          COUNT(*)::int AS likes
        FROM "Like" l
        INNER JOIN "User" actor ON actor."id" = l."userId"
        INNER JOIN "Post" p ON p."id" = l."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        WHERE actor."userType"::text <> 'ROBOT'
          AND author."userType"::text <> 'ROBOT'
          AND l."createdAt" >= ${trendStart}
          AND l."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('recommendation-shares', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`ps."createdAt"`)} AS date,
          COUNT(*)::int AS shares
        FROM "PostShare" ps
        INNER JOIN "Post" p ON p."id" = ps."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        LEFT JOIN "User" actor ON actor."id" = ps."userId"
        WHERE author."userType"::text <> 'ROBOT'
          AND (ps."userId" IS NULL OR actor."userType"::text <> 'ROBOT')
          AND ps."createdAt" >= ${trendStart}
          AND ps."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
    ]);

    applyRows(viewRows, (bucket, row) => {
      bucket.exposures = toNumber(row.exposures);
      bucket.viewers = toNumber(row.viewers);
      bucket.quickSkips = toNumber(row.quickSkips);
      bucket.dwellMs = toNumber(row.dwellMs);
      bucket.dwellSamples = toNumber(row.dwellSamples);
    });
    applyRows(reduceRows, (bucket, row) => {
      bucket.reductions = toNumber(row.reductions);
    });
    applyRows(blockRows, (bucket, row) => {
      bucket.blocks = toNumber(row.blocks);
    });
    applyRows(likeRows, (bucket, row) => {
      bucket.likes = toNumber(row.likes);
    });
    applyRows(shareRows, (bucket, row) => {
      bucket.shares = toNumber(row.shares);
    });

    const finalizeBucket = (bucket: RecommendationMetricBucket): RecommendationMetricBucket => {
      const interactions = bucket.likes + bucket.shares;
      return {
        ...bucket,
        interactions,
        avgDwellMs: bucket.dwellSamples > 0 ? Math.round(bucket.dwellMs / bucket.dwellSamples) : 0,
        quickSkipRate: toRate(bucket.quickSkips, bucket.exposures),
        reduceRate: toRate(bucket.reductions, bucket.exposures),
        blockRate: toRate(bucket.blocks, bucket.exposures),
        interactionRate: toRate(interactions, bucket.exposures),
      };
    };

    const trend = trendRanges.map((range) => finalizeBucket(trendByDate.get(range.label) || createRecommendationBucket(range.label)));
    const last30Days = finalizeBucket(
      trend.reduce((acc, row) => {
        acc.exposures += row.exposures;
        acc.viewers += row.viewers;
        acc.likes += row.likes;
        acc.shares += row.shares;
        acc.dwellMs += row.dwellMs;
        acc.dwellSamples += row.dwellSamples;
        acc.quickSkips += row.quickSkips;
        acc.reductions += row.reductions;
        acc.blocks += row.blocks;
        return acc;
      }, createRecommendationBucket()),
    );
    last30Days.viewers = toNumber(viewSummaryRows[0]?.viewers);
    const today = trend.find((row) => row.date === todayRange.label) || finalizeBucket(createRecommendationBucket(todayRange.label));

    setNoStore(res);
    const payload = {
      today,
      last30Days,
      trend,
      generatedAt: new Date().toISOString(),
      timezone: PLATFORM_TIMEZONE,
    };
    recommendationReportCache = {
      expiresAt: Date.now() + OPS_REPORT_CACHE_TTL_MS,
      payload,
    };
    return res.json(payload);
  }));

  app.get('/api/admin/ops-report', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    if (!isDbConfigured()) return res.json(null);
    if (opsReportCache && opsReportCache.expiresAt > Date.now()) {
      setNoStore(res);
      return res.json(opsReportCache.payload);
    }

    const now = new Date();
    const todayRange = getPlatformDayRange(now, 0);
    const trendRanges = Array.from({ length: 30 }, (_, idx) => getPlatformDayRange(now, idx - 29));
    const trendStart = trendRanges[0].start;
    const reportEnd = todayRange.end;
    const trendByDate = new Map<string, OpsMetricBucket>(
      trendRanges.map((range) => [range.label, createOpsBucket(range.label)]),
    );

    const applyRows = (
      rows: Array<Record<string, unknown>>,
      apply: (bucket: OpsMetricBucket, row: Record<string, unknown>) => void,
    ) => {
      rows.forEach((row) => {
        const date = String(row.date || '');
        const bucket = trendByDate.get(date);
        if (!bucket) return;
        apply(bucket, row);
      });
    };

    const [userRows, memberRows, chatUserRows, rechargeRows, pointsRows, postRows, likeRows, shareRows, followRows, historicalRaw] = await Promise.all([
      runAdminReportQuery('ops-users-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`"createdAt"`)} AS date,
          COUNT(*)::int AS "registeredUsers"
        FROM "User"
        WHERE "userType"::text <> 'ROBOT'
          AND "createdAt" >= ${trendStart}
          AND "createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-members-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`sub."startedAt"`)} AS date,
          COUNT(DISTINCT sub."userId")::int AS "memberCount"
        FROM "TuiPlusSubscription" sub
        INNER JOIN "User" u ON u."id" = sub."userId"
        WHERE sub."status"::text IN (${Prisma.join(ACTIVE_TUI_PLUS_STATUSES)})
          AND u."userType"::text <> 'ROBOT'
          AND sub."startedAt" >= ${trendStart}
          AND sub."startedAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-chat-users-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`cm."createdAt"`)} AS date,
          COUNT(DISTINCT cm."authorUserId")::int AS "chatUserCount"
        FROM "ChatMessage" cm
        INNER JOIN "User" u ON u."id" = cm."authorUserId"
        WHERE cm."authorType"::text = 'USER'
          AND cm."authorUserId" IS NOT NULL
          AND u."userType"::text <> 'ROBOT'
          AND cm."createdAt" >= ${trendStart}
          AND cm."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-recharge-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`o."creditedAt"`)} AS date,
          COALESCE(SUM(o."usdtAmount"), 0)::numeric AS "rechargeAmount"
        FROM "Order" o
        INNER JOIN "User" u ON u."id" = o."userId"
        WHERE o."status"::text = ${RECHARGE_STATUS.CREDITED}
          AND u."userType"::text <> 'ROBOT'
          AND o."creditedAt" >= ${trendStart}
          AND o."creditedAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-points-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`pt."createdAt"`)} AS date,
          ABS(COALESCE(SUM(pt."amount"), 0))::bigint AS "consumedPoints"
        FROM "PointTransaction" pt
        INNER JOIN "User" u ON u."id" = pt."userId"
        WHERE pt."amount" < 0
          AND pt."action"::text IN (${Prisma.join(consumedPointActions)})
          AND u."userType"::text <> 'ROBOT'
          AND pt."createdAt" >= ${trendStart}
          AND pt."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-posts-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`p."createdAt"`)} AS date,
          COUNT(*)::int AS "postCount"
        FROM "Post" p
        INNER JOIN "User" u ON u."id" = p."userId"
        WHERE u."userType"::text <> 'ROBOT'
          AND p."createdAt" >= ${trendStart}
          AND p."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-likes-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`l."createdAt"`)} AS date,
          COUNT(*)::int AS "likeCount"
        FROM "Like" l
        INNER JOIN "User" actor ON actor."id" = l."userId"
        INNER JOIN "Post" p ON p."id" = l."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        WHERE actor."userType"::text <> 'ROBOT'
          AND author."userType"::text <> 'ROBOT'
          AND l."createdAt" >= ${trendStart}
          AND l."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-shares-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`ps."createdAt"`)} AS date,
          COUNT(*)::int AS "shareCount"
        FROM "PostShare" ps
        INNER JOIN "Post" p ON p."id" = ps."postId"
        INNER JOIN "User" author ON author."id" = p."userId"
        LEFT JOIN "User" actor ON actor."id" = ps."userId"
        WHERE author."userType"::text <> 'ROBOT'
          AND (ps."userId" IS NULL OR actor."userType"::text <> 'ROBOT')
          AND ps."createdAt" >= ${trendStart}
          AND ps."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      runAdminReportQuery('ops-follows-trend', prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT
          ${getPlatformSqlDateKeyExpression(Prisma.sql`f."createdAt"`)} AS date,
          COUNT(*)::int AS "followCount"
        FROM "Follow" f
        INNER JOIN "User" follower ON follower."id" = f."followerId"
        INNER JOIN "User" following ON following."id" = f."followingId"
        WHERE follower."userType"::text <> 'ROBOT'
          AND following."userType"::text <> 'ROBOT'
          AND f."createdAt" >= ${trendStart}
          AND f."createdAt" < ${reportEnd}
        GROUP BY date
      `), []),
      Promise.all([
        runAdminReportQuery('ops-users-historical', prisma.user.count({ where: { userType: { not: 'ROBOT' as any } } }), 0),
        runAdminReportQuery('ops-members-historical', prisma.user.count({
          where: {
            userType: { not: 'ROBOT' as any },
            plusStatus: { in: ACTIVE_TUI_PLUS_STATUSES as any },
            plusExpiresAt: { gt: now },
          },
        }), 0),
        runAdminReportQuery('ops-chat-users-historical', prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(DISTINCT cm."authorUserId")::int AS count
          FROM "ChatMessage" cm
          INNER JOIN "User" u ON u."id" = cm."authorUserId"
          WHERE cm."authorType"::text = 'USER'
            AND cm."authorUserId" IS NOT NULL
            AND u."userType"::text <> 'ROBOT'
        `), []),
        runAdminReportQuery('ops-recharge-historical', prisma.order.aggregate({
          where: { status: RECHARGE_STATUS.CREDITED as any, user: { userType: { not: 'ROBOT' as any } } },
          _sum: { usdtAmount: true },
        }), { _sum: { usdtAmount: null } }),
        runAdminReportQuery('ops-points-historical', prisma.pointTransaction.aggregate({
          where: { amount: { lt: 0 }, action: { in: consumedPointActions as any }, user: { userType: { not: 'ROBOT' as any } } },
          _sum: { amount: true },
        }), { _sum: { amount: 0 } }),
        runAdminReportQuery('ops-posts-historical', prisma.post.count({ where: { user: { userType: { not: 'ROBOT' as any } } } }), 0),
        runAdminReportQuery('ops-likes-historical', prisma.like.count({
          where: {
            user: { userType: { not: 'ROBOT' as any } },
            post: { user: { userType: { not: 'ROBOT' as any } } },
          },
        }), 0),
        runAdminReportQuery('ops-shares-historical', prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "PostShare" ps
          INNER JOIN "Post" p ON p."id" = ps."postId"
          INNER JOIN "User" author ON author."id" = p."userId"
          LEFT JOIN "User" actor ON actor."id" = ps."userId"
          WHERE author."userType"::text <> 'ROBOT'
            AND (ps."userId" IS NULL OR actor."userType"::text <> 'ROBOT')
        `), []),
        runAdminReportQuery('ops-follows-historical', prisma.follow.count({
          where: {
            follower: { userType: { not: 'ROBOT' as any } },
            following: { userType: { not: 'ROBOT' as any } },
          },
        }), 0),
      ]),
    ]);

    applyRows(userRows, (bucket, row) => {
      bucket.registeredUsers = toNumber(row.registeredUsers);
    });
    applyRows(memberRows, (bucket, row) => {
      bucket.memberCount = toNumber(row.memberCount);
    });
    applyRows(chatUserRows, (bucket, row) => {
      bucket.chatUserCount = toNumber(row.chatUserCount);
    });
    applyRows(rechargeRows, (bucket, row) => {
      bucket.rechargeAmount = toNumber(row.rechargeAmount);
    });
    applyRows(pointsRows, (bucket, row) => {
      bucket.consumedPoints = toNumber(row.consumedPoints);
    });
    applyRows(postRows, (bucket, row) => {
      bucket.postCount = toNumber(row.postCount);
    });
    applyRows(likeRows, (bucket, row) => {
      bucket.likeCount = toNumber(row.likeCount);
    });
    applyRows(shareRows, (bucket, row) => {
      bucket.shareCount = toNumber(row.shareCount);
    });
    applyRows(followRows, (bucket, row) => {
      bucket.followCount = toNumber(row.followCount);
    });

    const trend = trendRanges.map((range) => trendByDate.get(range.label) || createOpsBucket(range.label));
    const today = trend.find((row) => row.date === todayRange.label) || createOpsBucket(todayRange.label);
    const historical = {
      registeredUsers: historicalRaw[0],
      memberCount: historicalRaw[1],
      chatUserCount: toNumber((historicalRaw[2] as Array<{ count?: number }>)?.[0]?.count),
      rechargeAmount: toNumber((historicalRaw[3] as any)?._sum?.usdtAmount),
      consumedPoints: Math.abs(toNumber((historicalRaw[4] as any)?._sum?.amount)),
      postCount: historicalRaw[5] as number,
      likeCount: historicalRaw[6] as number,
      shareCount: toNumber((historicalRaw[7] as Array<{ count?: number }>)?.[0]?.count),
      followCount: historicalRaw[8] as number,
    };

    setNoStore(res);
    const payload = {
      today,
      trend,
      historical,
      generatedAt: new Date().toISOString(),
      timezone: PLATFORM_TIMEZONE,
    };
    opsReportCache = {
      expiresAt: Date.now() + OPS_REPORT_CACHE_TTL_MS,
      payload,
    };
    return res.json(payload);
  }));
}
