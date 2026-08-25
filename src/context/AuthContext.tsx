import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '@/types';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { safeLocalStorage } from '@/utils/storage';
import { apiFetch } from '@/services/apiCore';
import { publishSignupRewardBadge } from '@/utils/signupRewardBadge';
import { type ReferralInviteSource } from '../../shared/referral';

export type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; type: ToastType };
type AuthResult = { ok: true; signupRewardPoints?: number } | { ok: false; error: string };

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isAuthenticating: boolean;
  showAuthModal: boolean;
  requireAuth: (callback?: () => void) => void;
  closeAuthModal: () => void;
  refreshUser: (silent?: boolean) => Promise<void>;
  loginWithPassword: (u: string, p: string) => Promise<AuthResult>;
  registerWithPassword: (u: string, p: string, inviteCode?: string, inviteSource?: ReferralInviteSource) => Promise<AuthResult>;
  patchUser: (patch: Partial<User>) => void;
  logout: () => void;
  showToast: (message: string, type?: ToastType) => void;
};

const AuthContext = createContext<AuthContextType>({} as any);
const AUTH_USER_CACHE_KEY = 'auth_user_snapshot';
const AUTH_SCOPED_QUERY_KEYS = [
  ['me'],
  ['likes'],
  ['notifications'],
  ['users', 'following'],
  ['users', 'fans'],
  ['follow-status'],
  ['promotions'],
  ['transactions'],
  ['recharge-orders'],
  ['user-profile'],
  ['referrals'],
  ['tui-plus'],
] as const;
const noopCallback = () => {};

function readCachedUser() {
  try {
    const raw = safeLocalStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as User;
    return cached?.id ? cached : null;
  } catch {
    safeLocalStorage.removeItem(AUTH_USER_CACHE_KEY);
    return null;
  }
}

function toCachedUserSnapshot(user: User): User {
  return {
    id: user.id,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    coverUrl: user.coverUrl,
    points: Number.isFinite(Number(user.points)) ? Number(user.points) : 0,
    role: user.role,
    userType: user.userType,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    postCount: user.postCount,
    followingCount: user.followingCount,
    followerCount: user.followerCount,
    viewCount: user.viewCount,
    likeCount: user.likeCount,
    bio: user.bio,
    contact: user.contact,
    hasPassword: user.hasPassword,
    hasPaymentPassword: user.hasPaymentPassword,
    plusStatus: user.plusStatus,
    plusPlan: user.plusPlan,
    plusExpiresAt: user.plusExpiresAt,
    plusTrialUsed: user.plusTrialUsed,
    isTuiPlus: user.isTuiPlus,
    tuiPlusChannels: user.tuiPlusChannels,
    tuiPlusWebsites: user.tuiPlusWebsites,
    tuiPlusContacts: user.tuiPlusContacts,
  };
}

function cacheUserSnapshot(nextUser: User | null) {
  if (!nextUser) {
    safeLocalStorage.removeItem(AUTH_USER_CACHE_KEY);
    return;
  }

  safeLocalStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify(toCachedUserSnapshot(nextUser)));
}

async function readAuthError(response: Response) {
  try {
    const payload = await response.json();
    const message = typeof payload?.error === 'string' ? payload.error.trim() : '';
    return message || `Status: ${response.status}`;
  } catch {
    return `Status: ${response.status}`;
  }
}

function normalizePasswordLoginError(status: number, rawMessage: string) {
  if (status === 400 || status === 401 || status === 403) return rawMessage || '账号或密码错误';
  if (status === 503 || status >= 500) return '登录服务暂不可用，请稍后重试';
  return rawMessage || '登录失败，请稍后重试';
}

function normalizePasswordRegisterError(status: number, rawMessage: string) {
  if (status === 503 || status >= 500) return '注册服务暂不可用，请稍后重试';
  return rawMessage || '注册失败，请换一个账号重试';
}

function getPostAuthorId(post: any) {
  return String(post?.user?.id || post?.userId || post?.authorId || post?.creatorId || '').trim();
}

function patchPostAuthor(post: any, userId: string, userPatch: Partial<User>) {
  if (!post || typeof post !== 'object') return post;
  const authorId = getPostAuthorId(post);
  if (!authorId || authorId !== userId) return post;

  const currentAuthor = post.user && typeof post.user === 'object' ? post.user : {};
  return {
    ...post,
    user: {
      ...currentAuthor,
      id: authorId,
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'displayName') ? { displayName: userPatch.displayName } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'photoUrl') ? { photoUrl: userPatch.photoUrl || null } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'userType') ? { userType: userPatch.userType } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'plusStatus') ? { plusStatus: userPatch.plusStatus } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'plusPlan') ? { plusPlan: userPatch.plusPlan } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'plusExpiresAt') ? { plusExpiresAt: userPatch.plusExpiresAt } : {}),
      ...(Object.prototype.hasOwnProperty.call(userPatch, 'isTuiPlus') ? { isTuiPlus: userPatch.isTuiPlus } : {}),
    },
  };
}

function patchPostAuthorCacheValue(old: any, userId: string, userPatch: Partial<User>): any {
  if (!old) return old;
  if (Array.isArray(old)) return old.map((item) => patchPostAuthor(item, userId, userPatch));
  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) return page.map((item) => patchPostAuthor(item, userId, userPatch));
        if (Array.isArray(page?.items)) return { ...page, items: page.items.map((item: any) => patchPostAuthor(item, userId, userPatch)) };
        return page;
      }),
    };
  }
  return patchPostAuthor(old, userId, userPatch);
}

function syncPostAuthorCaches(queryClient: any, userId: string, userPatch: Partial<User>) {
  if (!userId || !userPatch || typeof userPatch !== 'object') return;
  const patcher = (old: any) => patchPostAuthorCacheValue(old, userId, userPatch);
  queryClient.setQueriesData({ queryKey: ['posts'] }, patcher);
  queryClient.setQueriesData({ queryKey: ['likes'] }, patcher);
  queryClient.setQueriesData({ queryKey: ['post'] }, patcher);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const initialUserRef = useRef<User | null | undefined>(undefined);
  if (initialUserRef.current === undefined) initialUserRef.current = readCachedUser();
  const [user, setUser] = useState<User | null>(() => initialUserRef.current || null);
  const [loading, setLoading] = useState(() => !initialUserRef.current);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [onAuthSuccess, setOnAuthSuccess] = useState<(() => void) | null>(null);
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);
  const pendingAuthCallbackRef = useRef<(() => void) | null>(null);
  const toastSeqRef = useRef(0);
  const refreshSeqRef = useRef(0);
  const showToastRef = useRef<(message: string, type?: ToastType) => void>(noopCallback);
  const activeToast = toastQueue[0] || null;

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = Date.now() + toastSeqRef.current++;
    setToastQueue((current) => {
      const latest = current[current.length - 1];
      if (latest?.message === trimmed && latest.type === type) return current;
      return [...current, { id, message: trimmed, type }].slice(-3);
    });
  }, []);

  const refreshUser = useCallback(async (silent = false) => {
    const reqId = ++refreshSeqRef.current;
    try {
      if (!silent) setLoading(true);
      const res = await apiFetch('/api/session');
      if (res.ok) {
        const data = await res.json();
        if (reqId !== refreshSeqRef.current) return;
        setUser(data.user);
        cacheUserSnapshot(data.user);
        if (data.user?.id) {
          queryClient.setQueryData(['user-profile', data.user.id], data.user);
          syncPostAuthorCaches(queryClient, data.user.id, data.user);
        }
      } else if (res.status === 401 || res.status === 403) {
        if (reqId !== refreshSeqRef.current) return;
        setUser(null);
        cacheUserSnapshot(null);
        queryClient.removeQueries({ queryKey: ['user-profile'] });
      }
    } catch (err) {
      console.error('Failed to refresh user:', err);
    } finally {
      if (!silent && reqId === refreshSeqRef.current) setLoading(false);
    }
  }, [queryClient]);

  const patchUser = useCallback((patch: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      const nextUser = { ...current, ...patch };
      cacheUserSnapshot(nextUser);
      if (nextUser.id) {
        queryClient.setQueryData(['user-profile', nextUser.id], nextUser);
        syncPostAuthorCaches(queryClient, nextUser.id, patch);
      }
      return nextUser;
    });
  }, [queryClient]);

  useEffect(() => {
    safeLocalStorage.removeItem('auth_token');
    const hasCachedUser = Boolean(initialUserRef.current);
    const runRefresh = () => { void refreshUser(hasCachedUser); };
    if (!hasCachedUser || typeof window === 'undefined') {
      runRefresh();
      return undefined;
    }
    const timer = window.setTimeout(runRefresh, 80);
    return () => window.clearTimeout(timer);
  }, [refreshUser]);

  useEffect(() => {
    if (!activeToast) return undefined;
    const timeout = window.setTimeout(() => {
      setToastQueue((current) => current[0]?.id === activeToast.id ? current.slice(1) : current);
    }, activeToast.type === 'error' ? 3200 : 2400);
    return () => window.clearTimeout(timeout);
  }, [activeToast]);

  const loginWithPassword = useCallback(async (username: string, password: string): Promise<AuthResult> => {
    if (isAuthenticating) return { ok: false, error: '正在登录，请稍候' };
    try {
      setIsAuthenticating(true);
      const res = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        await refreshUser();
        if (onAuthSuccess) {
          onAuthSuccess();
          setOnAuthSuccess(null);
        }
        return { ok: true };
      }
      return { ok: false, error: normalizePasswordLoginError(res.status, await readAuthError(res)) };
    } catch (err) {
      console.error('Password login failed:', err);
      return { ok: false, error: normalizePasswordLoginError(0, err instanceof Error ? err.message : '') };
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, onAuthSuccess, refreshUser]);

  const registerWithPassword = useCallback(async (username: string, password: string, inviteCode?: string, inviteSource?: ReferralInviteSource): Promise<AuthResult> => {
    if (isAuthenticating) return { ok: false, error: '正在注册，请稍候' };
    try {
      setIsAuthenticating(true);
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, inviteCode, inviteSource }),
      });
      if (res.ok) {
        const payload = await res.json().catch(() => ({}));
        await refreshUser();
        if (typeof payload?.signupRewardPoints === 'number' && payload.signupRewardPoints > 0) {
          publishSignupRewardBadge(payload.signupRewardPoints);
        }
        if (onAuthSuccess) {
          onAuthSuccess();
          setOnAuthSuccess(null);
        }
        return { ok: true, signupRewardPoints: typeof payload?.signupRewardPoints === 'number' ? payload.signupRewardPoints : undefined };
      }
      return { ok: false, error: normalizePasswordRegisterError(res.status, await readAuthError(res)) };
    } catch (err) {
      console.error('Password register failed:', err);
      return { ok: false, error: normalizePasswordRegisterError(0, err instanceof Error ? err.message : '') };
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, onAuthSuccess, refreshUser]);

  const requireAuth = useCallback((callback?: () => void) => {
    if (user) {
      callback?.();
      return;
    }
    pendingAuthCallbackRef.current = callback || null;
    setShowAuthModal(true);
  }, [user]);

  const closeAuthModal = useCallback(() => {
    setShowAuthModal(false);
    pendingAuthCallbackRef.current = null;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch((): null => null);
    setUser(null);
    cacheUserSnapshot(null);
    queryClient.removeQueries();
  }, [queryClient]);

  useEffect(() => {
    if (!user || !pendingAuthCallbackRef.current) return;
    const callback = pendingAuthCallbackRef.current;
    pendingAuthCallbackRef.current = null;
    setShowAuthModal(false);
    callback();
  }, [user]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const value = useMemo(() => ({
    user,
    loading,
    isAuthenticating,
    showAuthModal,
    requireAuth,
    closeAuthModal,
    refreshUser,
    loginWithPassword,
    registerWithPassword,
    patchUser,
    logout,
    showToast,
  }), [user, loading, isAuthenticating, showAuthModal, requireAuth, closeAuthModal, refreshUser, loginWithPassword, registerWithPassword, patchUser, logout, showToast]);
  const ActiveToastIcon = activeToast
    ? activeToast.type === 'success'
      ? CheckCircle
      : activeToast.type === 'error'
        ? AlertCircle
        : Info
    : null;

  return (
    <AuthContext.Provider value={value}>
      {children}
      {activeToast ? (
        <div className="ui-toast" data-toast-type={activeToast.type} role="status" aria-live="polite">
          {ActiveToastIcon ? <ActiveToastIcon className="ui-toast-icon" aria-hidden="true" /> : null}
          <span className="ui-toast-text">{activeToast.message}</span>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
