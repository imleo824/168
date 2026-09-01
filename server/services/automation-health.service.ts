import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';

export type AutomationModuleName = 'auto_like' | 'quote_publish' | 'comment_publish' | 'auto_post' | 'auto_crawl' | 'chat_bot';
export type AutomationHeartbeatTrigger = 'STARTUP_HEALTH_CHECK' | 'SCHEDULED_TICK' | 'MANUAL_DEBUG' | 'MAINTENANCE';
export type AutomationHeartbeatStatus = 'SUCCEEDED' | 'SKIPPED' | 'FAILED';
export type AutomationHeartbeatRecord = {
  id: string;
  module: AutomationModuleName;
  trigger: AutomationHeartbeatTrigger;
  status: AutomationHeartbeatStatus;
  enabled: boolean | null;
  reason: string | null;
  runId: string | null;
  details: unknown;
  startedAt: Date | string;
  finishedAt: Date | string;
  durationMs: number;
  createdAt: Date | string;
};

type RecordHeartbeatInput = {
  module: AutomationModuleName;
  trigger: AutomationHeartbeatTrigger;
  status: AutomationHeartbeatStatus;
  enabled?: boolean | null;
  reason?: string | null;
  runId?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
  details?: unknown;
};

function safeText(value: unknown, maxLength: number) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? Array.from(text).slice(0, maxLength).join('') : null;
}

function serializeDetails(details: unknown) {
  if (details === undefined || details === null) return null;
  try {
    return JSON.stringify(details).slice(0, 8000);
  } catch {
    return JSON.stringify({ value: String(details).slice(0, 1000) });
  }
}

function durationMs(startedAt: Date, finishedAt: Date) {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

export async function recordAutomationHeartbeat(input: RecordHeartbeatInput) {
  if (!isDbConfigured()) return;
  const startedAt = input.startedAt || new Date();
  const finishedAt = input.finishedAt || new Date();
  const id = `automation_heartbeat_${randomUUID()}`;
  const details = serializeDetails(input.details);

  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AutomationHeartbeat" (
        "id", "module", "trigger", "status", "enabled", "reason", "runId", "details", "startedAt", "finishedAt", "durationMs", "createdAt"
      ) VALUES (
        ${id},
        ${input.module},
        ${input.trigger},
        ${input.status},
        ${input.enabled ?? null},
        ${safeText(input.reason, 300)},
        ${safeText(input.runId, 160)},
        CAST(${details} AS jsonb),
        ${startedAt},
        ${finishedAt},
        ${durationMs(startedAt, finishedAt)},
        NOW()
      )
    `);
  } catch (error: any) {
    if (!isDbConfigured()) return;
    console.warn('[automation-heartbeat] write failed:', error?.message || error);
  }
}

export async function listAutomationHeartbeats(options: { module?: AutomationModuleName; limit?: number } = {}) {
  if (!isDbConfigured()) return [];
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit || 50))));
  const moduleName = options.module || null;
  return prisma.$queryRaw<AutomationHeartbeatRecord[]>(Prisma.sql`
    SELECT *
    FROM "AutomationHeartbeat"
    WHERE (${moduleName}::text IS NULL OR "module" = ${moduleName})
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ${limit}
  `);
}
