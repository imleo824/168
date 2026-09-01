import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';

import { ConfigService } from '../config.service';
import { isDbConfigured } from '../db';
import type { createStrictPaginationParser, setCursorPaginationHeaders } from '../http/pagination';
import { adminOnly, authMiddleware, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { normalizeTronAddress } from '../services/deposit-scanner.service';
import {
  claimAdminDepositSweepBatch,
  completeAdminDepositSweepTransaction,
  createAdminDepositSweepJob,
  failAdminDepositSweepTransaction,
  getAdminDepositStats,
  importAdminDepositAddresses,
  isDepositAddressStatus,
  listAdminDepositAddresses,
  updateAdminDepositAddressStatus,
} from '../services/admin-deposit.service';

type StrictPaginationParser = ReturnType<typeof createStrictPaginationParser>;
type SetPaginationHeaders = typeof setCursorPaginationHeaders;

type RegisterAdminDepositRoutesOptions = {
  throwOnInvalidPagination: StrictPaginationParser;
  setPaginationHeaders: SetPaginationHeaders;
};

function timingSafeSecretCompare(providedSecret: string, expectedSecret: string) {
  const providedHash = crypto.createHash('sha256').update(providedSecret).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedSecret).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function timingSafeBearerTokenCompare(providedToken: string, expectedToken: string) {
  if (!providedToken || !expectedToken) return false;
  return timingSafeSecretCompare(providedToken, expectedToken);
}

function requireSweepWorker(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.TRON_SWEEP_WORKER_SECRET || '').trim();
  if (!expected) return res.status(503).json({ error: 'Sweep worker is not configured' });
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!timingSafeBearerTokenCompare(token, expected)) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

export function registerAdminDepositRoutes(app: Express, options: RegisterAdminDepositRoutesOptions) {
  const { throwOnInvalidPagination, setPaginationHeaders } = options;

  app.get('/api/admin/deposit-addresses', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.json([]);
    const { status, search } = req.query;
    const { limit, cursor } = throwOnInvalidPagination(req, { maxLimit: 100, defaultLimit: 50 });
    const normalizedStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
    const safeSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
    if (normalizedStatus && !isDepositAddressStatus(normalizedStatus)) {
      return res.status(400).json({ error: 'status 参数不合法' });
    }
    const page = await listAdminDepositAddresses({ status: normalizedStatus, search: safeSearch, limit, cursor });
    setPaginationHeaders(res, {
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
    return res.json(page.items);
  }));

  app.get('/api/admin/deposit-addresses/stats', authMiddleware, adminOnly, catchAsync(async (_req, res) => {
    if (!isDbConfigured()) {
      return res.json({
        available: 0,
        assigned: 0,
        hdAssigned: 0,
        disabled: 0,
        fallbackOrders: 0,
        pendingAutoCreditOrders: 0,
        pendingSweepOrders: 0,
        pendingSweepUsdt: 0,
        todayRechargeCount: 0,
        todayRechargeUsdt: 0,
        sweepTargetConfigured: false,
        lastSweepJob: null,
      });
    }
    const configs = await ConfigService.getConfigs();
    const sweepTarget = normalizeTronAddress(configs?.tron_sweep_target_address);
    return res.json(await getAdminDepositStats({ sweepTargetConfigured: Boolean(sweepTarget) }));
  }));

  app.post('/api/admin/deposit-sweep-jobs', authMiddleware, adminOnly, catchAsync(async (req: AuthRequest, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const configs = await ConfigService.getConfigs();
    const targetAddress = normalizeTronAddress(configs?.tron_sweep_target_address);
    if (!targetAddress) {
      return res.status(400).json({ error: '请先在系统配置中设置归集目标地址' });
    }

    const result = await createAdminDepositSweepJob({ requestedById: req.user?.id || null, targetAddress });

    return res.status(201).json({ success: true, job: result });
  }));

  app.get('/api/internal/deposit-sweep-jobs/next', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const job = await claimAdminDepositSweepBatch(limit);
    return res.json({ job });
  }));

  app.post('/api/internal/deposit-sweep-transactions/:id/complete', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const txHash = typeof req.body?.txHash === 'string' ? req.body.txHash.trim() : '';
    if (!txHash || txHash.length > 128) return res.status(400).json({ error: 'txHash is required' });
    const feeTrx = req.body?.feeTrx === undefined || req.body?.feeTrx === null ? null : Number(req.body.feeTrx);
    const result = await completeAdminDepositSweepTransaction({
      id: req.params.id,
      txHash,
      feeTrx: Number.isFinite(feeTrx) && feeTrx !== null ? feeTrx : null,
    });
    return res.json({ success: true, item: result });
  }));

  app.post('/api/internal/deposit-sweep-transactions/:id/fail', requireSweepWorker, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const errorMessage = typeof req.body?.errorMessage === 'string'
      ? req.body.errorMessage.trim().slice(0, 500)
      : 'sweep_failed';
    const result = await failAdminDepositSweepTransaction({ id: req.params.id, errorMessage });
    return res.json({ success: true, item: result });
  }));

  app.post('/api/admin/deposit-addresses', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const raw = Array.isArray(req.body?.addresses)
      ? req.body.addresses
      : typeof req.body?.addresses === 'string'
        ? req.body.addresses.split(/[,\n\r\t ]+/)
        : [];
    const normalized: string[] = raw
      .map((item: unknown) => normalizeTronAddress(item))
      .filter((address: string) => Boolean(address));
    const uniqueAddresses: string[] = Array.from(new Set(normalized));
    if (uniqueAddresses.length === 0) {
      return res.status(400).json({ error: '请输入有效的 TRON 地址' });
    }
    if (uniqueAddresses.length > 200) {
      return res.status(400).json({ error: '单次最多导入 200 个地址' });
    }

    const result = await importAdminDepositAddresses(uniqueAddresses);

    return res.status(201).json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      invalid: raw.length - normalized.length,
    });
  }));

  app.patch('/api/admin/deposit-addresses/:id', authMiddleware, adminOnly, catchAsync(async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Database is not configured' });
    const status = typeof req.body?.status === 'string' ? req.body.status.trim().toUpperCase() : '';
    if (!['AVAILABLE', 'DISABLED'].includes(status) || !isDepositAddressStatus(status)) {
      return res.status(400).json({ error: '仅支持切换为可用或停用' });
    }
    const updated = await updateAdminDepositAddressStatus(req.params.id, status);
    return res.json(updated);
  }));

}
