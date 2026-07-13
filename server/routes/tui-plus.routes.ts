import type { Express } from 'express';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { ConfigService } from '../config.service';
import {
  TuiPlusError,
  addTuiPlusWebsite,
  buildTuiPlusStatusPayload,
  deleteTuiPlusContact,
  deleteTuiPlusWebsite,
  getTuiPlusPlans,
  purchaseTuiPlus,
  startTuiPlusTrial,
  updateTuiPlusWebsite,
} from '../services/tui-plus.service';
import {
  addTuiPlusTelegramChannel,
  deleteTuiPlusTelegramChannel,
  updateTuiPlusTelegramChannel,
} from '../services/tui-plus-channel.service';
import { upsertTuiPlusTypedContact } from '../services/tui-plus-contact-methods.service';
import { syncTuiPlusEntitlementsForUser } from '../services/tui-plus-entitlements.service';
import { createTuiPlusActivationPost } from '../services/tui-plus-auto-post.service';
import { completeTuiPlusStatusPayload } from '../services/tui-plus-benefits.service';
import { buildTuiPlusPostCoverSvg } from '../services/tui-plus-post-cover.service';
import {
  assertSupportedTuiPlusContactInput,
  deleteRemovedTuiPlusWechatContacts,
  filterSupportedTuiPlusContacts,
} from '../services/tui-plus-contact-policy.service';

function sendTuiPlusError(res: any, error: unknown) {
  if (error instanceof TuiPlusError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  throw error;
}

type TuiPlusRoutesContext = {
  markUserDataChanged?: (userId?: string | null) => void;
  markContentDataChanged?: () => void;
};

function normalizeContactPayload(body: any) {
  return {
    contact: body?.contact || body?.value || body?.url,
    label: body?.label || body?.title,
    contactKind: body?.contactKind || body?.kind || body?.type,
  };
}

function sanitizeTuiPlusPayload(payload: any) {
  return {
    ...payload,
    contacts: filterSupportedTuiPlusContacts(Array.isArray(payload?.contacts) ? payload.contacts : []),
  };
}

export function registerTuiPlusRoutes(app: Express, context: TuiPlusRoutesContext = {}) {
  const markTuiPlusProfileChanged = (userId?: string | null) => {
    context.markUserDataChanged?.(userId);
  };

  const markTuiPlusSourceChanged = () => {
    context.markContentDataChanged?.();
  };

  const syncTuiPlusAndMark = async (userId: string) => {
    const result = await syncTuiPlusEntitlementsForUser(userId).catch(() => null);
    if (!result) return null;
    if (result.changedUsers || result.changedSubscriptions || result.releasedPlatformSources) markTuiPlusProfileChanged(userId);
    if (result.changedSources || result.releasedPlatformSources) markTuiPlusSourceChanged();
    return result;
  };

  const cleanupLegacyContactsAndMark = async (userId: string) => {
    const deleted = await deleteRemovedTuiPlusWechatContacts(userId).catch(() => 0);
    if (Number(deleted || 0) > 0) markTuiPlusProfileChanged(userId);
    return Number(deleted || 0);
  };

  const createActivationPost = async (userId: string, plan: unknown) => {
    const post = await createTuiPlusActivationPost(userId, plan).catch((error) => {
      console.warn('[tui-plus] activation post failed', error);
      return null;
    });
    if (post) context.markContentDataChanged?.();
    return post;
  };

  app.get('/api/tui-plus/post-cover.svg', (_req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return res.send(buildTuiPlusPostCoverSvg());
  });

  app.get('/api/tui-plus/status', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    setNoStore(res);
    await syncTuiPlusAndMark(req.user.id);
    await cleanupLegacyContactsAndMark(req.user.id);
    const configs = await ConfigService.getConfigs().catch(() => ConfigService.getDefaultConfigs());
    const payload = sanitizeTuiPlusPayload(await buildTuiPlusStatusPayload(req.user.id, configs));
    return res.json(completeTuiPlusStatusPayload(payload));
  }));

  app.get('/api/tui-plus/plans', authMiddleware, mustAuth, catchAsync(async (_req: AuthRequest, res) => {
    const configs = await ConfigService.getConfigs().catch(() => ConfigService.getDefaultConfigs());
    return res.json(await getTuiPlusPlans(configs));
  }));

  app.post('/api/tui-plus/trial/start', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const status = await startTuiPlusTrial(req.user.id);
      await createActivationPost(req.user.id, status.plan);
      await syncTuiPlusAndMark(req.user.id);
      const payload = sanitizeTuiPlusPayload(await buildTuiPlusStatusPayload(req.user.id));
      markTuiPlusProfileChanged(req.user.id);
      return res.json(completeTuiPlusStatusPayload(payload));
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.post('/api/tui-plus/purchase', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const configs = await ConfigService.getConfigs().catch(() => ConfigService.getDefaultConfigs());
      const status = await purchaseTuiPlus(req.user.id, req.body?.plan, configs);
      await createActivationPost(req.user.id, status.plan);
      await syncTuiPlusAndMark(req.user.id);
      const payload = sanitizeTuiPlusPayload(await buildTuiPlusStatusPayload(req.user.id, configs));
      markTuiPlusProfileChanged(req.user.id);
      return res.json(completeTuiPlusStatusPayload({ ...payload, points: (status as any).points }));
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.post('/api/tui-plus/channels', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const channel = await addTuiPlusTelegramChannel(req.user.id, req.body || {});
      await syncTuiPlusAndMark(req.user.id);
      markTuiPlusProfileChanged(req.user.id);
      markTuiPlusSourceChanged();
      return res.json({ success: true, channel });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.patch('/api/tui-plus/channels/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const channel = await updateTuiPlusTelegramChannel(req.user.id, req.params.id, req.body || {});
      await syncTuiPlusAndMark(req.user.id);
      markTuiPlusProfileChanged(req.user.id);
      markTuiPlusSourceChanged();
      return res.json({ success: true, channel });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.delete('/api/tui-plus/channels/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const result = await deleteTuiPlusTelegramChannel(req.user.id, req.params.id);
      await syncTuiPlusAndMark(req.user.id);
      markTuiPlusProfileChanged(req.user.id);
      markTuiPlusSourceChanged();
      return res.json(result);
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.post('/api/tui-plus/websites', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const website = await addTuiPlusWebsite(req.user.id, req.body || {});
      markTuiPlusProfileChanged(req.user.id);
      return res.json({ success: true, website });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.patch('/api/tui-plus/websites/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const website = await updateTuiPlusWebsite(req.user.id, req.params.id, req.body || {});
      markTuiPlusProfileChanged(req.user.id);
      return res.json({ success: true, website });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.delete('/api/tui-plus/websites/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const result = await deleteTuiPlusWebsite(req.user.id, req.params.id);
      markTuiPlusProfileChanged(req.user.id);
      return res.json(result);
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.post('/api/tui-plus/contacts', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      assertSupportedTuiPlusContactInput(req.body || {});
      const contact = await upsertTuiPlusTypedContact(req.user.id, normalizeContactPayload(req.body));
      markTuiPlusProfileChanged(req.user.id);
      return res.json({ success: true, contact });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.patch('/api/tui-plus/contacts/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      assertSupportedTuiPlusContactInput(req.body || {});
      const contact = await upsertTuiPlusTypedContact(req.user.id, normalizeContactPayload(req.body), req.params.id);
      markTuiPlusProfileChanged(req.user.id);
      return res.json({ success: true, contact });
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));

  app.delete('/api/tui-plus/contacts/:id', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    try {
      const result = await deleteTuiPlusContact(req.user.id, req.params.id);
      markTuiPlusProfileChanged(req.user.id);
      return res.json(result);
    } catch (error) {
      return sendTuiPlusError(res, error);
    }
  }));
}
