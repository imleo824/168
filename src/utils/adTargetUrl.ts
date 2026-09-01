export const AD_TARGET_URL_FORMAT_HINT =
  '跳转地址格式不正确，请输入 https://example.com、t.me/xxx、@telegramID 或站内 / 路径';

const MAX_AD_TARGET_URL_LENGTH = 2048;

function hasControlCharacters(value: string) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function normalizeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function normalizeTelegramUrl(value: string) {
  const direct = value.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+)$/i)?.[1];
  if (direct && !/[\s\\]/.test(direct)) {
    return `https://t.me/${direct.replace(/^\/+/, '')}`;
  }

  const normalized = value
    .replace(/telegram|tg|小飞机|飞机|频道|机器人|bot/gi, ' ')
    .replace(/[:：,，;；]/g, ' ')
    .trim();
  const username = normalized.match(/^@?([a-zA-Z0-9_]{5,32})$/)?.[1];
  return username ? `https://t.me/${username}` : '';
}

function looksLikeDomain(value: string) {
  return /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[/:?#].*)?$/i.test(value);
}

export function resolveAdTargetUrlInput(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return { value: '', error: '请填写广告跳转地址' };
  if (value.length > MAX_AD_TARGET_URL_LENGTH) {
    return { value: '', error: '广告跳转地址过长，请控制在 2048 个字符内' };
  }
  if (hasControlCharacters(value)) {
    return { value: '', error: '广告跳转地址不能包含换行或特殊控制字符' };
  }

  if (/^https?:\/\//i.test(value)) {
    const normalizedUrl = normalizeHttpUrl(value);
    return normalizedUrl ? { value: normalizedUrl, error: '' } : { value: '', error: AD_TARGET_URL_FORMAT_HINT };
  }

  if (/^tg:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'tg:' ? { value, error: '' } : { value: '', error: AD_TARGET_URL_FORMAT_HINT };
    } catch {
      return { value: '', error: AD_TARGET_URL_FORMAT_HINT };
    }
  }

  if (/^\/(?!\/)/.test(value) && !/[\s\\]/.test(value)) {
    return { value, error: '' };
  }

  const telegramUrl = normalizeTelegramUrl(value);
  if (telegramUrl) return { value: telegramUrl, error: '' };

  if (looksLikeDomain(value)) {
    const normalizedUrl = normalizeHttpUrl(`https://${value}`);
    if (normalizedUrl) return { value: normalizedUrl, error: '' };
  }

  return { value: '', error: AD_TARGET_URL_FORMAT_HINT };
}

export function normalizeAdTargetUrlForDisplay(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return '/';

  const normalized = resolveAdTargetUrlInput(value);
  if (normalized.error) return '/';

  return normalized.value || '/';
}
