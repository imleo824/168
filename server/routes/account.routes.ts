import type { Express, Request, Response } from 'express';
import { registerAccountAuthRoutes } from './account-auth.routes';
import { registerAccountProfileRoutes } from './account-profile.routes';
import { registerAccountSettingsRoutes } from './account-settings.routes';
import { registerAccountEngagementRoutes } from './account-engagement.routes';
import { registerNotificationRoutes } from './notifications.routes';
import { registerPushRoutes } from './push.routes';
import { registerNotificationPreferenceRoutes } from './notification-preference.routes';
import { registerReferralRoutes } from './referral.routes';
import { registerTuiPlusRoutes } from './tui-plus.routes';
import { registerAvatarMediaRoutes } from './avatar-media.routes';

type PaginationParams = {
  limit: number;
  cursor?: string;
};

type AccountRoutesContext = {
  JWT_SECRET: string;
  MAX_BIO_LENGTH: number;
  WEBHOOK_MAX_CONTACT_LEN: number;
  POST_ID_PATTERN: RegExp;
  USER_PROFILE_CACHE_TTL_MS: number;
  USER_PROFILE_CACHE_MAX_ENTRIES: number;
  userProfileCache: Map<string, { expiresAt: number; payload: any }>;
  userProfileInflight: Map<string, Promise<any>>;
  validateLoginPassword: (password: string, username?: string) => string | null | undefined;
  canonicalizePersistentUploadedImageUrl: (url: string) => string;
  normalizeTelegramContactHandle: (input: unknown) => string;
  normalizeCategoryIdList: (rawValue: unknown, maxItems?: number) => string[];
  markInteractionDataChanged: (userIds?: string | null | Array<string | null | undefined>) => void;
  markUserDataChanged: (userId?: string | null) => void;
  markContentDataChanged?: () => void;
  recordUserProfileView: (req: Request, userId: string) => boolean;
  throwOnInvalidPagination: (req: Request, options?: { maxLimit?: number; defaultLimit?: number }) => PaginationParams;
  getBlockedUserIds: (currentUserId?: string | null) => Promise<string[]>;
  setPaginationHeaders: (res: Response, result: { nextCursor: string | null; hasMore: boolean }) => void;
  emptyFeedBadgeCounts: () => any;
  getFeedBadgeCounts: (userId: string, query: Request['query']) => Promise<any>;
};

export function registerAccountRoutes(app: Express, context: AccountRoutesContext) {
  registerAvatarMediaRoutes(app);

  registerAccountAuthRoutes(app, {
    JWT_SECRET: context.JWT_SECRET,
    validateLoginPassword: context.validateLoginPassword,
    markUserDataChanged: context.markUserDataChanged,
  });

  registerAccountProfileRoutes(app, {
    POST_ID_PATTERN: context.POST_ID_PATTERN,
    USER_PROFILE_CACHE_TTL_MS: context.USER_PROFILE_CACHE_TTL_MS,
    USER_PROFILE_CACHE_MAX_ENTRIES: context.USER_PROFILE_CACHE_MAX_ENTRIES,
    userProfileCache: context.userProfileCache,
    userProfileInflight: context.userProfileInflight,
    recordUserProfileView: context.recordUserProfileView,
  });

  registerAccountSettingsRoutes(app, {
    MAX_BIO_LENGTH: context.MAX_BIO_LENGTH,
    WEBHOOK_MAX_CONTACT_LEN: context.WEBHOOK_MAX_CONTACT_LEN,
    validateLoginPassword: context.validateLoginPassword,
    canonicalizePersistentUploadedImageUrl: context.canonicalizePersistentUploadedImageUrl,
    normalizeTelegramContactHandle: context.normalizeTelegramContactHandle,
    normalizeCategoryIdList: context.normalizeCategoryIdList,
    markInteractionDataChanged: context.markInteractionDataChanged,
    markUserDataChanged: context.markUserDataChanged,
  });

  registerAccountEngagementRoutes(app, {
    throwOnInvalidPagination: context.throwOnInvalidPagination,
    getBlockedUserIds: context.getBlockedUserIds,
    setPaginationHeaders: context.setPaginationHeaders,
    emptyFeedBadgeCounts: context.emptyFeedBadgeCounts,
    getFeedBadgeCounts: context.getFeedBadgeCounts,
  });

  registerNotificationRoutes(app);
  registerPushRoutes(app);
  registerNotificationPreferenceRoutes(app);
  registerReferralRoutes(app);
  registerTuiPlusRoutes(app, {
    markUserDataChanged: context.markUserDataChanged,
    markContentDataChanged: context.markContentDataChanged,
  });
}
