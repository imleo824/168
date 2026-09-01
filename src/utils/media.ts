const MAX_POST_MEDIA = 9;

function stripWrappingQuotes(input: string) {
  return input.replace(/^\s*"|"\s*$/g, '').trim();
}

function isLikeUrl(input: string) {
  const value = input.trim();
  if (!value) return false;
  if (value.startsWith('/')) return true;
  if (value.startsWith('data:')) return true;
  if (value.startsWith('blob:')) return true;
  return /^https?:\/\//i.test(value);
}

function pickImageFromObject(item: Record<string, unknown>): string | null {
  const keys = ['url', 'src', 'image', 'path', 'href', 'uri', 'link', 'downloadUrl', 'original', 'file'];

  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string') {
      const normalized = stripWrappingQuotes(value.trim());
      if (isLikeUrl(normalized)) return normalized;
    }
  }

  return null;
}

function normalizeImageCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = stripWrappingQuotes(value.trim());
    return isLikeUrl(normalized) ? normalized : null;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return pickImageFromObject(value as Record<string, unknown>);
  }

  return null;
}

function parseJsonImageList(input: string): string[] | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;

    const list = parsed
      .map((item) => normalizeImageCandidate(item))
      .filter((item): item is string => Boolean(item))
      .filter(Boolean);

    return list;
  } catch {
    return null;
  }
}

function parsePostgresArray(input: string): string[] | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const content = trimmed.slice(1, -1).trim();
  if (!content) return [];

  const result: string[] = [];
  let token = '';
  let inQuotes = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (isEscaped) {
      token += ch;
      isEscaped = false;
      continue;
    }

    if (ch === '\\') {
      isEscaped = true;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      const normalized = normalizeImageCandidate(token);
      if (normalized && !/^NULL$/i.test(normalized)) {
        result.push(normalized);
      }
      token = '';
      continue;
    }

    token += ch;
  }

  const normalized = normalizeImageCandidate(token);
  if (normalized && !/^NULL$/i.test(normalized)) {
    result.push(normalized);
  }

  return result.map((item) => item.trim()).filter(Boolean);
}

function splitImageList(input: string): string[] {
  return input
    .split(/[\n;,|]/)
    .flatMap((part) => part.split(',').map((item) => item.trim()))
    .map((item) => stripWrappingQuotes(item))
    .filter(Boolean)
    .filter((item) => isLikeUrl(item));
}

export function normalizeImageList(images: unknown): string[] {
  if (!Array.isArray(images)) {
    if (!images) return [];
    if (typeof images === 'string') {
      const trimmed = images.trim();
      if (!trimmed) return [];

      const jsonParsed = parseJsonImageList(trimmed);
      if (jsonParsed?.length) {
        return jsonParsed.slice(0, MAX_POST_MEDIA);
      }

      const pgArrayParsed = parsePostgresArray(trimmed);
      if (pgArrayParsed?.length) {
        return pgArrayParsed.slice(0, MAX_POST_MEDIA);
      }

      const splitted = splitImageList(trimmed);
      if (splitted.length > 1) {
        return splitted.slice(0, MAX_POST_MEDIA);
      }

      const asSingle = normalizeImageCandidate(trimmed);
      return asSingle ? [asSingle] : [];
    }

    return [];
  }

  return images
    .map((item) => normalizeImageCandidate(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_POST_MEDIA);
}

export function clampMediaIndex(index: number, length: number) {
  if (!length) return -1;
  if (!Number.isFinite(index) || index < 0) return -1;
  if (index >= length) return 0;
  return index;
}

export function dedupeUnique<T>(items: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = typeof item === 'string' ? item.trim() : JSON.stringify(item);
    if (key == null) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}
