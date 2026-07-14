import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';
import { PostService } from '../post.service';
import { getPlatformDayRange } from '../platform-time';
import { bumpPublicFeedCacheVersion, clearPublicFeedResultCache } from '../public-feed-cache';
import {
  getQuotePublishConfig,
  updateQuotePublishConfig,
  type QuotePublishConfig,
} from './quote-publish.config';
import {
  detectRobotReactionIntent,
  isLowSubstanceRobotSource,
  robotReactionSignature,
  scoreRobotReaction,
  type RobotReactionPost,
  type RobotReactionUser,
} from './robot-reaction-quality.service';
import { generateBestRobotReaction } from './robot-content-generation.service';
import { getAutomationAiRuntime } from './automation-ai.service';
import { listAutomationHeartbeats } from './automation-health.service';
import {
  getAutomationTaskLock,
  withAutomationTaskLock,
  type AutomationTaskLockDetails,
} from './automation-task-lock.service';

export { getQuotePublishConfig, updateQuotePublishConfig };
export type { QuotePublishConfig };
export type QuotePublishRunStatus = 'PENDING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
export type QuotePublishTrigger = 'MANUAL' | 'SCHEDULED';
export type QuotePublishAfterPostCreated = (params: { post: any; user: any; req?: Request }) => Promise<void> | void;

type RunOptions = { trigger?: QuotePublishTrigger; req?: Request; afterPostCreated?: QuotePublishAfterPostCreated; force?: boolean };
type ListRunsOptions = { status?: QuotePublishRunStatus; limit?: number; cursor?: string };
type RobotUser = RobotReactionUser & { photoUrl?: string | null; userType?: string | null; isDisabled?: boolean | null };
type HumanEngagement = { humanCommentCount: number; humanQuoteCount: number; shareCount: number; total: number };
type CandidatePost = RobotReactionPost & {
  id: string;
  userId: string;
  categoryId?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  location?: string | null;
  categoryMeta?: unknown;
  shareCount?: number | null;
  quoteCount?: number | null;
  likeCount?: number | null;
  viewCount?: number | null;
  recommendationScore?: number | null;
  createdAt?: Date | string | null;
  bumpedAt?: Date | string | null;
  humanEngagement?: HumanEngagement;
  robotCommentCount?: number;
  robotQuoteCount?: number;
  robotLastCommentAt?: Date | null;
  robotLastQuoteAt?: Date | null;
};

const COMMENT_SOURCE = 'comment_publish_robot';
const QUOTE_SOURCE = 'quote_publish_robot';
const RUN_RETENTION_DAYS = 14;
const CANDIDATE_SCAN_LIMIT = 160;
const RANDOM_POOL_LIMIT = 40;
const SIGNATURE_DAYS = 14;
const RECENT_ROBOT_ENGAGEMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const QUOTE_TASK_LOCK_NAME = 'quote_publish';
const QUOTE_TASK_LOCK_TTL_MS = 20 * 60 * 1000;
const TELEGRAM_SYNC_STATUS_NONE = 'NONE';
const RUN_STATUSES = new Set<QuotePublishRunStatus>(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);
const SKIPPED_SOURCE_COOLDOWN_REASONS = [
  'unsupported_source_intent',
  'low_substance_source',
  'human_engagement_saturated',
];

function db() { return prisma as any; }
function cut(text: string, limit: number) { return Array.from(text || '').slice(0, limit).join(''); }
function clean(raw: unknown, max = 500) {
  const text = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(text).length > max ? `${cut(text, max - 1)}…` : text;
}
function normalizeRunStatus(raw: unknown) {
  const status = String(raw || '').trim().toUpperCase() as QuotePublishRunStatus;
  return RUN_STATUSES.has(status) ? status : null;
}
function normalizeLocation(raw: unknown) {
  const value = String(raw || '').replace(/^📍\s*/, '').replace(/^(?:location|loc|位置|地点)[:：]?\s*/i, '').replace(/\s+/g, ' ').trim();
  return value || null;
}
function hashValue(seed: string) { let h = 0; for (const ch of seed) h = ((h << 5) - h + ch.charCodeAt(0)) | 0; return Math.abs(h); }
function hit(value: number, threshold: number) { return Number(threshold || 0) > 0 && value >= threshold; }
function saturated(config: QuotePublishConfig, e: HumanEngagement) {
  return hit(e.humanCommentCount, config.humanCommentSkipThreshold)
    || hit(e.humanQuoteCount, config.humanQuoteSkipThreshold)
    || hit(e.shareCount, config.humanShareSkipThreshold)
    || hit(e.total, config.humanTotalEngagementSkipThreshold);
}
function scorePost(post: CandidatePost) {
  const createdAt = post.createdAt ? new Date(post.createdAt).getTime() : 0;
  const ageHours = createdAt ? Math.max(1, (Date.now() - createdAt) / 3_600_000) : 720;
  return Math.max(
    1,
    Number(post.recommendationScore || 0) * 10
      + Number(post.shareCount || 0) * 3
      + Number(post.quoteCount || 0) * 2
      + Number(post.likeCount || 0) * 2
      + Math.log(Number(post.viewCount || 0) + 1) * 2
      + Math.max(0, 24 / ageHours),
  );
}
function weightedPool(candidates: CandidatePost[]) {
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  return candidates
    .map((post) => ({ post, score: scorePost(post), jitter: (hashValue(`${bucket}:${post.id}`) % 10_000) / 10_000 }))
    .sort((a, b) => (b.score + b.jitter) - (a.score + a.jitter))
    .slice(0, Math.min(RANDOM_POOL_LIMIT, candidates.length));
}
function runCursor(row: { createdAt?: Date | string | null; id?: string | null }) {
  const d = row.createdAt ? new Date(row.createdAt) : null;
  return d && row.id ? `${d.toISOString()}|${row.id}` : null;
}
function parseRunCursor(raw?: string) {
  const cursor = String(raw || '').trim();
  if (!cursor) return null;
  const [datePart, idPart] = cursor.includes('|') ? cursor.split('|') : ['', cursor];
  const date = datePart ? new Date(datePart) : null;
  return { createdAt: date && !Number.isNaN(date.getTime()) ? date : null, id: String(idPart || cursor).trim() || null };
}
function recentRobotTouched(post: CandidatePost) {
  const cutoff = Date.now() - RECENT_ROBOT_ENGAGEMENT_COOLDOWN_MS;
  return [post.robotLastCommentAt, post.robotLastQuoteAt].some((value) => value && new Date(value).getTime() >= cutoff);
}
function markQuotePublishPostChanged(postIds: string[]) {
  bumpPublicFeedCacheVersion('quote_publish');
  clearPublicFeedResultCache();
  PostService.schedulePostRankingRefresh(postIds);
}

async function recentSignature(signature: string) {
  const since = new Date(Date.now() - SIGNATURE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "RobotContentSignature" WHERE "module" IN ('comment_publish', 'quote_publish') AND "signature" = ${signature} AND "createdAt" >= ${since}`);
  return Number(rows[0]?.count || 0) > 0;
}
async function recentContents(limit = 12) {
  const since = new Date(Date.now() - SIGNATURE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ content: string | null }>>(Prisma.sql`SELECT "content" FROM "RobotContentSignature" WHERE "module" IN ('comment_publish', 'quote_publish') AND "createdAt" >= ${since} ORDER BY "createdAt" DESC LIMIT ${limit}`);
  return rows.map((row) => String(row.content || '').trim()).filter(Boolean);
}
async function saveSignatureTx(tx: any, signature: string, content: string, postId: string, robotId: string) {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "RobotContentSignature" ("id", "module", "signature", "content", "postId", "robotUserId", "createdAt") VALUES (${`signature_${randomUUID()}`}, 'quote_publish', ${signature}, ${content}, ${postId}, ${robotId}, NOW())`);
}
async function engagement(post: CandidatePost): Promise<HumanEngagement> {
  if (post.humanEngagement) return post.humanEngagement;
  const rows = await prisma.$queryRaw<Array<{ humanCommentCount: bigint; humanQuoteCount: bigint }>>(Prisma.sql`SELECT (SELECT COUNT(*) FROM "PostComment" c LEFT JOIN "User" u ON u."id" = c."userId" WHERE c."postId" = ${post.id} AND c."deletedAt" IS NULL AND COALESCE(c."source", '') <> ${COMMENT_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') AS "humanCommentCount", (SELECT COUNT(*) FROM "Post" q LEFT JOIN "User" u ON u."id" = q."userId" WHERE q."quotedPostId" = ${post.id} AND q."deletedAt" IS NULL AND COALESCE(q."source", '') <> ${QUOTE_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') AS "humanQuoteCount"`);
  const humanCommentCount = Number(rows[0]?.humanCommentCount || 0);
  const humanQuoteCount = Number(rows[0]?.humanQuoteCount || 0);
  const shareCount = Number(post?.shareCount || 0);
  return { humanCommentCount, humanQuoteCount, shareCount, total: humanCommentCount + humanQuoteCount + shareCount };
}
async function lockPair(tx: any, postId: string, robotId: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${postId}), hashtext(${robotId}))`);
}
async function alreadyTx(tx: any, postId: string, robotId: string) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT (SELECT COUNT(*) FROM "PostComment" WHERE "postId" = ${postId} AND "userId" = ${robotId} AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL) + (SELECT COUNT(*) FROM "Post" WHERE "quotedPostId" = ${postId} AND "userId" = ${robotId} AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL) AS "count"`) as Array<{ count: bigint }>;
  return Number(rows[0]?.count || 0) > 0;
}
async function engagedRobotIdsForPosts(postIds: string[]) {
  const map = new Map<string, Set<string>>();
  if (!postIds.length) return map;
  const rows = await prisma.$queryRaw<Array<{ postId: string; robotId: string }>>(Prisma.sql`
    SELECT "postId", "userId" AS "robotId" FROM "PostComment" WHERE "postId" IN (${Prisma.join(postIds)}) AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL
    UNION ALL
    SELECT "quotedPostId" AS "postId", "userId" AS "robotId" FROM "Post" WHERE "quotedPostId" IN (${Prisma.join(postIds)}) AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL
  `);
  for (const row of rows) {
    if (!row.postId || !row.robotId) continue;
    if (!map.has(row.postId)) map.set(row.postId, new Set());
    map.get(row.postId)!.add(row.robotId);
  }
  return map;
}
function pickRobotForPost(robots: RobotUser[], post: CandidatePost, engaged: Set<string> | undefined) {
  const available = robots.filter((robot) => robot.id !== post?.userId && !engaged?.has(robot.id));
  if (!available.length) return null;
  const index = hashValue(`${post.id}:${available.length}:${Math.floor(Date.now() / 3_600_000)}`) % available.length;
  return available[index];
}
async function pickSourceAndRobot(candidates: CandidatePost[], robots: RobotUser[]) {
  const pool = weightedPool(candidates);
  const engagedMap = await engagedRobotIdsForPosts(pool.map((item) => item.post.id));
  for (const item of pool) {
    const robot = pickRobotForPost(robots, item.post, engagedMap.get(item.post.id));
    if (robot) return { ...item, robot };
  }
  return null;
}

export async function cleanupExpiredQuotePublishRuns() {
  if (!isDbConfigured()) return;
  const before = new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db().quotePublishRun.deleteMany({ where: { createdAt: { lt: before }, status: { in: ['SKIPPED', 'FAILED'] } } }).catch(() => undefined);
}
async function todaySucceeded() {
  const range = getPlatformDayRange();
  return db().quotePublishRun.count({ where: { status: 'SUCCEEDED', createdAt: { gte: range.start, lt: range.end } } });
}
async function recentSourceIds(config: QuotePublishConfig) {
  const since = new Date(Date.now() - config.repeatSourceCooldownHours * 3_600_000);
  const rows = await db().quotePublishRun.findMany({
    where: {
      sourcePostId: { not: null },
      createdAt: { gte: since },
      OR: [
        { status: { in: ['PENDING', 'SUCCEEDED'] } },
        { status: 'SKIPPED', skipReason: { in: SKIPPED_SOURCE_COOLDOWN_REASONS } },
      ],
    },
    select: { sourcePostId: true },
    take: 1500,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return Array.from(new Set(rows.map((row: any) => row.sourcePostId).filter(Boolean)));
}
async function candidates(config: QuotePublishConfig) {
  const excluded = await recentSourceIds(config);
  const since = new Date(Date.now() - config.candidateWindowHours * 3_600_000);
  const excludedFilter = excluded.length ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(excluded)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    WITH base AS (
      SELECT p."id", p."userId", p."title", p."content", p."location", p."countryCode", p."countryName", p."categoryMeta", p."shareCount", p."quoteCount", p."likeCount", p."viewCount", p."bumpedAt", p."createdAt", cat."id" AS "categoryId", cat."name" AS "categoryName", cat."slug" AS "categorySlug", COALESCE(score."recommendationScore", 0) AS "recommendationScore"
      FROM "Post" p
      INNER JOIN "User" author ON author."id" = p."userId"
      LEFT JOIN "Category" cat ON cat."id" = p."categoryId"
      LEFT JOIN "PostRankingScore" score ON score."postId" = p."id"
      WHERE p."isPublished" = true AND p."deletedAt" IS NULL AND p."quotedPostId" IS NULL AND author."userType"::text <> 'ROBOT' AND p."createdAt" >= ${since} ${excludedFilter}
      ORDER BY COALESCE(score."recommendationScore", 0) DESC, p."shareCount" DESC, p."quoteCount" DESC, p."likeCount" DESC, p."viewCount" DESC, p."bumpedAt" DESC, p."createdAt" DESC, p."id" DESC
      LIMIT ${CANDIDATE_SCAN_LIMIT}
    )
    SELECT b.*, COALESCE(hc."count", 0)::int AS "humanCommentCount", COALESCE(hq."count", 0)::int AS "humanQuoteCount", COALESCE(rc."count", 0)::int AS "robotCommentCount", COALESCE(rq."count", 0)::int AS "robotQuoteCount", rc."lastCommentAt" AS "robotLastCommentAt", rq."lastQuoteAt" AS "robotLastQuoteAt"
    FROM base b
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count" FROM "PostComment" c LEFT JOIN "User" u ON u."id" = c."userId" WHERE c."postId" = b."id" AND c."deletedAt" IS NULL AND COALESCE(c."source", '') <> ${COMMENT_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') hc ON true
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count" FROM "Post" q LEFT JOIN "User" u ON u."id" = q."userId" WHERE q."quotedPostId" = b."id" AND q."deletedAt" IS NULL AND COALESCE(q."source", '') <> ${QUOTE_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') hq ON true
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count", MAX("createdAt") AS "lastCommentAt" FROM "PostComment" WHERE "postId" = b."id" AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL) rc ON true
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count", MAX("createdAt") AS "lastQuoteAt" FROM "Post" WHERE "quotedPostId" = b."id" AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL) rq ON true
  `);
  const out: CandidatePost[] = [];
  for (const row of rows) {
    const post: CandidatePost = {
      id: row.id,
      userId: row.userId,
      title: row.title,
      content: row.content,
      location: row.location,
      countryCode: row.countryCode,
      countryName: row.countryName,
      categoryId: row.categoryId,
      categoryMeta: row.categoryMeta,
      shareCount: Number(row.shareCount || 0),
      quoteCount: Number(row.quoteCount || 0),
      likeCount: Number(row.likeCount || 0),
      viewCount: Number(row.viewCount || 0),
      recommendationScore: Number(row.recommendationScore || 0),
      createdAt: row.createdAt,
      bumpedAt: row.bumpedAt,
      category: row.categoryId ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug } as any : null,
      humanEngagement: {
        humanCommentCount: Number(row.humanCommentCount || 0),
        humanQuoteCount: Number(row.humanQuoteCount || 0),
        shareCount: Number(row.shareCount || 0),
        total: Number(row.humanCommentCount || 0) + Number(row.humanQuoteCount || 0) + Number(row.shareCount || 0),
      },
      robotCommentCount: Number(row.robotCommentCount || 0),
      robotQuoteCount: Number(row.robotQuoteCount || 0),
      robotLastCommentAt: row.robotLastCommentAt || null,
      robotLastQuoteAt: row.robotLastQuoteAt || null,
    };
    if (isLowSubstanceRobotSource(post)) continue;
    if (detectRobotReactionIntent(post) === 'unsupported') continue;
    if (saturated(config, post.humanEngagement!)) continue;
    if (recentRobotTouched(post)) continue;
    out.push(post);
  }
  return out;
}
async function robots(): Promise<RobotUser[]> {
  return db().user.findMany({ where: { userType: 'ROBOT', isDisabled: false }, select: { id: true, displayName: true, photoUrl: true, bio: true, userType: true, isDisabled: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 160 });
}
async function createRun(trigger: QuotePublishTrigger, model: string) {
  return db().quotePublishRun.create({ data: { trigger, status: 'PENDING', aiModel: model, startedAt: new Date() } });
}
async function finishRun(id: string, data: any) {
  const run = await db().quotePublishRun.update({ where: { id }, data: { ...data, finishedAt: new Date() } });
  const [item] = await enrichRuns([run]);
  return item;
}
async function markRunSideEffectError(id: string, message: string) {
  const run = await db().quotePublishRun.update({ where: { id }, data: { error: message.slice(0, 500), finishedAt: new Date() } });
  const [item] = await enrichRuns([run]);
  return item;
}
async function createQuotePost(sourcePost: CandidatePost, robot: RobotUser, content: string, signature: string, config: QuotePublishConfig) {
  const now = new Date();
  const post = await db().$transaction(async (tx: any) => {
    await lockPair(tx, sourcePost.id, robot.id);
    if (await alreadyTx(tx, sourcePost.id, robot.id)) throw new Error('robot_post_already_engaged');
    if (saturated(config, await engagement(sourcePost))) throw new Error('human_engagement_saturated');
    const created = await tx.post.create({
      data: {
        title: cut(content, 18) || '引用观点',
        content,
        location: normalizeLocation(sourcePost.location),
        countryCode: sourcePost.countryCode || null,
        countryName: sourcePost.countryName || null,
        contact: '',
        showContact: false,
        images: [],
        source: QUOTE_SOURCE,
        isAnonymous: false,
        isPublished: true,
        syncToTelegram: false,
        telegramSyncStatus: TELEGRAM_SYNC_STATUS_NONE as any,
        telegramSyncRequestedAt: null,
        telegramSyncLastError: null,
        quotedPost: { connect: { id: sourcePost.id } },
        ...(sourcePost.categoryId ? { category: { connect: { id: sourcePost.categoryId } } } : {}),
        ...(sourcePost.categoryMeta ? { categoryMeta: sourcePost.categoryMeta as Prisma.InputJsonValue } : {}),
        user: { connect: { id: robot.id } },
        createdAt: now,
        bumpedAt: now,
      },
      include: { category: true, quotedPost: true },
    });
    await tx.post.updateMany({ where: { id: sourcePost.id }, data: { quoteCount: { increment: 1 }, updatedAt: now } });
    await saveSignatureTx(tx, signature, content, sourcePost.id, robot.id);
    return created;
  });
  markQuotePublishPostChanged([post.id, sourcePost.id]);
  return post;
}
async function enrichRuns(runs: any[]) {
  const postIds = Array.from(new Set(runs.flatMap((run) => [run.sourcePostId, run.quotePostId]).filter(Boolean)));
  const userIds = Array.from(new Set(runs.map((run) => run.robotUserId).filter(Boolean)));
  const [posts, users] = await Promise.all([
    postIds.length ? db().post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true, content: true, categoryId: true, location: true, quotedPostId: true, isPublished: true, deletedAt: true, createdAt: true, user: { select: { id: true, displayName: true, userType: true } }, category: { select: { id: true, name: true, slug: true } } } }) : [],
    userIds.length ? db().user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, photoUrl: true, userType: true, isDisabled: true } }) : [],
  ]);
  const postMap = new Map(posts.map((post: any) => [post.id, post]));
  const userMap = new Map(users.map((user: any) => [user.id, user]));
  return runs.map((run) => ({ ...run, sourcePost: run.sourcePostId ? postMap.get(run.sourcePostId) || null : null, quotePost: run.quotePostId ? postMap.get(run.quotePostId) || null : null, robotUser: run.robotUserId ? userMap.get(run.robotUserId) || null : null }));
}

export async function listQuotePublishRuns(options: ListRunsOptions = {}) {
  if (!isDbConfigured()) return { items: [], nextCursor: null, hasMore: false };
  await cleanupExpiredQuotePublishRuns();
  const limit = Math.min(100, Math.max(1, Math.round(Number(options.limit) || 30)));
  const status = normalizeRunStatus(options.status);
  const parsedCursor = parseRunCursor(options.cursor);
  let cursorCreatedAt = parsedCursor?.createdAt || null;
  let cursorId = parsedCursor?.id || null;
  if (cursorId && !cursorCreatedAt) {
    const row = await db().quotePublishRun.findUnique({ where: { id: cursorId }, select: { id: true, createdAt: true } }).catch(() => null);
    cursorCreatedAt = row?.createdAt || null;
    cursorId = row?.id || cursorId;
  }
  const runs = await db().quotePublishRun.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(cursorCreatedAt ? { OR: [{ createdAt: { lt: cursorCreatedAt } }, { createdAt: cursorCreatedAt, id: { lt: cursorId || '' } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = runs.length > limit;
  const items = hasMore ? runs.slice(0, limit) : runs;
  return { items: await enrichRuns(items), nextCursor: hasMore ? runCursor(items[items.length - 1]) : null, hasMore };
}
export async function getQuotePublishRunStats() {
  const empty = { total: 0, statuses: { PENDING: 0, SUCCEEDED: 0, SKIPPED: 0, FAILED: 0 } as Record<QuotePublishRunStatus, number>, latestRun: null as any };
  if (!isDbConfigured()) return empty;
  await cleanupExpiredQuotePublishRuns();
  const [grouped, latestRuns] = await Promise.all([db().quotePublishRun.groupBy({ by: ['status'], _count: { _all: true } }), db().quotePublishRun.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 })]);
  const statuses = { ...empty.statuses };
  for (const row of grouped) {
    const status = normalizeRunStatus(row.status);
    if (status) statuses[status] = Number(row._count?._all || 0);
  }
  const [latestRun] = await enrichRuns(latestRuns);
  return { total: Object.values(statuses).reduce((sum, count) => sum + count, 0), statuses, latestRun: latestRun || null };
}
export async function runQuotePublishOnce(options: RunOptions = {}) {
  if (!isDbConfigured()) throw new Error('Database is not configured');
  await cleanupExpiredQuotePublishRuns();
  const trigger = options.trigger || 'MANUAL';
  const config = await getQuotePublishConfig({ force: true });
  const aiRuntime = await getAutomationAiRuntime('quote', { force: true }).catch(() => null);
  const run = await createRun(trigger, aiRuntime?.model || 'platform-ai');
  let sourcePost: CandidatePost | null = null;
  let robot: RobotUser | null = null;
  let content: string | null = null;
  let score: number | null = null;
  try {
    if (!config.enabled && !options.force) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'disabled' });
    if (!aiRuntime?.ready) return finishRun(run.id, { status: 'SKIPPED', skipReason: aiRuntime?.disabledReason || 'platform_ai_not_ready' });
    const taskLock = await withAutomationTaskLock(
      QUOTE_TASK_LOCK_NAME,
      { ttlMs: QUOTE_TASK_LOCK_TTL_MS, metadata: { trigger, runId: run.id }, force: options.force },
      async () => {
        if (config.dailyLimit <= 0) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'daily_limit_zero' });
        if (await todaySucceeded() >= config.dailyLimit) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'daily_limit_reached' });
        const [availableRobots, availablePosts] = await Promise.all([robots(), candidates(config)]);
        if (!availableRobots.length) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'no_available_robot' });
        if (!availablePosts.length) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'no_quality_candidate_post' });
        const selected = await pickSourceAndRobot(availablePosts, availableRobots);
        if (!selected) return finishRun(run.id, { status: 'SKIPPED', skipReason: 'no_robot_without_prior_engagement' });
        sourcePost = selected.post;
        robot = selected.robot;
        const reaction = await generateBestRobotReaction({ post: sourcePost as RobotReactionPost, robot, mode: 'quote', recentContents: await recentContents(), allowRuleFallback: false });
        if (!reaction) return finishRun(run.id, { status: 'SKIPPED', sourcePostId: sourcePost.id, robotUserId: robot.id, skipReason: 'no_quality_reaction' });
        const quality = scoreRobotReaction(sourcePost as RobotReactionPost, reaction, 'quote');
        content = reaction.content;
        score = quality.score;
        const signature = robotReactionSignature(content);
        if (!quality.ok) return finishRun(run.id, { status: 'SKIPPED', sourcePostId: sourcePost.id, robotUserId: robot.id, candidateScore: quality.score, generatedContent: content, skipReason: quality.reason || reaction.reason || 'quality_gate_rejected' });
        if (await recentSignature(signature)) return finishRun(run.id, { status: 'SKIPPED', sourcePostId: sourcePost.id, robotUserId: robot.id, candidateScore: quality.score, generatedContent: content, skipReason: 'content_signature_recently_used' });
        const quotePost = await createQuotePost(sourcePost, robot, content, signature, config);
        let result = await finishRun(run.id, { status: 'SUCCEEDED', sourcePostId: sourcePost.id, quotePostId: quotePost.id, robotUserId: robot.id, generatedContent: content, candidateScore: quality.score });
        try {
          await options.afterPostCreated?.({ post: quotePost, user: robot, req: options.req });
        } catch (error: any) {
          const message = `after_post_created_failed: ${clean(error?.message || error, 430)}`;
          result = await markRunSideEffectError(run.id, message);
        }
        return result;
      },
    );
    if (!taskLock.acquired) {
      const skippedRun = await finishRun(run.id, { status: 'SKIPPED', skipReason: 'another_instance_running' });
      return { ...skippedRun, lock: taskLock.lock };
    }
    return taskLock.result;
  } catch (error: any) {
    const message = clean(error?.message || error, 500);
    const skipped = ['robot_post_already_engaged', 'human_engagement_saturated'].includes(message);
    return finishRun(run.id, { status: skipped ? 'SKIPPED' : 'FAILED', sourcePostId: sourcePost?.id || null, robotUserId: robot?.id || null, generatedContent: content, candidateScore: score, skipReason: skipped ? message : null, error: skipped ? null : message });
  }
}
export async function getQuotePublishStatus() {
  const [config, platformAi, lock, stats, latest, heartbeats] = await Promise.all([
    getQuotePublishConfig({ force: true }),
    getAutomationAiRuntime('quote', { force: true }),
    getAutomationTaskLock(QUOTE_TASK_LOCK_NAME).catch(() => null),
    getQuotePublishRunStats().catch(() => ({ statuses: {} } as any)),
    listQuotePublishRuns({ limit: 1 }).catch(() => ({ items: [] as any[] })),
    listAutomationHeartbeats({ module: 'quote_publish', limit: 5 }).catch(() => [] as any[]),
  ]);
  const usedToday = await todaySucceeded().catch(() => Number(stats.statuses?.SUCCEEDED || 0));
  const disabledReason = !config.enabled
    ? 'disabled'
    : !platformAi.ready
      ? platformAi.disabledReason || 'platform_ai_not_ready'
      : usedToday >= config.dailyLimit
        ? 'daily_limit_reached'
        : '';
  return {
    enabled: config.enabled,
    canAutoQuote: !disabledReason,
    disabledReason,
    config,
    platformAi: {
      ready: platformAi.ready,
      provider: platformAi.provider,
      model: platformAi.model,
      source: platformAi.source,
      disabledReason: platformAi.disabledReason,
    },
    lock: lock as AutomationTaskLockDetails | null,
    today: {
      succeeded: usedToday,
      skipped: Number(stats.statuses?.SKIPPED || 0),
      failed: Number(stats.statuses?.FAILED || 0),
      dailyLimit: config.dailyLimit,
      remaining: Math.max(0, config.dailyLimit - usedToday),
    },
    latestRun: latest.items?.[0] || null,
    heartbeats,
    lastHeartbeat: heartbeats[0] || null,
    generatedAt: new Date().toISOString(),
  };
}
