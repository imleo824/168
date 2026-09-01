const API_TIMEOUT_MS = 15000;
const API_RETRY_DELAYS_MS = [180, 480];
const inFlightGetRequests = new Map<string, Promise<Response>>();

export type RefreshIntent = 'silent' | 'manual' | 'pull' | 'tab' | 'mutation';

export type ApiRequestOptions = RequestInit & {
  /**
   * Refresh intent is forwarded to the server so only explicit user refreshes
   * bypass feed result caches. Normal navigation keeps the cheap cached path.
   */
  refreshIntent?: RefreshIntent;
  bypassServerCache?: boolean;
  retry?: boolean;
};

function normalizeRefreshIntent(value: unknown): RefreshIntent | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'silent' || normalized === 'manual' || normalized === 'pull' || normalized === 'tab' || normalized === 'mutation'
    ? normalized
    : null;
}

function shouldBypassServerCacheForIntent(intent: RefreshIntent | null, explicitBypass: unknown) {
  if (explicitBypass === true) return true;
  return intent === 'manual' || intent === 'pull' || intent === 'tab';
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isApiRequest(url: string) {
  return url.startsWith('/api') || url.includes('/api/');
}

function isReferenceApiRequest(url: string) {
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
  return path === '/api/home/bootstrap' || path === '/api/config' || path === '/api/categories' || path === '/api/promotions/home-ads';
}

function resolveRequestCacheMode(url: string, method: string, explicitCache?: RequestCache) {
  if (explicitCache) return explicitCache;
  if (method !== 'GET' || !isApiRequest(url)) return explicitCache;

  // React Query owns dynamic data freshness. Browser HTTP cache is reserved for
  // reference data so mutation invalidation cannot be blocked by a fresh 200.
  return isReferenceApiRequest(url) ? 'default' : 'no-store';
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function shouldRetryRequest(method: string, init: ApiRequestOptions) {
  if (init.retry === false) return false;
  return method === 'GET' && !init.signal;
}

function createAbortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function getGetDedupeKey(method: string, url: string, headers: Headers, init: RequestInit) {
  const auth = headers.get('Authorization') || '';
  const accept = headers.get('Accept') || '';
  const cache = init.cache || '';
  const retry = (init as ApiRequestOptions).retry === false ? '0' : '1';
  const refreshIntent = headers.get('X-Refresh-Intent') || '';
  const bypassFeedCache = headers.get('X-Bypass-Feed-Cache') || '';
  return `${method}:${url}:auth=${auth}:accept=${accept}:cache=${cache}:retry=${retry}:refresh=${refreshIntent}:bypass=${bypassFeedCache}`;
}

function waitForSharedResponse(pending: Promise<Response>, signal?: AbortSignal | null) {
  if (!signal) {
    return pending.then((response) => response.clone());
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<Response>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (response) => {
        cleanup();
        resolve(response.clone());
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function normalizeFetchException(error: unknown) {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('请求超时，请稍后重试', 0);
  }
  if (error instanceof TypeError) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return new ApiError(offline ? '当前网络不可用，请检查连接' : '网络连接不稳定，请稍后重试', 0);
  }
  return error;
}

export async function apiFetch(input: RequestInfo | URL, init: ApiRequestOptions = {}): Promise<Response> {
  const url = getRequestUrl(input);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const refreshIntent = normalizeRefreshIntent(init.refreshIntent);
  if (refreshIntent) {
    headers.set('X-Refresh-Intent', refreshIntent);
  }
  if (shouldBypassServerCacheForIntent(refreshIntent, init.bypassServerCache)) {
    headers.set('X-Bypass-Feed-Cache', '1');
  }

  const execute = async (parentSignal: AbortSignal | null | undefined = init.signal) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const abortFromParent = () => controller.abort();

    if (parentSignal?.aborted) {
      controller.abort();
    } else {
      parentSignal?.addEventListener('abort', abortFromParent, { once: true });
    }

    try {
      const response = await fetch(input, {
        ...init,
        method,
        headers,
        cache: resolveRequestCacheMode(url, method, init.cache),
        credentials: init.credentials || 'same-origin',
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    }
  };

  const executeWithRetry = async (parentSignal: AbortSignal | null | undefined = init.signal) => {
    const retryEnabled = shouldRetryRequest(method, { ...init, signal: parentSignal || undefined });

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await execute(parentSignal);
        if (
          !retryEnabled ||
          !isRetriableStatus(response.status) ||
          attempt >= API_RETRY_DELAYS_MS.length
        ) {
          return response;
        }
      } catch (error) {
        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        if (!retryEnabled || isAbort || attempt >= API_RETRY_DELAYS_MS.length) {
          throw error;
        }
      }

      await wait(API_RETRY_DELAYS_MS[attempt]);
    }
  };

  if (method === 'GET' && isApiRequest(url)) {
    const dedupeKey = getGetDedupeKey(method, url, headers, init);
    const existing = inFlightGetRequests.get(dedupeKey);
    if (existing) {
      return waitForSharedResponse(existing, init.signal);
    }

    const pending = executeWithRetry(null).finally(() => {
      inFlightGetRequests.delete(dedupeKey);
    });
    inFlightGetRequests.set(dedupeKey, pending);
    return waitForSharedResponse(pending, init.signal);
  }

  return executeWithRetry();
}

async function readApiError(res: Response) {
  try {
    const errorData = await res.json();
    return errorData?.error || errorData?.message || `Status: ${res.status}`;
  } catch {
    return `Status: ${res.status}`;
  }
}

export async function readJsonBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('服务返回格式异常，请刷新后重试', res.status || 500);
  }
}

export async function fetcher<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(url, options);
  } catch (error) {
    throw normalizeFetchException(error);
  }

  if (!res.ok) {
    throw new ApiError(await readApiError(res), res.status);
  }

  return await readJsonBody<T>(res);
}

export async function pageFetcher<T>(url: string, options?: ApiRequestOptions): Promise<{ items: T[]; nextCursor: string | null; hasMore: boolean }> {
  let res: Response;
  try {
    res = await apiFetch(url, options);
  } catch (error) {
    throw normalizeFetchException(error);
  }

  if (!res.ok) {
    throw new ApiError(await readApiError(res), res.status);
  }

  const items = await readJsonBody<T[]>(res);

  return {
    items: Array.isArray(items) ? items : [],
    nextCursor: res.headers.get('X-Next-Cursor') || null,
    hasMore: res.headers.get('X-Has-More') === 'true',
  };
}

export const getSessionUser = (options?: ApiRequestOptions) => apiFetch('/api/session', options);
export const loginWithPasswordApi = (payload: { username: string; password: string }) =>
  apiFetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const registerWithPasswordApi = (payload: { username: string; password: string; inviteCode?: string; inviteSource?: string }) =>
  apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
export const logoutApi = () => apiFetch('/api/auth/logout', { method: 'POST' });

