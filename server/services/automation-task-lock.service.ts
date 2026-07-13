import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma from '../db';

export type AutomationTaskLockLease = {
  name: string;
  owner: string;
  lockedAt: Date;
  expiresAt: Date;
  heartbeatAt: Date;
  metadata?: unknown;
};

export type AutomationTaskLockDetails = AutomationTaskLockLease & {
  active: boolean;
  ageSeconds: number;
  staleSeconds: number;
  heartbeatStaleSeconds: number;
};

const DEFAULT_TASK_LOCK_TTL_MS = 10 * 60_000;
const DEFAULT_LOCK_HEARTBEAT_STALE_MS = 15 * 60_000;

function safeMilliseconds(raw: unknown, fallbackMs = DEFAULT_TASK_LOCK_TTL_MS) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(30_000, Math.round(value)) : fallbackMs;
}

function ttlInterval(ttlMs: number) {
  return `${safeMilliseconds(ttlMs)} milliseconds`;
}

function heartbeatStaleMsForTtl(ttlMs: number) {
  const safeTtlMs = safeMilliseconds(ttlMs);
  const expectedHeartbeatMs = Math.max(1_000, Math.floor(safeTtlMs / 3));
  return Math.max(90_000, Math.min(DEFAULT_LOCK_HEARTBEAT_STALE_MS, expectedHeartbeatMs * 2 + 60_000));
}

function heartbeatStaleInterval(ttlMs: number) {
  return `${heartbeatStaleMsForTtl(ttlMs)} milliseconds`;
}

export async function getAutomationTaskLock(name: string) {
  const stale = `${DEFAULT_LOCK_HEARTBEAT_STALE_MS} milliseconds`;
  const rows = await prisma.$queryRaw<AutomationTaskLockDetails[]>(Prisma.sql`
    SELECT
      "name",
      "owner",
      "lockedAt",
      "expiresAt",
      "heartbeatAt",
      "metadata",
      ("expiresAt" > NOW() AND "heartbeatAt" >= NOW() - ${stale}::interval) AS "active",
      EXTRACT(EPOCH FROM (NOW() - "lockedAt"))::int AS "ageSeconds",
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "expiresAt")))::int AS "staleSeconds",
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "heartbeatAt")))::int AS "heartbeatStaleSeconds"
    FROM "AutomationTaskLock"
    WHERE "name" = ${name}
    LIMIT 1
  `);
  return rows[0] || null;
}

export async function acquireAutomationTaskLock(name: string, options: { ttlMs?: number; owner?: string; metadata?: Record<string, unknown>; force?: boolean } = {}) {
  const ttlMs = safeMilliseconds(options.ttlMs || DEFAULT_TASK_LOCK_TTL_MS);
  await cleanupExpiredAutomationTaskLocks({ heartbeatStaleMs: heartbeatStaleMsForTtl(ttlMs) });
  const owner = options.owner || `${process.pid || 'pid'}-${randomUUID()}`;
  const ttl = ttlInterval(ttlMs);
  const stale = heartbeatStaleInterval(ttlMs);
  const metadata = options.metadata ? JSON.stringify(options.metadata) : null;
  const rows = await prisma.$queryRaw<AutomationTaskLockLease[]>(Prisma.sql`
    INSERT INTO "AutomationTaskLock" ("name", "owner", "lockedAt", "expiresAt", "heartbeatAt", "metadata")
    VALUES (${name}, ${owner}, NOW(), NOW() + ${ttl}::interval, NOW(), ${metadata}::jsonb)
    ON CONFLICT ("name") DO UPDATE SET
      "owner" = EXCLUDED."owner",
      "lockedAt" = NOW(),
      "expiresAt" = EXCLUDED."expiresAt",
      "heartbeatAt" = NOW(),
      "metadata" = EXCLUDED."metadata"
    WHERE "AutomationTaskLock"."expiresAt" <= NOW()
       OR "AutomationTaskLock"."heartbeatAt" < NOW() - ${stale}::interval
       OR "AutomationTaskLock"."owner" = EXCLUDED."owner"
       OR ${Boolean(options.force)} = TRUE
    RETURNING "name", "owner", "lockedAt", "expiresAt", "heartbeatAt"
  `);
  const lease = rows[0] || null;
  const acquired = Boolean(lease && lease.owner === owner);
  return { acquired, owner, lease, lock: acquired ? null : await getAutomationTaskLock(name) };
}

export async function heartbeatAutomationTaskLock(name: string, owner: string, ttlMs = DEFAULT_TASK_LOCK_TTL_MS) {
  const ttl = ttlInterval(ttlMs);
  const rows = await prisma.$queryRaw<AutomationTaskLockLease[]>(Prisma.sql`
    UPDATE "AutomationTaskLock"
    SET "heartbeatAt" = NOW(), "expiresAt" = NOW() + ${ttl}::interval
    WHERE "name" = ${name} AND "owner" = ${owner}
    RETURNING "name", "owner", "lockedAt", "expiresAt", "heartbeatAt"
  `);
  return rows[0] || null;
}

export async function releaseAutomationTaskLock(name: string, owner: string | null | undefined) {
  if (!owner) return false;
  const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
    DELETE FROM "AutomationTaskLock"
    WHERE "name" = ${name} AND "owner" = ${owner}
    RETURNING "name"
  `);
  return rows.length > 0;
}

export async function getAutomationTaskLocks() {
  const stale = `${DEFAULT_LOCK_HEARTBEAT_STALE_MS} milliseconds`;
  return prisma.$queryRaw<AutomationTaskLockDetails[]>(Prisma.sql`
    SELECT
      "name",
      "owner",
      "lockedAt",
      "expiresAt",
      "heartbeatAt",
      "metadata",
      ("expiresAt" > NOW() AND "heartbeatAt" >= NOW() - ${stale}::interval) AS "active",
      EXTRACT(EPOCH FROM (NOW() - "lockedAt"))::int AS "ageSeconds",
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "expiresAt")))::int AS "staleSeconds",
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "heartbeatAt")))::int AS "heartbeatStaleSeconds"
    FROM "AutomationTaskLock"
    ORDER BY "lockedAt" DESC
  `);
}

export async function cleanupExpiredAutomationTaskLocks(options: { heartbeatStaleMs?: number } = {}) {
  const heartbeatStaleMs = safeMilliseconds(options.heartbeatStaleMs || DEFAULT_LOCK_HEARTBEAT_STALE_MS);
  const stale = `${heartbeatStaleMs} milliseconds`;
  const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
    DELETE FROM "AutomationTaskLock"
    WHERE "expiresAt" <= NOW()
       OR "heartbeatAt" < NOW() - ${stale}::interval
    RETURNING "name"
  `);
  return rows.length;
}

export async function forceReleaseAutomationTaskLock(name: string) {
  const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
    DELETE FROM "AutomationTaskLock"
    WHERE "name" = ${name}
    RETURNING "name"
  `);
  return rows.length > 0;
}

export async function withAutomationTaskLock<T>(
  name: string,
  options: { ttlMs?: number; owner?: string; metadata?: Record<string, unknown>; force?: boolean } = {},
  runner: (lease: AutomationTaskLockLease & { owner: string }) => Promise<T>,
) {
  const ttlMs = safeMilliseconds(options.ttlMs || DEFAULT_TASK_LOCK_TTL_MS);
  const taskLock = await acquireAutomationTaskLock(name, { ...options, ttlMs });
  if (!taskLock.acquired || !taskLock.lease) {
    return { acquired: false as const, owner: taskLock.owner, lock: taskLock.lock };
  }

  const heartbeatMs = Math.max(1_000, Math.floor(ttlMs / 3));
  let heartbeatStopped = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatStopped) return;
    void heartbeatAutomationTaskLock(name, taskLock.owner, ttlMs).catch((error) => {
      console.warn(`[automation-lock] heartbeat failed for ${name}:`, error?.message || error);
    });
  }, heartbeatMs);
  heartbeatTimer.unref?.();

  try {
    const result = await runner(taskLock.lease);
    return { acquired: true as const, owner: taskLock.owner, result };
  } finally {
    heartbeatStopped = true;
    clearInterval(heartbeatTimer);
    await releaseAutomationTaskLock(name, taskLock.owner).catch((error) => {
      console.warn(`[automation-lock] release failed for ${name}:`, error?.message || error);
    });
  }
}
