import type { ImageUploadPurpose, PreparedImageUpload } from './imageUploadConfig';
import { UPLOAD_API_ENDPOINT } from './api/uploadApi';

export interface UploadImageOptions {
  onProgress?: (pct: number) => void;
  registerRequest?: (xhr: XMLHttpRequest) => (() => void) | void;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

type UploadResponseBody = {
  url?: unknown;
  error?: unknown;
  message?: unknown;
  detail?: unknown;
};

const JPEG_EXTENSION = 'jpg';
const MAX_FILENAME_BASE_LENGTH = 90;
const DEFAULT_UPLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_UPLOAD_ATTEMPTS = 1;
const DEFAULT_UPLOAD_RETRY_DELAY_MS = 650;

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return JPEG_EXTENSION;
}

function sanitizeFilenameBase(filename: string, fallback: string) {
  const rawBase = (filename || fallback).replace(/\.[^./\\]+$/, '').trim() || fallback;

  const safeBase = rawBase
    .normalize('NFKC')
    .replace(/[\u0000-\u001F<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_FILENAME_BASE_LENGTH);

  return safeBase || fallback;
}

function ensurePreparedFilename(
  filename: string,
  purpose: ImageUploadPurpose,
  mimeType: string,
) {
  const baseName = sanitizeFilenameBase(filename, purpose);
  return `${baseName}.${extensionForMime(mimeType)}`;
}

function parseUploadResponse(xhr: XMLHttpRequest): UploadResponseBody | null {
  const text = xhr.responseText || '';

  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as UploadResponseBody;
  } catch {
    return {
      error: text.slice(0, 180),
    };
  }
}

function getUploadResponseMessage(
  body: UploadResponseBody | null,
  fallback: string,
) {
  const candidate = body?.error ?? body?.message ?? body?.detail;

  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }

  return fallback;
}

function getUploadResponseUrl(body: UploadResponseBody | null) {
  const url = body?.url;

  if (typeof url !== 'string') return '';

  return url.trim();
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeUploadAttempts(value: unknown) {
  const attempts = Number(value);
  if (!Number.isFinite(attempts)) return DEFAULT_UPLOAD_ATTEMPTS;
  return Math.min(3, Math.max(1, Math.floor(attempts)));
}

function createUploadError(message: string, status = 0) {
  const error = new Error(message) as Error & { status?: number };
  if (status) error.status = status;
  return error;
}

function isRetriableUploadError(error: unknown) {
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  const message = error instanceof Error ? error.message : String(error || '');

  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500) return true;
  if (/网络连接失败|上传超时|请求创建失败|failed to fetch|network|timeout|超时/i.test(message)) return true;
  return false;
}

function waitForUploadRetry(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('上传已取消'));
      return;
    }

    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, ms));
    const abort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('上传已取消'));
    };

    signal?.addEventListener('abort', abort, { once: true });
  });
}

function uploadPreparedImageOnce(
  prepared: PreparedImageUpload,
  options: UploadImageOptions = {},
) {
  return new Promise<string>((resolve, reject) => {
    if (!prepared?.blob) {
      reject(new Error('请选择有效图片文件'));
      return;
    }

    if (options.signal?.aborted) {
      reject(new Error('上传已取消'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    const mimeType = prepared.mimeType || 'image/jpeg';
    const filename = ensurePreparedFilename(prepared.filename, prepared.purpose, mimeType);

    formData.append('file', prepared.blob, filename);
    formData.append('purpose', prepared.purpose);

    let settled = false;
    let unregisterRequest: (() => void) | undefined;

    const reportProgress = (value: number) => {
      options.onProgress?.(normalizeProgress(value));
    };

    const cleanup = () => {
      options.signal?.removeEventListener('abort', abortUpload);
      unregisterRequest?.();
      unregisterRequest = undefined;
    };

    const settleResolve = (url: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reportProgress(100);
      resolve(url);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const abortUpload = () => {
      if (settled) return;
      xhr.abort();
    };

    try {
      const maybeUnregister = options.registerRequest?.(xhr);
      unregisterRequest = typeof maybeUnregister === 'function' ? maybeUnregister : undefined;
    } catch {
      unregisterRequest = undefined;
    }

    options.signal?.addEventListener('abort', abortUpload, { once: true });

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;

      reportProgress((event.loaded / event.total) * 100);
    });

    xhr.onload = () => {
      const body = parseUploadResponse(xhr);

      if (xhr.status >= 200 && xhr.status < 300) {
        const url = getUploadResponseUrl(body);

        if (!url) {
          settleReject(createUploadError('服务器未返回图片地址', xhr.status));
          return;
        }

        settleResolve(url);
        return;
      }

      const fallback = xhr.status
        ? `上传失败 (${xhr.status})`
        : '上传失败，请稍后重试';

      settleReject(createUploadError(getUploadResponseMessage(body, fallback), xhr.status));
    };

    xhr.onerror = () => {
      settleReject(createUploadError('网络连接失败，请检查网络后重试'));
    };

    xhr.ontimeout = () => {
      settleReject(createUploadError('上传超时，请更换较小图片或重试'));
    };

    xhr.onabort = () => {
      settleReject(createUploadError('上传已取消'));
    };

    try {
      reportProgress(0);
      xhr.timeout = Math.max(5_000, Number(options.timeoutMs || DEFAULT_UPLOAD_TIMEOUT_MS));
      xhr.open('POST', UPLOAD_API_ENDPOINT, true);
      xhr.withCredentials = true;
      xhr.send(formData);
    } catch (error) {
      settleReject(error instanceof Error ? error : createUploadError('上传请求创建失败'));
    }
  });
}

export async function uploadPreparedImage(
  prepared: PreparedImageUpload,
  options: UploadImageOptions = {},
) {
  const maxAttempts = normalizeUploadAttempts(options.maxAttempts);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await uploadPreparedImageOnce(prepared, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetriableUploadError(error) || options.signal?.aborted) {
        throw error;
      }
      await waitForUploadRetry(options.retryDelayMs ?? DEFAULT_UPLOAD_RETRY_DELAY_MS, options.signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('上传失败，请稍后重试');
}
