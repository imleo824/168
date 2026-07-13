import { GoogleGenAI } from '@google/genai';

import prisma, { isDbConfigured } from '../db';

export type PlatformAiProvider = 'google' | 'openai-compatible' | 'deepseek';

export type PlatformAiConfig = {
  provider: PlatformAiProvider;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  reviewIntervalMinutes: number;
};

export type PlatformAiRuntimeConfig = PlatformAiConfig & {
  enabled: boolean;
  apiKeyConfigured: boolean;
  source: 'db' | 'env' | 'default';
};

export type PlatformAiTextResult = {
  ok: boolean;
  text: string;
  reason: string;
  provider: PlatformAiProvider;
  model: string;
};

const CONFIG_KEY = 'platform_ai_config';
const DEFAULT_PLATFORM_AI_CONFIG: PlatformAiConfig = {
  provider: 'google',
  model: 'gemini-2.5-flash',
  baseUrl: '',
  timeoutMs: 16_000,
  reviewIntervalMinutes: 15,
};

let googleClient: GoogleGenAI | null = null;
let cachedConfig: { value: PlatformAiRuntimeConfig; expiresAt: number } | null = null;

function env(name: string) {
  return String(process.env[name] || '').trim();
}

function int(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

function normalizeProvider(value: unknown): PlatformAiProvider {
  const text = String(value || '').trim().toLowerCase();
  if (['deepseek', 'deepseek-chat'].includes(text)) return 'deepseek';
  if (['openai', 'openai-compatible', 'compatible', 'custom'].includes(text)) return 'openai-compatible';
  return 'google';
}

function parseJson(raw: unknown) {
  if (!raw) return {} as Record<string, unknown>;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function hasExplicitPlatformAiEnvConfig() {
  return Boolean(
    env('PLATFORM_AI_PROVIDER')
      || env('AUTO_AI_PROVIDER')
      || env('PLATFORM_AI_MODEL')
      || env('AUTO_AI_MODEL')
      || env('CHAT_AI_MODEL')
      || env('ROBOT_CONTENT_AI_MODEL')
      || env('GEMINI_MODEL')
      || env('PLATFORM_AI_BASE_URL')
      || env('AUTO_AI_BASE_URL')
      || env('OPENAI_BASE_URL')
      || env('PLATFORM_AI_API_KEY')
      || env('AUTO_AI_API_KEY')
      || env('GEMINI_API_KEY')
      || env('GOOGLE_API_KEY')
      || env('CHAT_AI_API_KEY')
      || env('ROBOT_CONTENT_AI_API_KEY')
      || env('DEEPSEEK_API_KEY')
      || env('OPENAI_API_KEY')
      || env('AUTO_CRAWL_AI_API_KEY')
  );
}

export function normalizePlatformAiConfig(raw: unknown): PlatformAiConfig {
  const data = parseJson(raw);
  const provider = normalizeProvider(data.provider || env('PLATFORM_AI_PROVIDER') || env('AUTO_AI_PROVIDER'));
  const envModel = env('PLATFORM_AI_MODEL') || env('AUTO_AI_MODEL') || env('CHAT_AI_MODEL') || env('ROBOT_CONTENT_AI_MODEL') || env('GEMINI_MODEL');
  const model = String(data.model || envModel || (provider === 'deepseek' ? 'deepseek-chat' : provider === 'openai-compatible' ? 'gpt-4o-mini' : DEFAULT_PLATFORM_AI_CONFIG.model)).trim() || DEFAULT_PLATFORM_AI_CONFIG.model;
  const envBaseUrl = env('PLATFORM_AI_BASE_URL') || env('AUTO_AI_BASE_URL') || env('OPENAI_BASE_URL');
  const baseUrl = String(data.baseUrl || envBaseUrl || (provider === 'deepseek' ? 'https://api.deepseek.com/v1' : provider === 'openai-compatible' ? 'https://api.openai.com/v1' : '')).trim().replace(/\/+$/, '');
  return {
    provider,
    model,
    baseUrl,
    timeoutMs: int(data.timeoutMs, DEFAULT_PLATFORM_AI_CONFIG.timeoutMs),
    reviewIntervalMinutes: int(data.reviewIntervalMinutes, DEFAULT_PLATFORM_AI_CONFIG.reviewIntervalMinutes),
  };
}

function getApiKey(provider: PlatformAiProvider) {
  const shared = env('PLATFORM_AI_API_KEY') || env('AUTO_AI_API_KEY');
  if (shared) return shared;
  if (provider === 'deepseek') return env('DEEPSEEK_API_KEY');
  if (provider === 'openai-compatible') return env('OPENAI_API_KEY') || env('AUTO_CRAWL_AI_API_KEY');
  return env('GEMINI_API_KEY') || env('GOOGLE_API_KEY') || env('CHAT_AI_API_KEY') || env('ROBOT_CONTENT_AI_API_KEY');
}

export function hasPlatformAiApiKey(provider: PlatformAiProvider = 'google') {
  return Boolean(getApiKey(provider));
}

export async function getPlatformAiConfig(options: { force?: boolean } = {}): Promise<PlatformAiRuntimeConfig> {
  const now = Date.now();
  if (!options.force && cachedConfig && cachedConfig.expiresAt > now) return cachedConfig.value;
  let source: PlatformAiRuntimeConfig['source'] = 'default';
  let raw: unknown = null;
  if (isDbConfigured()) {
    const row = await (prisma as any).systemConfig.findUnique({ where: { key: CONFIG_KEY } }).catch(() => null);
    if (row?.value) {
      raw = row.value;
      source = 'db';
    }
  }
  if (!raw && hasExplicitPlatformAiEnvConfig()) {
    raw = {
      provider: env('PLATFORM_AI_PROVIDER') || env('AUTO_AI_PROVIDER'),
      model: env('PLATFORM_AI_MODEL') || env('AUTO_AI_MODEL') || env('CHAT_AI_MODEL') || env('ROBOT_CONTENT_AI_MODEL') || env('GEMINI_MODEL'),
      baseUrl: env('PLATFORM_AI_BASE_URL') || env('AUTO_AI_BASE_URL') || env('OPENAI_BASE_URL'),
      timeoutMs: env('PLATFORM_AI_TIMEOUT_MS'),
      reviewIntervalMinutes: env('PLATFORM_AI_REVIEW_INTERVAL_MINUTES'),
    };
    source = 'env';
  }
  const normalized = normalizePlatformAiConfig(raw || DEFAULT_PLATFORM_AI_CONFIG);
  const apiKeyConfigured = hasPlatformAiApiKey(normalized.provider);
  const value = { ...normalized, enabled: apiKeyConfigured, apiKeyConfigured, source };
  cachedConfig = { value, expiresAt: Date.now() + 15_000 };
  return value;
}

export async function updatePlatformAiConfig(patch: Partial<PlatformAiConfig> & { enabled?: unknown }) {
  const current = await getPlatformAiConfig({ force: true });
  const { enabled: _ignoredEnabled, ...safePatch } = patch || {};
  const next = normalizePlatformAiConfig({ ...current, ...safePatch });
  if (isDbConfigured()) {
    await (prisma as any).systemConfig.upsert({
      where: { key: CONFIG_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: CONFIG_KEY, value: JSON.stringify(next) },
    });
  }
  cachedConfig = null;
  return getPlatformAiConfig({ force: true });
}

function getGoogleClient(apiKey: string) {
  if (!googleClient) googleClient = new GoogleGenAI({ apiKey });
  return googleClient;
}

function extractTextFromGoogleResponse(response: unknown) {
  const text = (response as any)?.text;
  if (typeof text === 'string') return text;
  return String(text || '').trim();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('platform_ai_timeout')), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generatePlatformAiText(input: {
  system?: string;
  user: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<PlatformAiTextResult> {
  const config = await getPlatformAiConfig();
  const apiKey = getApiKey(config.provider);
  if (!apiKey) return { ok: false, text: '', reason: 'platform_ai_key_missing', provider: config.provider, model: config.model };
  const timeoutMs = input.timeoutMs || config.timeoutMs;
  try {
    if (config.provider === 'google') {
      const contents = [input.system, input.user].filter(Boolean).join('\n\n');
      const response = await withTimeout(getGoogleClient(apiKey).models.generateContent({
        model: config.model,
        contents,
        config: {
          temperature: input.temperature ?? 0.7,
          topP: input.topP ?? 0.92,
          maxOutputTokens: input.maxTokens ?? 600,
          ...(input.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      } as any), timeoutMs);
      return { ok: true, text: extractTextFromGoogleResponse(response), reason: 'ok', provider: config.provider, model: config.model };
    }
    const baseUrl = config.baseUrl || (config.provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1');
    const response = await withTimeout(fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        temperature: input.temperature ?? 0.7,
        top_p: input.topP ?? 0.92,
        max_tokens: input.maxTokens ?? 600,
        ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          ...(input.system ? [{ role: 'system', content: input.system }] : []),
          { role: 'user', content: input.user },
        ],
      }),
    }), timeoutMs);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, text: '', reason: `platform_ai_http_${response.status}:${body.slice(0, 160)}`, provider: config.provider, model: config.model };
    }
    const payload = await response.json().catch(() => ({}));
    const text = String(payload?.choices?.[0]?.message?.content || '').trim();
    return { ok: Boolean(text), text, reason: text ? 'ok' : 'platform_ai_empty', provider: config.provider, model: config.model };
  } catch (error: any) {
    return { ok: false, text: '', reason: error?.message || 'platform_ai_failed', provider: config.provider, model: config.model };
  }
}

export function stripLegacyAiModel<T extends { model?: unknown; aiModel?: unknown }>(config: T) {
  const next = { ...config } as T;
  delete (next as any).model;
  delete (next as any).aiModel;
  return next;
}
