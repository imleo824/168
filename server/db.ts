import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const FALLBACK_DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
const DATABASE_URL = process.env.DATABASE_URL || FALLBACK_DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';
const hasLoggedDatabaseUrlWarning = Symbol.for('tuitui.prisma.databaseUrlWarning');

export const isDbConfigured = () => {
  return !!process.env.DATABASE_URL && process.env.DATABASE_URL !== FALLBACK_DATABASE_URL;
};

function warnIfDatabaseUrlLooksUnsafe() {
  const globalState = globalThis as any;
  if (globalState[hasLoggedDatabaseUrlWarning]) return;
  globalState[hasLoggedDatabaseUrlWarning] = true;
  if (!process.env.DATABASE_URL) return;

  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port || '5432';
    const usesSupabasePooler = hostname.includes('.pooler.supabase.com');
    const usesTransactionPooler = usesSupabasePooler && port === '6543';
    const hasPgBouncerFlag = parsed.searchParams.get('pgbouncer') === 'true';

    const problems: string[] = [];
    if (usesSupabasePooler && !usesTransactionPooler) {
      problems.push('DATABASE_URL is using Supabase pooler outside transaction mode. Use port 6543 for high-concurrency app traffic.');
    }
    if (usesTransactionPooler && !hasPgBouncerFlag) {
      problems.push('DATABASE_URL uses Supabase transaction pooler but is missing pgbouncer=true for Prisma.');
    }

    if (problems.length > 0) {
      const message = `[database] ${problems.join(' ')}`;
      if (isProduction && process.env.REQUIRE_SUPABASE_TRANSACTION_POOLER === '1') {
        throw new Error(message);
      }
      console.warn(message);
    }
  } catch {
    console.warn('[database] DATABASE_URL is not a valid PostgreSQL URL.');
  }
}

const prismaClientSingleton = () => {
  warnIfDatabaseUrlLooksUnsafe();
  return new PrismaClient({
    errorFormat: isProduction ? 'minimal' : 'pretty',
    log: process.env.PRISMA_QUERY_LOGS === '1'
      ? ['query', 'warn', 'error']
      : isProduction
        ? ['error']
        : ['warn', 'error'],
    datasources: {
      db: {
        url: DATABASE_URL
      }
    }
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
