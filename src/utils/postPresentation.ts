export interface PostTagItem {
  id: string;
  name: string;
  isLocation?: boolean;
  virtualLocation?: boolean;
}

export const LOCATION_TAG_PREFIX = '__location__:';

const LOCATION_SPLIT_PATTERN = /\s+-\s+|[·>＞、，,;；|/\n]+/;
const COUNTRY_LOCATION_NAMES = new Set([
  '中国',
  '美国',
  '英国',
  '泰国',
  '柬埔寨',
  '菲律宾',
  '缅甸',
  '越南',
  '老挝',
  '马来西亚',
  '新加坡',
  '日本',
  '韩国',
  '印尼',
  '印度尼西亚',
  '阿联酋',
  '格鲁吉亚',
  '亚美尼亚',
  '斯里兰卡',
  'thailand',
  'cambodia',
  'philippines',
  'myanmar',
  'vietnam',
  'laos',
  'malaysia',
  'singapore',
  'japan',
  'korea',
  'indonesia',
  'uae',
  'united arab emirates',
  'georgia',
  'armenia',
  'sri lanka',
  'china',
  'united states',
  'usa',
  'uk',
  'united kingdom',
]);
const CITY_LOCATION_NAMES = new Set([
  '北京',
  '上海',
  '广州',
  '深圳',
  '香港',
  '澳门',
  '台北',
  '曼谷',
  '迪拜',
  '马尼拉',
  '金边',
  '西港',
  '东京',
  '大阪',
  '首尔',
  '吉隆坡',
  '雅加达',
  '胡志明',
  '河内',
  '仰光',
  '曼德勒',
  '万象',
  'bangkok',
  'dubai',
  'manila',
  'phnom penh',
  'sihanoukville',
  'tokyo',
  'osaka',
  'seoul',
  'kuala lumpur',
  'jakarta',
  'ho chi minh',
  'hanoi',
  'yangon',
  'mandalay',
  'vientiane',
]);
const COUNTRY_SUFFIX_PATTERN = /(共和国|王国|合众国|联邦|国)$/;
const PROVINCE_SUFFIX_PATTERN = /(省|州|府|邦|自治区|特别行政区)$/;
const CITY_SUFFIX_PATTERN = /(市|市区)$/;
const DISTRICT_SUFFIX_PATTERN = /(区|县|镇|乡|村|街道|街|路|巷|里|园区|新区|商圈|广场|公园|机场|车站|港口|码头|口岸|关口|赌场)$/;

export function normalizeTagName(raw: string): string {
  return (raw || '')
    .replace(/^#/, '')
    .replace(/^📍\s*/, '')
    .replace(/^(location|loc|位置|地点)[:：]?\s*/i, '')
    .trim();
}

export function stripInlineHashtags(raw: string): string {
  return (raw || '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeStoredLocation(raw: string): string {
  return (raw || '')
    .replace(/^["'[\]{}]+|["'\]{}]+$/g, '')
    .replace(/^📍\s*/, '')
    .replace(/^(location|loc|位置|地点)[:：]?\s*/i, '')
    .trim();
}

export function normalizeLocationName(raw: string): string {
  return selectFinestDisplayLocation(raw) || normalizeStoredLocation(raw);
}

export function splitDisplayLocations(location?: string | null): string[] {
  const raw = String(location || '').trim();
  if (!raw) return [];

  const parts = raw
    .split(LOCATION_SPLIT_PATTERN)
    .map(normalizeStoredLocation)
    .filter(Boolean);

  const source = parts.length > 0 ? parts : [normalizeStoredLocation(raw)].filter(Boolean);
  const seen = new Set<string>();

  return source.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getLocationGranularityScore(label: string): number {
  const normalized = normalizeStoredLocation(label).replace(/\s+/g, ' ').trim();
  const key = normalized.toLowerCase();

  if (!normalized) return 0;
  if (DISTRICT_SUFFIX_PATTERN.test(normalized)) return 60;
  if (CITY_SUFFIX_PATTERN.test(normalized) || CITY_LOCATION_NAMES.has(key) || CITY_LOCATION_NAMES.has(normalized)) return 50;
  if (PROVINCE_SUFFIX_PATTERN.test(normalized)) return 30;
  if (COUNTRY_LOCATION_NAMES.has(key) || COUNTRY_LOCATION_NAMES.has(normalized) || COUNTRY_SUFFIX_PATTERN.test(normalized)) return 10;
  return 40;
}

export function selectFinestDisplayLocation(location?: string | null): string {
  const locations = splitDisplayLocations(location);
  if (locations.length <= 1) return locations[0] || '';

  return locations.reduce((best, current, index) => {
    const bestScore = getLocationGranularityScore(best.label);
    const currentScore = getLocationGranularityScore(current);
    if (currentScore > bestScore || (currentScore === bestScore && index > best.index)) {
      return { label: current, index };
    }
    return best;
  }, { label: locations[0], index: 0 }).label;
}

export function isLocationTag(tag: { name: string; isLocation?: boolean }): boolean {
  return Boolean(tag?.isLocation || (tag as any)?.virtualLocation);
}

export function sortTagsWithLocationFirst(tags: PostTagItem[] = []): PostTagItem[] {
  return [...tags].sort((a, b) => Number(isLocationTag(b)) - Number(isLocationTag(a)));
}

export function buildDisplayLocationTags(location?: string | null): PostTagItem[] {
  const label = selectFinestDisplayLocation(location);
  if (!label) return [];
  return [{
    id: `${LOCATION_TAG_PREFIX}${encodeURIComponent(label)}`,
    name: label,
    isLocation: true,
    virtualLocation: true,
  }];
}

export function buildDisplayTags(tags: PostTagItem[] = [], location?: string | null): PostTagItem[] {
  const locationTags = buildDisplayLocationTags(location);
  const seen = new Set(locationTags.map((tag) => normalizeTagName(tag.name).toLowerCase()));
  const visibleTags = sortTagsWithLocationFirst(tags)
    .map((tag) => ({
      ...tag,
      name: normalizeTagName(tag.name),
    }))
    .filter((tag) => {
      if (!tag.name || isLocationTag(tag)) return false;
      const key = tag.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return [...locationTags, ...visibleTags];
}

export function toLocationCategoryId(location: string): string {
  return `${LOCATION_TAG_PREFIX}${encodeURIComponent(normalizeStoredLocation(location))}`;
}

export function parseLocationCategoryId(categoryId?: string | null): string | null {
  if (!categoryId || !categoryId.startsWith(LOCATION_TAG_PREFIX)) return null;
  const encoded = categoryId.slice(LOCATION_TAG_PREFIX.length);
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    const normalized = normalizeStoredLocation(decoded);
    return normalized || null;
  } catch {
    return null;
  }
}
