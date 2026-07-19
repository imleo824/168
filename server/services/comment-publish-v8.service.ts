import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma from '../db';
import { getPlatformDayRange } from '../platform-time';
import { PostService } from '../post.service';
import { bumpPublicFeedCacheVersion, clearPublicFeedResultCache } from '../public-feed-cache';
import {
  detectRobotReactionIntent,
  isLowSubstanceRobotSource,
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
import {
  attachInteractionAutomationExecutionEvents,
  logInteractionAutomationEvent,
} from './interaction-automation-execution-log.service';

export type CommentPublishRunStatus = 'PENDING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED';

type RobotUser = RobotReactionUser;
type HumanEngagement = { humanCommentCount: number; humanQuoteCount: number; shareCount: number; total: number };
type CandidatePost = RobotReactionPost & {
  id: string;
  userId: string;
  categoryId?: string | null;
  shareCount?: number | null;
  viewCount?: number | null;
  humanEngagement?: HumanEngagement;
  robotCommentCount?: number;
  robotLastCommentAt?: Date | null;
  robotLastQuoteAt?: Date | null;
};
type ListCommentRunsOptions = { status?: CommentPublishRunStatus; limit?: number; cursor?: string };

export interface CommentPublishConfig {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  dailyLimit: number;
  maxPerPost: number;
  recentDays: number;
  categoryIds: string[];
  robotUserIds: string[];
  humanCommentSkipThreshold: number;
  humanQuoteSkipThreshold: number;
  humanShareSkipThreshold: number;
  humanTotalEngagementSkipThreshold: number;
}

export const DEFAULT_COMMENT_PUBLISH_CONFIG: CommentPublishConfig = {
  enabled: false,
  intervalMinutes: 120,
  batchSize: 1,
  dailyLimit: 12,
  maxPerPost: 1,
  recentDays: 7,
  categoryIds: [],
  robotUserIds: [],
  humanCommentSkipThreshold: 3,
  humanQuoteSkipThreshold: 2,
  humanShareSkipThreshold: 5,
  humanTotalEngagementSkipThreshold: 6,
};

const COMMENT_SOURCE = 'comment_publish_robot';
const QUOTE_SOURCE = 'quote_publish_robot';
const COMMENT_TASK_LOCK_NAME = 'comment_publish';
const COMMENT_TASK_LOCK_TTL_MS = 20 * 60 * 1000;
const SIGNATURE_DAYS = 14;
const RECENT_ROBOT_ENGAGEMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CANDIDATE_SCAN_LIMIT = 180;
const RUN_STATUSES = new Set<CommentPublishRunStatus>(['PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED']);

function db() { return prisma as any; }
function parseJson(raw: unknown) { if (!raw) return null; if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>; try { const parsed = JSON.parse(String(raw)); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; } }
function bool(v: unknown, fallback: boolean) { if (typeof v === 'boolean') return v; const s = String(v ?? '').trim().toLowerCase(); if (['true', '1', 'yes', 'on', '启用', '开启'].includes(s)) return true; if (['false', '0', 'no', 'off', '关闭', '停用'].includes(s)) return false; return fallback; }
function int(v: unknown, fallback: number) { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : fallback; }
function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min))); }
function list(v: unknown, fallback: string[]) { if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 200); if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 200); return fallback; }
function hasOwn(value: Record<string, unknown>, key: keyof CommentPublishConfig) { return Object.prototype.hasOwnProperty.call(value, key); }
function normalize(raw: unknown, fallback: CommentPublishConfig = DEFAULT_COMMENT_PUBLISH_CONFIG): CommentPublishConfig {
  const v = parseJson(raw) || {};
  const next = {
    enabled: hasOwn(v, 'enabled') ? bool(v.enabled, fallback.enabled) : fallback.enabled,
    intervalMinutes: hasOwn(v, 'intervalMinutes') ? int(v.intervalMinutes, fallback.intervalMinutes) : fallback.intervalMinutes,
    batchSize: hasOwn(v, 'batchSize') ? int(v.batchSize, fallback.batchSize) : fallback.batchSize,
    dailyLimit: hasOwn(v, 'dailyLimit') ? int(v.dailyLimit, fallback.dailyLimit) : fallback.dailyLimit,
    maxPerPost: hasOwn(v, 'maxPerPost') ? int(v.maxPerPost, fallback.maxPerPost) : fallback.maxPerPost,
    recentDays: hasOwn(v, 'recentDays') ? int(v.recentDays, fallback.recentDays) : fallback.recentDays,
    categoryIds: hasOwn(v, 'categoryIds') ? list(v.categoryIds, fallback.categoryIds) : fallback.categoryIds,
    robotUserIds: hasOwn(v, 'robotUserIds') ? list(v.robotUserIds, fallback.robotUserIds) : fallback.robotUserIds,
    humanCommentSkipThreshold: hasOwn(v, 'humanCommentSkipThreshold') ? int(v.humanCommentSkipThreshold, fallback.humanCommentSkipThreshold) : fallback.humanCommentSkipThreshold,
    humanQuoteSkipThreshold: hasOwn(v, 'humanQuoteSkipThreshold') ? int(v.humanQuoteSkipThreshold, fallback.humanQuoteSkipThreshold) : fallback.humanQuoteSkipThreshold,
    humanShareSkipThreshold: hasOwn(v, 'humanShareSkipThreshold') ? int(v.humanShareSkipThreshold, fallback.humanShareSkipThreshold) : fallback.humanShareSkipThreshold,
    humanTotalEngagementSkipThreshold: hasOwn(v, 'humanTotalEngagementSkipThreshold') ? int(v.humanTotalEngagementSkipThreshold, fallback.humanTotalEngagementSkipThreshold) : fallback.humanTotalEngagementSkipThreshold,
  };
  return {
    ...next,
    intervalMinutes: clamp(next.intervalMinutes, 30, 720),
    batchSize: clamp(next.batchSize, 1, 3),
    dailyLimit: clamp(next.dailyLimit, 0, 50),
    maxPerPost: clamp(next.maxPerPost, 1, 2),
    recentDays: clamp(next.recentDays, 1, 14),
    humanCommentSkipThreshold: clamp(next.humanCommentSkipThreshold, 0, 20),
    humanQuoteSkipThreshold: clamp(next.humanQuoteSkipThreshold, 0, 20),
    humanShareSkipThreshold: clamp(next.humanShareSkipThreshold, 0, 100),
    humanTotalEngagementSkipThreshold: clamp(next.humanTotalEngagementSkipThreshold, 0, 100),
  };
}
function hit(v: number, t: number) { return Number(t || 0) > 0 && v >= t; }
function saturated(c: CommentPublishConfig, e: HumanEngagement) { return hit(e.humanCommentCount, c.humanCommentSkipThreshold) || hit(e.humanQuoteCount, c.humanQuoteSkipThreshold) || hit(e.shareCount, c.humanShareSkipThreshold) || hit(e.total, c.humanTotalEngagementSkipThreshold); }
function hashValue(seed: string) { let h = 0; for (const ch of seed) h = ((h << 5) - h + ch.charCodeAt(0)) | 0; return Math.abs(h); }
function hashIndex(seed: string, max: number) { return hashValue(seed) % Math.max(1, max); }
function runCursor(row: { createdAt?: Date | string | null; id?: string | null }) { const d = row.createdAt ? new Date(row.createdAt) : null; return d && row.id ? `${d.toISOString()}|${row.id}` : null; }
function parseRunCursor(raw?: string) { const cursor = String(raw || '').trim(); if (!cursor) return null; const [datePart, idPart] = cursor.includes('|') ? cursor.split('|') : ['', cursor]; const date = datePart ? new Date(datePart) : null; return { createdAt: date && !Number.isNaN(date.getTime()) ? date : null, id: String(idPart || cursor).trim() || null }; }
function recentRobotTouched(post: CandidatePost) { const cutoff = Date.now() - RECENT_ROBOT_ENGAGEMENT_COOLDOWN_MS; return [post.robotLastCommentAt, post.robotLastQuoteAt].some((value) => value && new Date(value).getTime() >= cutoff); }

export async function getCommentPublishConfig() {
  const row = await db().systemConfig.findUnique({ where: { key: 'comment_publish_config' } }).catch(() => null);
  return normalize(row?.value);
}
export async function updateCommentPublishConfig(config: Partial<CommentPublishConfig> & { model?: unknown; aiModel?: unknown }) {
  const current = await getCommentPublishConfig();
  const { model: _model, aiModel: _aiModel, ...safeConfig } = config || {};
  const next = normalize(safeConfig, current);
  await db().systemConfig.upsert({ where: { key: 'comment_publish_config' }, update: { value: JSON.stringify(next) }, create: { key: 'comment_publish_config', value: JSON.stringify(next) } });
  return next;
}
export const saveCommentPublishConfig = updateCommentPublishConfig;

async function createRun(input: { postId?: string | null; robotUserId?: string | null; status: CommentPublishRunStatus; reason?: string | null; content?: string | null; commentId?: string | null; contentSignature?: string | null; qualityScore?: number | null }) {
  const id = `comment_run_${randomUUID()}`;
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "CommentPublishRun" ("id", "postId", "robotUserId", "status", "reason", "content", "commentId", "contentSignature", "qualityScore", "createdAt", "updatedAt") VALUES (${id}, ${input.postId || null}, ${input.robotUserId || null}, ${input.status}, ${input.reason || null}, ${input.content || null}, ${input.commentId || null}, ${input.contentSignature || null}, ${input.qualityScore ?? null}, NOW(), NOW())`);
  await logInteractionAutomationEvent({
    module: 'comment_publish',
    runId: id,
    level: input.status === 'FAILED' ? 'error' : 'info',
    phase: 'run_finished',
    message: input.status === 'SUCCEEDED' ? '自动评论发布成功' : input.status === 'SKIPPED' ? '自动评论跳过' : '自动评论失败',
    status: input.status,
    reason: input.reason || null,
    postId: input.postId || null,
    robotUserId: input.robotUserId || null,
    details: {
      commentId: input.commentId || null,
      content: input.content || null,
      contentSignature: input.contentSignature || null,
      qualityScore: input.qualityScore ?? null,
    },
  });
  return id;
}
async function todayCount() { const r = getPlatformDayRange(); const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "CommentPublishRun" WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end} AND "status" = 'SUCCEEDED'`); return Number(rows[0]?.count || 0); }
async function robots(c: CommentPublishConfig): Promise<RobotUser[]> { const where: any = { userType: 'ROBOT', isDisabled: false }; if (c.robotUserIds.length) where.id = { in: c.robotUserIds }; return db().user.findMany({ where, select: { id: true, displayName: true, bio: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 200 }); }
async function readHumanEngagement(postId: string, shareCount?: number | null): Promise<HumanEngagement> {
  const rows = await prisma.$queryRaw<Array<{ humanCommentCount: bigint; humanQuoteCount: bigint }>>(Prisma.sql`SELECT (SELECT COUNT(*) FROM "PostComment" c LEFT JOIN "User" u ON u."id" = c."userId" WHERE c."postId" = ${postId} AND c."deletedAt" IS NULL AND COALESCE(c."source", '') <> ${COMMENT_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') AS "humanCommentCount", (SELECT COUNT(*) FROM "Post" q LEFT JOIN "User" u ON u."id" = q."userId" WHERE q."quotedPostId" = ${postId} AND q."deletedAt" IS NULL AND COALESCE(q."source", '') <> ${QUOTE_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') AS "humanQuoteCount"`);
  const humanCommentCount = Number(rows[0]?.humanCommentCount || 0);
  const humanQuoteCount = Number(rows[0]?.humanQuoteCount || 0);
  const share = Number(shareCount || 0);
  return { humanCommentCount, humanQuoteCount, shareCount: share, total: humanCommentCount + humanQuoteCount + share };
}
async function posts(c: CommentPublishConfig): Promise<CandidatePost[]> {
  const since = new Date(Date.now() - c.recentDays * 24 * 60 * 60 * 1000);
  const categoryFilter = c.categoryIds.length ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(c.categoryIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    WITH base AS (
      SELECT p."id", p."userId", p."title", p."content", p."categoryId", p."shareCount", p."quoteCount", p."likeCount", p."viewCount", COALESCE(prs."recommendationScore", 0) AS "recommendationScore", p."createdAt", c."name" AS "categoryName", c."slug" AS "categorySlug"
      FROM "Post" p
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      LEFT JOIN "PostRankingScore" prs ON prs."postId" = p."id"
      LEFT JOIN "User" u ON u."id" = p."userId"
      WHERE p."isPublished" = TRUE
        AND p."deletedAt" IS NULL
        AND p."createdAt" >= ${since}
        AND COALESCE(p."source", '') <> ${COMMENT_SOURCE}
        AND COALESCE(p."source", '') <> ${QUOTE_SOURCE}
        AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT'
        ${categoryFilter}
      ORDER BY COALESCE(prs."recommendationScore", 0) DESC, p."createdAt" DESC
      LIMIT ${CANDIDATE_SCAN_LIMIT}
    )
    SELECT b.*, COALESCE(hc."count", 0)::int AS "humanCommentCount", COALESCE(hq."count", 0)::int AS "humanQuoteCount", COALESCE(rc."count", 0)::int AS "robotCommentCount", rc."lastCommentAt" AS "robotLastCommentAt", rq."lastQuoteAt" AS "robotLastQuoteAt"
    FROM base b
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count" FROM "PostComment" pc LEFT JOIN "User" u ON u."id" = pc."userId" WHERE pc."postId" = b."id" AND pc."deletedAt" IS NULL AND COALESCE(pc."source", '') <> ${COMMENT_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') hc ON true
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count" FROM "Post" q LEFT JOIN "User" u ON u."id" = q."userId" WHERE q."quotedPostId" = b."id" AND q."deletedAt" IS NULL AND COALESCE(q."source", '') <> ${QUOTE_SOURCE} AND COALESCE(u."userType"::text, 'USER') <> 'ROBOT') hq ON true
    LEFT JOIN LATERAL (SELECT COUNT(*)::bigint AS "count", MAX("createdAt") AS "lastCommentAt" FROM "PostComment" WHERE "postId" = b."id" AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL) rc ON true
    LEFT JOIN LATERAL (SELECT MAX("createdAt") AS "lastQuoteAt" FROM "Post" WHERE "quotedPostId" = b."id" AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL) rq ON true
  `);
  const out: CandidatePost[] = [];
  for (const row of rows) {
    const post: CandidatePost = { id: row.id, userId: row.userId, title: row.title, content: row.content, categoryId: row.categoryId, category: row.categoryId ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug } as any : null, shareCount: Number(row.shareCount || 0), humanEngagement: { humanCommentCount: Number(row.humanCommentCount || 0), humanQuoteCount: Number(row.humanQuoteCount || 0), shareCount: Number(row.shareCount || 0), total: Number(row.humanCommentCount || 0) + Number(row.humanQuoteCount || 0) + Number(row.shareCount || 0) }, robotCommentCount: Number(row.robotCommentCount || 0), robotLastCommentAt: row.robotLastCommentAt || null, robotLastQuoteAt: row.robotLastQuoteAt || null };
    if (isLowSubstanceRobotSource(post)) continue;
    if (detectRobotReactionIntent(post) === 'unsupported') continue;
    if (saturated(c, post.humanEngagement!)) continue;
    if (Number(post.robotCommentCount || 0) >= c.maxPerPost) continue;
    if (recentRobotTouched(post)) continue;
    out.push(post);
  }
  return shuffleCandidates(out);
}
function shuffleCandidates(items: CandidatePost[]) { return items.map((post) => ({ post, score: Math.random() + Math.log(Number(post.viewCount || 0) + 1) / 10 })).sort((a, b) => b.score - a.score).map((item) => item.post); }
async function engagedIds(postId: string) {
  const rows = await prisma.$queryRaw<Array<{ robotId: string }>>(Prisma.sql`SELECT DISTINCT "userId" AS "robotId" FROM "PostComment" WHERE "postId" = ${postId} AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL UNION SELECT DISTINCT "userId" AS "robotId" FROM "Post" WHERE "quotedPostId" = ${postId} AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL`);
  return new Set(rows.map((r) => r.robotId).filter(Boolean));
}
async function pickRobot(post: CandidatePost, all: RobotUser[]) {
  const used = await engagedIds(post.id);
  const available = all.filter((r) => r.id !== post.userId && !used.has(r.id));
  return available.length ? available[hashIndex(`${post.id}:${available.length}:${Date.now()}`, available.length)] : null;
}
async function lockPair(tx: any, postId: string, robotId: string) { await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${postId}), hashtext(${robotId}))`); }
async function alreadyTx(tx: any, postId: string, robotId: string) {
  const rows = await tx.$queryRaw(Prisma.sql`SELECT (SELECT COUNT(*) FROM "PostComment" WHERE "postId" = ${postId} AND "userId" = ${robotId} AND "source" = ${COMMENT_SOURCE} AND "deletedAt" IS NULL) + (SELECT COUNT(*) FROM "Post" WHERE "quotedPostId" = ${postId} AND "userId" = ${robotId} AND "source" = ${QUOTE_SOURCE} AND "deletedAt" IS NULL) AS "count"`) as Array<{ count: bigint }>;
  return Number(rows[0]?.count || 0) > 0;
}
async function recentSig(signature: string) {
  const since = new Date(Date.now() - SIGNATURE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "RobotContentSignature" WHERE "module" IN ('comment_publish', 'quote_publish') AND "signature" = ${signature} AND "createdAt" >= ${since}`);
  return Number(rows[0]?.count || 0) > 0;
}
async function recentContents(limit = 12) {
  const since = new Date(Date.now() - SIGNATURE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ content: string | null }>>(Prisma.sql`SELECT "content" FROM "RobotContentSignature" WHERE "module" IN ('comment_publish', 'quote_publish') AND "createdAt" >= ${since} ORDER BY "createdAt" DESC LIMIT ${limit}`);
  return rows.map((row) => String(row.content || '').trim()).filter(Boolean);
}
async function saveSig(tx: any, signature: string, content: string, postId: string, robotId: string) { await tx.$executeRaw(Prisma.sql`INSERT INTO "RobotContentSignature" ("id", "module", "signature", "content", "postId", "robotUserId", "createdAt") VALUES (${`signature_${randomUUID()}`}, 'comment_publish', ${signature}, ${content}, ${postId}, ${robotId}, NOW())`); }
function markCommentPublishPostChanged(postId: string) { bumpPublicFeedCacheVersion('comment_publish'); clearPublicFeedResultCache(); PostService.schedulePostRankingRefresh(postId); }

async function publish(c: CommentPublishConfig, post: CandidatePost, robot: RobotUser) {
  const reaction = await generateBestRobotReaction({ post, robot, mode: 'comment', recentContents: await recentContents(), allowRuleFallback: false });
  if (!reaction) { await createRun({ postId: post.id, robotUserId: robot.id, status: 'SKIPPED', reason: 'no_quality_reaction' }); return { status: 'SKIPPED' as const }; }
  const quality = scoreRobotReaction(post, reaction, 'comment');
  if (!quality.ok) { await createRun({ postId: post.id, robotUserId: robot.id, status: 'SKIPPED', reason: quality.reason || reaction.reason || 'quality_gate_rejected', content: reaction.content, contentSignature: reaction.signature, qualityScore: quality.score }); return { status: 'SKIPPED' as const }; }
  if (await recentSig(reaction.signature)) { await createRun({ postId: post.id, robotUserId: robot.id, status: 'SKIPPED', reason: 'content_signature_recently_used', content: reaction.content, contentSignature: reaction.signature, qualityScore: quality.score }); return { status: 'SKIPPED' as const }; }
  const commentId = `comment_${randomUUID()}`;
  try {
    await prisma.$transaction(async (tx) => {
      await lockPair(tx, post.id, robot.id);
      if (await alreadyTx(tx, post.id, robot.id)) throw new Error('robot_post_already_engaged');
      if (saturated(c, await readHumanEngagement(post.id, post.shareCount))) throw new Error('human_engagement_saturated');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PostComment" ("id", "postId", "userId", "content", "source", "createdAt", "updatedAt") VALUES (${commentId}, ${post.id}, ${robot.id}, ${reaction.content}, ${COMMENT_SOURCE}, NOW(), NOW())`);
      await tx.$executeRaw(Prisma.sql`UPDATE "Post" SET "commentCount" = COALESCE("commentCount", 0) + 1, "updatedAt" = NOW() WHERE "id" = ${post.id}`);
      await saveSig(tx, reaction.signature, reaction.content, post.id, robot.id);
    });
    markCommentPublishPostChanged(post.id);
    await createRun({ postId: post.id, robotUserId: robot.id, status: 'SUCCEEDED', content: reaction.content, commentId, contentSignature: reaction.signature, qualityScore: quality.score });
    return { status: 'SUCCEEDED' as const };
  } catch (error: any) {
    const reason = String(error?.message || 'create_comment_failed').slice(0, 200);
    const skipped = ['robot_post_already_engaged', 'human_engagement_saturated'].includes(reason);
    await createRun({ postId: post.id, robotUserId: robot.id, status: skipped ? 'SKIPPED' : 'FAILED', reason, content: reaction.content, contentSignature: reaction.signature, qualityScore: quality.score });
    return { status: skipped ? 'SKIPPED' as const : 'FAILED' as const };
  }
}

async function runCommentPublishLocked(c: CommentPublishConfig) {
  const usedToday = await todayCount();
  if (c.dailyLimit <= 0 || usedToday >= c.dailyLimit) return { enabled: c.enabled, created: 0, skipped: 0, failed: 0, reason: 'daily_limit_reached' };
  const [allRobots, allPosts] = await Promise.all([robots(c), posts(c)]);
  if (!allRobots.length || !allPosts.length) { const reason = !allRobots.length ? 'no_robot_user' : 'no_quality_candidate_post'; await createRun({ status: 'SKIPPED', reason }); return { enabled: c.enabled, created: 0, skipped: 1, failed: 0, reason }; }
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const limit = Math.min(c.batchSize, c.dailyLimit - usedToday, allPosts.length);
  for (let i = 0; i < limit; i += 1) { const post = allPosts[i]; const robot = await pickRobot(post, allRobots); if (!robot) { await createRun({ postId: post.id, status: 'SKIPPED', reason: 'no_robot_without_prior_engagement' }); skipped += 1; continue; } const result = await publish(c, post, robot); if (result.status === 'SUCCEEDED') created += 1; else if (result.status === 'FAILED') failed += 1; else skipped += 1; }
  return { enabled: c.enabled, created, skipped, failed };
}

export async function runCommentPublishOnce(inputConfig?: Partial<CommentPublishConfig>, options: { force?: boolean; trigger?: 'MANUAL' | 'SCHEDULED' } = {}) {
  const stored = await getCommentPublishConfig();
  const normalizedInput = inputConfig ? normalize(inputConfig, stored) : stored;
  const c = options.force ? { ...normalizedInput, enabled: true } : normalizedInput;
  if (!c.enabled) return { enabled: false, created: 0, skipped: 0, failed: 0, reason: 'disabled' };
  const aiRuntime = await getAutomationAiRuntime('comment', { force: true });
  if (!aiRuntime.ready) { await createRun({ status: 'SKIPPED', reason: aiRuntime.disabledReason || 'platform_ai_not_ready' }); return { enabled: c.enabled, created: 0, skipped: 1, failed: 0, reason: aiRuntime.disabledReason || 'platform_ai_not_ready', platformAi: aiRuntime }; }
  const trigger = options.trigger || (inputConfig ? 'MANUAL' : 'SCHEDULED');
  const taskLock = await withAutomationTaskLock(COMMENT_TASK_LOCK_NAME, { ttlMs: COMMENT_TASK_LOCK_TTL_MS, metadata: { trigger }, force: options.force }, () => runCommentPublishLocked(c));
  if (!taskLock.acquired) { await createRun({ status: 'SKIPPED', reason: 'another_instance_running' }); return { enabled: c.enabled, created: 0, skipped: 1, failed: 0, reason: 'another_instance_running', lock: taskLock.lock as AutomationTaskLockDetails | null }; }
  return taskLock.result;
}

export async function listCommentPublishRuns(options: number | ListCommentRunsOptions = 30) {
  const o = typeof options === 'number' ? { limit: options } : options;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(o.limit || 30))));
  const status = String(o.status || '').trim().toUpperCase() as CommentPublishRunStatus;
  const safeStatus = RUN_STATUSES.has(status) ? status : null;
  const parsedCursor = parseRunCursor(o.cursor);
  let cursorCreatedAt = parsedCursor?.createdAt || null;
  let cursorId = parsedCursor?.id || null;
  if (cursorId && !cursorCreatedAt) {
    const cursorRows = await prisma.$queryRaw<Array<{ createdAt: Date; id: string }>>(Prisma.sql`SELECT "createdAt", "id" FROM "CommentPublishRun" WHERE "id" = ${cursorId} LIMIT 1`);
    cursorCreatedAt = cursorRows[0]?.createdAt || null;
    cursorId = cursorRows[0]?.id || cursorId;
  }
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT r.*, p."title" AS "postTitle", p."content" AS "postContent", p."categoryId" AS "postCategoryId", c."name" AS "postCategoryName", u."displayName" AS "robotName" FROM "CommentPublishRun" r LEFT JOIN "Post" p ON p."id" = r."postId" LEFT JOIN "Category" c ON c."id" = p."categoryId" LEFT JOIN "User" u ON u."id" = r."robotUserId" WHERE (${safeStatus || null}::text IS NULL OR r."status" = ${safeStatus || null}) AND (${cursorCreatedAt || null}::timestamp IS NULL OR r."createdAt" < ${cursorCreatedAt || null} OR (r."createdAt" = ${cursorCreatedAt || null} AND r."id" < ${cursorId || null})) ORDER BY r."createdAt" DESC, r."id" DESC LIMIT ${limit + 1}`);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items: await attachInteractionAutomationExecutionEvents('comment_publish', items), hasMore, nextCursor: hasMore ? runCursor(items[items.length - 1]) : null };
}

export async function getCommentPublishRunStats() {
  const r = getPlatformDayRange();
  const rows = await prisma.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`SELECT "status", COUNT(*)::bigint AS "count" FROM "CommentPublishRun" WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end} GROUP BY "status"`);
  return rows.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.count || 0) }), {} as Record<string, number>);
}

export async function getCommentPublishStatus() {
  const [config, platformAi, lock, stats, latestResult, heartbeats] = await Promise.all([
    getCommentPublishConfig(),
    getAutomationAiRuntime('comment', { force: true }),
    getAutomationTaskLock(COMMENT_TASK_LOCK_NAME).catch(() => null),
    getCommentPublishRunStats().catch(() => ({} as Record<string, number>)),
    listCommentPublishRuns({ limit: 1 }).catch(() => ({ items: [] as any[] })),
    listAutomationHeartbeats({ module: 'comment_publish', limit: 5 }).catch(() => [] as any[]),
  ]);
  const usedToday = Number(stats.SUCCEEDED || 0);
  const disabledReason = !config.enabled ? 'disabled' : !platformAi.ready ? platformAi.disabledReason || 'platform_ai_not_ready' : usedToday >= config.dailyLimit ? 'daily_limit_reached' : '';
  return {
    enabled: config.enabled,
    canAutoComment: !disabledReason,
    disabledReason,
    config,
    platformAi: { ready: platformAi.ready, provider: platformAi.provider, model: platformAi.model, source: platformAi.source, disabledReason: platformAi.disabledReason },
    lock,
    today: { succeeded: usedToday, skipped: Number(stats.SKIPPED || 0), failed: Number(stats.FAILED || 0), dailyLimit: config.dailyLimit, remaining: Math.max(0, config.dailyLimit - usedToday) },
    latestRun: latestResult.items?.[0] || null,
    heartbeats,
    lastHeartbeat: heartbeats[0] || null,
    generatedAt: new Date().toISOString(),
  };
}
