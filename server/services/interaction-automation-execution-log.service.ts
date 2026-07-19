import fs from 'node:fs/promises';
import path from 'node:path';

export type InteractionAutomationModule = 'auto_like' | 'comment_publish' | 'quote_publish' | 'auto_post';
export type InteractionAutomationLogLevel = 'info' | 'warn' | 'error';

export type InteractionAutomationExecutionEvent = {
  timestamp: string;
  module: InteractionAutomationModule;
  runId: string;
  level: InteractionAutomationLogLevel;
  phase: string;
  message: string;
  status?: string | null;
  reason?: string | null;
  error?: string | null;
  postId?: string | null;
  robotUserId?: string | null;
  details?: Record<string, unknown>;
};

const LOG_DIR = path.join(process.cwd(), 'logs', 'interaction-automation');
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STRING_LENGTH = 800;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 4;

function truncate(raw: unknown, max = MAX_STRING_LENGTH) {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function isSensitive(pathParts: string[]) {
  return pathParts.some((part) => {
    const key = part.toLowerCase();
    return key === 'password'
      || key === 'secret'
      || key === 'authorization'
      || key === 'bearer'
      || key.includes('apikey')
      || key.includes('api_key')
      || (key.endsWith('token') && key !== 'maxtokens');
  });
}

function safeValue(value: unknown, depth = 0, pathParts: string[] = []): unknown {
  if (isSensitive(pathParts)) return '[redacted]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_LENGTH).map((item, index) => safeValue(item, depth + 1, [...pathParts, String(index)]));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)) output[key] = safeValue(item, depth + 1, [...pathParts, key]);
    return output;
  }
  return truncate(value);
}

function safeObject(value: unknown) {
  return safeValue(value || {}) as Record<string, unknown>;
}

function filePath(module: InteractionAutomationModule, runId: string) {
  return path.join(LOG_DIR, module, `${String(runId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`);
}

async function ensureModuleLogDir(module: InteractionAutomationModule) {
  await fs.mkdir(path.join(LOG_DIR, module), { recursive: true });
}

export async function cleanupInteractionAutomationExecutionLogs() {
  const cutoff = Date.now() - RETENTION_MS;
  for (const module of ['auto_like', 'comment_publish', 'quote_publish', 'auto_post'] as InteractionAutomationModule[]) {
    try {
      await ensureModuleLogDir(module);
      const entries = await fs.readdir(path.join(LOG_DIR, module), { withFileTypes: true }).catch(() => []);
      await Promise.all(entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map(async (entry) => {
          const fullPath = path.join(LOG_DIR, module, entry.name);
          const stat = await fs.stat(fullPath).catch(() => null);
          if (stat && stat.mtimeMs < cutoff) await fs.unlink(fullPath).catch(() => undefined);
        }));
    } catch (error) {
      console.warn('[interaction-automation-log] cleanup failed:', error instanceof Error ? error.message : error);
    }
  }
}

export async function logInteractionAutomationEvent(event: Omit<InteractionAutomationExecutionEvent, 'timestamp' | 'level'> & { level?: InteractionAutomationLogLevel }) {
  const payload: InteractionAutomationExecutionEvent = {
    timestamp: new Date().toISOString(),
    module: event.module,
    runId: truncate(event.runId, 160),
    level: event.level || 'info',
    phase: truncate(event.phase, 100),
    message: truncate(event.message, 500),
    status: event.status || null,
    reason: event.reason ? truncate(event.reason, 300) : null,
    error: event.error ? truncate(event.error, 800) : null,
    postId: event.postId || null,
    robotUserId: event.robotUserId || null,
    details: safeObject(event.details),
  };
  try {
    await ensureModuleLogDir(payload.module);
    await fs.appendFile(filePath(payload.module, payload.runId), `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    console.warn('[interaction-automation-log] write failed:', error instanceof Error ? error.message : error);
  }
}

function parseLine(line: string): InteractionAutomationExecutionEvent | null {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed as InteractionAutomationExecutionEvent : null;
  } catch {
    return null;
  }
}

export async function getInteractionAutomationExecutionEvents(module: InteractionAutomationModule, runId: string) {
  await cleanupInteractionAutomationExecutionLogs();
  const text = await fs.readFile(filePath(module, runId), 'utf8').catch(() => '');
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map(parseLine).filter(Boolean) as InteractionAutomationExecutionEvent[];
}

export async function attachInteractionAutomationExecutionEvents<T extends { id?: string | null }>(module: InteractionAutomationModule, runs: T[]) {
  return Promise.all(runs.map(async (run) => ({
    ...run,
    processEvents: run.id ? await getInteractionAutomationExecutionEvents(module, String(run.id)) : [],
  })));
}
