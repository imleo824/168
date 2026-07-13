import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const directUrl = String(process.env.DIRECT_URL || '').trim();
const migrationUrl = String(process.env.MIGRATION_DATABASE_URL || process.env.SUPABASE_MIGRATION_DATABASE_URL || '').trim();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const migrationsDir = path.resolve(import.meta.dirname, '..', 'prisma', 'migrations');

function parseSupabasePooler(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('.pooler.supabase.com')) return '';

    const username = decodeURIComponent(parsed.username || '');
    const projectRef = username.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
    if (!projectRef) return '';
    return { parsed, projectRef };
  } catch {
    return '';
  }
}

function cleanMigrationUrl(parsed) {
  parsed.searchParams.delete('pgbouncer');
  parsed.searchParams.delete('connection_limit');
  parsed.searchParams.delete('pool_timeout');
  if (!parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
  return parsed.toString();
}

function deriveSupabaseSessionPoolerUrl(rawUrl) {
  const pooler = parseSupabasePooler(rawUrl);
  if (!pooler) return '';
  const parsed = new URL(pooler.parsed.toString());
  parsed.port = '5432';
  return cleanMigrationUrl(parsed);
}

function deriveSupabaseDirectUrl(rawUrl) {
  const pooler = parseSupabasePooler(rawUrl);
  if (!pooler) return '';
  try {
    const parsed = new URL(pooler.parsed.toString());
    parsed.username = 'postgres';
    parsed.hostname = `db.${pooler.projectRef}.supabase.co`;
    parsed.port = '5432';
    return cleanMigrationUrl(parsed);
  } catch {
    return '';
  }
}

const derivedSessionPoolerUrl = deriveSupabaseSessionPoolerUrl(databaseUrl);
const derivedDirectUrl = deriveSupabaseDirectUrl(databaseUrl);

if (migrationUrl) {
  process.env.DATABASE_URL = migrationUrl;
  console.log('[prisma:migrate] Using MIGRATION_DATABASE_URL for migrations.');
} else if (directUrl) {
  process.env.DATABASE_URL = directUrl;
  console.log('[prisma:migrate] Using DIRECT_URL for migrations.');
} else if (derivedSessionPoolerUrl) {
  process.env.DATABASE_URL = derivedSessionPoolerUrl;
  console.log('[prisma:migrate] Derived Supabase session pooler URL from DATABASE_URL for migrations.');
} else if (derivedDirectUrl) {
  process.env.DATABASE_URL = derivedDirectUrl;
  console.log('[prisma:migrate] Derived Supabase direct URL from DATABASE_URL for migrations.');
} else {
  console.log('[prisma:migrate] DIRECT_URL is not set; using DATABASE_URL.');
}

function runPrisma(args) {
  const result = spawnSync('prisma', args, {
    env: process.env,
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.signal) {
    console.error(`[prisma:migrate] prisma ${args.join(' ')} terminated by ${result.signal}`);
    return { ok: false, status: 1, output: `${result.stdout || ''}${result.stderr || ''}` };
  }

  const status = result.status ?? 1;
  return {
    ok: status === 0,
    status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function listLocalMigrations() {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(migrationsDir, name, 'migration.sql')))
    .sort();
}

async function readBaselineState() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

  try {
    const tableRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS "count"
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name <> '_prisma_migrations'
    `;
    const migrationRows = await prisma.$queryRaw`
      SELECT COALESCE(to_regclass('public._prisma_migrations') IS NOT NULL, false) AS "exists"
    `;
    const migrationCountRows = migrationRows[0]?.exists
      ? await prisma.$queryRaw`SELECT COUNT(*)::int AS "count" FROM "_prisma_migrations"`
      : [{ count: 0 }];

    return {
      hasApplicationTables: Number(tableRows[0]?.count || 0) > 0,
      hasMigrationHistory: Number(migrationCountRows[0]?.count || 0) > 0,
    };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function canBaselineExistingDatabase() {
  if (process.env.PRISMA_BASELINE_EXISTING_DB === '0') return false;
  const state = await readBaselineState();
  return state.hasApplicationTables && !state.hasMigrationHistory;
}

async function baselineExistingDatabase() {
  const migrations = listLocalMigrations();
  if (migrations.length === 0) {
    throw new Error('No local Prisma migrations found to baseline.');
  }

  console.log(`[prisma:migrate] Baselining existing database with ${migrations.length} local migrations.`);
  for (const migration of migrations) {
    const result = runPrisma(['migrate', 'resolve', '--applied', migration]);
    if (!result.ok) {
      throw new Error(`Failed to baseline migration ${migration}.`);
    }
  }
}

async function main() {
  const firstDeploy = runPrisma(['migrate', 'deploy']);
  if (firstDeploy.ok) return;

  const isExistingDatabaseWithoutBaseline = firstDeploy.output.includes('P3005')
    && await canBaselineExistingDatabase();
  if (!isExistingDatabaseWithoutBaseline) {
    process.exit(firstDeploy.status);
  }

  await baselineExistingDatabase();
  const secondDeploy = runPrisma(['migrate', 'deploy']);
  if (!secondDeploy.ok) {
    process.exit(secondDeploy.status);
  }
}

main().catch((error) => {
  console.error('[prisma:migrate] Failed:', error?.message || error);
  process.exit(1);
});
