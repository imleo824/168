import type { Express } from 'express';
import { authMiddleware, mustAuth, type AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import prisma from '../db';
import {
  listMutedFeedCategoryIds,
  replaceMutedFeedCategoryIds,
} from '../services/feed-muted-categories.service';
import { updateUserBio, updateUserLoginAccount, updateUserPassword, updateUserPaymentPassword } from '../services/user-profile-settings.service';
import {
  normalizeLoginAccount,
  validateLoginAccountForWrite,
} from '../../shared/accountCredentials';

type AccountSettingsRoutesContext = {
  MAX_BIO_LENGTH: number;
  WEBHOOK_MAX_CONTACT_LEN: number;
  validateLoginPassword: (password: string, username?: string) => string | null | undefined;
  canonicalizePersistentUploadedImageUrl: (url: string) => string;
  normalizeTelegramContactHandle: (input: unknown) => string;
  normalizeCategoryIdList: (rawValue: unknown, maxItems?: number) => string[];
  markInteractionDataChanged: (userIds?: string | null | Array<string | null | undefined>) => void;
  markUserDataChanged: (userId?: string | null) => void;
};

export function registerAccountSettingsRoutes(app: Express, context: AccountSettingsRoutesContext) {
  const {
    MAX_BIO_LENGTH,
    WEBHOOK_MAX_CONTACT_LEN,
    validateLoginPassword,
    canonicalizePersistentUploadedImageUrl,
    normalizeTelegramContactHandle,
    normalizeCategoryIdList,
    markInteractionDataChanged,
    markUserDataChanged,
  } = context;

  app.get('/api/me/feed-muted-categories', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const categoryIds = await listMutedFeedCategoryIds(req.user.id);
    setNoStore(res);
    return res.json({ categoryIds });
  }));

  app.patch('/api/me/feed-muted-categories', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const categoryIds = normalizeCategoryIdList(req.body?.categoryIds);
    const validCategoryIds = await replaceMutedFeedCategoryIds(req.user.id, categoryIds);

    markInteractionDataChanged(req.user.id);
    setNoStore(res);
    return res.json({ success: true, categoryIds: validCategoryIds });
  }));

  app.put('/api/me/login-account', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { loginAccount } = req.body;
    if (typeof loginAccount !== 'string') return res.status(400).json({ error: '账号名称不能为空' });

    const cleanUsername = normalizeLoginAccount(loginAccount);
    const accountError = validateLoginAccountForWrite(cleanUsername);
    if (accountError) return res.status(400).json({ error: accountError });

    try {
      await updateUserLoginAccount(req.user.id, cleanUsername);
      markUserDataChanged(req.user.id);
    } catch (error: any) {
      if (error?.statusCode === 400 || error?.statusCode === 409) {
        return res.status(error.statusCode).json({ error: error.message || '该登录账号已被占用，请使用其他名称' });
      }
      throw error;
    }

    res.json({ success: true, loginAccount: cleanUsername });
  }));

  app.put('/api/me/password', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { password, oldPassword } = req.body;
    const nextPassword = typeof password === 'string' ? password.trim() : '';
    const nextOldPassword = typeof oldPassword === 'string' ? oldPassword.trim() : '';

    try {
      await updateUserPassword({
        userId: req.user.id,
        password: nextPassword,
        oldPassword: nextOldPassword,
        validateLoginPassword,
      });
      markUserDataChanged(req.user.id);
    } catch (error: any) {
      if (error?.statusCode === 400 || error?.statusCode === 404) {
        return res.status(error.statusCode).json({ error: error.message || '请求参数不正确' });
      }
      throw error;
    }

    res.json({ success: true });
  }));

  app.put('/api/me/payment-password', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { password, oldPassword } = req.body;
    const nextPassword = typeof password === 'string' ? password.trim() : '';
    const nextOldPassword = typeof oldPassword === 'string' ? oldPassword.trim() : '';

    if (nextPassword.length < 6 || nextPassword.length > 128) {
      return res.status(400).json({ error: '支付密码至少需要6位' });
    }

    try {
      await updateUserPaymentPassword({
        userId: req.user.id,
        password: nextPassword,
        oldPassword: nextOldPassword,
      });
      markUserDataChanged(req.user.id);
    } catch (error: any) {
      if (error?.statusCode === 400 || error?.statusCode === 404) {
        return res.status(error.statusCode).json({ error: error.message || '请求参数不正确' });
      }
      throw error;
    }

    res.json({ success: true, hasPaymentPassword: true });
  }));

  app.put('/api/me/bio', authMiddleware, mustAuth, catchAsync(async (req: AuthRequest, res) => {
    const { bio } = req.body;
    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
      return res.status(400).json({ error: '简介格式不正确' });
    }
    const normalizedBio = typeof bio === 'string' ? bio.trim() : '';
    if (normalizedBio.length > MAX_BIO_LENGTH) {
      return res.status(400).json({ error: `简介最长 ${MAX_BIO_LENGTH} 字` });
    }

    await updateUserBio(req.user.id, normalizedBio);
    markUserDataChanged(req.user.id);
    res.json({ success: true, bio: normalizedBio });
  }));

  app.patch('/api/me/profile', authMiddleware, mustAuth, catchAsync(async (req: any, res) => {
    const { displayName, photoUrl, coverUrl, contact } = req.body;
    if (displayName === undefined && photoUrl === undefined && coverUrl === undefined && contact === undefined) {
      return res.status(400).json({ error: '请提供要修改的内容' });
    }

    const data: any = {};
    if (displayName !== undefined) {
      if (typeof displayName !== 'string') return res.status(400).json({ error: '昵称格式不正确' });
      const normalized = displayName.trim();
      if (!normalized || normalized.length > 40) return res.status(400).json({ error: '昵称长度需为1-40个字符' });
      data.displayName = normalized;
    }
    if (photoUrl !== undefined) {
      const normalizedPhotoUrl = typeof photoUrl === 'string'
        ? canonicalizePersistentUploadedImageUrl(photoUrl)
        : '';
      if (photoUrl !== null && (typeof photoUrl !== 'string' || (photoUrl.trim() && !normalizedPhotoUrl))) {
        return res.status(400).json({ error: '头像图片必须先上传成功' });
      }
      data.photoUrl = normalizedPhotoUrl || null;
    }
    if (coverUrl !== undefined) {
      const normalizedCoverUrl = typeof coverUrl === 'string'
        ? canonicalizePersistentUploadedImageUrl(coverUrl)
        : '';
      if (coverUrl !== null && (typeof coverUrl !== 'string' || (coverUrl.trim() && !normalizedCoverUrl))) {
        return res.status(400).json({ error: '封面图片必须先上传成功' });
      }
      data.coverUrl = normalizedCoverUrl || null;
    }
    if (contact !== undefined) {
      if (contact !== null && typeof contact !== 'string') return res.status(400).json({ error: '联系方式格式不正确' });
      const normalized = typeof contact === 'string' ? normalizeTelegramContactHandle(contact) : '';
      if (typeof contact === 'string' && contact.trim() && !normalized) {
        return res.status(400).json({ error: '仅支持 Telegram 联系方式，请输入 @用户名 或 t.me 链接' });
      }
      if (normalized.length > WEBHOOK_MAX_CONTACT_LEN) {
        return res.status(400).json({ error: `联系方式最长 ${WEBHOOK_MAX_CONTACT_LEN} 字` });
      }
      data.contact = normalized || null;
    }

    const user = await (prisma as any).user.update({
      where: { id: req.user.id },
      data,
    });
    markUserDataChanged(req.user.id);

    const { passwordHash, paymentPasswordHash, ...safeUser } = user as any;
    res.json({
      ...safeUser,
      photoUrl: user.photoUrl,
      coverUrl: user.coverUrl || null,
      hasPassword: Boolean(passwordHash),
      hasPaymentPassword: Boolean(paymentPasswordHash),
    });
  }));
}
