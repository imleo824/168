import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import prisma, { isDbConfigured } from '../db';
import {
  buildUserAuthorSnapshot,
  checkChatWriteRateLimit,
  getChatEligibility,
  makeRateLimitedEligibility,
  normalizeChatBody,
  normalizeClientNonce,
} from './chat.policy';
import { getChatConfig } from './chat.config';
import { createUserChatMessage, getVisibleChatMessageForReply } from './chat.repository';
import type {
  ChatGatewayClientUser,
  ChatLiveInbound,
  ChatLiveOutbound,
  ChatMessageMetadata,
  ChatMessagePayload,
} from './chat.types';

type ChatBotBridge = {
  handleHumanMessage(message: ChatMessagePayload): Promise<void>;
};

type ChatClient = {
  id: string;
  ws: WebSocket;
  user: ChatGatewayClientUser | null;
  ip: string;
  isAlive: boolean;
  messageChain: Promise<void>;
};

const MAX_CHAT_CONNECTIONS = 1_200;
const HEARTBEAT_INTERVAL_MS = 30_000;
const PRESENCE_BROADCAST_DEBOUNCE_MS = 250;

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (!key || valueParts.length === 0) continue;
    cookies.set(key, decodeURIComponent(valueParts.join('=')));
  }
  return cookies;
}

function getTokenFromRequest(req: IncomingMessage) {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies.get('token');
  if (cookieToken?.trim()) return cookieToken.trim();
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string') return null;
  const [scheme, token] = authorization.trim().split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function readInboundPayload(raw: RawData) {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return Buffer.from(raw as any).toString('utf8');
}

function sendRaw(ws: WebSocket, payload: string) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(payload);
}

function send(ws: WebSocket, payload: ChatLiveOutbound) {
  sendRaw(ws, JSON.stringify(payload));
}

function normalizeReplyToMessageId(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return '';
  return trimmed;
}

function normalizeReplyBodyPreview(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function normalizeReplyImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const image = item.trim();
    if (!image || seen.has(image)) continue;
    seen.add(image);
    result.push(image);
    if (result.length >= 4) break;
  }
  return result;
}

function getMessageImages(message: ChatMessagePayload) {
  const metadata = message.metadata;
  if (!metadata || metadata.kind !== 'post_created') return [];
  return normalizeReplyImages(metadata.images);
}

function buildReplyMetadata(message: ChatMessagePayload): ChatMessageMetadata {
  const images = getMessageImages(message);
  return {
    kind: 'chat_reply',
    replyTo: {
      messageId: message.id,
      authorName: String(message.authorName || '用户').trim() || '用户',
      bodyPreview: normalizeReplyBodyPreview(message.body),
      images,
      imageCount: images.length || (
        message.metadata?.kind === 'post_created' ? Math.max(0, Number(message.metadata.imageCount || 0)) : 0
      ),
    },
  };
}

async function getUserFromRequest(req: IncomingMessage, jwtSecret: string) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded && typeof decoded === 'object' ? (decoded as any).userId : null;
    if (!userId || typeof userId !== 'string') return null;
    if (!isDbConfigured()) return { id: userId };
    return await (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isDisabled: true,
        displayName: true,
        photoUrl: true,
      },
    });
  } catch {
    return null;
  }
}

export function registerChatGateway(server: HttpServer, options: { jwtSecret: string }) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<string, ChatClient>();
  let botBridge: ChatBotBridge | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let presenceTimer: NodeJS.Timeout | null = null;

  function getOnlineCount() {
    return clients.size;
  }

  function broadcastPresenceNow() {
    const onlineCount = getOnlineCount();
    const payload = JSON.stringify({ type: 'presence.updated', onlineCount } satisfies ChatLiveOutbound);
    for (const client of clients.values()) {
      sendRaw(client.ws, payload);
    }
  }

  function broadcastPresence() {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = null;
      broadcastPresenceNow();
    }, PRESENCE_BROADCAST_DEBOUNCE_MS);
  }

  function broadcastMessage(message: ChatMessagePayload) {
    const payload = JSON.stringify({ type: 'message.created', message } satisfies ChatLiveOutbound);
    for (const client of clients.values()) {
      sendRaw(client.ws, payload);
    }
  }

  function removeClient(clientId: string) {
    if (!clients.delete(clientId)) return;
    if (clients.size === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    broadcastPresence();
  }

  async function handleChatMessage(client: ChatClient, raw: RawData) {
    const rawText = readInboundPayload(raw);
    if (rawText.length > 4096) {
      send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: '消息过长' });
      return;
    }

    let payload: ChatLiveInbound;
    try {
      payload = JSON.parse(rawText);
    } catch {
      send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: '消息格式不正确' });
      return;
    }

    if (payload.type === 'ping') {
      send(client.ws, { type: 'pong' });
      return;
    }

    if (payload.type !== 'message.create') {
      send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: '不支持的聊天事件' });
      return;
    }

    const config = await getChatConfig();
    if (!config.enabled) {
      send(client.ws, { type: 'error', code: 'SERVER_ERROR', message: '聊天室暂未开放' });
      return;
    }

    const userId = client.user?.id || null;
    const { eligibility, user } = await getChatEligibility(userId);
    if (!eligibility.canSend || !user) {
      send(client.ws, { type: 'error', code: eligibility.reason, message: eligibility.message || '暂时无法发言' });
      return;
    }

    if (!checkChatWriteRateLimit(`user:${user.id}`)) {
      const rateLimited = makeRateLimitedEligibility();
      send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: rateLimited.message || '发言太快了' });
      return;
    }

    const body = normalizeChatBody(payload.body, config.maxMessageLength);
    const replyToMessageId = normalizeReplyToMessageId(payload.replyToMessageId);
    if (replyToMessageId === '') {
      send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: '回复的消息不存在或已不可见' });
      return;
    }

    let metadata: ChatMessageMetadata | undefined;
    if (replyToMessageId) {
      const replyTarget = await getVisibleChatMessageForReply(replyToMessageId);
      if (!replyTarget) {
        send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: '回复的消息不存在或已不可见' });
        return;
      }
      metadata = buildReplyMetadata(replyTarget);
    }

    const message = await createUserChatMessage({
      ...buildUserAuthorSnapshot(user),
      body,
      clientNonce: normalizeClientNonce(payload.clientNonce),
      metadata,
    });

    broadcastMessage(message);
    botBridge?.handleHumanMessage(message).catch((error) => {
      console.warn('[chat:bot] human trigger failed:', error instanceof Error ? error.message : error);
    });
  }

  function startHeartbeat() {
    if (heartbeat) return;
    heartbeat = setInterval(() => {
      for (const client of clients.values()) {
        if (!client.isAlive) {
          client.ws.terminate();
          removeClient(client.id);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage, user: ChatGatewayClientUser | null) => {
    const client: ChatClient = {
      id: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
      ws,
      user,
      ip: req.socket.remoteAddress || '',
      isAlive: true,
      messageChain: Promise.resolve(),
    };
    clients.set(client.id, client);
    startHeartbeat();

    ws.on('pong', () => {
      client.isAlive = true;
    });
    ws.on('message', (raw: RawData) => {
      client.messageChain = client.messageChain.then(() => handleChatMessage(client, raw)).catch((error) => {
        console.warn('[chat:gateway] message failed:', error instanceof Error ? error.message : error);
        const statusCode = Number((error as any)?.statusCode || 500);
        send(ws, {
          type: 'error',
          code: statusCode >= 400 && statusCode < 500 ? 'INVALID_MESSAGE' : 'SERVER_ERROR',
          message: statusCode >= 400 && statusCode < 500
            ? (error instanceof Error ? error.message : '消息格式不正确')
            : '消息发送失败，请稍后再试',
        });
      });
    });
    ws.on('close', () => removeClient(client.id));
    ws.on('error', () => removeClient(client.id));

    const { eligibility } = await getChatEligibility(user?.id || null);
    send(ws, { type: 'chat.ready', onlineCount: getOnlineCount(), eligibility });
    broadcastPresence();
  });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/api/chat/live') return;

    if (clients.size >= MAX_CHAT_CONNECTIONS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = await getUserFromRequest(req, options.jwtSecret);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, user);
    });
  });

  return {
    broadcastMessage,
    broadcastPresence,
    getOnlineCount,
    setBotService(next: ChatBotBridge) {
      botBridge = next;
    },
    close() {
      if (heartbeat) clearInterval(heartbeat);
      if (presenceTimer) clearTimeout(presenceTimer);
      wss.close();
    },
  };
}
