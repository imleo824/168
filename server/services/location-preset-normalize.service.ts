import type { LocationPresetConfig } from '../config-types';

const LOCATION_TEXT_MAX_LENGTH = 160;

type LocationPresetMatchKind = 'city' | 'country';
type LocationPresetMatchEntry = {
  raw: string;
  key: string;
  canonical: string;
  kind: LocationPresetMatchKind;
};

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

function normalizedSearchText(raw: unknown) {
  return normalizeText(raw, 500)
    .toLowerCase()
    .replace(/[\s#＃_\-\/\\|·.,，。:：;；、()（）\[\]【】]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function locationParts(raw: unknown) {
  return normalizeText(raw, 500)
    .split(/[\n,，、/|;；]+/g)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 20);
}

function isAsciiShortAlias(raw: string) {
  return /^[a-z]{1,3}$/i.test(String(raw || '').trim());
}

function containsLocationAlias(candidate: string, entry: LocationPresetMatchEntry) {
  const compactCandidate = compactLocation(candidate);
  if (!compactCandidate) return false;
  if (compactCandidate === entry.key) return true;

  const rawAlias = String(entry.raw || '').trim();
  if (isAsciiShortAlias(rawAlias)) {
    const normalizedCandidate = normalizedSearchText(candidate);
    const normalizedAlias = normalizedSearchText(rawAlias);
    return Boolean(normalizedAlias)
      && new RegExp(`(^|[^a-z0-9])${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(normalizedCandidate);
  }

  return entry.key.length >= 2 && compactCandidate.includes(entry.key);
}

const COUNTRY_ALIASES: Record<string, string[]> = {
  斯里兰卡: ['斯里蘭卡', 'sri lanka', 'srilanka', 'lk', 'slk', 'ceylon', '兰卡'],
  菲律宾: ['philippines', 'ph', 'phl', '菲律賓'],
  阿联酋: ['阿聯酋', 'uae', 'u.a.e', 'united arab emirates', 'ae'],
  柬埔寨: ['cambodia', 'kh', 'khmer'],
  泰国: ['thailand', 'thai', 'th'],
  日本: ['japan', 'jp'],
  韩国: ['韓國', 'korea', 'south korea', 'kr'],
  马来西亚: ['馬來西亞', 'malaysia', 'my', '马来', '馬來'],
  缅甸: ['緬甸', 'myanmar', 'burma', 'mm'],
  越南: ['vietnam', 'vn'],
  印尼: ['印度尼西亚', '印尼西亚', 'indonesia', 'id'],
  老挝: ['老撾', 'laos', 'lao', 'la'],
  新加坡: ['singapore', 'sg'],
  香港: ['hong kong', 'hk'],
  澳门: ['澳門', 'macao', 'macau', 'mo'],
  印度: ['india', 'in'],
  孟加拉: ['bangladesh', 'bd'],
  尼泊尔: ['尼泊爾', 'nepal', 'np'],
  土耳其: ['turkey', 'tr'],
  塞浦路斯: ['塞普洛斯', 'cyprus', 'cy'],
  亚美尼亚: ['亞美尼亞', 'armenia', 'am'],
  格鲁吉亚: ['格魯吉亞', 'georgia', 'ge'],
  塞尔维亚: ['塞爾維亞', 'serbia', 'rs'],
  罗马尼亚: ['羅馬尼亞', 'romania', 'ro'],
  阿尔巴尼亚: ['阿爾巴尼亞', 'albania', 'al'],
  黑山: ['montenegro', 'me'],
  俄罗斯: ['俄羅斯', 'russia', 'ru'],
  哈萨克斯坦: ['哈薩克斯坦', 'kazakhstan', 'kz'],
  吉尔吉斯斯坦: ['吉爾吉斯斯坦', 'kyrgyzstan', 'kg'],
  乌兹别克斯坦: ['烏茲別克斯坦', 'uzbekistan', 'uz'],
  巴西: ['brazil', 'br'],
  墨西哥: ['mexico', 'mx'],
  阿尔及利亚: ['阿爾及利亞', 'algeria', 'dz'],
  毛里求斯: ['mauritius', 'mu'],
  英国: ['英國', 'united kingdom', 'uk', 'gb', 'britain'],
  美国: ['美國', 'united states', 'united states of america', 'usa', 'us'],
  加拿大: ['canada', 'ca'],
  澳大利亚: ['澳大利亞', 'australia', 'au'],
  瓦努阿图: ['瓦努阿圖', 'vanuatu', 'vu'],
  马绍尔: ['馬紹爾', 'marshall islands', 'mh'],
  德国: ['德國', 'germany', 'de'],
  法国: ['法國', 'france', 'fr'],
  意大利: ['italy', 'it'],
  西班牙: ['spain', 'es'],
  瑞士: ['switzerland', 'ch'],
  新西兰: ['新西蘭', 'new zealand', 'nz'],
  多米尼克: ['dominica', 'dm'],
  葡萄牙: ['portugal', 'pt'],
  希腊: ['希臘', 'greece', 'gr'],
  马耳他: ['馬耳他', 'malta', 'mt'],
  匈牙利: ['hungary', 'hu'],
  爱尔兰: ['愛爾蘭', 'ireland', 'ie'],
  荷兰: ['荷蘭', 'netherlands', 'nl'],
  奥地利: ['奧地利', 'austria', 'at'],
  卢森堡: ['盧森堡', 'luxembourg', 'lu'],
  比利时: ['比利時', 'belgium', 'be'],
  波兰: ['波蘭', 'poland', 'pl'],
  捷克: ['czech', 'czech republic', 'cz'],
  巴拿马: ['巴拿馬', 'panama', 'pa'],
  哥斯达黎加: ['哥斯達黎加', 'costa rica', 'cr'],
  阿根廷: ['argentina', 'ar'],
  智利: ['chile', 'cl'],
  乌拉圭: ['烏拉圭', 'uruguay', 'uy'],
  安提瓜和巴布达: ['安提瓜和巴布達', 'antigua and barbuda', 'ag'],
  圣基茨和尼维斯: ['聖基茨和尼維斯', 'saint kitts and nevis', 'st kitts', 'kn'],
  圣卢西亚: ['聖盧西亞', 'saint lucia', 'st lucia', 'lc'],
  格林纳达: ['格林納達', 'grenada', 'gd'],
};

const CITY_ALIASES: Record<string, string[]> = {
  '阿联酋 · 迪拜': ['dubai', 'dxb', 'db'],
  '阿联酋 · 阿布扎比': ['abu dhabi', 'abudhabi'],
  '阿联酋 · 沙迦': ['sharjah'],
  '阿联酋 · 阿治曼': ['ajman'],
  '缅甸 · 仰光': ['yangon', 'rangoon'],
  '缅甸 · 曼德勒': ['mandalay'],
  '缅甸 · 内比都': ['naypyidaw', 'nay pyi taw'],
  '缅甸 · 妙瓦底': ['myawaddy', 'myawadi'],
  '缅甸 · 老街': ['laukkai', 'laogai'],
  '缅甸 · 果敢': ['kokang'],
  '缅甸 · 木姐': ['muse'],
  '缅甸 · 大其力': ['tachileik'],
  '柬埔寨 · 金边': ['phnom penh', 'phnompenh', 'pp'],
  '柬埔寨 · 西港': ['sihanoukville', 'sihanouk', 'shv'],
  '柬埔寨 · 暹粒': ['siem reap', 'siemreap'],
  '柬埔寨 · 波贝': ['poipet'],
  '柬埔寨 · 巴域': ['bavet'],
  '老挝 · 万象': ['vientiane'],
  '老挝 · 琅勃拉邦': ['luang prabang', 'luangprabang'],
  '老挝 · 巴色': ['pakse', 'pakxe'],
  '老挝 · 磨丁': ['boten'],
  '老挝 · 金三角': ['golden triangle'],
  '塞浦路斯 · 尼科西亚': ['nicosia'],
  '塞浦路斯 · 利马索尔': ['limassol'],
  '塞浦路斯 · 拉纳卡': ['larnaca'],
  '塞浦路斯 · 北塞': ['north cyprus', 'northern cyprus'],
  '塞尔维亚 · 贝尔格莱德': ['belgrade'],
  '塞尔维亚 · 诺维萨德': ['novi sad', 'novisad'],
  '塞尔维亚 · 尼什': ['nis', 'niš'],
  '亚美尼亚 · 埃里温': ['yerevan'],
  '亚美尼亚 · 久姆里': ['gyumri'],
  '亚美尼亚 · 瓦纳佐尔': ['vanadzor'],
  '格鲁吉亚 · 第比利斯': ['tbilisi'],
  '格鲁吉亚 · 巴统': ['batumi'],
  '格鲁吉亚 · 库塔伊西': ['kutaisi'],
};

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
    if (!country) return;

    add(country, country);
    for (const alias of COUNTRY_ALIASES[country] || []) add(alias, country);

    cities.forEach((rawCity) => {
      const city = normalizeText(rawCity, 64);
      if (!city) return;
      const canonical = `${country} · ${city}`;
      add(canonical, canonical);
      add(`${country}${city}`, canonical);
      add(`${country} ${city}`, canonical);
      add(city, canonical);
      for (const alias of CITY_ALIASES[canonical] || []) add(alias, canonical);
    });
  });

  return index;
}

function buildLocationPresetMatchEntries(rawPresets: unknown) {
  const source = Array.isArray(rawPresets) ? rawPresets as LocationPresetConfig[] : [];
  const entries: LocationPresetMatchEntry[] = [];
  const canonicalByKey = new Map<string, string>();
  const ambiguous = new Set<string>();

  const add = (raw: unknown, canonical: string, kind: LocationPresetMatchKind) => {
    const text = normalizeText(raw, 120);
    const key = compactLocation(text);
    if (!key || ambiguous.has(key)) return;
    const current = canonicalByKey.get(key);
    if (current && current !== canonical) {
      canonicalByKey.delete(key);
      ambiguous.add(key);
      return;
    }
    canonicalByKey.set(key, canonical);
    entries.push({ raw: text, key, canonical, kind });
  };

  source.forEach((group) => {
    if (!group || typeof group !== 'object') return;
    const country = normalizeText(group.country, 64);
    const cities = Array.isArray(group.cities) ? group.cities : [];
    if (!country) return;

    add(country, country, 'country');
    for (const alias of COUNTRY_ALIASES[country] || []) add(alias, country, 'country');

    cities.forEach((rawCity) => {
      const city = normalizeText(rawCity, 64);
      if (!city) return;
      const canonical = `${country} · ${city}`;
      add(canonical, canonical, 'city');
      add(`${country}${city}`, canonical, 'city');
      add(`${country} ${city}`, canonical, 'city');
      add(city, canonical, 'city');
      for (const alias of CITY_ALIASES[canonical] || []) add(alias, canonical, 'city');
    });
  });

  return entries
    .filter((entry) => canonicalByKey.get(entry.key) === entry.canonical && !ambiguous.has(entry.key))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'city' ? -1 : 1;
      return right.key.length - left.key.length;
    });
}

export function normalizeToLocationPreset(rawLocation: unknown, rawPresets: unknown) {
  const index = buildLocationPresetIndex(rawPresets);
  if (!index.size) return '';

  for (const candidate of locationParts(rawLocation)) {
    const matched = index.get(compactLocation(candidate));
    if (matched) return matched;
  }

  const entries = buildLocationPresetMatchEntries(rawPresets);
  for (const candidate of locationParts(rawLocation)) {
    const matched = entries.find((entry) => containsLocationAlias(candidate, entry));
    if (matched) return matched.canonical;
  }

  return '';
}
