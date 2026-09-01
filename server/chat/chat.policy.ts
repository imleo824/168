import prisma, { isDbConfigured } from '../db';
import type { ChatEligibility, ChatUserSnapshot } from './chat.types';
import { getChatConfig } from './chat.config';
import { getActiveChatMute } from './chat.repository';
import { DAY_MS, getPlatformDayRange } from '../platform-time';

const CHAT_WRITE_WINDOW_MS = 30_000;
const CHAT_WRITE_MAX_PER_WINDOW = 8;
const writeBuckets = new Map<string, number[]>();

function db() {
  return prisma as any;
}

function daysBetween(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function calendarDaysBetween(from: Date, to = new Date()) {
  const fromDay = getPlatformDayRange(from).start.getTime();
  const toDay = getPlatformDayRange(to).start.getTime();
  return Math.max(0, Math.floor((toDay - fromDay) / DAY_MS));
}

function defaultEligibility(reason: ChatEligibility['reason'], message: string): ChatEligibility {
  return { canSend: false, reason, message };
}

export function normalizeChatBody(raw: unknown, maxLength: number) {
  const value = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  if (!value) {
    const error = new Error('请输入聊天内容');
    (error as any).statusCode = 400;
    throw error;
  }
  if (value.length > maxLength) {
    const error = new Error(`单条消息最多 ${maxLength} 个字符`);
    (error as any).statusCode = 400;
    throw error;
  }
  return value;
}

export function normalizeClientNonce(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value && value.length <= 80 ? value : null;
}

export function checkChatWriteRateLimit(actorKey: string) {
  const now = Date.now();
  const existing = writeBuckets.get(actorKey) || [];
  const fresh = existing.filter((timestamp) => now - timestamp < CHAT_WRITE_WINDOW_MS);
  fresh.push(now);
  writeBuckets.set(actorKey, fresh);

  if (writeBuckets.size > 10_000) {
    for (const [key, timestamps] of writeBuckets) {
      const next = timestamps.filter((timestamp) => now - timestamp < CHAT_WRITE_WINDOW_MS);
      if (next.length === 0) writeBuckets.delete(key);
      else writeBuckets.set(key, next);
      if (writeBuckets.size <= 8_000) break;
    }
  }

  return fresh.length <= CHAT_WRITE_MAX_PER_WINDOW;
}

export async function getChatEligibility(userId?: string | null): Promise<{
  eligibility: ChatEligibility;
  user: ChatUserSnapshot | null;
}> {
  if (!userId) {
    return {
      eligibility: defaultEligibility('LOGIN_REQUIRED', '登录后可查看发言资格'),
      user: null,
    };
  }

  if (!isDbConfigured()) {
    return {
      eligibility: defaultEligibility('NEEDS_RECHARGE_OR_AGE', '数据库暂不可用，暂时无法发言'),
      user: null,
    };
  }

  const config = await getChatConfig();
  const user = await db().user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      photoUrl: true,
      createdAt: true,
      isDisabled: true,
    },
  });

  if (!user) {
    return {
      eligibility: defaultEligibility('LOGIN_REQUIRED', '登录后可查看发言资格'),
      user: null,
    };
  }

  if (user.isDisabled) {
    return {
      eligibility: defaultEligibility('ACCOUNT_DISABLED', '账号已禁用，无法在聊天室发言'),
      user,
    };
  }

  const activeMute = await getActiveChatMute(user.id);
  if (activeMute) {
    return {
      eligibility: {
        canSend: false,
        reason: 'CHAT_MUTED',
        registeredAt: user.createdAt?.toISOString?.() || null,
        muteExpiresAt: activeMute.expiresAt ? new Date(activeMute.expiresAt).toISOString() : null,
        message: activeMute.expiresAt
          ? `已被聊天禁言，到 ${new Date(activeMute.expiresAt).toLocaleString('zh-CN')} 后恢复`
          : '已被聊天禁言',
      },
      user,
    };
  }

  const [creditedOrders, registeredDays] = await Promise.all([
    db().order.count({ where: { userId: user.id, status: 'CREDITED' } }),
    Promise.resolve(Math.max(
      daysBetween(new Date(user.createdAt)),
      calendarDaysBetween(new Date(user.createdAt)),
    )),
  ]);
  const hasCreditedOrder = creditedOrders > 0;
  const oldEnough = registeredDays >= config.minAccountAgeDays;

  if (!hasCreditedOrder && !oldEnough) {
    return {
      eligibility: {
        canSend: false,
        reason: 'NEEDS_RECHARGE_OR_AGE',
        registeredAt: user.createdAt?.toISOString?.() || null,
        hasCreditedOrder,
        registeredDays,
        message: `充值成功或注册满 ${config.minAccountAgeDays} 天后可发言`,
      },
      user,
    };
  }

  return {
    eligibility: {
      canSend: true,
      reason: 'OK',
      registeredAt: user.createdAt?.toISOString?.() || null,
      hasCreditedOrder,
      registeredDays,
      message: '可以发言',
    },
    user,
  };
}

export function buildUserAuthorSnapshot(user: ChatUserSnapshot) {
  return {
    authorUserId: user.id,
    authorName: String(user.displayName || '用户').trim().slice(0, 40) || '用户',
    authorPhotoUrl: user.photoUrl || null,
  };
}

export function makeRateLimitedEligibility(): ChatEligibility {
  return {
    canSend: false,
    reason: 'RATE_LIMITED',
    message: '发言太快了，稍后再试',
  };
}
