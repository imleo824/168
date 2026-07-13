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
  const requiredTables = [
    'User',
    'PointTransaction',
    'ReferralInvite',
    'ReferralRelation',
  ];
  const requiredColumns = [
    { tableName: 'User', columnName: 'photoUrl' },
    { tableName: 'User', columnName: 'coverUrl' },
    { tableName: 'User', columnName: 'loginAccount' },
    { tableName: 'User', columnName: 'contact' },
    { tableName: 'User', columnName: 'passwordHash' },
    { tableName: 'User', columnName: 'paymentPasswordHash' },
    { tableName: 'User', columnName: 'displayName' },
    { tableName: 'User', columnName: 'points' },
    { tableName: 'User', columnName: 'viewCount' },
    { tableName: 'User', columnName: 'role' },
    { tableName: 'User', columnName: 'userType' },
    { tableName: 'User', columnName: 'createdAt' },
    { tableName: 'User', columnName: 'updatedAt' },
    { tableName: 'User', columnName: 'isDisabled' },
    { tableName: 'User', columnName: 'bio' },
    { tableName: 'User', columnName: 'plusStatus' },
    { tableName: 'User', columnName: 'plusPlan' },
    { tableName: 'User', columnName: 'plusExpiresAt' },
    { tableName: 'User', columnName: 'plusTrialUsed' },
    { tableName: 'PointTransaction', columnName: 'id' },
    { tableName: 'PointTransaction', columnName: 'amount' },
    { tableName: 'PointTransaction', columnName: 'action' },
    { tableName: 'PointTransaction', columnName: 'description' },
    { tableName: 'PointTransaction', columnName: 'referenceType' },
    { tableName: 'PointTransaction', columnName: 'referenceId' },
    { tableName: 'PointTransaction', columnName: 'metadata' },
    { tableName: 'PointTransaction', columnName: 'userId' },
    { tableName: 'PointTransaction', columnName: 'createdAt' },
    { tableName: 'ReferralInvite', columnName: 'id' },
    { tableName: 'ReferralInvite', columnName: 'userId' },
    { tableName: 'ReferralInvite', columnName: 'inviteCode' },
    { tableName: 'ReferralInvite', columnName: 'disabledAt' },
    { tableName: 'ReferralInvite', columnName: 'createdAt' },
    { tableName: 'ReferralInvite', columnName: 'updatedAt' },
    { tableName: 'ReferralRelation', columnName: 'id' },
    { tableName: 'ReferralRelation', columnName: 'referrerId' },
    { tableName: 'ReferralRelation', columnName: 'inviteeId' },
    { tableName: 'ReferralRelation', columnName: 'inviteCode' },
    { tableName: 'ReferralRelation', columnName: 'source' },
    { tableName: 'ReferralRelation', columnName: 'sourceIp' },
    { tableName: 'ReferralRelation', columnName: 'sourceUserAgent' },
    { tableName: 'ReferralRelation', columnName: 'registeredAt' },
    { tableName: 'ReferralRelation', columnName: 'createdAt' },
    { tableName: 'ReferralRelation', columnName: 'updatedAt' },
  ];
  const requiredEnumValues = [
    { enumName: 'PointAction', enumValue: 'SIGNUP_REWARD' },
    { enumName: 'PointAction', enumValue: 'TUI_PLUS' },
  ];

  const missingTables = await prisma.$queryRaw`
      SELECT item AS "name"
      FROM jsonb_array_elements_text(${JSON.stringify(requiredTables)}::jsonb) AS required_table(item)
      WHERE to_regclass(format('%I.%I', 'public', item)) IS NULL
    `;

  const missingColumns = await prisma.$queryRaw`
    WITH required AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(requiredColumns)}::jsonb)
        AS columns("tableName" text, "columnName" text)
    )
    SELECT required."tableName" || '.' || required."columnName" AS "name"
    FROM required
    LEFT JOIN information_schema.columns columns
      ON columns.table_schema = 'public'
     AND columns.table_name = required."tableName"
     AND columns.column_name = required."columnName"
    WHERE columns.column_name IS NULL
  `;

  const missingEnumValues = await prisma.$queryRaw`
    WITH required AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(requiredEnumValues)}::jsonb)
        AS enum_values("enumName" text, "enumValue" text)
    )
    SELECT required."enumName" || '.' || required."enumValue" AS "name"
    FROM required
    LEFT JOIN pg_type enum_type ON enum_type.typname = required."enumName"
    LEFT JOIN pg_enum enum_value
      ON enum_value.enumtypid = enum_type.oid
     AND enum_value.enumlabel = required."enumValue"
    WHERE enum_value.enumlabel IS NULL
  `;

  const missing = [
    ...missingTables.map((row) => row.name),
    ...missingColumns.map((row) => row.name),
    ...missingEnumValues.map((row) => row.name),
  ];

  if (missing.length > 0) {
    throw new Error(`runtime schema repair incomplete: ${missing.join(', ')}`);
  }
}

try {
  await execute(`DO $$ BEGIN CREATE TYPE "PointAction" AS ENUM ('RECHARGE', 'ANONYMOUS_PUBLISH', 'PIN_POST', 'AD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await execute(`ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'SIGNUP_REWARD'`);
  await execute(`ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'PIN_CHAT'`);
  await execute(`ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'TELEGRAM_SYNC'`);
  await execute(`ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'TUI_PLUS'`);
  await execute(`DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await execute(`DO $$ BEGIN CREATE TYPE "UserType" AS ENUM ('NORMAL', 'ROBOT', 'OFFICIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

  await execute(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT PRIMARY KEY,
      "displayName" TEXT NOT NULL DEFAULT '用户',
      "points" INTEGER NOT NULL DEFAULT 0,
      "viewCount" INTEGER NOT NULL DEFAULT 0,
      "role" "Role" NOT NULL DEFAULT 'USER',
      "userType" "UserType" NOT NULL DEFAULT 'NORMAL',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "isDisabled" BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginAccount" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "contact" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paymentPasswordHash" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT NOT NULL DEFAULT \'用户\'');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "Role" NOT NULL DEFAULT \'USER\'');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userType" "UserType" NOT NULL DEFAULT \'NORMAL\'');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plusStatus" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plusPlan" TEXT');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plusExpiresAt" TIMESTAMPTZ');
  await execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plusTrialUsed" BOOLEAN NOT NULL DEFAULT false');
  await execute('CREATE UNIQUE INDEX IF NOT EXISTS "User_loginAccount_key" ON "User" ("loginAccount")');
  await execute('CREATE INDEX IF NOT EXISTS "idx_user_created_id" ON "User" ("createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_user_type_created_id" ON "User" ("userType", "createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_user_role_created_id" ON "User" ("role", "createdAt" DESC, "id" DESC)');

  await execute(`
    CREATE TABLE IF NOT EXISTS "PointTransaction" (
      "id" TEXT PRIMARY KEY,
      "amount" INTEGER NOT NULL,
      "action" "PointAction" NOT NULL,
      "description" TEXT,
      "referenceType" TEXT,
      "referenceId" TEXT,
      "metadata" JSONB,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await execute('ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "description" TEXT');
  await execute('ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "referenceType" TEXT');
  await execute('ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "referenceId" TEXT');
  await execute('ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB');
  await execute('ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('CREATE INDEX IF NOT EXISTS "idx_point_tx_user_created_desc" ON "PointTransaction" ("userId", "createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_point_tx_user_action_created_desc" ON "PointTransaction" ("userId", "action", "createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_point_tx_created_id" ON "PointTransaction" ("createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_point_tx_action_created_id" ON "PointTransaction" ("action", "createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_point_tx_reference_action" ON "PointTransaction" ("referenceId", "action")');

  await execute(`
    CREATE TABLE IF NOT EXISTS "ReferralInvite" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
      "inviteCode" TEXT NOT NULL UNIQUE,
      "disabledAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await execute(`
    CREATE TABLE IF NOT EXISTS "ReferralRelation" (
      "id" TEXT PRIMARY KEY,
      "referrerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "inviteeId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
      "inviteCode" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "sourceIp" TEXT,
      "sourceUserAgent" TEXT,
      "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT "ReferralRelation_no_self" CHECK ("referrerId" <> "inviteeId")
    )
  `);
  await execute('ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMPTZ');
  await execute('ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "ReferralInvite" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT \'manual\'');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "sourceIp" TEXT');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "sourceUserAgent" TEXT');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('ALTER TABLE "ReferralRelation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()');
  await execute('CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_invite_user_unique" ON "ReferralInvite" ("userId")');
  await execute('CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_invite_code_unique" ON "ReferralInvite" ("inviteCode")');
  await execute('CREATE UNIQUE INDEX IF NOT EXISTS "idx_referral_relation_invitee_unique" ON "ReferralRelation" ("inviteeId")');
  await execute('CREATE INDEX IF NOT EXISTS "idx_referral_relation_referrer_created" ON "ReferralRelation" ("referrerId", "createdAt" DESC, "id" DESC)');
  await execute('CREATE INDEX IF NOT EXISTS "idx_referral_relation_invitee" ON "ReferralRelation" ("inviteeId")');

  await assertRuntimeSchemaReady();
  console.log('[railway:schema-repair] Runtime schema ready.');
} catch (error) {
  console.error('[railway:schema-repair] Failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => {});
}
