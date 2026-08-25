import prisma, { isDbConfigured } from '../db';
import { getAutomationAiRuntime } from '../services/automation-ai.service';
import { getChatConfig } from './chat.config';

function db() {
  return prisma as any;
}

type RuntimeSnapshot = {
  queuePending: number;
  pendingKeys: number;
  active: number;
  queueMax: number;
  localBotMessagesLastMinute: number;
  updatedAt: string | null;
};

const runtimeSnapshot: RuntimeSnapshot = {
  queuePending: 0,
  pendingKeys: 0,
  active: 0,
  queueMax: 0,
  localBotMessagesLastMinute: 0,
  updatedAt: null,
};

export function updateChatAutomationRuntimeSnapshot(patch: Partial<RuntimeSnapshot>) {
  Object.assign(runtimeSnapshot, patch, { updatedAt: new Date().toISOString() });
}

async function readMessageStats(since: Date, recentSince: Date) {
  if (!isDbConfigured()) return { humanMessages: 0, botMessages: 0, systemMessages: 0, botMessagesLastMinute: 0 };
  const rows = await db().$queryRawUnsafe(
    `SELECT
       COUNT(*) FILTER (WHERE "authorType" = 'USER')::int AS "humanMessages",
       COUNT(*) FILTER (WHERE "authorType" = 'BOT')::int AS "botMessages",
       COUNT(*) FILTER (WHERE "authorType" = 'SYSTEM')::int AS "systemMessages",
       COUNT(*) FILTER (WHERE "authorType" = 'BOT' AND "createdAt" >= $2)::int AS "botMessagesLastMinute"
     FROM "ChatMessage"
     WHERE "createdAt" >= $1`,
    since,
    recentSince,
  ).catch(() => [] as any[]);
  const row = rows?.[0] || {};
  return {
    humanMessages: Number(row.humanMessages || 0),
    botMessages: Number(row.botMessages || 0),
    systemMessages: Number(row.systemMessages || 0),
    botMessagesLastMinute: Number(row.botMessagesLastMinute || 0),
  };
}

async function readInvocationStats(since: Date) {
  if (!isDbConfigured()) return { succeeded: 0, skipped: 0, failed: 0, pending: 0, fallbackUsed: 0, recentErrors: [] as string[] };
  const rows = await db().$queryRawUnsafe(
    `SELECT "status", COUNT(*)::int AS count
     FROM "ChatBotInvocation"
     WHERE "createdAt" >= $1
     GROUP BY "status"`,
    since,
  ).catch(() => [] as Array<{ status: string; count: number }>);
  const errors = await db().chatBotInvocation.findMany({
    where: { createdAt: { gte: since }, error: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 8,
    select: { error: true },
  }).catch(() => [] as Array<{ error: string | null }>);
  const stat = { succeeded: 0, skipped: 0, failed: 0, pending: 0, fallbackUsed: 0, recentErrors: [] as string[] };
  for (const row of rows || []) {
    const key = String(row.status || '').toUpperCase();
    if (key === 'SUCCEEDED') stat.succeeded = Number(row.count || 0);
    if (key === 'SKIPPED') stat.skipped = Number(row.count || 0);
    if (key === 'FAILED') stat.failed = Number(row.count || 0);
    if (key === 'PENDING') stat.pending = Number(row.count || 0);
  }
  stat.fallbackUsed = errors.filter((item: { error: string | null }) => String(item.error || '').includes('fallback')).length;
  const recentErrors: string[] = [];
  const seenErrors = new Set<string>();
  for (const item of errors) {
    const message = String(item.error || '').trim();
    if (!message || seenErrors.has(message)) continue;
    seenErrors.add(message);
    recentErrors.push(message);
    if (recentErrors.length >= 8) break;
  }
  stat.recentErrors = recentErrors;
  return stat;
}

export async function getChatAutomationStatus() {
  const [config, aiRuntime] = await Promise.all([
    getChatConfig({ force: true }),
    getAutomationAiRuntime('chat', { force: true }).catch((): null => null),
  ]);
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentSince = new Date(now.getTime() - 60_000);
  const [messages, invocations] = await Promise.all([readMessageStats(since, recentSince), readInvocationStats(since)]);
  return {
    enabled: config.enabled,
    aiEnabled: config.aiEnabled,
    canAutoChat: Boolean(config.enabled && config.aiEnabled && aiRuntime?.ready),
    disabledReason: !config.enabled
      ? 'chat_disabled'
      : !config.aiEnabled
        ? 'chat_ai_disabled'
        : aiRuntime?.ready
          ? null
          : aiRuntime?.disabledReason || 'platform_ai_not_ready',
    provider: aiRuntime?.provider || null,
    model: aiRuntime?.model || config.aiModel,
    runtime: runtimeSnapshot,
    messages,
    invocations,
  };
}
