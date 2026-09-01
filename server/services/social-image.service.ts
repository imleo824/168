import type { Request, Response } from 'express';
import path from 'path';
import fs from 'node:fs';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';

import { getPublicOrigin, normalizeOrigin } from '../http-origin';
import { setPublicCache } from '../http-cache';
import {
  isProduction,
  isLocalUploadUrlAllowed,
  supabaseUrl,
} from '../routes/upload.routes';

export type SocialPreviewImage = {
  buffer: Buffer;
  contentType: string;
};

const SOCIAL_PREVIEW_FETCH_TIMEOUT_MS = 8000;
const SOCIAL_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;
const SOCIAL_PREVIEW_MAX_REDIRECTS = 2;
export const TELEGRAM_PHOTO_ASSETS_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const SHARE_PREVIEW_ALLOWED_HOSTS = new Set(
  (process.env.SHARE_PREVIEW_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

export function resolvePublicOriginFromContext(context?: Request | string) {
  if (!context) return getPublicOrigin(undefined);
  if (typeof context === 'string') {
    return normalizeOrigin(context) || getPublicOrigin(undefined);
  }
  return getPublicOrigin(context);
}

function toAbsoluteAssetUrl(url: string | undefined, context?: Request | string) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const origin = resolvePublicOriginFromContext(context);
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function shouldUseSupabaseImageTransform() {
  return process.env.SUPABASE_IMAGE_TRANSFORM === 'true'
    || process.env.VITE_SUPABASE_IMAGE_TRANSFORM === 'true';
}

function toTelegramPreviewImageUrl(url: string | undefined, context?: Request | string) {
  const absoluteUrl = toAbsoluteAssetUrl(url, context);
  if (!absoluteUrl) return '';

  const marker = '/storage/v1/object/public/uploads/';
  if (!absoluteUrl.includes(marker) || !shouldUseSupabaseImageTransform()) return absoluteUrl;

  try {
    const rendered = absoluteUrl.replace(marker, '/storage/v1/render/image/public/uploads/');
    const parsed = new URL(rendered);
    parsed.searchParams.set('width', '1200');
    parsed.searchParams.set('height', '630');
    parsed.searchParams.set('format', 'jpeg');
    parsed.searchParams.set('resize', 'cover');
    parsed.searchParams.set('quality', '86');
    return parsed.toString();
  } catch {
    return absoluteUrl;
  }
}

function normalizeShareSource(input: string | undefined) {
  if (!input) return '';
  return `${input}`.trim();
}

export function buildPostSharePreviewCandidates(sourceImage: string | undefined, context?: Request | string) {
  const source = normalizeShareSource(sourceImage);
  if (!source) return [] as string[];

  const candidates = new Set<string>();
  const rendered = toTelegramPreviewImageUrl(source, context);

  if (rendered) {
    candidates.add(rendered);
  }

  const absolute = toAbsoluteAssetUrl(source, context);
  if (absolute) {
    candidates.add(absolute);

    try {
      const withParams = new URL(absolute);
      withParams.searchParams.set('width', '1200');
      withParams.searchParams.set('height', '630');
      withParams.searchParams.set('format', 'jpeg');
      withParams.searchParams.set('resize', 'cover');
      withParams.searchParams.set('quality', '86');
      candidates.add(withParams.toString());
    } catch {
      // Ignore malformed third-party URLs.
    }
  }

  const raw = toAbsoluteAssetUrl(sourceImage, context);
  if (raw) {
    candidates.add(raw);
  }

  return [...candidates];
}

export function canonicalizePersistentUploadedImageUrl(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return isLocalUploadUrlAllowed() ? raw : (!isProduction ? raw : '');
  if (!/^https?:\/\//i.test(raw)) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/uploads/')) {
      const requestOrigin = getPublicOrigin(undefined);
      if (requestOrigin) {
        try {
          const requestHost = new URL(requestOrigin).hostname.replace(/^www\./, '').toLowerCase();
          const normalizedHost = parsed.hostname.replace(/^www\./, '').toLowerCase();
          if (requestHost === normalizedHost && isLocalUploadUrlAllowed()) return parsed.pathname;
        } catch {
          // Continue with Supabase URL checks.
        }
      }
    }

    const uploadPath = parsed.pathname;
    const marker = [
      '/storage/v1/object/public/uploads/',
      '/storage/v1/render/image/public/uploads/',
      '/storage/v1/object/sign/uploads/',
      '/storage/v1/render/image/sign/uploads/',
    ].find((item) => uploadPath.includes(item));
    if (!marker) return '';

    const configured = supabaseUrl ? new URL(supabaseUrl) : null;
    const normalizedHost = parsed.hostname.replace(/^www\./, '').toLowerCase();

    let hostAllowed = false;
    if (isImageHostedBySupabase(parsed.hostname)) hostAllowed = true;

    if (!configured) {
      hostAllowed = true;
    } else {
      const configuredHost = configured.hostname.replace(/^www\./, '').toLowerCase();
      if (normalizedHost === configuredHost) hostAllowed = true;
      if (normalizedHost.endsWith('.supabase.co') || normalizedHost.endsWith('.supabase.in')) hostAllowed = true;
    }

    const requestOrigin = getPublicOrigin(undefined);
    if (requestOrigin) {
      try {
        const requestHost = new URL(requestOrigin).hostname.replace(/^www\./, '').toLowerCase();
        if (requestHost === normalizedHost) hostAllowed = true;
      } catch {
        // Ignore parse failures.
      }
    }

    if (!hostAllowed) return '';

    const markerIndex = uploadPath.indexOf(marker);
    const suffix = uploadPath.slice(markerIndex + marker.length);
    if (!suffix || suffix.startsWith('/') || suffix.includes('..')) return '';

    parsed.pathname = `${uploadPath.slice(0, markerIndex)}/storage/v1/object/public/uploads/${suffix}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isImageHostedBySupabase(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return host.endsWith('.supabase.co')
    || host.endsWith('.supabase.in')
    || host.includes('supabase');
}

function getStaticShareFallbackPath() {
  const candidates = [
    path.join(process.cwd(), 'dist', 'share-fallback.png'),
    path.join(process.cwd(), 'public', 'share-fallback.png'),
  ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0];
}

function isTelegramSafeImageContentType(contentType: string) {
  const value = contentType.split(';')[0]?.trim().toLowerCase();
  if (!value) return true;
  return [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/octet-stream',
  ].includes(value);
}

function isPersistentImageContentType(contentType: string) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(contentType);
}

function detectTelegramImageContentType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 6
    && buffer.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/)
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return '';
}

async function readResponseBufferWithLimit(response: globalThis.Response, maxBytes: number) {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error('Preview image is too large');
    }
    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error('Preview image is too large');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel().catch((): void => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export function isLikelyImageUrl(value: string) {
  if (!value) return false;
  if (value.startsWith('/uploads/')) return !isProduction;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();
    if (isBlockedNetworkAddress(hostname)) {
      return false;
    }

    if (SHARE_PREVIEW_ALLOWED_HOSTS.size > 0) {
      const allowed = Array.from(SHARE_PREVIEW_ALLOWED_HOSTS);
      const matched = allowed.some((host) => hostname === host || hostname.endsWith(`.${host}`));
      if (!matched) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeHostForNetworkCheck(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isBlockedNetworkAddress(address: string) {
  const host = normalizeHostForNetworkCheck(address);
  const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isBlockedNetworkAddress(mappedIpv4);
  if (/^(::ffff:|0:0:0:0:0:ffff:)/i.test(host)) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map((item) => Number(item));
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (ipVersion === 6) {
    return (
      host === '::' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
    );
  }

  return host === 'localhost' || host.endsWith('.local');
}

async function assertPublicImageHost(url: string) {
  const parsed = new URL(url);
  const hostname = normalizeHostForNetworkCheck(parsed.hostname);

  if (isBlockedNetworkAddress(hostname)) {
    throw new Error('Blocked private preview image host');
  }

  if (net.isIP(hostname)) return;

  const records = await dnsLookup(hostname, { all: true, verbatim: false });
  if (!records.length || records.some((record) => isBlockedNetworkAddress(record.address))) {
    throw new Error('Blocked private preview image address');
  }
}

async function fetchCheckedPreviewImageResponse(url: string, signal: AbortSignal) {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= SOCIAL_PREVIEW_MAX_REDIRECTS; redirectCount += 1) {
    if (!isLikelyImageUrl(currentUrl)) {
      throw new Error('Blocked preview image URL');
    }

    await assertPublicImageHost(currentUrl);

    const response = await fetch(currentUrl, {
      signal,
      redirect: 'manual',
      headers: {
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.6,*/*;q=0.2',
        'User-Agent': 'tuitui-social-preview/1.0',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount >= SOCIAL_PREVIEW_MAX_REDIRECTS) {
        throw new Error('Preview image redirect blocked');
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error('Preview image redirect blocked');
}

export async function fetchSocialPreviewImage(url: string): Promise<SocialPreviewImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOCIAL_PREVIEW_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchCheckedPreviewImageResponse(url, controller.signal);

    if (!response.ok) throw new Error(`Preview image fetch failed: ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (!isTelegramSafeImageContentType(contentType)) {
      throw new Error(`Unsupported preview image type: ${contentType || 'unknown'}`);
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > SOCIAL_PREVIEW_MAX_BYTES) {
      throw new Error('Preview image is too large');
    }

    const buffer = await readResponseBufferWithLimit(response, SOCIAL_PREVIEW_MAX_BYTES);
    const detectedContentType = detectTelegramImageContentType(buffer);
    if (!detectedContentType) {
      throw new Error('Unsupported preview image bytes');
    }
    if (!isPersistentImageContentType(detectedContentType)) {
      throw new Error(`Unsupported preview image type: ${detectedContentType}`);
    }

    return {
      buffer,
      contentType: detectedContentType,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function sendShareFallbackImage(res: Response) {
  res.setHeader('Content-Type', 'image/png');
  setPublicCache(res, 3600, 86400, 86400);
  return res.sendFile(getStaticShareFallbackPath());
}
