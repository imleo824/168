import type { Express } from 'express';

import { authMiddleware, adminOnly, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { isDbConfigured } from '../db';
import {
  convertAvailableReferralCommissionToPoints,
  createReferralWithdrawalFromAvailable,
  ensureReferralInviteForUser,
  listAdminReferralWithdrawals,
  listReferralWithdrawals,
  updateAdminReferralWithdrawal,
} from '../services/referral.service';
import {
  getReferralSummaryReadModel,
  listReferralCommissionsReadModel,
  listReferralRelationsReadModel,
} from '../services/referral-read.service';
import { startReferralCommissionPoller } from '../services/referral-poller.service';

function readLimit(value: unknown, fallback = 30) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

function getSafeErrorMessage(error: any, fallback: string) {
  const statusCode = Number(error?.statusCode || 500);
  if (statusCode >= 400 && statusCode < 500 && typeof error?.message === 'string') return error.message;
  return fallback;
}

export function registerReferralRoutes(app: Express) {
  startReferralCommissionPoller();

  app.get('/api/referrals/summary', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const summary = await getReferralSummaryReadModel(req.user.id);
    return res.json(summary);
  }));

  app.get('/api/referrals/invite-code', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const inviteCode = await ensureReferralInviteForUser(req.user.id);
    return res.json({ inviteCode });
  }));

  app.get('/api/referrals/relations', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const items = await listReferralRelationsReadModel(req.user.id, readLimit(req.query.limit));
    return res.json(items);
  }));

  app.get('/api/referrals/commissions', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const items = await listReferralCommissionsReadModel(req.user.id, readLimit(req.query.limit));
    return res.json(items);
  }));

  app.get('/api/referrals/withdrawals', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const items = await listReferralWithdrawals(req.user.id, readLimit(req.query.limit));
    return res.json(items);
  }));

  app.post('/api/referrals/convert-points', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await convertAvailableReferralCommissionToPoints(req.user.id, { amount: req.body?.amount });
      return res.json({ success: true, ...result, summary: await getReferralSummaryReadModel(req.user.id) });
    } catch (error: any) {
      return res.status(Number(error?.statusCode || 400)).json({ error: getSafeErrorMessage(error, '转换积分失败，请稍后重试') });
    }
  }));

  app.post('/api/referrals/withdrawals', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await createReferralWithdrawalFromAvailable(req.user.id, {
        amount: req.body?.amount,
        address: req.body?.address,
        network: req.body?.network,
        paymentPassword: req.body?.paymentPassword,
      });
      return res.status(201).json({ success: true, withdrawal: result, summary: await getReferralSummaryReadModel(req.user.id) });
    } catch (error: any) {
      return res.status(Number(error?.statusCode || 400)).json({ error: getSafeErrorMessage(error, '提现申请失败，请稍后重试') });
    }
  }));

  app.get('/api/admin/referral-withdrawals', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.json([]);
    const result = await listAdminReferralWithdrawals({
      status: req.query.status,
      search: req.query.search,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    res.setHeader('X-Next-Cursor', result.nextCursor || '');
    res.setHeader('X-Has-More', result.hasMore ? 'true' : 'false');
    return res.json(result.items);
  }));

  app.patch('/api/admin/referral-withdrawals/:id', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const item = await updateAdminReferralWithdrawal({
        id: req.params.id,
        status: req.body?.status,
        adminNote: req.body?.adminNote,
        adminUserId: req.user?.id,
      });
      return res.json(item);
    } catch (error: any) {
      return res.status(Number(error?.statusCode || 400)).json({ error: getSafeErrorMessage(error, '提现审核失败，请稍后重试') });
    }
  }));
}
