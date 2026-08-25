export function normalizeExternalLocation(rawLocation?: unknown) {
  if (typeof rawLocation !== 'string') return null;
  const value = rawLocation
    .replace(/^📍\s*/, '')
    .replace(/^(?:location|loc|位置|地点)[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return value || null;
}

export function derivePostLocation(externalLocation?: unknown) {
  return {
    location: normalizeExternalLocation(externalLocation),
    countryCode: null as string | null,
    countryName: null as string | null,
  };
}

export function normalizeBooleanInput(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true' || lowered === '1') return true;
    if (lowered === 'false' || lowered === '0') return false;
  }
  return fallback;
}

export function normalizeShowContactInput(value: unknown, normalizedContact: string | null | undefined) {
  if (value !== undefined && value !== null) {
    return normalizeBooleanInput(value, false);
  }

  return Boolean(normalizedContact);
}
