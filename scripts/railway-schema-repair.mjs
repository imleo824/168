import { PrismaClient } from '@prisma/client';

const explicitMigrationUrl = String(process.env.MIGRATION_DATABASE_URL || process.env.SUPABASE_MIGRATION_DATABASE_URL || process.env.DIRECT_URL || '').trim();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

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

function resolveMigrationUrl() {
  if (explicitMigrationUrl) return { source: 'explicit_migration_url', url: explicitMigrationUrl };
  const sessionPoolerUrl = deriveSupabaseSessionPoolerUrl(databaseUrl);
  if (sessionPoolerUrl) return { source: 'derived_supabase_session_pooler', url: sessionPoolerUrl };
  if (databaseUrl) return { source: 'database_url', url: databaseUrl };
  return { source: 'missing', url: '' };
}

const resolved = resolveMigrationUrl();
if (!resolved.url) {
  console.error('[railway:schema-repair] DATABASE_URL is missing.');
  process.exit(1);
}

console.log(`[railway:schema-repair] Using ${resolved.source}.`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: resolved.url,
    },
  },
});

async function execute(statement) {
  await prisma.$executeRawUnsafe(statement);
}

async function assertRuntimeSchemaReady() {
  const missingColumns = await prisma.$queryRaw`
    WITH required(table_name, column_name) AS (
      VALUES
        ('User', 'loginAccount'),
        ('User', 'passwordHash'),
        ('User', 'paymentPasswordHash'),
        ('User', 'points'),
        ('User', 'isDisabled')
    )
    SELECT required.table_name || '.' || required.column_name AS "name"
    FROM required
    LEFT JOIN information_schema.columns columns
      ON columns.table_schema = 'public'
     AND columns.table_name = required.table_name
     AND columns.column_name = required.column_name
    WHERE columns.column_name IS NULL
  `;

  const enumRows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type enum_type
      JOIN pg_enum enum_value ON enum_value.enumtypid = enum_type.oid
      WHERE enum_type.typname = 'PointAction'
        AND enum_value.enumlabel = 'SIGNUP_REWARD'
    ) AS "exists"
  `;

  const missing = [
    ...missingColumns.map((row) => row.name),
    ...(enumRows[0]?.exists ? [] : ['PointAction.SIGNUP_REWARD']),
  ];

  if (missing.length > 0) {
    throw new Error(`runtime schema repair incomplete: ${missing.join(', ')}`);
  }
}

try {
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAccount" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paymentPasswordHash" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false');
  await execute('CREATE UNIQUE INDEX IF NOT EXISTS "User_loginAccount_key" ON "User" ("loginAccount")');
  await execute('ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS \'SIGNUP_REWARD\'');
  await assertRuntimeSchemaReady();
  console.log('[railway:schema-repair] Runtime schema ready.');
} catch (error) {
  console.error('[railway:schema-repair] Failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}

