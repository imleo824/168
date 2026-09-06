const TELEGRAM_HOST_RE = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+)$/i;
const TELEGRAM_USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

function stripTelegramPrefix(value: string) {
  return value.replace(/^@+/, '').trim();
}

export function isTelegramContactHandle(input?: string | null) {
  return TELEGRAM_USERNAME_RE.test(stripTelegramPrefix(input || ''));
}

export function normalizeTelegramContactHandle(contact?: string | null) {
  if (!contact) return '';
  const raw = contact.trim();

  const directMatch = raw.match(TELEGRAM_HOST_RE);
  if (directMatch?.[1]) {
    const path = stripTelegramPrefix(directMatch[1].split(/[/?#\s]/)[0] || '');
    return TELEGRAM_USERNAME_RE.test(path) ? path : '';
  }

  const candidate = stripTelegramPrefix(raw);
  return TELEGRAM_USERNAME_RE.test(candidate) ? candidate : '';
}

export function formatTelegramContactDisplay(contact?: string | null) {
  const handle = normalizeTelegramContactHandle(contact);
  return handle ? `@${handle}` : '';
}

export function getTelegramContactUrl(contact?: string | null) {
  const handle = normalizeTelegramContactHandle(contact);
  return handle ? `https://t.me/${handle}` : null;
}

export function resolveTelegramChannelUrl(channel?: string | null): string {
  if (!channel) return 'https://t.me/';
  const raw = channel.trim();
  if (!raw) return 'https://t.me/';
  if (/^(https?:\/\/|tg:\/\/)/i.test(raw)) return raw;
  if (/^t\.me\//i.test(raw)) return `https://${raw}`;
  const clean = raw.replace(/^@+/, '').trim();
  return clean ? `https://t.me/${clean}` : 'https://t.me/';
}

export function openTelegramContact(contact?: string | null) {
  const url = getTelegramContactUrl(contact);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
