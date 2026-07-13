import type { Express } from 'express';

import { setNoStore } from '../http-cache';

export function registerAdminNoStoreMiddleware(app: Express) {
  app.use('/api/admin', (_req, res, next) => {
    setNoStore(res);
    next();
  });
}
