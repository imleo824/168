import prisma, { isDbConfigured } from '../db';
import { getAutomationTaskLock } from './automation-task-lock.service';
import { getAutomationRuntimeSnapshot } from './automation/automation-runtime';

export type AutoCrawlRuntimeStatus = {
  now: string;
  isBusy: boolean;
  scheduler: ReturnType<typeof getAutomationRuntimeSnapshot>;
  autoCrawlScheduler: ReturnType<typeof getAutomationRuntimeSnapshot>['modules'][number] | null;
  activeLock: null | {
    name: string;
    owner: string;
    lockedAt: string | null;
    expiresAt: string | null;
    active: boolean;
  };
  activeRun: null | {
    id: string;
    status: string;
    trigger: string;
    startedAt: string | null;
    finishedAt: string | null;
    scanned: number;
    delivered: number;
    filtered: number;
    duplicate: number;
    error: number;
    sourceCount: number;
    skipReason: string | null;
    errorMessage: string | null;
    latestTitle: string | null;
  };
  latestRun: AutoCrawlRuntimeStatus['activeRun'];
  staleRunningRun: AutoCrawlRuntimeStatus['activeRun'];
  needsRecovery: boolean;
  totals: {
    sourceCount: number;
    enabledSourceCount: number;
    runningRunCount: number;
    itemCount: number;
    publishedItemCount: number;
    autoCrawlPostCount: number;
    latestAutoCrawlPostAt: string | null;
  };
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function first<T>(rows: T[] | unknown): T | null {
  return Array.isArray(rows) && rows.length ? rows[0] as T : null;
}
function mapRun(row: any): AutoCrawlRuntimeStatus['activeRun'] {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    status: String(row.status || ''),
    trigger: String(row.trigger || ''),
    startedAt: toIso(row.startedAt),
    finishedAt: toIso(row.finishedAt),
    scanned: Number(row.scanned || 0),
    delivered: Number(row.delivered || 0),
    filtered: Number(row.filtered || 0),
    duplicate: Number(row.duplicate || 0),
    error: Number(row.error || 0),
    sourceCount: Number(row.sourceCount || 0),
    skipReason: row.skipReason || null,
    errorMessage: row.errorMessage || null,
    latestTitle: row.latestTitle || null,
  };
}
function emptyStatus(now: string): AutoCrawlRuntimeStatus {
  const scheduler = getAutomationRuntimeSnapshot();
  return {
    now,
    isBusy: false,
    scheduler,
    autoCrawlScheduler: scheduler.modules.find((item) => item.module === 'auto_crawl') || null,
    activeLock: null,
    activeRun: null,
    latestRun: null,
    staleRunningRun: null,
    needsRecovery: false,
    totals: {
      sourceCount: 0,
      enabledSourceCount: 0,
      runningRunCount: 0,
      itemCount: 0,
      publishedItemCount: 0,
      autoCrawlPostCount: 0,
      latestAutoCrawlPostAt: null,
    },
  };
}

export async function getAutoCrawlRuntimeStatus(): Promise<AutoCrawlRuntimeStatus> {
  const scheduler = getAutomationRuntimeSnapshot();
  const autoCrawlScheduler = scheduler.modules.find((item) => item.module === 'auto_crawl') || null;
  if (!isDbConfigured()) return emptyStatus(new Date().toISOString());

  const query = (sql: string, ...params: unknown[]) => (prisma as any).$queryRawUnsafe(sql, ...params) as Promise<any[]>;
  const now = toIso(first<any>(await query(`SELECT now() AS now`))?.now) || new Date().toISOString();
  const [lockRow, activeRunRow, latestRunRow, staleRunningRunRow, totalsRow] = await Promise.all([
    getAutomationTaskLock('auto_crawl').catch(() => null),
    query(`SELECT "id","status","trigger","startedAt","finishedAt","scanned","delivered","filtered","duplicate","error","sourceCount","skipReason","errorMessage","latestTitle" FROM "AutoCrawlRun" WHERE "status"='RUNNING' AND "startedAt">=CURRENT_TIMESTAMP-INTERVAL '30 minutes' ORDER BY "startedAt" DESC,"id" DESC LIMIT 1`).then(first<any>).catch(() => null),
    query(`SELECT "id","status","trigger","startedAt","finishedAt","scanned","delivered","filtered","duplicate","error","sourceCount","skipReason","errorMessage","latestTitle" FROM "AutoCrawlRun" ORDER BY "startedAt" DESC,"id" DESC LIMIT 1`).then(first<any>).catch(() => null),
    query(`SELECT "id","status","trigger","startedAt","finishedAt","scanned","delivered","filtered","duplicate","error","sourceCount","skipReason","errorMessage","latestTitle" FROM "AutoCrawlRun" WHERE "status"='RUNNING' AND "startedAt"<CURRENT_TIMESTAMP-INTERVAL '30 minutes' ORDER BY "startedAt" ASC,"id" ASC LIMIT 1`).then(first<any>).catch(() => null),
    query(`SELECT
      (SELECT COUNT(*)::int FROM "AutoCrawlSource") AS "sourceCount",
      (SELECT COUNT(*)::int FROM "AutoCrawlSource" WHERE "disabled"=FALSE) AS "enabledSourceCount",
      (SELECT COUNT(*)::int FROM "AutoCrawlRun" WHERE "status"='RUNNING' AND "startedAt">=CURRENT_TIMESTAMP-INTERVAL '30 minutes') AS "runningRunCount",
      (SELECT COUNT(*)::int FROM "AutoCrawlItem") AS "itemCount",
      (SELECT COUNT(*)::int FROM "AutoCrawlItem" WHERE "status"='PUBLISHED') AS "publishedItemCount",
      (SELECT COUNT(*)::int FROM "AutoCrawlItem" WHERE "postId" IS NOT NULL) AS "autoCrawlPostCount",
      (SELECT MAX(p."createdAt") FROM "AutoCrawlItem" i JOIN "Post" p ON p."id"=i."postId" WHERE i."postId" IS NOT NULL) AS "latestAutoCrawlPostAt"`).then(first<any>).catch(() => ({})),
  ]);

  const activeLock = lockRow ? {
    name: String(lockRow.name || 'auto_crawl'),
    owner: String(lockRow.owner || ''),
    lockedAt: toIso(lockRow.lockedAt),
    expiresAt: toIso(lockRow.expiresAt),
    active: Boolean(lockRow.active),
  } : null;
  const activeRun = mapRun(activeRunRow);
  const latestRun = mapRun(latestRunRow);
  const staleRunningRun = mapRun(staleRunningRunRow);
  const totals = {
    sourceCount: Number(totalsRow?.sourceCount || 0),
    enabledSourceCount: Number(totalsRow?.enabledSourceCount || 0),
    runningRunCount: Number(totalsRow?.runningRunCount || 0),
    itemCount: Number(totalsRow?.itemCount || 0),
    publishedItemCount: Number(totalsRow?.publishedItemCount || 0),
    autoCrawlPostCount: Number(totalsRow?.autoCrawlPostCount || 0),
    latestAutoCrawlPostAt: toIso(totalsRow?.latestAutoCrawlPostAt),
  };

  return {
    now,
    isBusy: Boolean(activeLock?.active || activeRun || autoCrawlScheduler?.status === 'RUNNING'),
    scheduler,
    autoCrawlScheduler,
    activeLock,
    activeRun,
    latestRun,
    staleRunningRun,
    needsRecovery: Boolean(staleRunningRun),
    totals,
  };
}
