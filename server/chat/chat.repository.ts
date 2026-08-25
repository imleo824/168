import prisma, { isDbConfigured } from '../db';
import { ensureChatSchemaReady, hasChatSchemaReady } from './chat.schema';
import {
  PUBLIC_CHAT_ROOM_KEY,
  type ChatBotProfilePayload,
  type ChatMessagePayload,
  type ChatMessageStatus,
} from './chat.types';

type PublicChatRoomPayload = { id: string; key: string; title: string };
type ChatRobotUserRow = { id: string; displayName: string; photoUrl?: string | null; bio?: string | null; isDisabled?: boolean; createdAt: Date; updatedAt: Date };

const CHAT_BOT_CACHE_TTL_MS = 30_000;
const CHAT_BOT_USER_BATCH_SIZE = 100;
const DEFAULT_CHAT_ROBOTS = [
  { displayName: '推推信息员A', bio: '平台信息账号。只补充分类信息里的一个具体字段，例如地点、价格、时间、材料、薪资、押金，不闲聊。' },
  { displayName: '推推信息员B', bio: '平台信息账号。回复短句，只围绕招聘、租房、二手、签证、供需等信息点，不冒充真人经历。' },
  { displayName: '推推信息员C', bio: '平台信息账号。负责追问缺失字段，只说一句，不总结，不讲大道理，不刷屏。' },
];

let publicRoomCache: PublicChatRoomPayload | null = null;
let publicRoomPromise: Promise<PublicChatRoomPayload> | null = null;
let chatBotCache: { items: ChatBotProfilePayload[]; expiresAt: number } | null = null;
const chatBotLastMessageAt = new Map<string, number>();
let chatStorageAvailable = true;
let chatStorageWarningLogged = false;
let lastChatStorageProbeAt = 0;

function db() { return prisma as any; }
function isChatBotProfileId(raw: unknown) { return /^chat-bot-profile-/i.test(String(raw || '').trim()); }
function normalizeRobotUserId(raw: unknown) { const value = String(raw || '').trim(); return isChatBotProfileId(value) ? '' : value; }
function robotPersona(row: Pick<ChatRobotUserRow, 'displayName' | 'bio'>) { const bio = String(row.bio || '').trim(); return bio ? bio.slice(0, 500) : `${String(row.displayName || '机器人').trim()} 是平台机器人账号，只按机器人账号类型参与自动化内容。`; }
function mapRobotUser(row: ChatRobotUserRow): ChatBotProfilePayload {
  const id = normalizeRobotUserId(row.id);
  const lastMessageAt = chatBotLastMessageAt.get(id) || 0;
  return { id, authorUserId: id, botProfileId: null, displayName: row.displayName, photoUrl: row.photoUrl || null, persona: robotPersona(row), isEnabled: !row.isDisabled, weight: 1, cooldownSeconds: 0, lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null, createdAt: new Date(row.createdAt).toISOString(), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString() };
}
function stripLegacyBotProfileIds(message: ChatMessagePayload): ChatMessagePayload { return { ...message, authorUserId: isChatBotProfileId(message.authorUserId) ? null : message.authorUserId, botProfileId: null }; }

function isMissingChatStorageError(error: unknown) {
  const candidate = error as any;
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.code !== 'P2021' && candidate.code !== 'P2022') return false;
  const table = String(candidate.meta?.table || candidate.meta?.modelName || '');
  const column = String(candidate.meta?.column || '');
  return /Chat(Room|Message|Mute|BotInvocation)/.test(table) || /Chat(Room|Message|Mute|BotInvocation)/.test(column);
}
function markChatStorageUnavailable(error: unknown) {
  if (!isMissingChatStorageError(error)) return false;
  chatStorageAvailable = false;
  publicRoomCache = null;
  publicRoomPromise = null;
  chatBotCache = null;
  if (!chatStorageWarningLogged) { chatStorageWarningLogged = true; console.warn('[chat] Database tables are missing; chat storage is temporarily disabled until migrations are applied.'); }
  return true;
}
function isChatStorageAvailable() { return isDbConfigured() && chatStorageAvailable; }
export function markChatStorageAvailable() { chatStorageAvailable = true; chatStorageWarningLogged = false; }
async function recoverChatStorageAvailability(options: { repair?: boolean } = {}) {
  if (!isDbConfigured()) return false;
  const now = Date.now();
  if (!options.repair && chatStorageAvailable) return true;
  if (!options.repair && now - lastChatStorageProbeAt < 5_000) return false;
  lastChatStorageProbeAt = now;
  try {
    const ready = options.repair ? await ensureChatSchemaReady() : await hasChatSchemaReady();
    if (ready) { markChatStorageAvailable(); console.info('[chat] Database tables are available; chat storage resumed.'); return true; }
    chatStorageAvailable = false;
  } catch (error) {
    console.warn('[chat] schema recovery failed:', error instanceof Error ? error.message : error);
  }
  return false;
}
async function ensureChatStorageAvailable(options: { repair?: boolean } = {}) { return isChatStorageAvailable() || recoverChatStorageAvailability(options); }
function createChatStorageUnavailableError() { const error = new Error('聊天室数据表正在初始化，请稍后再试'); (error as any).statusCode = 503; return error; }
function toChatMessagePayload(row: any): ChatMessagePayload { return stripLegacyBotProfileIds({ id: row.id, roomId: row.roomId, authorType: row.authorType, authorUserId: row.authorUserId || null, botProfileId: null, authorName: row.authorName, authorPhotoUrl: row.authorPhotoUrl || null, body: row.body, status: row.status, clientNonce: row.clientNonce || null, metadata: row.metadata || null, createdAt: new Date(row.createdAt).toISOString(), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined, deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null }); }
const CHAT_MESSAGE_SELECT = { id: true, roomId: true, authorType: true, authorUserId: true, authorName: true, authorPhotoUrl: true, body: true, status: true, clientNonce: true, metadata: true, createdAt: true, updatedAt: true, deletedAt: true };

export async function ensurePublicChatRoom() {
  const fallback = { id: PUBLIC_CHAT_ROOM_KEY, key: PUBLIC_CHAT_ROOM_KEY, title: '公共聊天室' };
  if (!isDbConfigured()) return fallback;
  if (publicRoomCache && isChatStorageAvailable()) return publicRoomCache;
  if (publicRoomPromise) return publicRoomPromise;
  if (!(await ensureChatStorageAvailable({ repair: true }))) return fallback;
  publicRoomPromise = (async (): Promise<PublicChatRoomPayload> => {
    try {
      const room = await db().chatRoom.upsert({ where: { key: PUBLIC_CHAT_ROOM_KEY }, update: {}, create: { key: PUBLIC_CHAT_ROOM_KEY, title: '公共聊天室' }, select: { id: true, key: true, title: true } });
      publicRoomCache = room;
      return room;
    } catch (error) {
      if (markChatStorageUnavailable(error)) { if (await recoverChatStorageAvailability({ repair: true })) { publicRoomPromise = null; return ensurePublicChatRoom(); } return fallback; }
      throw error;
    } finally { publicRoomPromise = null; }
  })();
  return publicRoomPromise;
}
async function cleanupLegacyChatBotProfileIds() {
  if (!isDbConfigured()) return;
  try {
    await db().$executeRawUnsafe(`UPDATE "ChatMessage" SET "authorUserId" = NULL WHERE "authorUserId" LIKE 'chat-bot-profile-%'`);
    await db().$executeRawUnsafe(`DELETE FROM "User" WHERE "id" LIKE 'chat-bot-profile-%'`);
  } catch (error) { console.warn('[chat] legacy chat-bot-profile cleanup failed:', error instanceof Error ? error.message : error); }
}
export async function ensureDefaultChatBots() {
  if (!(await ensureChatStorageAvailable({ repair: true }))) return { created: 0, total: 0 };
  await cleanupLegacyChatBotProfileIds();
  let total = await db().user.count({ where: { userType: 'ROBOT', isDisabled: false } }).catch(() => 0);
  let created = 0;
  if (total <= 0) {
    for (const robot of DEFAULT_CHAT_ROBOTS) {
      const existing = await db().user.findFirst({ where: { userType: 'ROBOT', displayName: robot.displayName }, select: { id: true } }).catch((): null => null);
      if (existing?.id) continue;
      await db().user.create({ data: { displayName: robot.displayName, bio: robot.bio, userType: 'ROBOT', isDisabled: false, points: 0, role: 'USER' } });
      created += 1;
    }
    total = await db().user.count({ where: { userType: 'ROBOT', isDisabled: false } }).catch(() => created);
  }
  chatBotCache = null;
  return { created, total };
}
async function loadRobotUsers() {
  const users: ChatRobotUserRow[] = [];
  let cursor: string | null = null;
  let batch: ChatRobotUserRow[] = [];
  do {
    batch = await db().user.findMany({ where: { userType: 'ROBOT', isDisabled: false, NOT: { id: { startsWith: 'chat-bot-profile-' } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, displayName: true, photoUrl: true, bio: true, isDisabled: true, createdAt: true, updatedAt: true }, take: CHAT_BOT_USER_BATCH_SIZE });
    users.push(...batch);
    cursor = batch.length === CHAT_BOT_USER_BATCH_SIZE ? batch[batch.length - 1]?.id || null : null;
  } while (cursor);
  return users;
}
export async function listChatBots() { if (!(await ensureChatStorageAvailable({ repair: true }))) return []; await cleanupLegacyChatBotProfileIds(); const mapped = (await loadRobotUsers()).map(mapRobotUser); chatBotCache = { items: mapped, expiresAt: Date.now() + CHAT_BOT_CACHE_TTL_MS }; return mapped; }
export async function createChatBot(input: { displayName: string; persona: string; photoUrl?: string | null; isEnabled?: boolean; weight?: number; cooldownSeconds?: number }) { if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); const user = await db().user.create({ data: { displayName: String(input.displayName || '').trim() || '机器人', photoUrl: input.photoUrl || null, bio: String(input.persona || '').trim() || null, userType: 'ROBOT', isDisabled: input.isEnabled === false, points: 0, role: 'USER' }, select: { id: true, displayName: true, photoUrl: true, bio: true, isDisabled: true, createdAt: true, updatedAt: true } }); chatBotCache = null; return mapRobotUser(user); }
export async function updateChatBot(botId: string, input: Partial<{ displayName: string; persona: string; photoUrl: string | null; isEnabled: boolean; weight: number; cooldownSeconds: number }>) { if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); const id = normalizeRobotUserId(botId); if (!id) throw new Error('机器人账号ID无效'); const data: Record<string, unknown> = { userType: 'ROBOT' }; if ('displayName' in input) data.displayName = input.displayName; if ('persona' in input) data.bio = input.persona; if ('photoUrl' in input) data.photoUrl = input.photoUrl; if ('isEnabled' in input) data.isDisabled = input.isEnabled === false; const user = await db().user.update({ where: { id }, data, select: { id: true, displayName: true, photoUrl: true, bio: true, isDisabled: true, createdAt: true, updatedAt: true } }); chatBotCache = null; return mapRobotUser(user); }
export async function pickAvailableChatBot(_globalCooldownSeconds: number) { if (!(await ensureChatStorageAvailable({ repair: true }))) return null; let bots = chatBotCache && chatBotCache.expiresAt > Date.now() ? chatBotCache.items : []; if (!bots.length) { bots = (await loadRobotUsers()).map(mapRobotUser); if (!bots.length) { await ensureDefaultChatBots(); bots = (await loadRobotUsers()).map(mapRobotUser); } chatBotCache = { items: bots, expiresAt: Date.now() + CHAT_BOT_CACHE_TTL_MS }; } return bots.length ? bots[Math.floor(Math.random() * bots.length)] : null; }
async function buildCursorFilter(cursor?: string) { if (!cursor) return {}; const cursorMessage = await db().chatMessage.findUnique({ where: { id: cursor }, select: { id: true, createdAt: true } }); if (!cursorMessage) { const error = new Error('cursor 无效或已过期'); (error as any).statusCode = 400; throw error; } return { OR: [{ createdAt: { lt: cursorMessage.createdAt } }, { createdAt: cursorMessage.createdAt, id: { lt: cursorMessage.id } }] }; }
export async function listChatMessages(options: { cursor?: string; limit: number; includeHidden?: boolean }) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable())) return { items: [], hasMore: false, nextCursor: null, room }; const cursorFilter = await buildCursorFilter(options.cursor); const rows = await db().chatMessage.findMany({ where: { roomId: room.id, ...(options.includeHidden ? {} : { status: 'VISIBLE' }), ...cursorFilter }, select: CHAT_MESSAGE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: options.limit + 1 }); const hasMore = rows.length > options.limit; const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toChatMessagePayload); return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null, room }; }
export async function listAdminChatMessages(options: { cursor?: string; limit: number; status?: string; authorType?: string; search?: string }) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable())) return { items: [], hasMore: false, nextCursor: null }; const cursorFilter = await buildCursorFilter(options.cursor); const where: Record<string, unknown> = { roomId: room.id, ...cursorFilter }; if (options.status) where.status = options.status; if (options.authorType) where.authorType = options.authorType; if (options.search) where.OR = [{ body: { contains: options.search, mode: 'insensitive' } }, { authorName: { contains: options.search, mode: 'insensitive' } }, { authorUserId: { contains: options.search, mode: 'insensitive' } }]; const rows = await db().chatMessage.findMany({ where, select: CHAT_MESSAGE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: options.limit + 1 }); const hasMore = rows.length > options.limit; const items = (hasMore ? rows.slice(0, options.limit) : rows).map(toChatMessagePayload); return { items, hasMore, nextCursor: hasMore ? items[items.length - 1]?.id || null : null }; }
export async function listRecentVisibleMessages(limit = 20) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable())) return []; const rows = await db().chatMessage.findMany({ where: { roomId: room.id, status: 'VISIBLE' }, select: CHAT_MESSAGE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: Math.max(1, Math.min(limit, 50)) }); return rows.reverse().map(toChatMessagePayload); }
export async function getVisibleChatMessageForReply(messageId: string) { const id = String(messageId || '').trim(); if (!id) return null; const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable())) return null; const row = await db().chatMessage.findFirst({ where: { id, roomId: room.id, status: 'VISIBLE' }, select: CHAT_MESSAGE_SELECT }); return row ? toChatMessagePayload(row) : null; }
export async function createUserChatMessage(input: { authorUserId: string | null; authorName: string; authorPhotoUrl?: string | null; body: string; clientNonce?: string | null; metadata?: unknown }) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); const authorUserId = normalizeRobotUserId(input.authorUserId); const data = { roomId: room.id, authorType: 'USER', authorUserId: authorUserId || null, authorName: input.authorName, authorPhotoUrl: input.authorPhotoUrl || null, body: input.body, clientNonce: input.clientNonce || null, metadata: input.metadata ?? undefined }; try { return toChatMessagePayload(await db().chatMessage.create({ data, select: CHAT_MESSAGE_SELECT })); } catch (error) { if (input.clientNonce) { const existing = await db().chatMessage.findFirst({ where: { authorUserId: data.authorUserId, clientNonce: input.clientNonce }, select: CHAT_MESSAGE_SELECT }); if (existing) return toChatMessagePayload(existing); } throw error; } }
export async function createBotChatMessage(input: { authorUserId: string; authorName: string; authorPhotoUrl?: string | null; body: string }) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); const authorUserId = normalizeRobotUserId(input.authorUserId); if (!authorUserId) throw new Error('机器人消息必须绑定 User 表里的机器人账号'); return toChatMessagePayload(await db().chatMessage.create({ data: { roomId: room.id, authorType: 'BOT', authorUserId, authorName: input.authorName, authorPhotoUrl: input.authorPhotoUrl || null, body: input.body }, select: CHAT_MESSAGE_SELECT })); }
export async function updateChatMessageStatus(messageId: string, status: ChatMessageStatus, actorUserId?: string | null) { if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); const data: Record<string, unknown> = { status }; if (status === 'DELETED' || status === 'HIDDEN') { data.deletedAt = new Date(); data.deletedByUserId = normalizeRobotUserId(actorUserId) || null; } if (status === 'VISIBLE') { data.deletedAt = null; data.deletedByUserId = null; } return toChatMessagePayload(await db().chatMessage.update({ where: { id: messageId }, data, select: CHAT_MESSAGE_SELECT })); }
export async function getActiveChatMute(userId: string) { if (!(await ensureChatStorageAvailable())) return null; return db().chatMute.findFirst({ where: { userId: normalizeRobotUserId(userId), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); }
export async function createChatMute(input: { userId: string; mutedByUserId?: string | null; reason?: string | null; expiresAt?: Date | null }) { if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); return db().chatMute.create({ data: { userId: normalizeRobotUserId(input.userId), mutedByUserId: normalizeRobotUserId(input.mutedByUserId) || null, reason: input.reason || null, expiresAt: input.expiresAt || null } }); }
export async function markChatBotSpoke(botId: string, at = new Date()) { const id = normalizeRobotUserId(botId); if (!id) return; chatBotLastMessageAt.set(id, at.getTime()); if (chatBotCache) chatBotCache = { ...chatBotCache, items: chatBotCache.items.map((bot) => (bot.id === id ? { ...bot, lastMessageAt: at.toISOString(), updatedAt: at.toISOString() } : bot)) }; }
export async function createBotInvocation(input: { authorUserId?: string | null; trigger: string; inputMessageId?: string | null; model: string }) { const room = await ensurePublicChatRoom(); if (!(await ensureChatStorageAvailable({ repair: true }))) throw createChatStorageUnavailableError(); return db().chatBotInvocation.create({ data: { roomId: room.id, trigger: input.trigger, inputMessageId: input.inputMessageId || null, model: input.model, status: 'PENDING' } }); }
export async function finishBotInvocation(invocationId: string, input: { status: string; outputMessageId?: string | null; error?: string | null }) { if (!(await ensureChatStorageAvailable())) return; await db().chatBotInvocation.update({ where: { id: invocationId }, data: { status: input.status, outputMessageId: input.outputMessageId || null, error: input.error ? input.error.slice(0, 500) : null, finishedAt: new Date() } }); }
export async function cleanupExpiredChatAutomationLogs(retentionDays = 3) {
  if (!(await ensureChatStorageAvailable())) return { deleted: 0 };
  const safeDays = Math.max(1, Math.min(30, Math.round(Number(retentionDays) || 3)));
  const expiredBefore = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const result = await db().chatBotInvocation.deleteMany({ where: { createdAt: { lt: expiredBefore }, status: { in: ['SUCCEEDED', 'SKIPPED', 'FAILED'] } } });
  return { deleted: Number(result?.count || 0) };
}
export async function listAdminChatBotInvocations(options: { limit: number; status?: string }) {
  const room = await ensurePublicChatRoom();
  if (!(await ensureChatStorageAvailable())) return [];
  const safeStatus = String(options.status || '').trim().toUpperCase();
  const rows = await db().chatBotInvocation.findMany({ where: { roomId: room.id, ...(safeStatus ? { status: safeStatus } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: Math.max(1, Math.min(100, Math.round(Number(options.limit) || 20))) });
  const messageIds = Array.from(new Set(rows.flatMap((row: any) => [row.inputMessageId, row.outputMessageId]).filter(Boolean)));
  const relatedMessages = messageIds.length ? await db().chatMessage.findMany({ where: { id: { in: messageIds } }, select: CHAT_MESSAGE_SELECT }) : [];
  const messageMap = new Map<string, ChatMessagePayload>(relatedMessages.map((message: any) => [message.id, toChatMessagePayload(message)]));
  return Promise.all(rows.map(async (row: any) => {
    const contextRows = await db().chatMessage.findMany({ where: { roomId: row.roomId, status: 'VISIBLE', createdAt: { lte: row.startedAt || row.createdAt } }, select: CHAT_MESSAGE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12 }).catch((): any[] => []);
    const contextMessages = contextRows.reverse().map(toChatMessagePayload);
    const inputMessage = row.inputMessageId ? messageMap.get(row.inputMessageId) || null : null;
    const outputMessage = row.outputMessageId ? messageMap.get(row.outputMessageId) || null : null;
    const generatedContent = outputMessage?.body || '';
    return { ...row, startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null, finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null, createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null, inputMessage, outputMessage, generatedContent, contextMessages, qualityDecision: row.error ? { passed: false, score: null, reason: row.error } : row.status === 'SUCCEEDED' ? { passed: true, score: null, reason: '已发布到聊天室' } : null };
  }));
}
