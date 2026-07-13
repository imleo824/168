import type { Express } from 'express';

import { setNoStore } from '../http-cache';
import { authMiddleware, adminOnly } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import {
  cleanupExpiredAutomationTaskLocks,
  forceReleaseAutomationTaskLock,
  getAutomationTaskLocks,
} from '../services/automation-task-lock.service';

export function registerAdminAutomationLockRoutes(app: Express) {
  app.get('/api/admin/automation/locks', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    return res.json(await getAutomationTaskLocks());
  }));

  app.post('/api/admin/automation/locks/cleanup-expired', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    setNoStore(res);
    const deleted = await cleanupExpiredAutomationTaskLocks();
    return res.json({ success: true, deleted });
  }));

  app.delete('/api/admin/automation/locks/:name', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    setNoStore(res);
    const released = await forceReleaseAutomationTaskLock(String(req.params.name || '').trim());
    return res.json({ success: true, released });
  }));
}
