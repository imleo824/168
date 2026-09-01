import type { Express, Request, Response } from 'express';
import { adminOnly, authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import {
  normalizeBooleanParam,
  normalizeIntParam,
  normalizeOptionalStringParam,
  normalizeStringParam,
} from '../http/params';
import { getChatAutomationStatus } from './chat.automation-runtime';
import { getChatConfig, updateChatConfig } from './chat.config';
import {
  createChatBot,
  createChatMute,
  listAdminChatBotInvocations,
  listAdminChatMessages,
  listChatBots,
  updateChatBot,
  updateChatMessageStatus,
} from './chat.repository';

const CHAT_STATUSES = new Set(['VISIBLE', 'HIDDEN', 'DELETED']);
const CHAT_AUTHOR_TYPES = new Set(['USER', 'BOT', 'SYSTEM']);
const ADMIN_CHAT_LIST_PATH = '/api/admin/chat';

async function sendAdminChatMessages(req: Request, res: Response) {
  const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 100 });
  const status = normalizeStringParam(req.query.status, 20).toUpperCase();
  const authorType = normalizeStringParam(req.query.authorType, 20).toUpperCase();
  if (status && !CHAT_STATUSES.has(status)) return res.status(400).json({ error: 'status 参数不合法' });
  if (authorType && !CHAT_AUTHOR_TYPES.has(authorType)) return res.status(400).json({ error: 'authorType 参数不合法' });

  const result = await listAdminChatMessages({
    limit,
    cursor,
    status: status || undefined,
    authorType: authorType || undefined,
    search: normalizeStringParam(req.query.search, 80) || undefined,
  });
  setCursorPaginationHeaders(res, result);
  return res.json(result.items);
}

export function registerChatAdminRoutes(app: Express) {
  app.get(ADMIN_CHAT_LIST_PATH, authMiddleware, adminOnly, catchAsync(sendAdminChatMessages));

  app.get('/api/admin/chat/runs', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const limit = normalizeIntParam(req.query.limit, 20, 1, 100);
    const status = normalizeOptionalStringParam(req.query.status, 20)?.toUpperCase() || '';
    return res.json(await listAdminChatBotInvocations({ limit, status }));
  }));

  app.patch('/api/admin/chat/messages/:id', authMiddleware, adminOnly, catchAsync(async (req: any, res) => {
    const status = normalizeStringParam(req.body?.status, 20).toUpperCase();
    if (!CHAT_STATUSES.has(status)) return res.status(400).json({ error: 'status 参数不合法' });
    const message = await updateChatMessageStatus(req.params.id, status as any, req.user?.id || null);
    return res.json(message);
  }));

  app.post('/api/admin/chat/mutes', authMiddleware, adminOnly, catchAsync(async (req: any, res) => {
    const userId = normalizeStringParam(req.body?.userId, 80);
    if (!userId) return res.status(400).json({ error: 'userId 必填' });
    const minutes = normalizeIntParam(req.body?.minutes, 60, 1, 525_600);
    const isPermanent = normalizeBooleanParam(req.body?.permanent, false);
    const expiresAt = isPermanent
      ? null
      : new Date(Date.now() + minutes * 60 * 1000);
    const mute = await createChatMute({
      userId,
      mutedByUserId: req.user?.id || null,
      reason: normalizeOptionalStringParam(req.body?.reason, 200) || null,
      expiresAt,
    });
    return res.status(201).json(mute);
  }));

  app.get('/api/admin/chat/bots', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    return res.json(await listChatBots());
  }));

  app.post('/api/admin/chat/bots', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    const displayName = normalizeStringParam(req.body?.displayName, 40);
    const persona = normalizeStringParam(req.body?.persona, 800);
    if (!displayName || !persona) return res.status(400).json({ error: '昵称和 persona 必填' });
    const bot = await createChatBot({
      displayName,
      persona,
      photoUrl: normalizeOptionalStringParam(req.body?.photoUrl, 500) || null,
      isEnabled: normalizeBooleanParam(req.body?.isEnabled, true),
      weight: normalizeIntParam(req.body?.weight, 1, 1, 20),
      cooldownSeconds: normalizeIntParam(req.body?.cooldownSeconds, 90, 15, 3600),
    });
    return res.status(201).json(bot);
  }));

  app.patch('/api/admin/chat/bots/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    const data: Record<string, unknown> = {};
    if ('displayName' in req.body) data.displayName = normalizeStringParam(req.body.displayName, 40);
    if ('persona' in req.body) data.persona = normalizeStringParam(req.body.persona, 800);
    if ('photoUrl' in req.body) data.photoUrl = normalizeOptionalStringParam(req.body.photoUrl, 500) ?? null;
    if ('isEnabled' in req.body) data.isEnabled = normalizeBooleanParam(req.body.isEnabled, true);
    if ('weight' in req.body) data.weight = normalizeIntParam(req.body.weight, 1, 1, 20);
    if ('cooldownSeconds' in req.body) data.cooldownSeconds = normalizeIntParam(req.body.cooldownSeconds, 90, 15, 3600);
    const bot = await updateChatBot(req.params.id, data as any);
    return res.json(bot);
  }));

  app.get('/api/admin/chat/config', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getChatConfig());
  }));

  app.patch('/api/admin/chat/config', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const config = await updateChatConfig(req.body || {});
    return res.json(config);
  }));

  app.get('/api/admin/chat/automation-status', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getChatAutomationStatus());
  }));
}
