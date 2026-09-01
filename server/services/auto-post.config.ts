import prisma, { isDbConfigured } from '../db';

export type AutoPostConfig = {
  enabled: boolean;
  topicConfigs: Record<string, AutoPostTopicConfig>;
  checkIntervalMinutes: number;
};

export type AutoPostTopicConfig = {
  enabled: boolean;
  authorUserId: string;
  categoryId: string;
  dailyLimit: number;
};

export const AUTO_POST_CONFIG_TOPICS = ['QUOTE', 'FACT', 'RIDDLE', 'JOKE'] as const;

const CONFIG_PREFIX = 'auto_post_';
const CONFIG_CACHE_TTL_MS = 15_000;
const LIMITS = {
  checkIntervalMinutes: { min: 30, max: 720, fallback: 60 },
  dailyLimit: { min: 0, max: 100, fallback: 12 },
} as const;

const DEFAULT_TOPIC_CONFIG: AutoPostTopicConfig = {
  enabled: false,
  authorUserId: '',
  categoryId: '',
  dailyLimit: LIMITS.dailyLimit.fallback,
};

export const DEFAULT_AUTO_POST_CONFIG: AutoPostConfig = {
  enabled: false,
  topicConfigs: Object.fromEntries(AUTO_POST_CONFIG_TOPICS.map((topic) => [topic, { ...DEFAULT_TOPIC_CONFIG }])),
  checkIntervalMinutes: LIMITS.checkIntervalMinutes.fallback,
};

const CONFIG_KEYS: Array<keyof AutoPostConfig> = [
  'enabled',
  'topicConfigs',
  'checkIntervalMinutes',
];

let cachedConfig: { value: AutoPostConfig; expiresAt: number } | null = null;
let configReadPromise: Promise<AutoPostConfig> | null = null;

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'enabled', '启用', '开启'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', 'disabled', '关闭', '停用'].includes(normalized)) return false;
  }
  return fallback;
}

function clampInteger(value: unknown, limit: { min: number; max: number; fallback: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, Math.round(parsed)));
}

function toConfigString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasOwn(value: Record<string, unknown>, key: keyof AutoPostTopicConfig) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeTopicConfigs(raw: unknown, fallback?: AutoPostConfig['topicConfigs']) {
  const input = raw && typeof raw === 'object' ? raw as Record<string, Partial<AutoPostTopicConfig>> : {};
  return Object.fromEntries(AUTO_POST_CONFIG_TOPICS.map((topic) => {
    const current = fallback?.[topic] || DEFAULT_TOPIC_CONFIG;
    const value = input[topic] || {};
    return [topic, {
      enabled: toBoolean(value.enabled, current.enabled),
      authorUserId: toConfigString(value.authorUserId) || current.authorUserId,
      categoryId: hasOwn(value as Record<string, unknown>, 'categoryId') ? toConfigString(value.categoryId) : current.categoryId,
      dailyLimit: hasOwn(value as Record<string, unknown>, 'dailyLimit') ? clampInteger(value.dailyLimit, LIMITS.dailyLimit) : current.dailyLimit,
    }];
  }));
}

function deserializeConfigValue(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function normalizeAutoPostConfig(input: Partial<Record<keyof AutoPostConfig, unknown>> = {}) {
  const topicConfigs = normalizeTopicConfigs(input.topicConfigs, DEFAULT_AUTO_POST_CONFIG.topicConfigs);
  return {
    enabled: toBoolean(input.enabled, DEFAULT_AUTO_POST_CONFIG.enabled),
    topicConfigs,
    checkIntervalMinutes: clampInteger(input.checkIntervalMinutes, LIMITS.checkIntervalMinutes),
  } satisfies AutoPostConfig;
}

async function readConfigFromStorage(): Promise<AutoPostConfig> {
  if (!isDbConfigured()) return DEFAULT_AUTO_POST_CONFIG;

  const db = prisma as any;
  const rows = await db.systemConfig.findMany({
    where: { key: { in: CONFIG_KEYS.map((key) => `${CONFIG_PREFIX}${key}`) } },
  });

  const values: Partial<Record<keyof AutoPostConfig, unknown>> = { ...DEFAULT_AUTO_POST_CONFIG };
  for (const row of rows) {
    const key = String(row.key || '').replace(CONFIG_PREFIX, '') as keyof AutoPostConfig;
    if (CONFIG_KEYS.includes(key)) values[key] = deserializeConfigValue(row.value);
  }

  return normalizeAutoPostConfig(values);
}

export async function getAutoPostConfig(options: { force?: boolean } = {}) {
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

export async function updateAutoPostConfig(input: Partial<Record<keyof AutoPostConfig, unknown>>) {
  const next = normalizeAutoPostConfig({ ...(await getAutoPostConfig({ force: true })), ...input });

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
