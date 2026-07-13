import { spawn } from 'node:child_process';

const directUrl = String(process.env.DIRECT_URL || '').trim();
const migrationUrl = String(process.env.MIGRATION_DATABASE_URL || process.env.SUPABASE_MIGRATION_DATABASE_URL || '').trim();
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

const child = spawn('prisma', ['migrate', 'deploy'], {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[prisma:migrate] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
