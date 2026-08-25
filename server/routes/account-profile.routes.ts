import type { Express, Request } from 'express';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore, setPublicCache } from '../http-cache';
import { isDbConfigured } from '../db';
import { UserService } from '../user.service';
import { getCachedPublicUserProfile } from '../services/public-user-profile.service';

type AccountProfileRoutesContext = {
  POST_ID_PATTERN: RegExp;
  USER_PROFILE_CACHE_TTL_MS: number;
  USER_PROFILE_CACHE_MAX_ENTRIES: number;
  userProfileCache: Map<string, { expiresAt: number; payload: any }>;
  userProfileInflight: Map<string, Promise<any>>;
  recordUserProfileView: (req: Request, userId: string) => boolean;
};

export function registerAccountProfileRoutes(app: Express, context: AccountProfileRoutesContext) {
  const {
    POST_ID_PATTERN,
    USER_PROFILE_CACHE_TTL_MS,
    USER_PROFILE_CACHE_MAX_ENTRIES,
    userProfileCache,
    userProfileInflight,
    recordUserProfileView,
  } = context;

  app.get('/api/me', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const user = await UserService.getUser(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    setNoStore(res);
    return res.json({ user });
  }));

  app.get('/api/session', authMiddleware, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!req.user?.id) return res.json({ user: null });

    const user = await UserService.getUser(req.user.id);
    return res.json({ user: user || null });
  }));

  app.get('/api/users/:id', catchAsync(async (req, res) => {
    const { id } = req.params;
    if (!POST_ID_PATTERN.test(id)) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!isDbConfigured()) {
      setPublicCache(res, 30, 120, 60);
      return res.status(404).json({ error: 'User not found' });
    }

    const { payload, cacheStatus } = await getCachedPublicUserProfile({
      userId: id,
      cache: userProfileCache,
      inflight: userProfileInflight,
      ttlMs: USER_PROFILE_CACHE_TTL_MS,
      maxEntries: USER_PROFILE_CACHE_MAX_ENTRIES,
    });
    if (!payload) return res.status(404).json({ error: 'User not found' });

    const recordedProfileView = recordUserProfileView(req, id);
    const processedUser = {
      ...payload,
      viewCount: Math.max(0, payload.viewCount || 0) + (recordedProfileView ? 1 : 0),
    };

    setPublicCache(res, 30, 120, 60);
    res.setHeader('X-User-Profile-Cache', cacheStatus);
    return res.json(processedUser);
  }));
}
