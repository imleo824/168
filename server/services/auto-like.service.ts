import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma from '../db';
import { getPlatformDayRange } from '../platform-time';
import { withAutomationTaskLock, type AutomationTaskLockDetails } from './automation-task-lock.service';

export type AutoLikeTrigger = 'MANUAL' | 'SCHEDULED' | 'STARTUP_HEALTH_CHECK';
export type AutoLikeRunStatus = 'SUCCEEDED' | 'SKIPPED' | 'FAILED';

export interface AutoLikeConfig {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  dailyLimit: number;
  recentDays: number;
  maxLikesPerPost: number;
  maxLikesPerRobotPerDay: number;
  categoryIds: string[];
  robotUserIds: string[];
}

export type AutoLikeRunResult = {
  enabled: boolean;
  trigger: AutoLikeTrigger;
  liked: number;
  boosted: number;
  skipped: number;
  failed: number;
  reason?: string | null;
  lastPostId?: string | null;
  lastRobotUserId?: string | null;
  lock?: AutomationTaskLockDetails | null;
};

export type AutoLikeStats = {
  enabled: boolean;
  todayLiked: number;
  todayBoosted: number;
  todayRobotUsers: number;
  todayPosts: number;
  todayRunSucceeded: number;
  todayRunSkipped: number;
  todayRunFailed: number;
  robotUserCount: number;
  candidatePostCount: number;
  latestRun: (AutoLikeRunResult & { finishedAt: string }) | null;
};

type ListAutoLikeRunsOptions = { status?: AutoLikeRunStatus; limit?: number; cursor?: string };

const CONFIG_KEY = 'auto_like_config';
const AUTO_LIKE_TASK_LOCK_NAME = 'auto_like';
const AUTO_LIKE_TASK_LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_ROBOTS = 500;
const MAX_CANDIDATES = 240;
const RUN_STATUSES = new Set<AutoLikeRunStatus>(['SUCCEEDED', 'SKIPPED', 'FAILED']);

export const DEFAULT_AUTO_LIKE_CONFIG: AutoLikeConfig = {
  enabled: false,
  intervalMinutes: 120,
  batchSize: 10,
  dailyLimit: 200,
  recentDays: 7,
  maxLikesPerPost: 8,
  maxLikesPerRobotPerDay: 30,
  categoryIds: [],
  robotUserIds: [],
};

let latestRun: AutoLikeStats['latestRun'] = null;

function db() { return prisma as any; }
function parseJson(raw: unknown) { if (!raw) return null; if (typeof raw === 'object') return raw as Record<string, unknown>; try { return JSON.parse(String(raw)); } catch { return null; } }
function bool(value: unknown, fallback: boolean) { if (typeof value === 'boolean') return value; const normalized = String(value ?? '').trim().toLowerCase(); if (['true', '1', 'yes', 'on', 'enabled', '启用', '开启'].includes(normalized)) return true; if (['false', '0', 'no', 'off', 'disabled', '关闭', '停用'].includes(normalized)) return false; return fallback; }
function hasOwn(value: Record<string, unknown>, key: keyof AutoLikeConfig) { return Object.prototype.hasOwnProperty.call(value, key); }
function int(value: unknown, fallback: number, min: number, max: number) { const next = Number(value); if (!Number.isFinite(next)) return fallback; return Math.min(max, Math.max(min, Math.round(next))); }
function list(value: unknown, fallback: string[]) { if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 500); if (typeof value === 'string') return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 500); return fallback; }
function normalizeConfig(raw: unknown, fallback: AutoLikeConfig = DEFAULT_AUTO_LIKE_CONFIG): AutoLikeConfig {
  const value = parseJson(raw) || {};
  return {
    enabled: hasOwn(value, 'enabled') ? bool(value.enabled, fallback.enabled) : fallback.enabled,
    intervalMinutes: hasOwn(value, 'intervalMinutes') ? int(value.intervalMinutes, fallback.intervalMinutes, 30, 720) : fallback.intervalMinutes,
    batchSize: hasOwn(value, 'batchSize') ? int(value.batchSize, fallback.batchSize, 1, 100) : fallback.batchSize,
    dailyLimit: hasOwn(value, 'dailyLimit') ? int(value.dailyLimit, fallback.dailyLimit, 0, 10000) : fallback.dailyLimit,
    recentDays: hasOwn(value, 'recentDays') ? int(value.recentDays, fallback.recentDays, 1, 30) : fallback.recentDays,
    maxLikesPerPost: hasOwn(value, 'maxLikesPerPost') ? int(value.maxLikesPerPost, fallback.maxLikesPerPost, 1, 100) : fallback.maxLikesPerPost,
    maxLikesPerRobotPerDay: hasOwn(value, 'maxLikesPerRobotPerDay') ? int(value.maxLikesPerRobotPerDay, fallback.maxLikesPerRobotPerDay, 1, 500) : fallback.maxLikesPerRobotPerDay,
    categoryIds: hasOwn(value, 'categoryIds') ? list(value.categoryIds, fallback.categoryIds) : fallback.categoryIds,
    robotUserIds: hasOwn(value, 'robotUserIds') ? list(value.robotUserIds, fallback.robotUserIds) : fallback.robotUserIds,
  };
}

async function createRunRow(input: { trigger: AutoLikeTrigger; status: AutoLikeRunStatus; postId?: string | null; robotUserId?: string | null; reason?: string | null }) {
  const id = `auto_like_run_${randomUUID()}`;
  await prisma.$executeRaw(Prisma.sql`INSERT INTO "AutoLikeRun" ("id", "trigger", "status", "postId", "robotUserId", "reason", "createdAt", "finishedAt") VALUES (${id}, ${input.trigger}, ${input.status}, ${input.postId || null}, ${input.robotUserId || null}, ${input.reason || null}, NOW(), NOW())`);
  return id;
}

function todayRange() { return getPlatformDayRange(); }
async function countTodayRobotLikes() {
  const range = todayRange();
  const rows = await prisma.$queryRaw<Array<{ likeCount: bigint; robotCount: bigint; postCount: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "likeCount", COUNT(DISTINCT l."userId")::bigint AS "robotCount", COUNT(DISTINCT l."postId")::bigint AS "postCount"
    FROM "Like" l
    JOIN "User" u ON u."id" = l."userId"
    WHERE u."userType"::text = 'ROBOT' AND l."createdAt" >= ${range.start} AND l."createdAt" < ${range.end}
  `);
  const row = rows[0];
  return { likeCount: Number(row?.likeCount || 0), robotCount: Number(row?.robotCount || 0), postCount: Number(row?.postCount || 0) };
}
async function countTodayRuns() {
  const range = todayRange();
  const rows = await prisma.$queryRaw<Array<{ status: AutoLikeRunStatus; count: bigint }>>(Prisma.sql`SELECT "status", COUNT(*)::bigint AS "count" FROM "AutoLikeRun" WHERE "createdAt" >= ${range.start} AND "createdAt" < ${range.end} GROUP BY "status"`);
  const counts = { SUCCEEDED: 0, SKIPPED: 0, FAILED: 0 } as Record<AutoLikeRunStatus, number>;
  for (const row of rows) if (RUN_STATUSES.has(row.status)) counts[row.status] = Number(row.count || 0);
  return counts;
}
async function countRobotLikesForPost(postId: string) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "Like" l JOIN "User" u ON u."id" = l."userId" WHERE l."postId" = ${postId} AND u."userType"::text = 'ROBOT'`);
  return Number(rows[0]?.count || 0);
}
async function countRobotDailyLikes(robotUserId: string) {
  const range = todayRange();
  return db().like.count({ where: { userId: robotUserId, createdAt: { gte: range.start, lt: range.end } } });
}
async function listRobots(config: AutoLikeConfig) {
  const where: any = { userType: 'ROBOT', isDisabled: false };
  if (config.robotUserIds.length) where.id = { in: config.robotUserIds };
  return db().user.findMany({ where, select: { id: true, displayName: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: MAX_ROBOTS }) as Promise<Array<{ id: string; displayName?: string | null }>>;
}
async function listPosts(config: AutoLikeConfig) {
  const since = new Date(Date.now() - config.recentDays * 24 * 60 * 60 * 1000);
  return db().post.findMany({
    where: { isPublished: true, deletedAt: null, quotedPostId: null, createdAt: { gte: since }, user: { userType: { not: 'ROBOT' } }, ...(config.categoryIds.length ? { categoryId: { in: config.categoryIds } } : {}) },
    select: { id: true, userId: true, likeCount: true, viewCount: true, bumpedAt: true, createdAt: true },
    orderBy: [{ likeCount: 'asc' }, { viewCount: 'asc' }, { bumpedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_CANDIDATES,
  }) as Promise<Array<{ id: string; userId: string; likeCount?: number | null; viewCount?: number | null }>>;
}
async function createInternalLike(input: { postId: string; postAuthorId: string; robotUserId: string; config: AutoLikeConfig }) {
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${input.postId}), hashtext(${input.robotUserId}))`);
      if (input.postAuthorId === input.robotUserId) throw new Error('robot_cannot_like_own_post');
      const existing = await tx.like.findUnique({ where: { userId_postId: { userId: input.robotUserId, postId: input.postId } }, select: { userId: true } });
      if (existing) throw new Error('already_liked');
      const postRobotLikes = await tx.$queryRaw(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "Like" l JOIN "User" u ON u."id" = l."userId" WHERE l."postId" = ${input.postId} AND u."userType"::text = 'ROBOT'`) as Array<{ count: bigint }>;
      const range = todayRange();
      const robotDailyLikes = await tx.like.count({ where: { userId: input.robotUserId, createdAt: { gte: range.start, lt: range.end } } });
      if (Number(postRobotLikes[0]?.count || 0) >= input.config.maxLikesPerPost) throw new Error('post_limit_reached');
      if (Number(robotDailyLikes || 0) >= input.config.maxLikesPerRobotPerDay) throw new Error('robot_daily_limit_reached');
      await tx.like.create({ data: { userId: input.robotUserId, postId: input.postId } });
      await tx.post.update({ where: { id: input.postId }, data: { likeCount: { increment: 1 }, bumpedAt: new Date() } });
    });
    return { status: 'SUCCEEDED' as const, reason: 'liked' };
  } catch (error: any) {
    const reason = String(error?.message || 'like_failed');
    if (reason.includes('Unique constraint') || ['already_liked', 'post_limit_reached', 'robot_daily_limit_reached', 'robot_cannot_like_own_post'].includes(reason)) return { status: 'SKIPPED' as const, reason };
    console.warn('[auto-like] failed:', reason);
    return { status: 'FAILED' as const, reason };
  }
}

async function recordAndReturn(result: AutoLikeRunResult, status: AutoLikeRunStatus, reason?: string | null) {
  rememberLatestRun({ ...result, reason: reason ?? result.reason ?? null });
  await createRunRow({ trigger: result.trigger, status, postId: result.lastPostId || null, robotUserId: result.lastRobotUserId || null, reason: reason ?? result.reason ?? null }).catch((error) => console.warn('[auto-like] run history write failed:', error?.message || error));
  return result;
}
function rememberLatestRun(result: AutoLikeRunResult) { latestRun = { ...result, finishedAt: new Date().toISOString() }; }
function pickPair(input: { posts: Array<{ id: string; userId: string }>; robots: Array<{ id: string }>; robotDailyCounts: Map<string, number>; usedPairs: Set<string>; config: AutoLikeConfig }) {
  for (const post of input.posts) {
    for (const robot of input.robots) {
      if (post.userId === robot.id) continue;
      if (input.usedPairs.has(`${post.id}:${robot.id}`)) continue;
      if ((input.robotDailyCounts.get(robot.id) || 0) >= input.config.maxLikesPerRobotPerDay) continue;
      return { post, robot };
    }
  }
  return null;
}

export async function getAutoLikeConfig() { const row = await db().systemConfig.findUnique({ where: { key: CONFIG_KEY } }).catch(() => null); return normalizeConfig(row?.value); }
export async function updateAutoLikeConfig(config: Partial<AutoLikeConfig>) {
  const current = await getAutoLikeConfig();
  const next = normalizeConfig(config, current);
  await db().systemConfig.upsert({ where: { key: CONFIG_KEY }, update: { value: JSON.stringify(next) }, create: { key: CONFIG_KEY, value: JSON.stringify(next) } });
  return next;
}

async function runAutoLikeLocked(config: AutoLikeConfig, enabled: boolean, trigger: AutoLikeTrigger): Promise<AutoLikeRunResult> {
  const today = await countTodayRobotLikes();
  if (today.likeCount >= config.dailyLimit) return recordAndReturn({ enabled, trigger, liked: 0, boosted: 0, skipped: 0, failed: 0, reason: 'daily_limit_reached' }, 'SKIPPED', 'daily_limit_reached');
  const [robots, rawPosts] = await Promise.all([listRobots(config), listPosts(config)]);
  if (!robots.length || !rawPosts.length) {
    const reason = !robots.length ? 'no_robot_user' : 'no_candidate_post';
    return recordAndReturn({ enabled, trigger, liked: 0, boosted: 0, skipped: 1, failed: 0, reason }, 'SKIPPED', reason);
  }
  const posts: typeof rawPosts = [];
  for (const post of rawPosts) if (await countRobotLikesForPost(post.id) < config.maxLikesPerPost) posts.push(post);
  if (!posts.length) return recordAndReturn({ enabled, trigger, liked: 0, boosted: 0, skipped: 1, failed: 0, reason: 'post_limit_reached' }, 'SKIPPED', 'post_limit_reached');
  const robotDailyCounts = new Map<string, number>();
  for (const robot of robots) robotDailyCounts.set(robot.id, await countRobotDailyLikes(robot.id));
  let liked = 0; let skipped = 0; let failed = 0; let lastPostId: string | null = null; let lastRobotUserId: string | null = null; let lastReason: string | null = null;
  const usedPairs = new Set<string>();
  const limit = Math.min(config.batchSize, config.dailyLimit - today.likeCount);
  for (let i = 0; i < limit; i += 1) {
    const pair = pickPair({ posts, robots, robotDailyCounts, usedPairs, config });
    if (!pair) break;
    usedPairs.add(`${pair.post.id}:${pair.robot.id}`);
    const attempt = await createInternalLike({ postId: pair.post.id, postAuthorId: pair.post.userId, robotUserId: pair.robot.id, config });
    lastPostId = pair.post.id; lastRobotUserId = pair.robot.id; lastReason = attempt.reason || null;
    if (attempt.status === 'SUCCEEDED') { liked += 1; robotDailyCounts.set(pair.robot.id, (robotDailyCounts.get(pair.robot.id) || 0) + 1); }
    else if (attempt.status === 'FAILED') failed += 1;
    else skipped += 1;
    await createRunRow({ trigger, status: attempt.status, postId: pair.post.id, robotUserId: pair.robot.id, reason: attempt.reason }).catch((error) => console.warn('[auto-like] attempt history write failed:', error?.message || error));
  }
  const reason = liked > 0 ? 'liked' : lastReason || 'no_available_pair';
  const result = { enabled, trigger, liked, boosted: liked, skipped, failed, reason, lastPostId, lastRobotUserId };
  rememberLatestRun(result);
  if (liked === 0 && skipped === 0 && failed === 0) await createRunRow({ trigger, status: 'SKIPPED', reason: 'no_available_pair' }).catch((error) => console.warn('[auto-like] run history write failed:', error?.message || error));
  return result;
}

export async function runAutoLikeOnce(options: { trigger?: AutoLikeTrigger; enabled?: boolean; force?: boolean } = {}): Promise<AutoLikeRunResult> {
  const trigger = options.trigger || 'MANUAL';
  const config = await getAutoLikeConfig();
  const enabled = options.enabled === true || options.force === true ? true : Boolean(config.enabled);
  if (!enabled) return recordAndReturn({ enabled: false, trigger, liked: 0, boosted: 0, skipped: 0, failed: 0, reason: 'disabled' }, 'SKIPPED', 'disabled');
  const taskLock = await withAutomationTaskLock(AUTO_LIKE_TASK_LOCK_NAME, { ttlMs: AUTO_LIKE_TASK_LOCK_TTL_MS, metadata: { trigger }, force: options.force }, () => runAutoLikeLocked(config, enabled, trigger));
  if (!taskLock.acquired) return recordAndReturn({ enabled, trigger, liked: 0, boosted: 0, skipped: 1, failed: 0, reason: 'another_instance_running', lock: taskLock.lock }, 'SKIPPED', 'another_instance_running');
  return taskLock.result;
}

function toLatestRun(row: any): AutoLikeStats['latestRun'] {
  if (!row) return latestRun;
  const status = String(row.status || 'SKIPPED') as AutoLikeRunStatus;
  return { enabled: true, trigger: String(row.trigger || 'MANUAL') as AutoLikeTrigger, liked: status === 'SUCCEEDED' ? 1 : 0, boosted: status === 'SUCCEEDED' ? 1 : 0, skipped: status === 'SKIPPED' ? 1 : 0, failed: status === 'FAILED' ? 1 : 0, reason: row.reason || null, lastPostId: row.postId || null, lastRobotUserId: row.robotUserId || null, finishedAt: new Date(row.finishedAt || row.createdAt || Date.now()).toISOString() };
}
async function getLatestRunFromStorage() { const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "AutoLikeRun" ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`); return toLatestRun(rows[0]); }
export async function listAutoLikeRuns(options: ListAutoLikeRunsOptions = {}) {
  const limit = Math.min(100, Math.max(1, Math.round(Number(options.limit) || 30)));
  const status = options.status && RUN_STATUSES.has(options.status) ? options.status : null;
  const cursor = typeof options.cursor === 'string' && options.cursor.trim().length <= 160 ? options.cursor.trim() : '';
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT r.*, p."title" AS "postTitle", p."content" AS "postContent", u."displayName" AS "robotName" FROM "AutoLikeRun" r LEFT JOIN "Post" p ON p."id" = r."postId" LEFT JOIN "User" u ON u."id" = r."robotUserId" WHERE (${status || null}::text IS NULL OR r."status" = ${status || null}) AND (${cursor || null}::text IS NULL OR r."id" < ${cursor || null}) ORDER BY r."createdAt" DESC, r."id" DESC LIMIT ${limit + 1}`);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null };
}
export async function getAutoLikeStats(): Promise<AutoLikeStats> {
  const config = await getAutoLikeConfig();
  const [today, runCounts, latest, robotUserCount, candidatePostCount] = await Promise.all([countTodayRobotLikes(), countTodayRuns(), getLatestRunFromStorage(), db().user.count({ where: { userType: 'ROBOT', isDisabled: false } }), db().post.count({ where: { isPublished: true, deletedAt: null } })]);
  return { enabled: config.enabled, todayLiked: today.likeCount, todayBoosted: today.likeCount, todayRobotUsers: today.robotCount, todayPosts: today.postCount, todayRunSucceeded: runCounts.SUCCEEDED, todayRunSkipped: runCounts.SKIPPED, todayRunFailed: runCounts.FAILED, robotUserCount: Number(robotUserCount || 0), candidatePostCount: Number(candidatePostCount || 0), latestRun: latest };
}
