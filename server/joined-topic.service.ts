import prisma, { isDbConfigured } from './db';

const JOINED_TOPIC_TABLE_NAME = 'UserJoinedTopic';
const JOINED_TOPIC_SCHEMA_CACHE_MS = 60_000;

type JoinedTopicSchemaState = {
  expiresAt: number;
  exists: boolean;
  columns: Set<string>;
};

type JoinedTopicInput = {
  userId: string;
  topicId: string;
  topicName: string;
  topicType: JoinedTopicType;
};

export type JoinedTopicType = 'category' | 'topic';

let schemaStateCache: JoinedTopicSchemaState | null = null;
let hasWarnedUnavailableTable = false;
let hasWarnedDegradedSchema = false;

function warnOnce(kind: 'table' | 'schema', message: string, error?: unknown) {
  if (kind === 'table') {
    if (hasWarnedUnavailableTable) return;
    hasWarnedUnavailableTable = true;
  } else {
    if (hasWarnedDegradedSchema) return;
    hasWarnedDegradedSchema = true;
  }
  console.warn(message, error || '');
}

async function getJoinedTopicSchemaState(): Promise<JoinedTopicSchemaState> {
  const now = Date.now();
  if (schemaStateCache && schemaStateCache.expiresAt > now) return schemaStateCache;

  if (!isDbConfigured()) {
    schemaStateCache = { exists: false, columns: new Set(), expiresAt: now + JOINED_TOPIC_SCHEMA_CACHE_MS };
    return schemaStateCache;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = ${JOINED_TOPIC_TABLE_NAME}
        AND table_schema = ANY (current_schemas(false))
    `;
    const columns = new Set(rows.map((row) => row.column_name).filter(Boolean));
    schemaStateCache = {
      exists: columns.size > 0,
      columns,
      expiresAt: now + JOINED_TOPIC_SCHEMA_CACHE_MS,
    };
    if (!schemaStateCache.exists) {
      warnOnce('table', '[joined-topic] UserJoinedTopic table is unavailable; following topic data is degraded.');
    }
    return schemaStateCache;
  } catch (error) {
    warnOnce('schema', '[joined-topic] Could not inspect UserJoinedTopic schema; following topic data is degraded.', error);
    schemaStateCache = { exists: false, columns: new Set(), expiresAt: now + 10_000 };
    return schemaStateCache;
  }
}

function canReadJoinedTopicRows(schema: JoinedTopicSchemaState) {
  return schema.exists && schema.columns.has('userId') && schema.columns.has('topicId') && schema.columns.has('topicName');
}

function normalizeJoinedTopicType(value: unknown): JoinedTopicType {
  return String(value || '').toLowerCase() === 'category' ? 'category' : 'topic';
}

function buildJoinedTopicWhere(userId: string, schema: JoinedTopicSchemaState) {
  const where: Record<string, unknown> = { userId };
  if (schema.columns.has('topicType')) {
    where.topicType = { in: ['category', 'topic'] };
  }
  return where;
}

function buildJoinedTopicSelect(schema: JoinedTopicSchemaState) {
  return {
    topicId: true,
    topicName: true,
    ...(schema.columns.has('topicType') ? { topicType: true } : {}),
    ...(schema.columns.has('createdAt') ? { createdAt: true } : {}),
    ...(schema.columns.has('updatedAt') ? { updatedAt: true } : {}),
  };
}

function buildJoinedTopicOrderBy(schema: JoinedTopicSchemaState) {
  return schema.columns.has('createdAt')
    ? [{ createdAt: 'desc' as const }, { topicId: 'desc' as const }]
    : [{ topicId: 'desc' as const }];
}

export async function listUserJoinedTopics(userId: string, take = 200) {
  if (!userId || !isDbConfigured()) return [];

  const schema = await getJoinedTopicSchemaState();
  if (!canReadJoinedTopicRows(schema)) return [];

  try {
    const rows = await (prisma as any).userJoinedTopic.findMany({
      where: buildJoinedTopicWhere(userId, schema),
      orderBy: buildJoinedTopicOrderBy(schema),
      take,
      select: buildJoinedTopicSelect(schema),
    });
    return rows.map((topic: any) => ({
      ...topic,
      topicType: normalizeJoinedTopicType(topic.topicType),
    }));
  } catch (error) {
    schemaStateCache = null;
    warnOnce('schema', '[joined-topic] Failed to read joined topics; returning empty topic list.', error);
    return [];
  }
}

export async function findUserJoinedTopic(userId: string, topicId: string) {
  if (!userId || !topicId || !isDbConfigured()) return null;

  const schema = await getJoinedTopicSchemaState();
  if (!canReadJoinedTopicRows(schema)) return null;

  try {
    return (prisma as any).userJoinedTopic.findUnique({
      where: {
        userId_topicId: { userId, topicId },
      },
      select: { topicId: true },
    });
  } catch (error) {
    schemaStateCache = null;
    warnOnce('schema', '[joined-topic] Failed to read joined topic status; treating as not joined.', error);
    return null;
  }
}

export async function upsertUserJoinedTopic(input: JoinedTopicInput) {
  const schema = await getJoinedTopicSchemaState();
  if (!canReadJoinedTopicRows(schema)) {
    throw Object.assign(new Error('关注话题数据表暂不可用'), { statusCode: 503 });
  }

  const createPayload: Record<string, string> = {
    userId: input.userId,
    topicId: input.topicId,
    topicName: input.topicName,
  };
  const updatePayload: Record<string, string> = {
    topicName: input.topicName,
  };

  if (schema.columns.has('topicType')) {
    const topicType = normalizeJoinedTopicType(input.topicType);
    createPayload.topicType = topicType;
    updatePayload.topicType = topicType;
  }

  try {
    return (prisma as any).userJoinedTopic.upsert({
      where: {
        userId_topicId: {
          userId: input.userId,
          topicId: input.topicId,
        },
      },
      create: createPayload,
      update: updatePayload,
    });
  } catch (error) {
    schemaStateCache = null;
    throw error;
  }
}

export async function deleteUserJoinedTopic(userId: string, topicId: string) {
  if (!userId || !topicId || !isDbConfigured()) return;

  const schema = await getJoinedTopicSchemaState();
  if (!schema.exists || !schema.columns.has('userId') || !schema.columns.has('topicId')) return;

  try {
    await (prisma as any).userJoinedTopic.deleteMany({
      where: { userId, topicId },
    });
  } catch (error) {
    schemaStateCache = null;
    warnOnce('schema', '[joined-topic] Failed to delete joined topic; ignoring for idempotent leave.', error);
  }
}
