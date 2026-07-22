import type { Express } from 'express';
import { authLimiter } from '../middlewares/rateLimit';
import { catchAsync } from '../middlewares/error';
import { setNoStore } from '../http-cache';
import { isDbConfigured } from '../db';
import { issueAuthSessionCookie, clearAuthSessionCookie } from '../http/auth-session';
import { getConfigs } from './config.routes';
import { authenticatePasswordAccount } from '../services/account-password-auth.service';
import { registerPasswordAccount } from '../services/account-registration.service';
import {
  normalizeLoginAccount,
  validateLoginAccountForWrite,
} from '../../shared/accountCredentials';
import {
  normalizeReferralInviteCode,
  normalizeReferralInviteSource,
} from '../../shared/referral';

type AccountAuthRoutesContext = {
  JWT_SECRET: string;
  validateLoginPassword: (password: string, username?: string) => string | null | undefined;
  markUserDataChanged: (userId?: string | null) => void;
};

export function registerAccountAuthRoutes(app: Express, context: AccountAuthRoutesContext) {
  const { JWT_SECRET, validateLoginPassword, markUserDataChanged } = context;

  app.post('/api/auth/password', authLimiter, catchAsync(async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!isDbConfigured()) {
      return res.status(503).json({ error: '服务暂时不可用，请稍后再试' });
    }

    let user;
    try {
      user = await authenticatePasswordAccount({
        loginAccount: cleanUsername,
        password,
      });
    } catch (error: any) {
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        return res.status(error.statusCode).json({ error: error.message || '账号或密码不正确，请重新输入' });
      }
      throw error;
    }

    issueAuthSessionCookie(res, { userId: user.id, jwtSecret: JWT_SECRET });

    const { passwordHash: _, paymentPasswordHash: __, ...safeUser } = user as any;
    res.json({ success: true, user: { ...safeUser, hasPassword: Boolean((user as any).passwordHash), hasPaymentPassword: Boolean((user as any).paymentPasswordHash) } });
  }));

  app.post('/api/auth/register', authLimiter, catchAsync(async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: '请输入账号和密码' });
    }

    const cleanUsername = normalizeLoginAccount(username);
    const accountError = validateLoginAccountForWrite(cleanUsername);
    if (accountError) return res.status(400).json({ error: accountError });
    const passwordError = validateLoginPassword(password, cleanUsername);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const rawInviteCode = req.body?.inviteCode ?? req.body?.referralCode ?? req.body?.invite;
    const inviteCode = normalizeReferralInviteCode(rawInviteCode);
    if (rawInviteCode && !inviteCode) {
      return res.status(400).json({ error: '邀请码格式不正确' });
    }
    if (!isDbConfigured()) {
      return res.status(503).json({ error: '服务暂时不可用，请稍后再试' });
    }

    const configs = await getConfigs();
    let user;
    try {
      user = await registerPasswordAccount({
        loginAccount: cleanUsername,
        password,
        signupRewardPoints: configs.signup_reward_points,
        inviteCode,
        inviteSource: normalizeReferralInviteSource(req.body?.inviteSource),
        sourceIp: req.ip,
        sourceUserAgent: req.get('user-agent') || '',
      });
    } catch (error: any) {
      if (error?.statusCode === 400) {
        return res.status(400).json({ error: error.message || '这个账号已被使用，请换一个' });
      }
      throw error;
    }

    issueAuthSessionCookie(res, { userId: user.id, jwtSecret: JWT_SECRET });
    markUserDataChanged(user.id);

    const { passwordHash: _, paymentPasswordHash: __, ...safeUser } = user as any;
    res.json({
      success: true,
      user: { ...safeUser, hasPassword: true, hasPaymentPassword: false },
      isNewUser: true,
      signupRewardPoints: user.points || 0,
    });
  }));

  app.post('/api/auth/logout', catchAsync(async (_req, res) => {
    clearAuthSessionCookie(res);
    setNoStore(res);
    res.json({ success: true });
  }));
}
