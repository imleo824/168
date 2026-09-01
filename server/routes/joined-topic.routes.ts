import type { Express } from 'express';
import { followLimiter } from '../middlewares/rateLimit';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore, setPrivateCache } from '../http-cache';
import prisma, { isDbConfigured } from '../db';
import {
  deleteUserJoinedTopic,
  findUserJoinedTopic,
  listUserJoinedTopics,
  upsertUserJoinedTopic,
  type JoinedTopicType,
} from '../joined-topic.service';

const JOINED_TOPIC_ID_MAX_LENGTH = 128;
const JOINED_TOPIC_NAME_MAX_LENGTH = 80;

type JoinedTopicRoutesDeps = {
  markInteractionDataChanged: (userIds?: string | null | Array<string | null | undefined>) => void;
};

type ResolvedJoinedTopicInput =
  | { topicId: string; topicName: string; topicType: JoinedTopicType }
  | { error: string };

function normalizeJoinedTopicText(value: unknown, maxLength: number) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, maxLength);
}

function serializeJoinedTopic(topic: any, categoryTopicIds: Set<string> = new Set()) {
  const topicId = String(topic.topicId || '');
  const topicType = String(topic.topicType || '').toLowerCase() === 'category' ? 'category' : 'topic';
  return {
    id: topic.topicId,
    name: topic.topicName,
    type: categoryTopicIds.has(topicId) ? 'category' : topicType,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}

async function resolveJoinedTopicInput(rawTopicId: unknown, rawName?: unknown): Promise<ResolvedJoinedTopicInput> {
  const topicIdInput = normalizeJoinedTopicText(rawTopicId, JOINED_TOPIC_ID_MAX_LENGTH);
  const bodyName = normalizeJoinedTopicText(rawName, JOINED_TOPIC_NAME_MAX_LENGTH);
  if (!topicIdInput) {
    return { error: '话题不存在' };
  }

  const category = await prisma.category.findFirst({
    where: {
      OR: [
        { id: topicIdInput },
        { slug: topicIdInput },
      ],
    },
    select: { id: true, name: true },
  });
  if (category) {
    return { topicId: category.id, topicName: category.name, topicType: 'category' };
  }

  if (bodyName && bodyName !== '动态广场' && bodyName !== '分类不存在') {
    return { topicId: topicIdInput, topicName: bodyName, topicType: 'topic' };
  }

  return { error: '话题不存在' };
}

export function registerJoinedTopicRoutes(app: Express, deps: JoinedTopicRoutesDeps) {
  app.get('/api/me/joined-topics', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setPrivateCache(res, 15, 30, 15);
    if (!isDbConfigured()) return res.json([]);
    const topics = await listUserJoinedTopics(req.user.id, 200);
    const topicIds = topics.map((topic: any) => String(topic.topicId || '')).filter(Boolean);
    const categoryRows = topicIds.length > 0
      ? await prisma.category.findMany({
          where: { id: { in: topicIds } },
          select: { id: true },
        })
      : [];
    const categoryTopicIds = new Set(categoryRows.map((category) => category.id));
    return res.json(topics.map((topic: any) => serializeJoinedTopic(topic, categoryTopicIds)));
  }));

  app.get('/api/topics/:id/join-status', authMiddleware, catchAsync(async (req: AuthRequest, res) => {
    setPrivateCache(res, 15, 30, 15);
    if (!req.user?.id) return res.json({ joined: false });
    if (!isDbConfigured()) return res.json({ joined: false });

    const resolved = await resolveJoinedTopicInput(req.params.id);
    if ('error' in resolved) return res.json({ joined: false });

    const existing = await findUserJoinedTopic(req.user.id, resolved.topicId);

    return res.json({ joined: Boolean(existing) });
  }));

  app.post('/api/topics/:id/join', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: '服务暂不可用，请稍后重试' });
    }

    const resolved = await resolveJoinedTopicInput(req.params.id, req.body?.name);
    if ('error' in resolved) {
      return res.status(404).json({ error: resolved.error });
    }

    const topic = await upsertUserJoinedTopic({
      userId: req.user.id,
      topicId: resolved.topicId,
      topicName: resolved.topicName,
      topicType: resolved.topicType,
    });

    deps.markInteractionDataChanged(req.user.id);
    setNoStore(res);
    return res.json({ success: true, topic: serializeJoinedTopic(topic) });
  }));

  app.delete('/api/topics/:id/join', followLimiter, authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) {
      return res.json({ success: true });
    }

    const resolved = await resolveJoinedTopicInput(req.params.id);
    if ('error' in resolved) {
      return res.json({ success: true });
    }

    await deleteUserJoinedTopic(req.user.id, resolved.topicId);

    deps.markInteractionDataChanged(req.user.id);
    setNoStore(res);
    return res.json({ success: true });
  }));
}
