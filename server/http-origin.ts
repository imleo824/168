import type { Request } from 'express';

const FALLBACK_PUBLIC_ORIGIN = 'https://168-production.up.railway.app';

export function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const isLocalHost = /^(localhost|127\.0\.0\.1|::1)$/i.test(parsed.hostname);
    const protocol = isLocalHost || parsed.protocol === 'https:' ? parsed.protocol : 'https:';
    return `${protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function getIncomingProtocol(req: Request) {
  const forwarded = req.get('x-forwarded-proto');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim().toLowerCase();
    if (first) return first;
  }
  return req.protocol.toLowerCase();
}

export function isLocalRequest(req: Request) {
  const host = (req.get('host') || req.hostname || '').toLowerCase();
  const hostname = host.split(':')[0];

  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.local');
}

function getConfiguredPublicOrigin() {
  return normalizeOrigin(process.env.APP_URL)
    || normalizeOrigin(process.env.VITE_APP_URL)
    || normalizeOrigin(process.env.RAILWAY_PUBLIC_DOMAIN)
    || (process.env.NODE_ENV === 'production' ? normalizeOrigin(FALLBACK_PUBLIC_ORIGIN) : null);
}

export function getPublicOrigin(req?: Request) {
  const configured = getConfiguredPublicOrigin();
  if (configured) return configured;

  if (!req) return FALLBACK_PUBLIC_ORIGIN;
  const incomingProtocol = getIncomingProtocol(req);
  const host = req.get('host') || req.hostname;
  if (!host) return FALLBACK_PUBLIC_ORIGIN;

  const rawOrigin = `${incomingProtocol}://${host}`;
  return normalizeOrigin(rawOrigin) || FALLBACK_PUBLIC_ORIGIN;
}

export function getRequestOriginForCsrf(req: Request) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return '';
  return normalizeOrigin(referer) || '';
}
