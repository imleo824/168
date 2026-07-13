import type { Express } from 'express';
import prisma, { isDbConfigured } from '../db';
import { setNoStore } from '../http-cache';
import { getUploadStorageReadiness } from './upload.routes';

const HEALTH_CACHE_TTL_MS = 5_000;
const READINESS_CACHE_TTL_MS = 5_000;
const REQUIRED_RUNTIME_TABLES = [
  'User',
  'Post',
  'SystemConfig',
  'QuotePublishRun',
  'CommentPublishRun',
  'RobotContentSignature',
  'ChatRoom',
  'ChatMessage',
] as const;
const REQUIRED_RUNTIME_COLUMNS = [
  'User.loginAccount',
  'User.passwordHash',
  'User.paymentPasswordHash',
  'User.points',
  'User.isDisabled',
] as const;

let healthCache: { expiresAt: number; statusCode: number; payload: any } | null = null;
let readinessCache: { expiresAt: number; statusCode: number; payload: any } | null = null;

export function registerRootHealthRoute(app: Express) {
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ status: 'ok' });
  });
}

function respondCached(res: any, cache: { statusCode: number; payload: any }) {
  return res.status(cache.statusCode).json(cache.payload);
}

function makeCachedHealth(statusCode: number, payload: any) {
  healthCache = {
    expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
    statusCode,
    payload,
  };
  return healthCache;
}

function makeCachedReadiness(statusCode: number, payload: any) {
  readinessCache = {
    expiresAt: Date.now() + READINESS_CACHE_TTL_MS,
    statusCode,
    payload,
  };
  return readinessCache;
}

export function registerApiHealthRoute(app: Express) {
  app.get('/api/health', async (_req, res) => {
    setNoStore(res);

    if (healthCache && healthCache.expiresAt > Date.now()) {
      return respondCached(res, healthCache);
    }

    if (!isDbConfigured()) {
      const production = process.env.NODE_ENV === 'production';
      return respondCached(res, makeCachedHealth(production ? 503 : 200, {
        status: production ? 'degraded' : 'ok',
        database: 'disabled',
        timestamp: new Date().toISOString(),
      }));
    }

    try {
      await prisma.$queryRaw`select 1`;
      return respondCached(res, makeCachedHealth(200, {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      }));
    } catch {
      return respondCached(res, makeCachedHealth(503, {
        status: 'degraded',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      }));
    }
  });

  app.get('/api/readyz', async (_req, res) => {
    setNoStore(res);

    if (readinessCache && readinessCache.expiresAt > Date.now()) {
      return respondCached(res, readinessCache);
    }

    const production = process.env.NODE_ENV === 'production';
    const checks: Record<string, any> = {
      process: { ready: true },
      database: { ready: false, configured: isDbConfigured() },
      schema: { ready: false, missingTables: [] as string[], missingColumns: [] as string[] },
      imageStorage: await getUploadStorageReadiness(),
    };

    if (!isDbConfigured()) {
      const statusCode = production ? 503 : 200;
      return respondCached(res, makeCachedReadiness(statusCode, {
        status: production ? 'not_ready' : 'ready_without_database',
        ready: !production,
        checks,
        timestamp: new Date().toISOString(),
      }));
    }

    try {
      await prisma.$queryRaw`select 1`;
      checks.database.ready = true;
      const rows = await prisma.$queryRaw<Array<{ tableName: string; exists: boolean }>>`
        SELECT table_name AS "tableName", to_regclass(format('%I.%I', 'public', table_name)) IS NOT NULL AS "exists"
        FROM unnest(${REQUIRED_RUNTIME_TABLES as any}::text[]) AS table_name
      `;
      const existing = new Map(rows.map((row) => [row.tableName, Boolean(row.exists)]));
      checks.schema.missingTables = REQUIRED_RUNTIME_TABLES.filter((table) => !existing.get(table));
      const columnRows = await prisma.$queryRaw<Array<{ tableName: string; columnName: string; exists: boolean }>>`
        WITH required AS (
          SELECT
            split_part(item, '.', 1) AS table_name,
            split_part(item, '.', 2) AS column_name
          FROM unnest(${REQUIRED_RUNTIME_COLUMNS as any}::text[]) AS item
        )
        SELECT
          required.table_name AS "tableName",
          required.column_name AS "columnName",
          columns.column_name IS NOT NULL AS "exists"
        FROM required
        LEFT JOIN information_schema.columns columns
          ON columns.table_schema = 'public'
         AND columns.table_name = required.table_name
         AND columns.column_name = required.column_name
      `;
      checks.schema.missingColumns = columnRows
        .filter((row) => !row.exists)
        .map((row) => `${row.tableName}.${row.columnName}`);
      checks.schema.ready = checks.schema.missingTables.length === 0 && checks.schema.missingColumns.length === 0;
      const ready = checks.database.ready && checks.schema.ready;
      return respondCached(res, makeCachedReadiness(ready ? 200 : 503, {
        status: ready ? 'ready' : 'not_ready',
        ready,
        checks,
        timestamp: new Date().toISOString(),
      }));
    } catch (error: any) {
      checks.database.error = error?.message || 'database_check_failed';
      return respondCached(res, makeCachedReadiness(503, {
        status: 'not_ready',
        ready: false,
        checks,
        timestamp: new Date().toISOString(),
      }));
    }
  });
}

export function registerFaviconRoute(app: Express) {
  app.get('/favicon.ico', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
    res.redirect(308, '/favicon-32.png');
  });
}
