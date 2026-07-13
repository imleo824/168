import { spawn } from 'node:child_process';

const directUrl = String(process.env.DIRECT_URL || '').trim();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

function deriveSupabaseDirectUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.endsWith('.pooler.supabase.com')) return '';

    const username = decodeURIComponent(parsed.username || '');
    const projectRef = username.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
    if (!projectRef) return '';

    parsed.username = 'postgres';
    parsed.hostname = `db.${projectRef}.supabase.co`;
    parsed.port = '5432';
    parsed.searchParams.delete('pgbouncer');
    parsed.searchParams.delete('connection_limit');
    parsed.searchParams.delete('pool_timeout');
    if (!parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
    return parsed.toString();
  } catch {
    return '';
  }
}

const derivedDirectUrl = deriveSupabaseDirectUrl(databaseUrl);

if (directUrl) {
  process.env.DATABASE_URL = directUrl;
  console.log('[prisma:migrate] Using DIRECT_URL for migrations.');
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
