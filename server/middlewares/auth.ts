import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma, { isDbConfigured } from '../db';
import { getRequiredEnv } from '../env';

const JWT_SECRET = getRequiredEnv('JWT_SECRET', 'fallback-secret-for-dev');

export interface AuthRequest extends Request {
  user?: any;
  requestId?: string;
}

const AUTH_TOKEN_KEYS = ['token'];
const MUTATING_HTTP_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_USER_CACHE_TTL_MS = 10_000;
const AUTH_USER_CACHE_MAX_ENTRIES = 5000;

type JwtPayload = { userId?: unknown };
type AuthUserSnapshot = {
  id: string;
  role: string;
  isDisabled: boolean;
  loginAccount: string | null;
  displayName: string;
  photoUrl: string | null;
  contact: string | null;
  userType: string;
};

const authUserCache = new Map<string, { expiresAt: number; user: AuthUserSnapshot | null }>();

export function clearAuthUserCache(userId?: string | null) {
  if (userId) {
    authUserCache.delete(userId);
    return;
  }
  authUserCache.clear();
}

function getCachedAuthUser(userId: string) {
  const cached = authUserCache.get(userId);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    authUserCache.delete(userId);
    return undefined;
  }
  return cached.user;
}

function setCachedAuthUser(userId: string, user: AuthUserSnapshot | null) {
  authUserCache.set(userId, {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });

  if (authUserCache.size <= AUTH_USER_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [key, value] of authUserCache) {
    if (value.expiresAt <= now || authUserCache.size > AUTH_USER_CACHE_MAX_ENTRIES) {
      authUserCache.delete(key);
    }
    if (authUserCache.size <= AUTH_USER_CACHE_MAX_ENTRIES) break;
  }
}

function extractToken(req: AuthRequest): string | null {
  const cookieToken = req.cookies?.token;
  if (cookieToken && typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string') {
    return null;
  }

  const parts = authorization.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1]?.trim();
  return token || null;
}

function parseJwtUserId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as JwtPayload;
  return typeof payload.userId === 'string' && payload.userId.trim() ? payload.userId.trim() : null;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  const method = req.method.toUpperCase();
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = parseJwtUserId(decoded);
    if (!userId) {
      req.user = null;
      return next();
    }

    if (!isDbConfigured()) {
      req.user = { id: userId };
      return next();
    }

    const cachedUser = getCachedAuthUser(userId);
    const user = cachedUser !== undefined
      ? cachedUser
      : await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          isDisabled: true,
          loginAccount: true,
          displayName: true,
          photoUrl: true,
          contact: true,
          userType: true,
        },
      });
    if (cachedUser === undefined) {
      setCachedAuthUser(userId, user);
    }
    req.user = user;

    // 禁用账号仅限制可变更写操作；只读接口仍返回公开内容
    if (req.user?.isDisabled && MUTATING_HTTP_METHODS.has(method)) {
      return res.status(403).json({ error: '您的账号已被禁用，无法进行此项操作！' });
    }

    next();
  } catch (err) {
    req.user = null;
    const token = req.cookies?.[AUTH_TOKEN_KEYS[0]];
    if (typeof token === 'string') {
      res.clearCookie(AUTH_TOKEN_KEYS[0], {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    next();
  }
};

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN' || req.user.isDisabled) {
    return res.status(403).json({ error: '权限不足 (Admin privileges required)' });
  }
  return next();
};

export const mustAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }
  return next();
};
