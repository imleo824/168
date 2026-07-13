function firstValue(raw: unknown) {
  return Array.isArray(raw) ? raw[0] : raw;
}

export function normalizeStringParam(raw: unknown, maxLength: number) {
  const value = firstValue(raw);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeOptionalStringParam(raw: unknown, maxLength: number) {
  if (raw === null) return null;
  const value = normalizeStringParam(raw, maxLength);
  return value || undefined;
}

export function normalizeIntParam(raw: unknown, fallback: number, min: number, max: number) {
  const value = firstValue(raw);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeBooleanParam(raw: unknown, fallback: boolean) {
  const value = firstValue(raw);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
  return fallback;
}

export function normalizeOptionalBooleanParam(raw: unknown) {
  const value = firstValue(raw);
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}
