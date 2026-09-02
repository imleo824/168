import crypto from 'node:crypto';

import { assertPublicHttpTarget } from './auto-crawl-fetch-parse.service';
import { persistUploadedImageBuffer } from '../routes/upload.routes';

const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_REDIRECTS = 3;
const IMAGE_CONCURRENCY = 2;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type AutoCrawlMediaAudit = {
  sourceImages: string[];
  persistedImages: string[];
  mapping: Record<string, string>;
  reusedCount: number;
  downloadedCount: number;
  failures: Array<{ sourceUrl: string; reason: string }>;
};

export class AutoCrawlMediaError extends Error {
  code = 'auto_crawl_media_import_failed';
  retryable = true;
  audit: AutoCrawlMediaAudit;

  constructor(audit: AutoCrawlMediaAudit) {
    super(audit.failures[0]?.reason || '抓取图片持久化失败');
    this.name = 'AutoCrawlMediaError';
    this.audit = audit;
  }
}

function sha256(raw: unknown) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'image_import_failed');
}

async function readLimitedBody(response: Response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > IMAGE_MAX_BYTES) throw new Error('image_response_too_large');
  if (!response.body) throw new Error('image_response_empty');
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > IMAGE_MAX_BYTES) {
      await reader.cancel().catch((): void => undefined);
      throw new Error('image_response_too_large');
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function sniffImageMime(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function fetchImage(initialUrl: string) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= IMAGE_MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpTarget(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; TuiTuiAutoCrawlMedia/1.0)',
          accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirectCount >= IMAGE_MAX_REDIRECTS) throw new Error('image_redirect_not_allowed');
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok) throw new Error(`image_fetch_failed:${response.status}`);
      const rawMime = (response.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() || '';
      let mime = rawMime;
      if (mime === 'image/jpg' || mime === 'image/pjpeg') mime = 'image/jpeg';
      if (mime === 'image/x-png') mime = 'image/png';

      const buffer = await readLimitedBody(response);
      const sniffed = sniffImageMime(buffer);
      if (sniffed) {
        mime = sniffed;
      } else if (!ALLOWED_IMAGE_MIME.has(mime)) {
        throw new Error(`image_type_not_supported:${rawMime || 'unknown'}`);
      }
      return { buffer, mime, finalUrl: currentUrl };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('image_redirect_limit_exceeded');
}

export async function persistAutoCrawlImages(input: {
  sourceId: string;
  sourcePostId: string;
  authorUserId: string;
  images: string[];
  cached?: Record<string, string>;
  canonicalizeImageUrl: (url: string) => string;
}) {
  const sourceImages = Array.from(new Set((input.images || []).filter(Boolean))).slice(0, 9);
  const persistedImages = new Array<string>(sourceImages.length);
  const audit: AutoCrawlMediaAudit = {
    sourceImages,
    persistedImages: [],
    mapping: {},
    reusedCount: 0,
    downloadedCount: 0,
    failures: [],
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < sourceImages.length) {
      const index = cursor;
      cursor += 1;
      const sourceUrl = sourceImages[index];
      try {
        const cached = input.canonicalizeImageUrl(input.cached?.[sourceUrl] || '');
        if (cached) {
          persistedImages[index] = cached;
          audit.mapping[sourceUrl] = cached;
          audit.reusedCount += 1;
          continue;
        }
        const alreadyPersistent = input.canonicalizeImageUrl(sourceUrl);
        if (alreadyPersistent) {
          persistedImages[index] = alreadyPersistent;
          audit.mapping[sourceUrl] = alreadyPersistent;
          audit.reusedCount += 1;
          continue;
        }
        const fetched = await fetchImage(sourceUrl);
        const contentHash = sha256(fetched.buffer);
        const storageKey = sha256(`${input.sourceId}:${input.sourcePostId}:${sourceUrl}:${contentHash}`).slice(0, 48);
        const stored = await persistUploadedImageBuffer({
          buffer: fetched.buffer,
          mime: fetched.mime,
          userId: input.authorUserId,
          purpose: 'post',
          storageKey,
        });
        const canonical = input.canonicalizeImageUrl(stored);
        if (!canonical) throw new Error('image_storage_url_not_persistent');
        persistedImages[index] = canonical;
        audit.mapping[sourceUrl] = canonical;
        audit.downloadedCount += 1;
      } catch (error) {
        audit.failures.push({ sourceUrl, reason: errorText(error).slice(0, 300) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, Math.max(1, sourceImages.length)) }, () => worker()));
  audit.persistedImages = persistedImages.filter(Boolean);
  if (audit.failures.length || audit.persistedImages.length !== sourceImages.length) throw new AutoCrawlMediaError(audit);

  return {
    images: audit.persistedImages,
    mapping: audit.mapping,
    audit,
  };
}
