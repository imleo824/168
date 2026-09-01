import type { Express } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { publicReadLimiter } from '../middlewares/rateLimit';
import { setNoStore, setPrivateCache } from '../http-cache';
import { parseCursorPagination, setCursorPaginationHeaders } from '../http/pagination';
import { getChatConfig } from './chat.config';
import { ensurePublicChatRoom, listChatMessages } from './chat.repository';
import { getChatEligibility } from './chat.policy';

export function registerChatRoutes(app: Express, options: { getOnlineCount: () => number }) {
  app.get('/api/chat/bootstrap', publicReadLimiter, authMiddleware, catchAsync(async (req: any, res) => {
    const room = await ensurePublicChatRoom();
    const [config, eligibilityResult] = await Promise.all([
      getChatConfig(),
      getChatEligibility(req.user?.id || null),
    ]);

    setPrivateCache(res, 5, 15, 15);
    return res.json({
      room,
      eligibility: eligibilityResult.eligibility,
      onlineCount: options.getOnlineCount(),
      config: {
        maxMessageLength: config.maxMessageLength,
        aiEnabled: config.aiEnabled,
      },
    });
  }));

  app.get('/api/chat/messages', publicReadLimiter, catchAsync(async (req, res) => {
    const { limit, cursor } = parseCursorPagination(req, { defaultLimit: 30, maxLimit: 80 });
    const result = await listChatMessages({ limit, cursor });
    setNoStore(res);
    setCursorPaginationHeaders(res, result);
    return res.json(result.items);
  }));
}
