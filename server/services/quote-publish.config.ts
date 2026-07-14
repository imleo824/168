import prisma, { isDbConfigured } from '../db';

export type QuotePublishConfig = {
  enabled: boolean;
  checkIntervalMinutes: number;
  dailyLimit: number;
  candidateWindowHours: number;
  repeatSourceCooldownHours: number;
  humanCommentSkipThreshold: number;
  humanQuoteSkipThreshold: number;
  humanShareSkipThreshold: number;
  humanTotalEngagementSkipThreshold: number;
};

const CONFIG_PREFIX = 'quote_publish_';
const CONFIG_CACHE_TTL_MS = 15_000;

const LIMITS = {
  checkIntervalMinutes: { min: 30, max: 720, fallback: 120 },
  dailyLimit: { min: 0, max: 50, fallback: 8 },
  candidateWindowHours: { min: 24, max: 336, fallback: 168 },
  repeatSourceCooldownHours: { min: 24, max: 336, fallback: 168 },
  humanCommentSkipThreshold: { min: 0, max: 20, fallback: 3 },
  humanQuoteSkipThreshold: { min: 0, max: 20, fallback: 2 },
  humanShareSkipThreshold: { min: 0, max: 100, fallback: 5 },
  humanTotalEngagementSkipThreshold: { min: 0, max: 100, fallback: 6 },
} as const;

export const DEFAULT_QUOTE_PUBLISH_CONFIG: QuotePublishConfig = {
  enabled: false,
  checkIntervalMinutes: LIMITS.checkIntervalMinutes.fallback,
  dailyLimit: LIMITS.dailyLimit.fallback,
  candidateWindowHours: LIMITS.candidateWindowHours.fallback,
  repeatSourceCooldownHours: LIMITS.repeatSourceCooldownHours.fallback,
  humanCommentSkipThreshold: LIMITS.humanCommentSkipThreshold.fallback,
  humanQuoteSkipThreshold: LIMITS.humanQuoteSkipThreshold.fallback,
  humanShareSkipThreshold: LIMITS.humanShareSkipThreshold.fallback,
  humanTotalEngagementSkipThreshold: LIMITS.humanTotalEngagementSkipThreshold.fallback,
};

const CONFIG_KEYS: Array<keyof QuotePublishConfig> = [
  'enabled',
  'checkIntervalMinutes',
  'dailyLimit',
  'candidateWindowHours',
  'repeatSourceCooldownHours',
  'humanCommentSkipThreshold',
  'humanQuoteSkipThreshold',
  'humanShareSkipThreshold',
  'humanTotalEngagementSkipThreshold',
];

let cachedConfig: { value: QuotePublishConfig; expiresAt: number } | null = null;
let configReadPromise: Promise<QuotePublishConfig> | null = null;

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', '启用', '开启'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', '关闭', '停用'].includes(normalized)) return false;
  }
  return fallback;
}

function hasOwn(input: Partial<Record<keyof QuotePublishConfig, unknown>>, key: keyof QuotePublishConfig) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function clampInteger(value: unknown, limit: { min: number; max: number; fallback: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, Math.round(parsed)));
}

function deserializeConfigValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function normalizeQuotePublishConfig(input: Partial<Record<keyof QuotePublishConfig, unknown>> = {}, fallback: QuotePublishConfig = DEFAULT_QUOTE_PUBLISH_CONFIG) {
  return {
    enabled: hasOwn(input, 'enabled') ? toBoolean(input.enabled, fallback.enabled) : fallback.enabled,
    checkIntervalMinutes: hasOwn(input, 'checkIntervalMinutes') ? clampInteger(input.checkIntervalMinutes, LIMITS.checkIntervalMinutes) : fallback.checkIntervalMinutes,
    dailyLimit: hasOwn(input, 'dailyLimit') ? clampInteger(input.dailyLimit, LIMITS.dailyLimit) : fallback.dailyLimit,
    candidateWindowHours: hasOwn(input, 'candidateWindowHours') ? clampInteger(input.candidateWindowHours, LIMITS.candidateWindowHours) : fallback.candidateWindowHours,
    repeatSourceCooldownHours: hasOwn(input, 'repeatSourceCooldownHours') ? clampInteger(input.repeatSourceCooldownHours, LIMITS.repeatSourceCooldownHours) : fallback.repeatSourceCooldownHours,
    humanCommentSkipThreshold: hasOwn(input, 'humanCommentSkipThreshold') ? clampInteger(input.humanCommentSkipThreshold, LIMITS.humanCommentSkipThreshold) : fallback.humanCommentSkipThreshold,
    humanQuoteSkipThreshold: hasOwn(input, 'humanQuoteSkipThreshold') ? clampInteger(input.humanQuoteSkipThreshold, LIMITS.humanQuoteSkipThreshold) : fallback.humanQuoteSkipThreshold,
    humanShareSkipThreshold: hasOwn(input, 'humanShareSkipThreshold') ? clampInteger(input.humanShareSkipThreshold, LIMITS.humanShareSkipThreshold) : fallback.humanShareSkipThreshold,
    humanTotalEngagementSkipThreshold: hasOwn(input, 'humanTotalEngagementSkipThreshold') ? clampInteger(input.humanTotalEngagementSkipThreshold, LIMITS.humanTotalEngagementSkipThreshold) : fallback.humanTotalEngagementSkipThreshold,
  } satisfies QuotePublishConfig;
}

async function readConfigFromStorage(): Promise<QuotePublishConfig> {
  if (!isDbConfigured()) return DEFAULT_QUOTE_PUBLISH_CONFIG;
  const db = prisma as any;
  const rows = await db.systemConfig.findMany({
    where: { key: { in: CONFIG_KEYS.map((key) => `${CONFIG_PREFIX}${key}`) } },
  });
  const values: Partial<Record<keyof QuotePublishConfig, unknown>> = { ...DEFAULT_QUOTE_PUBLISH_CONFIG };
  for (const row of rows) {
    const key = String(row.key || '').replace(CONFIG_PREFIX, '') as keyof QuotePublishConfig;
    if (CONFIG_KEYS.includes(key)) values[key] = deserializeConfigValue(row.value);
  }
  return normalizeQuotePublishConfig(values);
}

export async function getQuotePublishConfig(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cachedConfig && cachedConfig.expiresAt > now) return cachedConfig.value;
  if (!options.force && configReadPromise) return configReadPromise;
  configReadPromise = readConfigFromStorage()
    .then((value) => {
      cachedConfig = { value, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
      return value;
    })
    .finally(() => {
      configReadPromise = null;
    });
  return configReadPromise;
}

export async function updateQuotePublishConfig(input: Partial<Record<keyof QuotePublishConfig, unknown>> & { model?: unknown; aiModel?: unknown }) {
  const current = await getQuotePublishConfig({ force: true });
  const { model: _model, aiModel: _aiModel, ...safeInput } = input || {};
  const next = normalizeQuotePublishConfig(safeInput, current);
  if (!isDbConfigured()) {
    cachedConfig = { value: next, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
    return next;
  }
  const db = prisma as any;
  await db.$transaction(
    CONFIG_KEYS.map((key) =>
      db.systemConfig.upsert({
        where: { key: `${CONFIG_PREFIX}${key}` },
        update: { value: JSON.stringify(next[key]) },
        create: { key: `${CONFIG_PREFIX}${key}`, value: JSON.stringify(next[key]) },
      }),
    ),
  );
  cachedConfig = { value: next, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS };
  return next;
}
