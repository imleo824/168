import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

import {
  globalLimiter,
  publicReadLimiter,
} from './middlewares/rateLimit';
import { errorHandler, catchAsync } from './middlewares/error';
import { startServerRuntime } from './startup/server-runtime';
import { authMiddleware, adminOnly, mustAuth, AuthRequest, clearAuthUserCache } from './middlewares/auth';
import { registerUploadRoutes } from './routes/upload.routes';
import { registerRumRoutes } from './routes/rum.routes';
import { registerApiHealthRoute, registerFaviconRoute, registerRootHealthRoute } from './routes/health.routes';
import { registerSeoRoutes } from './routes/seo.routes';
import { registerSeoFallbackRoutes } from './routes/seo-fallback.routes';
import { getCachedCategories, getConfigs, registerConfigRoutes } from './routes/config.routes';
import { registerAccountRoutes } from './routes/account.routes';
import { registerAutoCrawlRoutes } from './routes/auto-crawl.routes';
import { registerAutoPostRoutes } from './routes/auto-post.routes';
import { registerQuotePublishRoutes } from './routes/quote-publish.routes';
import { registerFeedRoutes } from './routes/feed.routes';
import { registerPostRoutes } from './routes/post.routes';
import { registerPostReadRoutes } from './routes/post-read.routes';
import { registerPostActionsRoutes } from './routes/post-actions.routes';
import { registerPostTelegramSyncRoutes } from './routes/post-telegram-sync.routes';
import { registerPostCreateRoutes } from './routes/post-create.routes';
import { sendPublicFeedCachedResult, sendPublicFeedResult } from './routes/public-feed-response';
import { registerUserSocialRoutes } from './routes/user-social.routes';
import { registerPromotionRoutes } from './routes/promotion.routes';
import { registerJoinedTopicRoutes } from './routes/joined-topic.routes';
import { registerBillingRoutes } from './routes/billing.routes';
import { registerAdminBillingRoutes } from './routes/admin-billing.routes';
import { registerAdminDepositRoutes } from './routes/admin-deposit.routes';
import { registerAdminUserRoutes } from './routes/admin-user.routes';
import { registerAdminPostRoutes } from './routes/admin-post.routes';
import { registerAdminConfigRoutes } from './routes/admin-config.routes';
import { registerAdminPromotionRoutes } from './routes/admin-promotion.routes';
import { clearAdminReportCache, registerAdminReportRoutes } from './routes/admin-report.routes';
import { registerAdminNoStoreMiddleware } from './routes/admin-middleware.routes';
import { getIncomingProtocol, getRequestOriginForCsrf, isLocalRequest, normalizeOrigin } from './http-origin';
import { withTimeout } from './http/async';
import {
  HttpError,
  isDatabaseSchemaDriftError,
  isDatabaseUnavailableError,
  isHttpError,
  sendDatabaseSchemaDrift,
  sendDatabaseUnavailable,
} from './http/errors';
import { getRequestId } from './http/request-id';
import { createStrictPaginationParser, setCursorPaginationHeaders as setPaginationHeaders } from './http/pagination';
import { PLATFORM_TIMEZONE, getPlatformDateRangeFilter, getPlatformDayRange, getPlatformSqlDateKeyExpression } from './platform-time';

import { PromotionService } from './promotion.service';
import { UserService } from './user.service';
import { PostService, type PostCategoryMetaFilter } from './post.service';
import { HomeFeedService } from './services/home-feed.service';
import type { AutoPostAfterPostCreated } from './services/auto-post.service';
import type { QuotePublishAfterPostCreated } from './services/quote-publish-v5.service';
import {
  buildLocationPresetValueSet,
  normalizeCategoryMetaFeedFilters,
  normalizePublishCategoryMetaPayload,
} from './services/category-meta.service';
import { startPublicFeedWarmup } from './services/public-feed-warmup.service';
import prisma, { isDbConfigured } from './db';
import { seedSuperpowerCategoryPosts } from '../scripts/seed-superpower-category-posts.mjs';
import { getRequiredEnv } from './env';
import {
  setNoStore,
  setPrivateCache,
  setListCacheHeaders,
  setPublicFeedListCacheHeaders,
  shouldSkipCompression,
} from './http-cache';
import {
  RANKED_CURSOR_PATTERN,
  type PublicFeedCachedPayload,
  type PublicFeedResultPayload,
  buildPublicFeedCacheKey,
  bumpPublicFeedCacheVersion,
  clearPublicFeedResultCache,
  getPublicFeedFallbackCache,
  getPublicFeedCacheVersion,
  getPublicFeedInflight,
  getPublicFeedResultCache,
  getPublicFeedResultCacheKey,
  refreshPublicFeedResultCache,
  runPublicFeedRead,
  setPublicFeedInflight,
  setPublicFeedResultCache,
} from './public-feed-cache';
import { TransactionAction, isUserTypeValue } from '../shared/domain';
import { collapseText } from './services/text-format.service';
import {
  buildPostSharePreviewCandidates,
  canonicalizePersistentUploadedImageUrl,
  fetchSocialPreviewImage,
  resolvePublicOriginFromContext,
  sendShareFallbackImage,
} from './services/social-image.service';
import {
  TELEGRAM_SYNC_STATUS_FAILED,
  TELEGRAM_SYNC_STATUS_NONE,
  TELEGRAM_SYNC_STATUS_PENDING,
  TELEGRAM_SYNC_STATUS_SENT,
  evaluateTelegramSyncRule,
  getTelegramBotToken,
  isTelegramSyncPostSendChargeError,
  markTelegramSyncFailed,
  markTelegramSyncSentWithCharge,
  normalizeTelegramContactHandle,
  normalizeTelegramSyncStatus,
  notifyRechargeOrderSubmitted,
  resolveTelegramChannelChatId,
  resolveTelegramSyncCost,
  scheduleTelegramChannelSync,
} from './services/telegram-sync.service';
import {
  derivePostLocation,
  normalizeBooleanInput,
  normalizeExternalLocation,
  normalizeShowContactInput,
} from './services/post/post-create-input';

const PORT = parseInt(process.env.PORT as string, 10) || 3000;
const app = express();
const MAX_BIO_LENGTH = 160;
const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CURSOR_LENGTH = 256;
const PUBLIC_FEED_DEFAULT_LIMIT = 10;
const PUBLIC_FEED_MAX_LIMIT = 10;
const PUBLIC_FEED_WARM_LIMITS = Array.from(new Set([
  PUBLIC_FEED_DEFAULT_LIMIT,
  PUBLIC_FEED_MAX_LIMIT,
]));
const PUBLIC_FEED_WARM_CATEGORY_MAX = 4;
const PUBLIC_FEED_WARM_INTERVAL_MS = 300_000;
const PUBLIC_FEED_INITIAL_WARM_DELAY_MS = 250;
const HIDDEN_AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content';
const USER_PROFILE_CACHE_TTL_MS = 30_000;
const USER_PROFILE_CACHE_MAX_ENTRIES = 2_000;
const USER_PROFILE_VIEW_DEDUPE_TTL_MS = 6 * 60 * 60 * 1000;
const USER_PROFILE_VIEW_DEDUPE_MAX_ENTRIES = 50_000;
const FOLLOWING_IDS_CACHE_TTL_MS = 20_000;
const FOLLOWING_IDS_CACHE_MAX_ENTRIES = 2_000;
const FEED_UPDATE_BADGE_LIMIT = 50;
const POST_CREATED_CHAT_QUOTE_SELECT = {
  id: true,
  userId: true,
  title: true,
  content: true,
  images: true,
  isPublished: true,
  deletedAt: true,
  isAnonymous: true,
  createdAt: true,
  user: { select: { id: true, displayName: true, photoUrl: true, userType: true } },
};
const userProfileCache = new Map<string, { expiresAt: number; payload: any }>();
const userProfileInflight = new Map<string, Promise<any>>();
const userProfileViewDedupe = new Map<string, number>();
const followingIdsCache = new Map<string, { expiresAt: number; ids: string[] }>();
const followingIdsInflight = new Map<string, Promise<string[]>>();
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = getRequestId(req);
  res.setHeader('X-Request-Id', requestId);
  const startedAt = Date.now();

  (req as AuthRequest).requestId = requestId;
  res.once('finish', () => {
    const durationMs = Date.now() - startedAt;
    if (res.statusCode >= 500) {
      console.warn('[request:error]', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip,
      });
    }
  });

  next();
});

registerRootHealthRoute(app);

registerFaviconRoute(app);

const allowedCorsOrigins = new Set(
  [
    'https://168-production.up.railway.app',
    process.env.APP_URL,
    process.env.VITE_APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map(normalizeOrigin)
    .filter(Boolean) as string[],
);

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  return allowedCorsOrigins.has(normalized);
}

function isCrossSiteBrowserWrite(req: Request) {
  const site = String(req.get('sec-fetch-site') || '').toLowerCase();
  return site === 'cross-site';
}

// Trust proxy for express-rate-limit to correctly identify client IP behind Nginx/Cloud Run
app.set('trust proxy', 1);

// Security and Logging Middleware
const isDev = process.env.NODE_ENV !== 'production';
app.use((req: Request, res: Response, next: NextFunction) => {
  const shouldEnforceHttps = process.env.NODE_ENV === 'production'
    && !isLocalRequest(req)
    && process.env.DISABLE_HTTP_REDIRECT !== '1';

  if (shouldEnforceHttps) {
    const protocol = getIncomingProtocol(req);
    if (protocol && protocol !== 'https') {
      const host = req.get('host');
      if (host) {
        return res.redirect(308, `https://${host}${req.originalUrl}`);
      }
    }

    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  return next();
});

app.use(helmet({
  contentSecurityPolicy: isDev ? false : {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:", "https:", "https://picsum.photos", "https://api.dicebear.com"],
      "script-src": ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedCorsOrigin(origin) ? origin || true : false);
  },
  credentials: true,
  exposedHeaders: ['X-Next-Cursor', 'X-Has-More']
}));
app.use(globalLimiter);
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    return next();
  }

  if (isCrossSiteBrowserWrite(req)) {
    return res.status(403).json({ error: '跨站请求不允许' });
  }

  const requestOrigin = getRequestOriginForCsrf(req);
  if (requestOrigin && !isAllowedCorsOrigin(requestOrigin)) {
    return res.status(403).json({ error: '请求来源不允许' });
  }

  return next();
});
if (process.env.NODE_ENV !== 'production' || process.env.HTTP_ACCESS_LOGS === '1') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev', {
    skip: (req) => req.path.startsWith('/assets/') || req.path === '/favicon.ico',
  }));
}

app.use(compression({
  filter: (req: any, res: any) => {
    if (shouldSkipCompression(req as Request)) return false;
    return compression.filter(req, res);
  },
}) as any);
app.use(express.json({ limit: '1mb' })); // Prevent large payload attacks
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

registerRumRoutes(app);

registerUploadRoutes(app, { canonicalizePersistentUploadedImageUrl });

const JWT_SECRET = getRequiredEnv('JWT_SECRET', 'fallback-secret-for-dev');
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const LOGIN_PASSWORD_MIN_LENGTH = 8;
const LOGIN_PASSWORD_MAX_LENGTH = 128;
const MAX_BULK_VIEW_POST_IDS = 30;
const CONSUMED_POINT_ACTIONS = [
  TransactionAction.ANONYMOUS_PUBLISH,
  TransactionAction.PIN_POST,
  TransactionAction.PIN_CHAT,
  TransactionAction.TELEGRAM_SYNC,
  TransactionAction.AD,
  TransactionAction.TUI_PLUS,
] as const;
function validateLoginPassword(password: string, username?: string) {
  if (password.length < LOGIN_PASSWORD_MIN_LENGTH || password.length > LOGIN_PASSWORD_MAX_LENGTH) {
    return `密码长度需为${LOGIN_PASSWORD_MIN_LENGTH}-${LOGIN_PASSWORD_MAX_LENGTH}位`;
  }

  const lowerPassword = password.toLowerCase();
  const lowerUsername = String(username || '').trim().toLowerCase();
  if (lowerUsername.length >= 3 && lowerPassword.includes(lowerUsername)) {
    return '密码不能包含登录账号';
  }

  if (/^(.)\1+$/.test(password)) {
    return '密码过于简单，请更换更安全的密码';
  }

  const commonWeakPasswords = new Set([
    '12345678',
    '123456789',
    'password',
    'qwerty123',
    'abc12345',
    '11111111',
    '88888888',
  ]);
  if (commonWeakPasswords.has(lowerPassword)) {
    return '密码过于常见，请更换更安全的密码';
  }

  const strengthClasses = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (password.length < 12 && strengthClasses < 2) {
    return '密码需包含字母、数字或符号中的至少两类';
  }

  return '';
}
function normalizeAdminUserTypeFilter(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized && isUserTypeValue(normalized) ? normalized : '';
}

function readTokenFromRequest(req: Request) {
  const cookieToken = (req as any).cookies?.token;
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) return cookieToken.trim();

  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = `${authHeader}`.trim().split(' ');
  if (scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

function parseJwtUserIdFromToken(req: Request) {
  const token = readTokenFromRequest(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || typeof decoded !== 'object') return null;

    const userId = (decoded as { userId?: unknown }).userId;
    return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
  } catch {
    return null;
  }
}

function getCurrentUserId(req: Request) {
  const authUser = (req as AuthRequest).user;

  // When authMiddleware has already inspected the request, never fall back to
  // trusting a raw JWT payload for users that are missing, invalid, or disabled.
  if (authUser === null || authUser?.isDisabled) return null;

  if (authUser && typeof authUser.id === 'string' && authUser.id.trim()) {
    return authUser.id.trim();
  }

  return parseJwtUserIdFromToken(req);
}

async function getBlockedUserIds(currentUserId?: string | null) {
  if (!currentUserId || !isDbConfigured()) return [] as string[];

  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
    },
    select: { blockerId: true, blockedId: true },
  });

  return Array.from(
    new Set([
      ...blocks.map((item) => item.blockerId),
      ...blocks.map((item) => item.blockedId),
    ]),
  ).filter((userId) => userId !== currentUserId);
}

function pruneFollowingIdsCache(now = Date.now()) {
  for (const [userId, entry] of followingIdsCache) {
    if (entry.expiresAt <= now) {
      followingIdsCache.delete(userId);
    }
  }

  while (followingIdsCache.size > FOLLOWING_IDS_CACHE_MAX_ENTRIES) {
    const firstKey = followingIdsCache.keys().next().value;
    if (!firstKey) break;
    followingIdsCache.delete(firstKey);
  }
}

function setFollowingIdsCache(userId: string, ids: string[]) {
  pruneFollowingIdsCache();
  followingIdsCache.set(userId, {
    expiresAt: Date.now() + FOLLOWING_IDS_CACHE_TTL_MS,
    ids,
  });
}

function clearFollowingIdsCache(userId?: string | null) {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) {
    followingIdsCache.clear();
    followingIdsInflight.clear();
    return;
  }

  followingIdsCache.delete(id);
  followingIdsInflight.delete(id);
}

function getFollowingIds(userId: string) {
  if (!userId || !isDbConfigured()) return Promise.resolve([] as string[]);

  const now = Date.now();
  const cached = followingIdsCache.get(userId);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.ids);
  followingIdsCache.delete(userId);

  const inflight = followingIdsInflight.get(userId);
  if (inflight) return inflight;

  const request = prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  })
    .then((rows) => {
      const ids = Array.from(new Set(rows.map((row) => row.followingId).filter(Boolean)));
      setFollowingIdsCache(userId, ids);
      return ids;
    })
    .finally(() => {
      followingIdsInflight.delete(userId);
    });

  followingIdsInflight.set(userId, request);
  return request;
}

function parseFeedSince(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw.trim()) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emptyFeedBadgeCounts() {
  return {
    following: { count: 0, hasMore: false },
    discover: { count: 0, hasMore: false },
  };
}

async function getFeedUpdateBadge(where: Prisma.PostWhereInput, since: Date | null) {
  if (!since || !isDbConfigured()) return { count: 0, hasMore: false };

  const rows = await prisma.post.findMany({
    where: {
      ...where,
      createdAt: { gt: since },
      isPublished: true,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEED_UPDATE_BADGE_LIMIT + 1,
  });

  return {
    count: Math.min(rows.length, FEED_UPDATE_BADGE_LIMIT),
    hasMore: rows.length > FEED_UPDATE_BADGE_LIMIT,
  };
}

async function getFeedBadgeCounts(userId: string, query: Request['query']) {
  if (!userId || !isDbConfigured()) return emptyFeedBadgeCounts();

  const [followingSince, discoverSince, followingIds, blockedIds] = await Promise.all([
    Promise.resolve(parseFeedSince(query.followingSince)),
    Promise.resolve(parseFeedSince(query.discoverSince)),
    getFollowingIds(userId),
    getBlockedUserIds(userId),
  ]);
  const excludedAuthorIds = Array.from(new Set([userId, ...blockedIds].filter(Boolean)));
  const publicAuthorFilter = excludedAuthorIds.length > 0 ? { userId: { notIn: excludedAuthorIds } } : {};
  const visibleFollowingIds = followingIds.filter((id) => !blockedIds.includes(id));

  const [following, discover] = await Promise.all([
    visibleFollowingIds.length > 0
      ? getFeedUpdateBadge({ userId: { in: visibleFollowingIds } }, followingSince)
      : Promise.resolve({ count: 0, hasMore: false }),
    getFeedUpdateBadge(publicAuthorFilter, discoverSince),
  ]);

  return { following, discover };
}

const throwOnInvalidPagination = createStrictPaginationParser({
  defaultPageSize: DEFAULT_PAGE_SIZE,
  maxPageSize: MAX_PAGE_SIZE,
  maxCursorLength: MAX_CURSOR_LENGTH,
  cursorPatterns: [POST_ID_PATTERN, RANKED_CURSOR_PATTERN],
});

registerAdminNoStoreMiddleware(app);
const PUBLIC_FEED_RESPONSE_BUDGET_MS = 200;

function clearUserProfileCache(userId?: string | null) {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) {
    userProfileCache.clear();
    userProfileInflight.clear();
    return;
  }
  userProfileCache.delete(id);
  userProfileInflight.delete(id);
}

function getShareActorKey(req: Request, currentUserId?: string | null) {
  if (currentUserId) return `user:${currentUserId}`;
  const forwardedFor = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = req.ip || forwardedFor || req.socket.remoteAddress || 'unknown';
  const userAgent = req.header('user-agent') || '';
  const userAgentHash = crypto
    .createHash('sha1')
    .update(userAgent)
    .digest('hex')
    .slice(0, 12);
  return `anon:${ip}:${userAgentHash}`;
}

function markContentDataChanged() {
  bumpPublicFeedCacheVersion('content');
  clearPublicFeedResultCache();
  clearAdminReportCache();
  clearUserProfileCache();
}

function markInteractionDataChanged(userIds?: string | null | Array<string | null | undefined>) {
  clearAdminReportCache();
  if (arguments.length === 0) {
    PostService.clearRecommendationContextCache();
    clearUserProfileCache();
    clearFollowingIdsCache();
    return;
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [userIds])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean),
    ),
  );

  ids.forEach((id) => {
    PostService.clearRecommendationContextCache(id);
    clearUserProfileCache(id);
    clearFollowingIdsCache(id);
  });
}

function markUserDataChanged(userId?: string | null) {
  bumpPublicFeedCacheVersion('user');
  clearPublicFeedResultCache();
  clearAuthUserCache(userId);
  clearUserProfileCache(userId);
  clearAdminReportCache();
}

function markPromotionDataChanged() {
  bumpPublicFeedCacheVersion('promotion');
  clearPublicFeedResultCache();
  clearAdminReportCache();
  HomeFeedService.clearCache();
  PostService.clearPromotionCache();
  PromotionService.clearCache();
}

const SAFE_PROMOTION_ERROR_PREFIXES = [
  '推广类型无效',
  '预约日期无效',
  '请选择预约日期',
  '单次最多预约',
  '不能预约已过去的日期',
  '请选择有效的首页横幅广告位置',
  '当前仅支持按天预约推广位',
  '分类置顶必须选择分类',
  '请上传',
  '电脑端广告图片地址无效',
  '移动端广告图片地址无效',
  '广告图片地址无效',
  '请填写广告跳转地址',
  '广告跳转地址过长',
  '广告跳转地址不能包含',
  '广告跳转地址无效',
  '广告跳转地址支持',
  '跳转地址格式不正确',
  '投放记录不存在',
  '只有首页横幅广告支持编辑素材',
  '只有横幅广告支持编辑素材',
  '该广告已结束',
  '推广价格配置无效',
  '请先设置支付密码',
  '请输入支付密码',
  '支付密码错误',
  '分类不存在',
  '请选择要推广的信息',
  '请选择该分类下可推广的已发布帖子',
  '请选择可推广的已发布帖子',
  '以下日期已被预约',
  '账户积分不足',
  '所选日期刚刚被其他用户预约',
];

function normalizePromotionErrorMessage(error: unknown) {
  const message = typeof (error as any)?.message === 'string' ? (error as any).message.trim() : '';
  if (message && SAFE_PROMOTION_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))) {
    return message;
  }
  return '推广操作失败，请稍后重试';
}

function normalizeCategoryIdList(rawValue: unknown, maxItems = 200) {
  const rawItems = Array.isArray(rawValue) ? rawValue : [];
  return Array.from(
    new Set(
      rawItems
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => POST_ID_PATTERN.test(item)),
    ),
  ).slice(0, maxItems);
}

async function publishPostCreatedToChat(_params: {
  post: any;
  user: {
    id?: string | null;
    role?: string | null;
    displayName?: string | null;
    photoUrl?: string | null;
    userType?: string | null;
  };
}) {
  return;
}

type AccessiblePostMeta = {
  id: string;
  userId: string;
  isPublished: boolean;
  deletedAt: Date | null;
  viewCount: number;
};

type QuoteCountPostState = {
  quotedPostId?: string | null;
  isPublished?: boolean | null;
  deletedAt?: Date | string | null;
};

function shouldCountQuotePost(post?: QuoteCountPostState | null) {
  return Boolean(post?.quotedPostId && post.isPublished === true && post.deletedAt === null);
}

async function adjustPostQuoteCount(tx: any, quotedPostId: string | null | undefined, delta: number) {
  const postId = typeof quotedPostId === 'string' ? quotedPostId.trim() : '';
  if (!POST_ID_PATTERN.test(postId) || delta === 0) return;

  if (delta > 0) {
    await tx.post.updateMany({
      where: { id: postId },
      data: { quoteCount: { increment: delta } },
    });
    return;
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE "Post"
    SET "quoteCount" = GREATEST("quoteCount" + ${delta}, 0)
    WHERE "id" = ${postId}
  `);
}

async function resolveAccessiblePostMeta(postId: string, viewerId?: string, viewerRole?: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      isPublished: true,
      deletedAt: true,
      viewCount: true,
    },
  });

  if (!post || post.deletedAt !== null) return null;

  const isOwnerOrAdmin = !!viewerId && (post.userId === viewerId || viewerRole === 'ADMIN');
  if (!isOwnerOrAdmin) {
    if (post.isPublished !== true) {
      return null;
    }
    if (viewerId) {
      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: post.userId },
            { blockerId: post.userId, blockedId: viewerId },
          ],
        },
        select: { blockerId: true },
      });
      if (blocked) return null;
    }
  }

  return post as AccessiblePostMeta;
}

async function resolveQuotablePostMeta(postId: string, viewerId?: string, viewerRole?: string) {
  if (!POST_ID_PATTERN.test(postId)) return null;
  const post = await resolveAccessiblePostMeta(postId, viewerId, viewerRole);
  if (!post || post.deletedAt !== null || post.isPublished !== true) return null;
  return post;
}

function getViewFingerprint(req: Request) {
  const ua = req.get('user-agent') || '';
  const lang = req.get('accept-language') || '';
  const ip = req.ip || req.socket.remoteAddress || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}|${lang}`).digest('hex').slice(0, 40);
}

function recordUserProfileView(req: Request, userId: string) {
  const fingerprint = getViewFingerprint(req);
  if (!fingerprint || !userId) return false;

  const now = Date.now();
  const key = `${userId}:${fingerprint}`;
  const expiresAt = userProfileViewDedupe.get(key) || 0;
  if (expiresAt > now) return false;

  userProfileViewDedupe.set(key, now + USER_PROFILE_VIEW_DEDUPE_TTL_MS);
  if (userProfileViewDedupe.size > USER_PROFILE_VIEW_DEDUPE_MAX_ENTRIES) {
    for (const [dedupeKey, dedupeExpiresAt] of userProfileViewDedupe) {
      if (dedupeExpiresAt <= now || userProfileViewDedupe.size > USER_PROFILE_VIEW_DEDUPE_MAX_ENTRIES) {
        userProfileViewDedupe.delete(dedupeKey);
      }
      if (userProfileViewDedupe.size <= USER_PROFILE_VIEW_DEDUPE_MAX_ENTRIES) break;
    }
  }

  prisma.user.update({
    where: { id: userId },
    data: { viewCount: { increment: 1 } }
  }).catch(() => {});
  return true;
}

const handleQuotePublishPostCreated: QuotePublishAfterPostCreated = async ({ post, user }) => {
  markContentDataChanged();
  const postIds = [post?.id, post?.quotedPostId]
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean);
  if (postIds.length > 0) {
    PostService.schedulePostRankingRefresh(postIds);
  }

  await publishPostCreatedToChat({
    post,
    user,
  });
};

const handleAutoPostCreated: AutoPostAfterPostCreated = async ({ post, user }) => {
  markContentDataChanged();
  if (typeof post?.id === 'string' && post.id.trim()) {
    PostService.schedulePostRankingRefresh(post.id);
  }

  if (post?.source !== HIDDEN_AUTO_POST_CURATED_SOURCE || user?.userType !== 'ROBOT') {
    await publishPostCreatedToChat({
      post,
      user,
    });
  }
};

registerConfigRoutes(app);
registerAutoCrawlRoutes(app, { markContentDataChanged });
registerAutoPostRoutes(app, {
  afterPostCreated: handleAutoPostCreated,
});
registerQuotePublishRoutes(app, {
  afterPostCreated: handleQuotePublishPostCreated,
  afterAutoPostCreated: handleAutoPostCreated,
});
registerApiHealthRoute(app);

registerAccountRoutes(app, {
  JWT_SECRET,
  MAX_BIO_LENGTH,
  POST_ID_PATTERN,
  USER_PROFILE_CACHE_TTL_MS,
  USER_PROFILE_CACHE_MAX_ENTRIES,
  userProfileCache,
  userProfileInflight,
  validateLoginPassword,
  canonicalizePersistentUploadedImageUrl,
  normalizeTelegramContactHandle,
  normalizeCategoryIdList,
  markInteractionDataChanged,
  markUserDataChanged,
  markContentDataChanged,
  recordUserProfileView,
  throwOnInvalidPagination,
  getBlockedUserIds,
  setPaginationHeaders,
  emptyFeedBadgeCounts,
  getFeedBadgeCounts,
});

registerPostCreateRoutes(app, {
  POST_ID_PATTERN,
  POST_CREATED_CHAT_QUOTE_SELECT,
  normalizeExternalLocation,
  derivePostLocation,
  normalizeTelegramContactHandle,
  normalizeBooleanInput,
  normalizeShowContactInput,
  canonicalizePersistentUploadedImageUrl,
  resolveQuotablePostMeta,
  adjustPostQuoteCount,
  publishPostCreatedToChat,
  markContentDataChanged,
  isDatabaseUnavailableError,
  isDatabaseSchemaDriftError,
  sendDatabaseUnavailable,
  sendDatabaseSchemaDrift,
});

registerPostRoutes(app, {
  publicReadLimiter,
  authMiddleware,
  catchAsync,
  isDbConfigured,
  sendDatabaseUnavailable,
  getCurrentUserId,
  throwOnInvalidPagination,
  getConfigs,
  buildLocationPresetValueSet,
  normalizeCategoryMetaFeedFilters,
  PostService,
  runPublicFeedRead,
  getPublicFeedResultCacheKey,
  getPublicFeedResultCache,
  refreshPublicFeedResultCache,
  getPublicFeedInflight,
  getPublicFeedFallbackCache,
  setPublicFeedInflight,
  setPublicFeedResultCache,
  withTimeout,
  sendPublicFeedCachedResult,
  sendPublicFeedResult,
  isHttpError,
  isDatabaseUnavailableError,
  PUBLIC_FEED_DEFAULT_LIMIT,
  PUBLIC_FEED_MAX_LIMIT,
  PUBLIC_FEED_RESPONSE_BUDGET_MS,
});

registerFeedRoutes(app, {
  publicReadLimiter,
  authMiddleware,
  catchAsync,
  isDbConfigured,
  sendDatabaseUnavailable,
  getCurrentUserId,
  throwOnInvalidPagination,
  getConfigs,
  buildLocationPresetValueSet,
  normalizeCategoryMetaFeedFilters,
  PostService,
  HomeFeedService,
  runPublicFeedRead,
  getPublicFeedResultCacheKey,
  getPublicFeedResultCache,
  refreshPublicFeedResultCache,
  getPublicFeedInflight,
  getPublicFeedFallbackCache,
  setPublicFeedInflight,
  setPublicFeedResultCache,
  buildPublicFeedCacheKey,
  withTimeout,
  sendPublicFeedCachedResult,
  sendPublicFeedResult,
  setPaginationHeaders,
  setListCacheHeaders,
  setPublicFeedListCacheHeaders,
  getPublicFeedCacheVersion,
  isDatabaseUnavailableError,
  PUBLIC_FEED_DEFAULT_LIMIT,
  PUBLIC_FEED_MAX_LIMIT,
  PUBLIC_FEED_RESPONSE_BUDGET_MS,
});

registerPostReadRoutes(app, {
  POST_ID_PATTERN,
  MAX_BULK_VIEW_POST_IDS,
  HIDDEN_AUTO_POST_CURATED_SOURCE,
  getCurrentUserId,
  throwOnInvalidPagination,
  setPaginationHeaders,
  resolveAccessiblePostMeta,
  getViewFingerprint,
  isDatabaseUnavailableError,
  isDatabaseSchemaDriftError,
  sendDatabaseUnavailable,
  sendDatabaseSchemaDrift,
});
registerBillingRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
  notifyRechargeOrderSubmitted,
});
registerAdminConfigRoutes(app);
registerAdminReportRoutes(app, {
  consumedPointActions: CONSUMED_POINT_ACTIONS,
});
registerAdminUserRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
  normalizeAdminUserTypeFilter,
  markUserDataChanged,
});
registerAdminPostRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
  normalizeAdminUserTypeFilter,
  markContentDataChanged,
  shouldCountQuotePost,
  adjustPostQuoteCount,
});
registerAdminPromotionRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
  normalizeAdminUserTypeFilter,
  markPromotionDataChanged,
  normalizePromotionErrorMessage,
});
registerAdminBillingRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
  normalizeAdminUserTypeFilter,
});
registerAdminDepositRoutes(app, {
  throwOnInvalidPagination,
  setPaginationHeaders,
});

registerJoinedTopicRoutes(app, {
  markInteractionDataChanged,
});

registerUserSocialRoutes(app, {
  POST_ID_PATTERN,
  throwOnInvalidPagination,
  setPaginationHeaders,
  getBlockedUserIds,
  markInteractionDataChanged,
  sendDatabaseUnavailable,
});
registerPromotionRoutes(app, {
  POST_ID_PATTERN,
  getConfigs,
  normalizePromotionErrorMessage,
  markPromotionDataChanged,
});
registerSeoFallbackRoutes(app, {
  buildPostSharePreviewCandidates,
  fetchSocialPreviewImage,
  sendShareFallbackImage,
});

registerPostTelegramSyncRoutes(app, {
  POST_ID_PATTERN,
  statuses: {
    NONE: TELEGRAM_SYNC_STATUS_NONE,
    PENDING: TELEGRAM_SYNC_STATUS_PENDING,
    SENT: TELEGRAM_SYNC_STATUS_SENT,
    FAILED: TELEGRAM_SYNC_STATUS_FAILED,
  },
  normalizeTelegramSyncStatus,
  getTelegramBotToken,
  resolveTelegramChannelChatId,
  evaluateTelegramSyncRule,
  resolveTelegramSyncCost,
  isTelegramSyncPostSendChargeError,
  markTelegramSyncSentWithCharge,
  resolvePublicOriginFromContext,
  scheduleTelegramChannelSync,
  markTelegramSyncFailed,
  sendDatabaseUnavailable,
});

registerPostActionsRoutes(app, {
  POST_ID_PATTERN,
  resolveAccessiblePostMeta,
  getCurrentUserId,
  getShareActorKey,
  getViewFingerprint,
  shouldCountQuotePost,
  adjustPostQuoteCount,
  markInteractionDataChanged,
  markContentDataChanged,
  markPromotionDataChanged,
});

registerSeoRoutes(app);

app.use('/api', (_req, res) => {
  setNoStore(res);
  res.status(404).json({ error: 'API not found' });
});

// Global Error Handler
app.use(errorHandler);

async function startServer() {
  await startServerRuntime(app, {
    port: PORT,
    jwtSecret: JWT_SECRET,
    prisma,
    isDbConfigured,
    seedSuperpowerCategoryPosts,
    afterAutoPostCreated: handleAutoPostCreated,
    afterQuotePublishPostCreated: handleQuotePublishPostCreated,
    startPublicFeedWarmup: () => startPublicFeedWarmup({
      isDbConfigured,
      getCachedCategories,
      PostService,
    }, {
      limits: PUBLIC_FEED_WARM_LIMITS,
      categoryMax: PUBLIC_FEED_WARM_CATEGORY_MAX,
      intervalMs: PUBLIC_FEED_WARM_INTERVAL_MS,
      initialDelayMs: PUBLIC_FEED_INITIAL_WARM_DELAY_MS,
    }),
  });
}

startServer().catch((err) => {
  console.error("Critical server startup error:", err);
  process.exit(1);
});
