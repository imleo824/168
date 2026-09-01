import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const explicitMigrationUrl = String(process.env.MIGRATION_DATABASE_URL || process.env.SUPABASE_MIGRATION_DATABASE_URL || process.env.DIRECT_URL || '').trim();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const root = path.resolve(import.meta.dirname, '..');
const schemaPath = path.join(root, 'prisma/schema.prisma');
const scalarTypes = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

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

function resolveVerificationUrl() {
  if (explicitMigrationUrl) return { source: 'explicit_migration_url', url: explicitMigrationUrl };
  const sessionPoolerUrl = deriveSupabaseSessionPoolerUrl(databaseUrl);
  if (sessionPoolerUrl) return { source: 'derived_supabase_session_pooler', url: sessionPoolerUrl };
  const directUrl = deriveSupabaseDirectUrl(databaseUrl);
  if (directUrl) return { source: 'derived_supabase_direct', url: directUrl };
  if (databaseUrl) return { source: 'database_url', url: databaseUrl };
  return { source: 'missing', url: '' };
}

function stripAttributes(line) {
  return line.replace(/\/\/.*$/, '').trim();
}

function parseSchema(source) {
  const enumNames = new Set();
  const enums = [];
  const models = [];

  for (const enumMatch of source.matchAll(/enum\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const [, name, body] = enumMatch;
    enumNames.add(name);
    const values = body
      .split('\n')
      .map(stripAttributes)
      .filter((line) => line && !line.startsWith('@@') && !line.startsWith('@'))
      .map((line) => line.split(/\s+/)[0])
      .filter(Boolean);
    enums.push({ name, values });
  }

  for (const modelMatch of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const [, name, body] = modelMatch;
    const columns = body
      .split('\n')
      .map(stripAttributes)
      .filter((line) => line && !line.startsWith('@@') && !line.startsWith('@'))
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .filter(([fieldName]) => !fieldName.startsWith('@@') && !fieldName.startsWith('@'))
      .filter(([, rawType]) => {
        const cleanType = rawType.replace(/[?\[\]]/g, '');
        return scalarTypes.has(cleanType) || enumNames.has(cleanType);
      })
      .map(([fieldName]) => fieldName);
    models.push({ name, columns });
  }

  return { enums, models };
}

async function main() {
  const resolved = resolveVerificationUrl();
  if (!resolved.url) {
    console.error('[railway:schema-verify] DATABASE_URL is missing.');
    process.exit(1);
  }

  console.log(`[railway:schema-verify] Using ${resolved.source}.`);

  const schema = parseSchema(fs.readFileSync(schemaPath, 'utf8'));
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: resolved.url,
      },
    },
  });

  try {
    const tableRows = await prisma.$queryRaw`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const existingTables = new Set(tableRows.map((row) => row.tableName));
    const missingTables = schema.models
      .map((model) => model.name)
      .filter((tableName) => !existingTables.has(tableName));

    const columnRows = await prisma.$queryRaw`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const existingColumns = new Set(columnRows.map((row) => `${row.tableName}.${row.columnName}`));
    const missingColumns = schema.models.flatMap((model) => (
      model.columns
        .map((columnName) => `${model.name}.${columnName}`)
        .filter((columnKey) => !existingColumns.has(columnKey))
    ));

    const enumRows = await prisma.$queryRaw`
      SELECT enum_type.typname AS "enumName", enum_value.enumlabel AS "enumValue"
      FROM pg_type enum_type
      JOIN pg_enum enum_value ON enum_value.enumtypid = enum_type.oid
    `;
    const existingEnumValues = new Set(enumRows.map((row) => `${row.enumName}.${row.enumValue}`));
    const missingEnumValues = schema.enums.flatMap((entry) => (
      entry.values
        .map((value) => `${entry.name}.${value}`)
        .filter((enumKey) => !existingEnumValues.has(enumKey))
    ));

    const missing = [...missingTables, ...missingColumns, ...missingEnumValues];
    if (missing.length > 0) {
      throw new Error(`schema verification failed: ${missing.join(', ')}`);
    }

    console.log(`[railway:schema-verify] Schema ready: ${schema.models.length} tables, ${schema.enums.length} enums.`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[railway:schema-verify] Failed:', error?.message || error);
  process.exit(1);
});
