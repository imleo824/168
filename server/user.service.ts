import prisma, { isDbConfigured } from './db';
import { Prisma } from '@prisma/client';
import { TransactionAction } from '../shared/domain';
import {
  getTuiPlusStatus,
  TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  listTuiPlusChannels,
  listTuiPlusContacts,
  listTuiPlusWebsites,
} from './services/tui-plus.service';

async function getTuiPlusUserSnapshot(userId: string) {
  try {
    const [status, channels, websites, contacts] = await Promise.all([
      getTuiPlusStatus(userId),
      listTuiPlusChannels(userId),
      listTuiPlusWebsites(userId),
      listTuiPlusContacts(userId),
    ]);
    return {
      plusStatus: status.status || null,
      plusPlan: status.plan || null,
      plusExpiresAt: status.expiresAt || null,
      plusTrialUsed: Boolean(status.trialUsed),
      isTuiPlus: Boolean(status.active),
      tuiPlusChannels: Array.isArray(channels) ? channels.slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT) : [],
      tuiPlusWebsites: Array.isArray(websites) ? websites.slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT) : [],
      tuiPlusContacts: Array.isArray(contacts) ? contacts : [],
    };
  } catch {
    return {
      plusStatus: null,
      plusPlan: null,
      plusExpiresAt: null,
      plusTrialUsed: false,
      isTuiPlus: false,
      tuiPlusChannels: [],
      tuiPlusWebsites: [],
      tuiPlusContacts: [],
    };
  }
}

export class UserService {
  static async getUser(userId: string) {
    if (!isDbConfigured()) return null;
    const visiblePostWhere: Prisma.PostWhereInput = {
      deletedAt: null,
      isPublished: true,
    };
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            posts: { where: visiblePostWhere },
            followers: true,
            following: true,
            likes: true
          }
        }
      }
    });
    if (!user) return null;

    const tuiPlusSnapshot = await getTuiPlusUserSnapshot(userId);
    const { passwordHash, paymentPasswordHash, ...safeUser } = user as any;
    return {
      ...safeUser,
      ...tuiPlusSnapshot,
      username: user.loginAccount || '',
      hasPassword: Boolean(passwordHash),
      hasPaymentPassword: Boolean(paymentPasswordHash),
      postCount: user._count?.posts || 0,
      followerCount: user._count?.followers || 0,
      followingCount: user._count?.following || 0,
      likeCount: user._count?.likes || 0,
      photoUrl: user.photoUrl,
      coverUrl: (user as any).coverUrl || null,
    };
  }

  static async isFollowing(followerId: string, followingId: string) {
    if (!isDbConfigured()) return false;
    const follow = await (prisma as any).follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { followerId: true }
    });
    return !!follow;
  }

  static async follow(followerId: string, followingId: string) {
    if (!isDbConfigured()) return;
    if (followerId === followingId) throw new Error('不能关注自己');
    return await (prisma as any).follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId }
    });
  }

  static async unfollow(followerId: string, followingId: string) {
    if (!isDbConfigured()) return;
    try {
      return await (prisma as any).follow.delete({
        where: { followerId_followingId: { followerId, followingId } }
      });
    } catch (e) {
      // Ignore if not following
    }
  }

  static async getTransactions(
    userId: string,
    options: {
      limit?: number;
      cursor?: string;
      action?: string;
    } = {},
  ) {
    if (!isDbConfigured()) return [];

    const limitRaw = Number.isFinite(Number(options.limit))
      ? Math.floor(Number(options.limit))
      : 50;
    const limit = Math.min(Math.max(limitRaw, 1), 200);

    const cursor = typeof options.cursor === 'string' && options.cursor.trim() ? options.cursor.trim() : undefined;
    const action = typeof options.action === 'string' ? options.action.trim() : '';
    let where: any = { userId };
    if (action) {
      if (action === TransactionAction.SIGNUP_REWARD) {
        where.OR = [
          { action: TransactionAction.SIGNUP_REWARD },
          { action: TransactionAction.RECHARGE, description: { contains: '注册', mode: 'insensitive' } },
        ];
      } else if (action === TransactionAction.PIN_CHAT) {
        where.OR = [
          { action: TransactionAction.PIN_CHAT },
          { action: TransactionAction.AD, description: { contains: '聊天室', mode: 'insensitive' } },
        ];
      } else if (action === TransactionAction.RECHARGE) {
        where.action = TransactionAction.RECHARGE;
        where.NOT = { description: { contains: '注册', mode: 'insensitive' } };
      } else if (action === TransactionAction.AD) {
        where.action = TransactionAction.AD;
        where.NOT = { description: { contains: '聊天室', mode: 'insensitive' } };
      } else {
        where.action = action;
      }
    }
    if (cursor) {
      const cursorTx = await prisma.pointTransaction.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });
      if (!cursorTx?.createdAt) {
        return [];
      }
      where = {
        ...where,
        OR: [
          { createdAt: { lt: cursorTx.createdAt } },
          { createdAt: cursorTx.createdAt, id: { lt: cursor } },
        ],
      };
    }

    return await prisma.pointTransaction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }
}
