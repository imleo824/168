import type { LocationPresetConfig } from '../config-types';

const LOCATION_TEXT_MAX_LENGTH = 160;

function normalizeText(raw: unknown, max = LOCATION_TEXT_MAX_LENGTH) {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/^📍\s*/, '')
    .replace(/^#|^＃/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function compactLocation(raw: unknown) {
  return normalizeText(raw)
    .toLowerCase()
    .replace(/[\s#＃_\-\/\\|·.,，。:：;；、()（）\[\]【】]+/g, '')
    .trim();
}

function locationParts(raw: unknown) {
  return normalizeText(raw, 500)
    .split(/[\n,，、/|;；]+/g)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 20);
}

export function buildLocationPresetIndex(rawPresets: unknown) {
  const source = Array.isArray(rawPresets) ? rawPresets as LocationPresetConfig[] : [];
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();

  const add = (raw: unknown, canonical: string) => {
    const key = compactLocation(raw);
    if (!key || ambiguous.has(key)) return;
    const current = index.get(key);
    if (current && current !== canonical) {
      index.delete(key);
      ambiguous.add(key);
      return;
    }
    index.set(key, canonical);
  };

  source.forEach((group) => {
    if (!group || typeof group !== 'object') return;
    const country = normalizeText(group.country, 64);
    const cities = Array.isArray(group.cities) ? group.cities : [];

    cities.forEach((rawCity) => {
      const city = normalizeText(rawCity, 64);
      if (!country || !city) return;
      const canonical = `${country} · ${city}`;
      add(canonical, canonical);
      add(`${country}${city}`, canonical);
      add(`${country} ${city}`, canonical);
      add(city, canonical);
    });
  });

  return index;
}

export function normalizeToLocationPreset(rawLocation: unknown, rawPresets: unknown) {
  const index = buildLocationPresetIndex(rawPresets);
  if (!index.size) return '';

  for (const candidate of locationParts(rawLocation)) {
    const matched = index.get(compactLocation(candidate));
    if (matched) return matched;
  }

  return '';
}
