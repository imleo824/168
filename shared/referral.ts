export const REFERRAL_INVITE_CODE_MIN_LENGTH = 4;
export const REFERRAL_INVITE_CODE_MAX_LENGTH = 16;
export const REFERRAL_INVITE_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
export const REFERRAL_INVITE_ATTRIBUTION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const REFERRAL_INVITE_QUERY_KEYS = ['invite', 'ref', 'referral'] as const;

export const REFERRAL_INVITE_SOURCES = {
  LINK: 'link',
  MANUAL: 'manual',
} as const;

export type ReferralInviteSource = typeof REFERRAL_INVITE_SOURCES[keyof typeof REFERRAL_INVITE_SOURCES];

export function normalizeReferralInviteCode(value: unknown) {
  const code = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, REFERRAL_INVITE_CODE_MAX_LENGTH);
  return REFERRAL_INVITE_CODE_PATTERN.test(code) ? code : '';
}

export function sanitizeReferralInviteCodeInput(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, REFERRAL_INVITE_CODE_MAX_LENGTH);
}

export function isReferralInviteCodeTooShort(value: unknown) {
  const code = sanitizeReferralInviteCodeInput(value);
  return Boolean(code) && code.length < REFERRAL_INVITE_CODE_MIN_LENGTH;
}

export function readReferralInviteCodeFromSearch(search: unknown) {
  const source = typeof search === 'string' ? search : '';
  if (!source) return '';

  try {
    const params = new URLSearchParams(source.startsWith('?') ? source : `?${source}`);
    for (const key of REFERRAL_INVITE_QUERY_KEYS) {
      const code = normalizeReferralInviteCode(params.get(key));
      if (code) return code;
    }
  } catch {
    return '';
  }

  return '';
}

export function normalizeReferralInviteSource(value: unknown): ReferralInviteSource {
  return value === REFERRAL_INVITE_SOURCES.LINK
    ? REFERRAL_INVITE_SOURCES.LINK
    : REFERRAL_INVITE_SOURCES.MANUAL;
}
