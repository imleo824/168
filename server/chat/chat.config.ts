import prisma, { isDbConfigured } from '../db';
import type { ChatConfig } from './chat.types';

const CONFIG_PREFIX = 'chat_';
const CHAT_CONFIG_CACHE_TTL_MS = 15_000;

const CHAT_LIMITS = {
  minAccountAgeDays: { min: 0, max: 365, fallback: 7 },
  retentionDays: { min: 1, max: 30, fallback: 7 },
  maxMessageLength: { min: 1, max: 500, fallback: 500 },
  botMaxPerMinute: { min: 0, max: 5, fallback: 2 },
  botConcurrency: { min: 1, max: 3, fallback: 1 },
  botCooldownSeconds: { min: 60, max: 3600, fallback: 420 },
  botReplyMinDelayMs: { min: 10_000, max: 300_000, fallback: 25_000 },
  botReplyMaxDelayMs: { min: 10_000, max: 600_000, fallback: 180_000 },
} as const;

const DEFAULT_CHAT_CONFIG: ChatConfig = {
  // enabled controls the human chat room itself. Product decision: the chat room stays open.
  // Robot automation is controlled separately by aiEnabled and platform AI readiness.
  enabled: true,
  minAccountAgeDays: CHAT_LIMITS.minAccountAgeDays.fallback,
  retentionDays: CHAT_LIMITS.retentionDays.fallback,
  maxMessageLength: CHAT_LIMITS.maxMessageLength.fallback,
  aiEnabled: false,
  aiModel: process.env.CHAT_AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  botMaxPerMinute: CHAT_LIMITS.botMaxPerMinute.fallback,
  botConcurrency: CHAT_LIMITS.botConcurrency.fallback,
  botCooldownSeconds: CHAT_LIMITS.botCooldownSeconds.fallback,
  botReplyMinDelayMs: CHAT_LIMITS.botReplyMinDelayMs.fallback,
  botReplyMaxDelayMs: CHAT_LIMITS.botReplyMaxDelayMs.fallback,
};

const CHAT_CONFIG_KEYS: Array<keyof ChatConfig> = [
  'enabled',
  'minAccountAgeDays',
  'retentionDays',
  'maxMessageLength',
  'aiEnabled',
  'aiModel',
  'botMaxPerMinute',
  'botConcurrency',
  'botCooldownSeconds',
  'botReplyMinDelayMs',
  'botReplyMaxDelayMs',
];

let cachedConfig: { value: ChatConfig; expiresAt: number } | null = null;
let configReadPromise: Promise<ChatConfig> | null = null;

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '是', '开启', '启用'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '否', '关闭', '停用'].includes(normalized)) return false;
  }
  return fallback;
}

function clampInteger(value: unknown, limit: { min: number; max: number; fallback: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, Math.round(parsed)));
}

function normalizeModel(value: unknown) {
  return String(value || DEFAULT_CHAT_CONFIG.aiModel).trim().slice(0, 120) || DEFAULT_CHAT_CONFIG.aiModel;
}

function normalizePartialConfig(input: Partial<Record<keyof ChatConfig, unknown>>) {
  const minDelay = clampInteger(input.botReplyMinDelayMs, CHAT_LIMITS.botReplyMinDelayMs);
  const maxDelay = Math.max(minDelay, clampInteger(input.botReplyMaxDelayMs, CHAT_LIMITS.botReplyMaxDelayMs));
  return {
    enabled: true,
    minAccountAgeDays: clampInteger(input.minAccountAgeDays, CHAT_LIMITS.minAccountAgeDays),
    retentionDays: clampInteger(input.retentionDays, CHAT_LIMITS.retentionDays),
    maxMessageLength: clampInteger(input.maxMessageLength, CHAT_LIMITS.maxMessageLength),
    aiEnabled: toBoolean(input.aiEnabled, DEFAULT_CHAT_CONFIG.aiEnabled),
    aiModel: normalizeModel(input.aiModel),
    botMaxPerMinute: clampInteger(input.botMaxPerMinute, CHAT_LIMITS.botMaxPerMinute),
    botConcurrency: clampInteger(input.botConcurrency, CHAT_LIMITS.botConcurrency),
    botCooldownSeconds: clampInteger(input.botCooldownSeconds, CHAT_LIMITS.botCooldownSeconds),
    botReplyMinDelayMs: minDelay,
    botReplyMaxDelayMs: maxDelay,
  } satisfies ChatConfig;
}

function normalizeChatConfig(input: Partial<Record<keyof ChatConfig, unknown>> = {}) {
  return normalizePartialConfig(input);
}

function deserializeConfigValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function readChatConfigFromStorage(): Promise<ChatConfig> {
  if (!isDbConfigured()) return DEFAULT_CHAT_CONFIG;
  const db = prisma as any;
  const rows = await db.systemConfig.findMany({
    where: { key: { in: CHAT_CONFIG_KEYS.map((key) => `${CONFIG_PREFIX}${key}`) } },
  });

  const values: Partial<Record<keyof ChatConfig, unknown>> = { ...DEFAULT_CHAT_CONFIG };
  for (const row of rows) {
    const key = String(row.key || '').replace(CONFIG_PREFIX, '') as keyof ChatConfig;
    if (CHAT_CONFIG_KEYS.includes(key)) values[key] = deserializeConfigValue(row.value);
  }
  return normalizeChatConfig(values);
}

export async function getChatConfig(options: { force?: boolean } = {}): Promise<ChatConfig> {
  const now = Date.now();
  if (!options.force && cachedConfig && cachedConfig.expiresAt > now) return cachedConfig.value;
  if (!options.force && configReadPromise) return configReadPromise;

  configReadPromise = readChatConfigFromStorage()
    .then((value) => {
      cachedConfig = { value, expiresAt: Date.now() + CHAT_CONFIG_CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      configReadPromise = null;
    });
  return configReadPromise;
}

export async function updateChatConfig(input: Partial<Record<keyof ChatConfig, unknown>>) {
  const next = normalizeChatConfig({ ...(await getChatConfig({ force: true })), ...input, enabled: true });
  if (!isDbConfigured()) {
    cachedConfig = { value: next, expiresAt: Date.now() + CHAT_CONFIG_CACHE_TTL_MS };
    return next;
  }
  const db = prisma as any;
  await db.$transaction(
    CHAT_CONFIG_KEYS.map((key) =>
      db.systemConfig.upsert({
        where: { key: `${CONFIG_PREFIX}${key}` },
        update: { value: JSON.stringify(next[key]) },
        create: { key: `${CONFIG_PREFIX}${key}`, value: JSON.stringify(next[key]) },
      }),
    ),
  );
  cachedConfig = { value: next, expiresAt: Date.now() + CHAT_CONFIG_CACHE_TTL_MS };
  return next;
}
