import prisma, { isDbConfigured } from '../db';

const CHAT_TABLE_NAMES = [
  'ChatRoom',
  'ChatMessage',
  'ChatMute',
  'ChatBotInvocation',
] as const;

let schemaReady = false;
let schemaProbe: Promise<boolean> | null = null;

async function probeChatSchema() {
  if (!isDbConfigured()) return false;

  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (${CHAT_TABLE_NAMES.map((name) => `'${name}'`).join(', ')})`,
  );
  const found = new Set(rows.map((row) => row.table_name));
  return CHAT_TABLE_NAMES.every((name) => found.has(name));
}

export async function hasChatSchemaReady() {
  if (schemaReady) return true;
  try {
    schemaReady = await probeChatSchema();
    return schemaReady;
  } catch {
    return false;
  }
}

export async function ensureChatSchemaReady() {
  if (schemaReady) return true;
  if (schemaProbe) return schemaProbe;

  schemaProbe = probeChatSchema()
    .then((ready) => {
      schemaReady = ready;
      return ready;
    })
    .finally(() => {
      schemaProbe = null;
    });
  return schemaProbe;
}
