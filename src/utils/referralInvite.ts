import {
  REFERRAL_INVITE_ATTRIBUTION_TTL_MS,
  REFERRAL_INVITE_SOURCES,
  type ReferralInviteSource,
  normalizeReferralInviteCode,
  normalizeReferralInviteSource,
  readReferralInviteCodeFromSearch,
} from '../../shared/referral';

const REFERRAL_INVITE_STORAGE_KEY = 'referral_invite_attribution';

type StoredReferralInvite = {
  code: string;
  source: ReferralInviteSource;
  capturedAt: number;
};

function getAttributionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

function isReferralInviteExpired(invite: StoredReferralInvite, now = Date.now()) {
  return !invite.capturedAt || now - invite.capturedAt > REFERRAL_INVITE_ATTRIBUTION_TTL_MS;
}

function normalizeStoredReferralInvite(value: unknown): StoredReferralInvite | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const code = normalizeReferralInviteCode(record.code);
  if (!code) return null;
  const invite = {
    code,
    source: normalizeReferralInviteSource(record.source),
    capturedAt: Number.isFinite(Number(record.capturedAt)) ? Number(record.capturedAt) : Date.now(),
  } satisfies StoredReferralInvite;
  return isReferralInviteExpired(invite) ? null : invite;
}

export function readReferralInviteFromCurrentUrl() {
  if (typeof window === 'undefined') return null;
  const code = readReferralInviteCodeFromSearch(window.location.search);
  if (!code) return null;
  return {
    code,
    source: REFERRAL_INVITE_SOURCES.LINK,
    capturedAt: Date.now(),
  } satisfies StoredReferralInvite;
}

export function readStoredReferralInvite() {
  const storage = getAttributionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(REFERRAL_INVITE_STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizeStoredReferralInvite(JSON.parse(raw));
    if (!normalized) {
      storage.removeItem(REFERRAL_INVITE_STORAGE_KEY);
      return null;
    }
    return normalized;
  } catch {
    storage.removeItem(REFERRAL_INVITE_STORAGE_KEY);
    return null;
  }
}

export function writeStoredReferralInvite(invite: { code: unknown; source?: unknown }) {
  const storage = getAttributionStorage();
  const code = normalizeReferralInviteCode(invite.code);
  if (!storage || !code) return null;
  const nextInvite: StoredReferralInvite = {
    code,
    source: normalizeReferralInviteSource(invite.source),
    capturedAt: Date.now(),
  };
  storage.setItem(REFERRAL_INVITE_STORAGE_KEY, JSON.stringify(nextInvite));
  return nextInvite;
}

export function clearStoredReferralInvite() {
  getAttributionStorage()?.removeItem(REFERRAL_INVITE_STORAGE_KEY);
}

export function readEffectiveReferralInvite() {
  const urlInvite = readReferralInviteFromCurrentUrl();
  if (urlInvite) {
    writeStoredReferralInvite(urlInvite);
    return urlInvite;
  }
  return readStoredReferralInvite();
}

export function buildReferralInviteLandingUrl(inviteCode: string, origin?: string, pathname = '/') {
  const code = normalizeReferralInviteCode(inviteCode);
  if (!code) return '';
  const baseOrigin = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!baseOrigin) return '';
  const safePathname = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
  const url = new URL(safePathname, baseOrigin);
  url.searchParams.set('invite', code);
  return url.toString();
}
