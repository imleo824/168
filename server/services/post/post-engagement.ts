import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma from '../../db';
import { normalizeDwellMs } from './ranking-utils';
import { clearRecommendationContextCache } from './recommendation-context';
import { POST_UUID_PATTERN, normalizePostIds } from './post-identifiers';
import { schedulePostRankingRefresh } from './post-ranking-maintenance';
import { incrementNormalShareAggregate } from './trusted-engagement-aggregate';

const POST_BUMP_COOLDOWN_MS = 20 * 60 * 1000;
const VIEW_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;
const VIEW_DEDUPE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const VIEW_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_RECORD_VIEW_BATCH = 30;

export type ViewRecordInput = {
  postId: string;
  dwellMs?: number;
  quickSkip?: boolean;
};

export type PostViewSource = 'view' | 'feed' | 'like' | 'webhook_like';

const POST_VIEW_SOURCES = new Set<PostViewSource>(['view', 'feed', 'like', 'webhook_like']);
let lastViewCleanupAt = 0;

function getViewBucketAt(now = new Date()) {
  return new Date(Math.floor(now.getTime() / VIEW_DEDUPE_WINDOW_MS) * VIEW_DEDUPE_WINDOW_MS);
}

function normalizeViewSource(source?: string): PostViewSource {
  const normalized = (source || 'view').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return POST_VIEW_SOURCES.has(normalized as PostViewSource) ? (normalized as PostViewSource) : 'view';
}

function clampBumpCooldown(rawValue?: number) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return POST_BUMP_COOLDOWN_MS;
  if (value <= 0) return 30_000;
  if (value < 5_000) return 5_000;
  return Math.min(6 * 60 * 60 * 1000, value);
}

function normalizeViewPostIds(postIds: string[]) {
  return normalizePostIds(postIds, MAX_RECORD_VIEW_BATCH);
}

function buildViewerKey(options: { userId?: string | null; fingerprint?: string | null }) {
  if (options.userId) return `u:${options.userId}`;
  if (options.fingerprint) return `a:${options.fingerprint}`;
  return '';
}

function maybeCleanupPostViews() {
  const now = Date.now();
  if (now - lastViewCleanupAt < VIEW_CLEANUP_INTERVAL_MS) return;
  lastViewCleanupAt = now;

  prisma.postView.deleteMany({
    where: {
      bucketAt: {
        lt: new Date(now - VIEW_DEDUPE_RETENTION_MS),
      },
    },
  }).catch(() => {});
}

export async function bumpPostOnInteraction(
  postId: string,
  options: { now?: Date; cooldownMs?: number; force?: boolean } = {},
) {
  const now = options.now || new Date();
  const force = options.force === true;

  if (force) {
    const result = await prisma.$executeRaw`
      UPDATE "Post"
      SET "bumpedAt" = ${now}
      WHERE "id" = ${postId}
    `;
    return result > 0;
  }

  const cooldownMs = clampBumpCooldown(options.cooldownMs);
  const limitTime = new Date(now.getTime() - cooldownMs);
  const result = await prisma.$executeRaw`
    UPDATE "Post"
    SET "bumpedAt" = ${now}
    WHERE "id" = ${postId}
      AND ("bumpedAt" IS NULL OR "bumpedAt" < ${limitTime})
  `;

  return result > 0;
}

export async function recordViews(postInputs: Array<string | ViewRecordInput>, options: {
  userId?: string | null;
  fingerprint?: string | null;
  source?: PostViewSource;
  now?: Date;
} = {}) {
  const inputByPostId = new Map<string, ViewRecordInput>();
  for (const item of postInputs || []) {
    const postId = typeof item === 'string' ? item : item?.postId;
    if (!POST_UUID_PATTERN.test(String(postId || ''))) continue;
    const current = inputByPostId.get(postId) || { postId };
    if (typeof item === 'string') {
      inputByPostId.set(postId, current);
      continue;
    }
    inputByPostId.set(postId, {
      postId,
      dwellMs: Math.max(normalizeDwellMs(current.dwellMs), normalizeDwellMs(item.dwellMs)),
      quickSkip: Boolean(current.quickSkip || item.quickSkip),
    });
  }
  const ids = normalizeViewPostIds(Array.from(inputByPostId.keys()));
  const viewerKey = buildViewerKey(options);
  if (!ids.length || !viewerKey) return {};

  const now = options.now || new Date();
  const bucketAt = getViewBucketAt(now);
  const source = normalizeViewSource(options.source);
  const viewerUserId = options.userId || null;
  const rows = ids.map((postId) => ({
    id: crypto.randomUUID(),
    postId,
    viewerKey,
    viewerUserId,
    bucketAt,
    source,
    dwellMs: normalizeDwellMs(inputByPostId.get(postId)?.dwellMs),
    quickSkip: Boolean(inputByPostId.get(postId)?.quickSkip),
    createdAt: now,
  }));

  try {
    maybeCleanupPostViews();

    const changedRows = await prisma.$queryRaw<Array<{ postId: string; viewCount: number }>>(Prisma.sql`
      WITH incoming("id", "postId", "viewerKey", "viewerUserId", "bucketAt", "source", "dwellMs", "quickSkip", "createdAt") AS (
        VALUES ${Prisma.join(rows.map((row) => Prisma.sql`(${row.id}, ${row.postId}, ${row.viewerKey}, ${row.viewerUserId}, ${row.bucketAt}, ${row.source}, ${row.dwellMs}, ${row.quickSkip}, ${row.createdAt})`))}
      ),
      inserted AS (
        INSERT INTO "PostView" ("id", "postId", "viewerKey", "viewerUserId", "bucketAt", "source", "dwellMs", "quickSkip", "createdAt")
        SELECT "id", "postId", "viewerKey", "viewerUserId", "bucketAt", "source", "dwellMs", "quickSkip", "createdAt"
        FROM incoming
        ON CONFLICT ("postId", "viewerKey", "bucketAt") DO NOTHING
        RETURNING "postId", "viewerKey", "viewerUserId", "dwellMs", "quickSkip"
      ),
      matched_existing AS (
        SELECT
          v."postId",
          v."viewerKey",
          COALESCE(v."viewerUserId", incoming."viewerUserId") AS "viewerUserId",
          v."bucketAt",
          v."dwellMs" AS "oldDwellMs",
          v."quickSkip" AS "oldQuickSkip",
          incoming."dwellMs" AS "incomingDwellMs",
          incoming."quickSkip" AS "incomingQuickSkip"
        FROM "PostView" AS v
        JOIN incoming
          ON v."postId" = incoming."postId"
          AND v."viewerKey" = incoming."viewerKey"
          AND v."bucketAt" = incoming."bucketAt"
        WHERE incoming."dwellMs" > v."dwellMs"
          OR (incoming."quickSkip" = true AND v."quickSkip" = false)
          OR (v."viewerUserId" IS NULL AND incoming."viewerUserId" IS NOT NULL)
      ),
      updated_existing AS (
        UPDATE "PostView" AS v
        SET
          "viewerUserId" = COALESCE(v."viewerUserId", matched_existing."viewerUserId"),
          "dwellMs" = GREATEST(v."dwellMs", matched_existing."incomingDwellMs"),
          "quickSkip" = v."quickSkip" OR matched_existing."incomingQuickSkip"
        FROM matched_existing
        WHERE v."postId" = matched_existing."postId"
          AND v."viewerKey" = matched_existing."viewerKey"
          AND v."bucketAt" = matched_existing."bucketAt"
        RETURNING
          matched_existing."postId",
          COALESCE(v."viewerUserId", matched_existing."viewerUserId") AS "viewerUserId",
          GREATEST(matched_existing."oldDwellMs", matched_existing."incomingDwellMs") - matched_existing."oldDwellMs" AS "dwellMsDelta",
          CASE WHEN matched_existing."oldQuickSkip" = false AND matched_existing."incomingQuickSkip" = true THEN 1 ELSE 0 END AS "quickSkipDelta"
      ),
      grouped AS (
        SELECT "postId", COUNT(*)::int AS count
        FROM inserted
        GROUP BY "postId"
      ),
      aggregate_deltas AS (
        SELECT
          "postId",
          SUM("normalViewCountDelta")::int AS "normalViewCountDelta",
          SUM("normalDwellMsDelta")::int AS "normalDwellMsDelta",
          SUM("normalQuickSkipCountDelta")::int AS "normalQuickSkipCountDelta"
        FROM (
          SELECT
            inserted."postId",
            CASE WHEN u."userType" = 'NORMAL' THEN 1 ELSE 0 END AS "normalViewCountDelta",
            CASE WHEN u."userType" = 'NORMAL' THEN inserted."dwellMs" ELSE 0 END AS "normalDwellMsDelta",
            CASE WHEN u."userType" = 'NORMAL' AND inserted."quickSkip" = true THEN 1 ELSE 0 END AS "normalQuickSkipCountDelta"
          FROM inserted
          LEFT JOIN "User" u ON u."id" = inserted."viewerUserId"
          UNION ALL
          SELECT
            updated_existing."postId",
            0 AS "normalViewCountDelta",
            CASE WHEN u."userType" = 'NORMAL' THEN updated_existing."dwellMsDelta" ELSE 0 END AS "normalDwellMsDelta",
            CASE WHEN u."userType" = 'NORMAL' THEN updated_existing."quickSkipDelta" ELSE 0 END AS "normalQuickSkipCountDelta"
          FROM updated_existing
          LEFT JOIN "User" u ON u."id" = updated_existing."viewerUserId"
        ) deltas
        GROUP BY "postId"
        HAVING SUM("normalViewCountDelta") > 0
          OR SUM("normalDwellMsDelta") > 0
          OR SUM("normalQuickSkipCountDelta") > 0
      ),
      aggregate_refresh AS (
        INSERT INTO "PostEngagementAggregate" (
          "postId",
          "verifiedViewCount",
          "dwellMs",
          "quickSkipCount",
          "normalViewCount",
          "normalDwellMs",
          "normalQuickSkipCount",
          "updatedAt"
        )
        SELECT
          aggregate_deltas."postId",
          aggregate_deltas."normalViewCountDelta",
          aggregate_deltas."normalDwellMsDelta",
          aggregate_deltas."normalQuickSkipCountDelta",
          aggregate_deltas."normalViewCountDelta",
          aggregate_deltas."normalDwellMsDelta",
          aggregate_deltas."normalQuickSkipCountDelta",
          ${now} AS "updatedAt"
        FROM aggregate_deltas
        ON CONFLICT ("postId") DO UPDATE SET
          "verifiedViewCount" = "PostEngagementAggregate"."verifiedViewCount" + EXCLUDED."verifiedViewCount",
          "dwellMs" = "PostEngagementAggregate"."dwellMs" + EXCLUDED."dwellMs",
          "quickSkipCount" = "PostEngagementAggregate"."quickSkipCount" + EXCLUDED."quickSkipCount",
          "normalViewCount" = "PostEngagementAggregate"."normalViewCount" + EXCLUDED."normalViewCount",
          "normalDwellMs" = "PostEngagementAggregate"."normalDwellMs" + EXCLUDED."normalDwellMs",
          "normalQuickSkipCount" = "PostEngagementAggregate"."normalQuickSkipCount" + EXCLUDED."normalQuickSkipCount",
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "postId"
      ),
      post_count_refresh AS (
        UPDATE "Post" AS p
        SET "viewCount" = p."viewCount" + grouped.count
        FROM grouped
        WHERE p.id = grouped."postId"
        RETURNING p.id AS "postId"
      ),
      changed_post_ids AS (
        SELECT "postId" FROM post_count_refresh
        UNION
        SELECT "postId" FROM aggregate_refresh
      )
      SELECT changed_post_ids."postId", p."viewCount"
      FROM changed_post_ids
      JOIN "Post" p ON p.id = changed_post_ids."postId"
    `);

    const refreshedPostIds = changedRows.map((row) => row.postId);
    if (options.userId && refreshedPostIds.length > 0) {
      clearRecommendationContextCache(options.userId);
    }
    schedulePostRankingRefresh(refreshedPostIds);

    return changedRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.postId] = row.viewCount;
      return acc;
    }, {});
  } catch (e) {
    console.error('Failed to record post views', e);
    return {};
  }
}

export async function recordShare(postId: string, actorKey: string, userId?: string | null) {
  const normalizedActorKey = String(actorKey || '').trim().slice(0, 160);
  if (!POST_UUID_PATTERN.test(postId) || !normalizedActorKey) {
    return { counted: false, shareCount: 0 };
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PostShare" ("id", "postId", "actorKey", "userId", "createdAt")
        VALUES (${crypto.randomUUID()}, ${postId}, ${normalizedActorKey}, ${userId || null}, ${new Date()})
        ON CONFLICT ("postId", "actorKey") DO NOTHING
      `);
      const counted = Number(inserted || 0) > 0;

      if (!counted) {
        const current = await tx.post.findUnique({ where: { id: postId }, select: { shareCount: true } });
        return { counted: false, shareCount: current?.shareCount || 0, trusted: false };
      }

      const updated = await tx.post.update({
        where: { id: postId },
        data: { shareCount: { increment: 1 } },
        select: { shareCount: true },
      });
      const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { userType: true } }) : null;
      return { counted: true, shareCount: updated.shareCount || 0, trusted: actor?.userType === 'NORMAL' };
    });

    if (result.counted && result.trusted) {
      await incrementNormalShareAggregate(postId);
      schedulePostRankingRefresh(postId);
    }
    return { counted: result.counted, shareCount: result.shareCount };
  } catch (error) {
    console.error('Failed to record post share', error);
    throw error;
  }
}
