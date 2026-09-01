import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import prisma, { isDbConfigured } from '../db';

export type AutoCrawlExecutionLogLevel = 'info' | 'warn' | 'error';
export type AutoCrawlExecutionLogScope = 'run' | 'source' | 'item' | 'quality' | 'ai' | 'publish';
export type AutoCrawlExecutionLogEvent = {
  timestamp: string;
  runId: string;
  trigger?: string;
  level: AutoCrawlExecutionLogLevel;
  scope: AutoCrawlExecutionLogScope;
  phase: string;
  message: string;
  sourceId?: string | null;
  sourceName?: string | null;
  sourcePostId?: string | null;
  fingerprint?: string | null;
  counts?: Record<string, unknown>;
  status?: string | null;
  reason?: string | null;
  error?: string | null;
  details?: Record<string, unknown>;
};
export type AutoCrawlExecutionLogSummary = {
  runId: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  sourceCount: number;
  scanned: number;
  delivered: number;
  filtered: number;
  duplicate: number;
  error: number;
  eventCount: number;
  latestMessage: string;
};

const LOG_DIR = path.join(process.cwd(), 'logs', 'auto-crawl');
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_STRING_LENGTH = 800;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 5;
type AutoCrawlLogFile = { fullPath: string; mtimeMs: number };

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
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item, index) => safeValue(item, depth + 1, [...pathParts, String(index)]));
  }
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS)) {
      output[key] = safeValue(item, depth + 1, [...pathParts, key]);
    }
    return output;
  }
  return truncate(value);
}
function safeObject(value: unknown) {
  return safeValue(value || {}) as Record<string, unknown>;
}
function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function filePath(runId: string) {
  return path.join(LOG_DIR, `${String(runId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`);
}
function parseLine(line: string): AutoCrawlExecutionLogEvent | null {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed as AutoCrawlExecutionLogEvent : null;
  } catch {
    return null;
  }
}
async function ensureLogDir() {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

export async function cleanupAutoCrawlExecutionLogs() {
  try {
    await ensureLogDir();
    const cutoff = Date.now() - RETENTION_MS;
    const entries: Dirent[] = await fs.readdir(LOG_DIR, { withFileTypes: true }).catch((): Dirent[] => []);
    await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(async (entry) => {
        const fullPath = path.join(LOG_DIR, entry.name);
        const stat = await fs.stat(fullPath).catch((): null => null);
        if (stat && stat.mtimeMs < cutoff) await fs.unlink(fullPath).catch((): void => undefined);
      }));
  } catch (error) {
    console.warn('[auto-crawl-log] cleanup failed:', error instanceof Error ? error.message : error);
  }
}

export function createAutoCrawlExecutionLogger(runId: string, trigger: string) {
  let chain: Promise<void> = Promise.resolve();
  const log = (event: Omit<AutoCrawlExecutionLogEvent, 'timestamp' | 'runId' | 'trigger' | 'level'> & { level?: AutoCrawlExecutionLogLevel }) => {
    const payload: AutoCrawlExecutionLogEvent = {
      timestamp: new Date().toISOString(),
      runId,
      trigger,
      level: event.level || 'info',
      scope: event.scope,
      phase: truncate(event.phase, 100),
      message: truncate(event.message, 500),
      sourceId: event.sourceId || null,
      sourceName: event.sourceName || null,
      sourcePostId: event.sourcePostId || null,
      fingerprint: event.fingerprint || null,
      counts: safeObject(event.counts),
      status: event.status || null,
      reason: event.reason ? truncate(event.reason, 300) : null,
      error: event.error ? truncate(event.error, 800) : null,
      details: safeObject(event.details),
    };
    chain = chain.then(async () => {
      try {
        await ensureLogDir();
        await fs.appendFile(filePath(runId), `${JSON.stringify(payload)}\n`, 'utf8');
      } catch (error) {
        console.warn('[auto-crawl-log] write failed:', error instanceof Error ? error.message : error);
      }
    });
    return chain;
  };
  return { log, flush: (): Promise<void> => chain.catch((): void => undefined) };
}

function summarize(events: AutoCrawlExecutionLogEvent[]): AutoCrawlExecutionLogSummary | null {
  if (!events.length) return null;
  const first = events[0];
  const finish = [...events].reverse().find((event) => event.phase === 'run_finished');
  const last = events[events.length - 1];
  const counts = finish?.counts || {};
  return {
    runId: first.runId,
    trigger: first.trigger || '',
    startedAt: first.timestamp,
    finishedAt: finish?.timestamp || null,
    status: String(finish?.status || last.status || 'RUNNING'),
    sourceCount: Number(counts.sourceCount || 0),
    scanned: Number(counts.scanned || 0),
    delivered: Number(counts.delivered || 0),
    filtered: Number(counts.filtered || 0),
    duplicate: Number(counts.duplicate || 0),
    error: Number(counts.error || 0),
    eventCount: events.length,
    latestMessage: last.message || '',
  };
}
async function readEvents(fullPath: string) {
  const text = await fs.readFile(fullPath, 'utf8');
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map(parseLine).filter(Boolean) as AutoCrawlExecutionLogEvent[];
}

function runSummary(row: any): AutoCrawlExecutionLogSummary {
  const startedAt = iso(row.startedAt) || new Date().toISOString();
  const finishedAt = iso(row.finishedAt);
  const status = String(row.status || (finishedAt ? 'SKIPPED' : 'RUNNING'));
  const reason = String(row.skipReason || row.errorMessage || '').trim();
  const latestTitle = String(row.latestTitle || '').trim();
  return {
    runId: String(row.id),
    trigger: String(row.trigger || ''),
    startedAt,
    finishedAt,
    status,
    sourceCount: Number(row.sourceCount || 0),
    scanned: Number(row.scanned || 0),
    delivered: Number(row.delivered || 0),
    filtered: Number(row.filtered || 0),
    duplicate: Number(row.duplicate || 0),
    error: Number(row.error || 0),
    eventCount: 0,
    latestMessage: latestTitle || reason || (finishedAt ? '自动抓取运行结束' : '自动抓取正在运行'),
  };
}

function runEventsFromSummary(summary: AutoCrawlExecutionLogSummary, row?: any): AutoCrawlExecutionLogEvent[] {
  const reason = String(row?.skipReason || row?.errorMessage || '').trim();
  const events: AutoCrawlExecutionLogEvent[] = [{
    timestamp: summary.startedAt,
    runId: summary.runId,
    trigger: summary.trigger,
    level: 'info',
    scope: 'run',
    phase: 'run_started',
    message: '自动抓取运行开始',
    status: 'RUNNING',
    counts: {},
    reason: null,
    error: null,
    details: {},
  }];
  if (summary.finishedAt) {
    events.push({
      timestamp: summary.finishedAt,
      runId: summary.runId,
      trigger: summary.trigger,
      level: summary.status === 'FAILED' || summary.status === 'PARTIAL_FAILED' ? 'error' : 'info',
      scope: 'run',
      phase: 'run_finished',
      message: '自动抓取运行结束',
      status: summary.status,
      counts: {
        sourceCount: summary.sourceCount,
        scanned: summary.scanned,
        delivered: summary.delivered,
        filtered: summary.filtered,
        duplicate: summary.duplicate,
        error: summary.error,
      },
      reason: reason || null,
      error: row?.errorMessage || null,
      details: {
        latestTitle: row?.latestTitle || null,
        databaseFallback: true,
      },
    });
  }
  return events;
}

async function listDatabaseRunSummaries(limit: number) {
  if (!isDbConfigured()) return [];
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT "id","status","trigger","startedAt","finishedAt","scanned","delivered","filtered","duplicate","error","sourceCount","skipReason","errorMessage","latestTitle"
     FROM "AutoCrawlRun"
     ORDER BY "startedAt" DESC,"id" DESC
     LIMIT $1::integer`,
    Math.max(1, Math.min(100, limit)),
  ).catch((): any[] => []);
  return Array.isArray(rows) ? rows.map(runSummary) : [];
}

async function getDatabaseRun(runId: string) {
  if (!isDbConfigured()) return null;
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT "id","status","trigger","startedAt","finishedAt","scanned","delivered","filtered","duplicate","error","sourceCount","skipReason","errorMessage","latestTitle"
     FROM "AutoCrawlRun"
     WHERE "id"=$1
     LIMIT 1`,
    runId,
  ).catch((): any[] => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function listAutoCrawlExecutionLogs(limit = 20): Promise<AutoCrawlExecutionLogSummary[]> {
  await cleanupAutoCrawlExecutionLogs();
  await ensureLogDir();
  const entries: Dirent[] = await fs.readdir(LOG_DIR, { withFileTypes: true }).catch((): Dirent[] => []);
  const files: Array<AutoCrawlLogFile | null> = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map(async (entry) => {
      const fullPath = path.join(LOG_DIR, entry.name);
      const stat = await fs.stat(fullPath).catch((): null => null);
      return stat ? { fullPath, mtimeMs: stat.mtimeMs } : null;
    }));
  const summaries: AutoCrawlExecutionLogSummary[] = [];
  const recentFiles = files
    .filter((file): file is AutoCrawlLogFile => Boolean(file))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Math.max(1, Math.min(100, limit)));
  for (const file of recentFiles) {
    const summary = summarize(await readEvents(file.fullPath).catch((): AutoCrawlExecutionLogEvent[] => []));
    if (summary) summaries.push(summary);
  }
  const byRunId = new Map(summaries.map((summary) => [summary.runId, summary]));
  for (const summary of await listDatabaseRunSummaries(limit)) {
    if (!byRunId.has(summary.runId)) byRunId.set(summary.runId, summary);
  }
  return [...byRunId.values()]
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export async function getAutoCrawlExecutionLog(runId: string, options: { sourceId?: string } = {}) {
  await cleanupAutoCrawlExecutionLogs();
  const events = await readEvents(filePath(runId)).catch((): AutoCrawlExecutionLogEvent[] => []);
  let filtered = options.sourceId
    ? events.filter((event) => event.sourceId === options.sourceId || event.scope === 'run')
    : events;
  if (!filtered.length) {
    const row = await getDatabaseRun(runId);
    if (row) {
      const summary = runSummary(row);
      filtered = runEventsFromSummary(summary, row);
    }
  }
  return { runId, summary: summarize(filtered), events: filtered };
}

export async function listAutoCrawlExecutionLogDetails(limit = 20) {
  const summaries = await listAutoCrawlExecutionLogs(limit);
  const details = await Promise.all(summaries.map((summary) => getAutoCrawlExecutionLog(summary.runId)
    .catch(() => ({ runId: summary.runId, summary, events: [] as AutoCrawlExecutionLogEvent[] }))));
  return { summaries, details };
}
