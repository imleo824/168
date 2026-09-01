import { toOptimizedImageUrl } from '@/utils/image';
import {
  LOGIN_PASSWORD_MAX_LENGTH,
  LOGIN_PASSWORD_MIN_LENGTH,
  validateLoginPasswordForWrite,
} from '@/utils/accountCredentials';

export { LOGIN_PASSWORD_MIN_LENGTH, LOGIN_PASSWORD_MAX_LENGTH };

export function removePostFromCachedData(old: any, postId: string) {
  if (!old) return old;
  if (Array.isArray(old)) {
    return old.filter((item: any) => item?.id !== postId);
  }
  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) {
          return page.filter((item: any) => item?.id !== postId);
        }
        if (Array.isArray(page?.items)) {
          return {
            ...page,
            items: page.items.filter((item: any) => item?.id !== postId),
          };
        }
        return page;
      }),
    };
  }
  return old;
}

export function patchPostInCachedData(old: any, postId: string, patch: Record<string, unknown>) {
  if (!old) return old;
  const patchItem = (item: any) => (item?.id === postId ? { ...item, ...patch } : item);
  if (Array.isArray(old)) {
    return old.map(patchItem);
  }
  if (old?.pages && Array.isArray(old.pages)) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        if (Array.isArray(page)) return page.map(patchItem);
        if (Array.isArray(page?.items)) {
          return {
            ...page,
            items: page.items.map(patchItem),
          };
        }
        return page;
      }),
    };
  }
  if (old?.id === postId) {
    return { ...old, ...patch };
  }
  return old;
}

export async function parseResponseError(response: Response, fallback: string) {
  try {
    const body = await response.json();
    if (body && typeof body === 'object' && typeof (body as any).error === 'string') {
      const message = (body as any).error.trim();
      if (message) return message;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function stripAvatarCacheBust(url: string) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.delete('_av');
    parsed.searchParams.delete('__t');
    return parsed.toString();
  } catch {
    return url.replace(/([?&])_av=\d+(&|$)/, '$1').replace(/[?&]$/, '');
  }
}

export function normalizePersistentImageUrl(url: string) {
  const raw = stripAvatarCacheBust(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('blob:') || raw.startsWith('data:') || raw.startsWith('file:')) {
    return raw;
  }

  if (raw.startsWith('/uploads/')) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const path = parsed.pathname;
    const marker = [
      '/storage/v1/object/public/uploads/',
      '/storage/v1/render/image/public/uploads/',
      '/storage/v1/object/sign/uploads/',
      '/storage/v1/render/image/sign/uploads/',
    ].find((item) => path.includes(item));

    if (marker) {
      const markerIndex = path.indexOf(marker);
      const suffix = path.slice(markerIndex + marker.length);
      if (suffix && !suffix.startsWith('/') && !suffix.includes('..')) {
        parsed.pathname = `${path.slice(0, markerIndex)}/storage/v1/object/public/uploads/${suffix}`;
      }
    }

    parsed.search = '';
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return raw;
  }
}

export function clearObjectUrl(url: string) {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function preloadImage(src: string, timeoutMs = 1200): Promise<boolean> {
  if (!src || typeof window === 'undefined') return Promise.resolve(false);

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
  });
}

async function preloadAvatarUrl(url: string) {
  const candidates = Array.from(new Set([
    toOptimizedImageUrl(url, 'thumb'),
    toOptimizedImageUrl(url, 'medium'),
    url,
  ].filter(Boolean)));

  for (const candidate of candidates) {
    if (await preloadImage(candidate)) return;
  }
}

async function preloadCoverUrl(url: string) {
  const candidates = Array.from(new Set([
    toOptimizedImageUrl(url, 'medium'),
    toOptimizedImageUrl(url, 'large'),
    url,
  ].filter(Boolean)));

  for (const candidate of candidates) {
    if (await preloadImage(candidate)) return;
  }
}

export async function warmImageUrl(url: string, variant: 'avatar' | 'cover') {
  try {
    if (variant === 'cover') {
      await preloadCoverUrl(url);
      return;
    }
    await preloadAvatarUrl(url);
  } catch {
    // Image warming is only for smoother UI. A valid saved URL should still render.
  }
}

function trimPassword(value: string) {
  return String(value || '').trim();
}

function toNewPasswordError(error: string) {
  if (error === '请输入密码') return '请输入新密码';
  if (error.startsWith('密码')) return `新${error}`;
  return error;
}

export function validatePasswordChange(args: {
  hasExistingPassword: boolean;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  loginAccount?: string | null;
}) {
  const oldPwd = trimPassword(args.oldPassword);
  const newPwd = trimPassword(args.newPassword);
  const confirmPwd = trimPassword(args.confirmPassword);

  if (args.hasExistingPassword) {
    if (!oldPwd) {
      return { ok: false, error: '请输入原始密码进行确认', payload: null as null };
    }
  }

  if (!newPwd) {
    return { ok: false, error: '密码不能为空', payload: null as null };
  }

  if (newPwd.length < LOGIN_PASSWORD_MIN_LENGTH || newPwd.length > LOGIN_PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `新密码长度需为${LOGIN_PASSWORD_MIN_LENGTH}-${LOGIN_PASSWORD_MAX_LENGTH}位`, payload: null as null };
  }

  const loginAccount = String(args.loginAccount || '').trim().toLowerCase();
  const passwordError = validateLoginPasswordForWrite(newPwd, loginAccount);
  if (passwordError) {
    return { ok: false, error: toNewPasswordError(passwordError), payload: null as null };
  }

  if (newPwd !== confirmPwd) {
    return { ok: false, error: args.hasExistingPassword ? '两次输入的新密码不一致' : '两次输入的密码不一致', payload: null as null };
  }

  if (args.hasExistingPassword && oldPwd === newPwd) {
    return { ok: false, error: '新密码不能和原密码相同', payload: null as null };
  }

  return {
    ok: true,
    error: null as null,
    payload: {
      oldPassword: args.hasExistingPassword ? oldPwd : undefined,
      password: newPwd,
    },
  };
}
