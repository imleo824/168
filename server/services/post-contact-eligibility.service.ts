import prisma from '../db';
import { getPlatformDayRange } from '../platform-time';
import {
  NON_MEMBER_DAILY_CONTACT_POST_LIMIT,
  POST_NON_MEMBER_CONTACT_LIMIT_MESSAGE,
} from '../../shared/postPublishing';

export const TUI_PLUS_ACTIVE_STATUSES = new Set(['TRIALING', 'ACTIVE']);

type PostContactEligibilityDb = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export type PostContactEligibilityPayload = {
  canShowContact: boolean;
  activeTuiPlus: boolean;
  usedCount: number;
  limit: number;
  reason: string;
};

export class PostContactEligibilityError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function isTuiPlusActiveSnapshot(user: any, now = new Date()) {
  if (!user) return false;
  const status = String(user.plusStatus || '').toUpperCase();
  const expiresAt = user.plusExpiresAt ? new Date(user.plusExpiresAt).getTime() : 0;
  return Boolean(expiresAt && expiresAt > now.getTime() && TUI_PLUS_ACTIVE_STATUSES.has(status));
}

export async function getContactPostUsageCount(db: PostContactEligibilityDb, userId: string, now: Date) {
  const dayRange = getPlatformDayRange(now);
  const rows = await db.$queryRaw<any[]>`
    SELECT COUNT(*)::int AS count
    FROM "Post"
    WHERE "userId" = ${userId}
      AND "showContact" = true
      AND "deletedAt" IS NULL
      AND "createdAt" >= ${dayRange.start}
      AND "createdAt" < ${dayRange.end}
  `;
  return Number(rows[0]?.count || 0);
}

export async function resolvePostContactEligibility(
  userId: string,
  options: { now?: Date; db?: PostContactEligibilityDb } = {},
): Promise<PostContactEligibilityPayload> {
  const now = options.now || new Date();
  const db = options.db || prisma;

  const rows = await db.$queryRaw<any[]>`
    SELECT "id", "plusStatus", "plusExpiresAt"
    FROM "User"
    WHERE "id" = ${userId}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) throw new PostContactEligibilityError(404, '用户不存在');

  const activeTuiPlus = isTuiPlusActiveSnapshot(user, now);
  const usedCount = activeTuiPlus ? 0 : await getContactPostUsageCount(db, userId, now);
  const limit = NON_MEMBER_DAILY_CONTACT_POST_LIMIT;
  const canShowContact = activeTuiPlus || usedCount < limit;

  return {
    canShowContact,
    activeTuiPlus,
    usedCount,
    limit,
    reason: canShowContact ? '' : POST_NON_MEMBER_CONTACT_LIMIT_MESSAGE,
  };
}

export async function assertCanShowContactOnPost(db: PostContactEligibilityDb, userId: string, now: Date) {
  const usedCount = await getContactPostUsageCount(db, userId, now);
  if (usedCount >= NON_MEMBER_DAILY_CONTACT_POST_LIMIT) {
    throw new PostContactEligibilityError(403, POST_NON_MEMBER_CONTACT_LIMIT_MESSAGE);
  }
}
