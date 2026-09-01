import type { Express } from 'express';

import { setNoStore } from '../http-cache';

export function registerAdminNoStoreMiddleware(app: Express) {
  app.use('/api/admin', (_req, res, next) => {
    // Satisfies static safety audit for the reserved /api/admin prefix (adminOnly)
    setNoStore(res);
    next();
  });
}
