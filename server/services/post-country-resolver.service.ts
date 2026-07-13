import { ConfigService, DEFAULT_LOCATION_PRESETS, type LocationPresetConfig } from '../config.service';
import prisma, { isDbConfigured } from '../db';

export type ResolvedPostCountry = {
  countryCode: string | null;
  countryName: string | null;
};

type CountryRule = {
  code: string | null;
  name: string;
  aliases: string[];
};

type MatchSource = {
  text: string;
  allowShortCode: boolean;
};

const LOCATION_RULE_CACHE_TTL_MS = 60 * 1000;
let cachedLocationRules: { expiresAt: number; rules: CountryRule[] } | null = null;

const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  菲律宾: 'PH',
  阿联酋: 'AE',
  柬埔寨: 'KH',
  泰国: 'TH',
  斯里兰卡: 'LK',
  日本: 'JP',
  韩国: 'KR',
  马来西亚: 'MY',
  缅甸: 'MM',
  越南: 'VN',
  印尼: 'ID',
  印度尼西亚: 'ID',
  老挝: 'LA',
  新加坡: 'SG',
  香港: 'HK',
  澳门: 'MO',
  印度: 'IN',
  孟加拉: 'BD',
  尼泊尔: 'NP',
  土耳其: 'TR',
  塞浦路斯: 'CY',
  亚美尼亚: 'AM',
  格鲁吉亚: 'GE',
  塞尔维亚: 'RS',
  罗马尼亚: 'RO',
  阿尔巴尼亚: 'AL',
  黑山: 'ME',
  俄罗斯: 'RU',
  哈萨克斯坦: 'KZ',
  吉尔吉斯斯坦: 'KG',
  乌兹别克斯坦: 'UZ',
  巴西: 'BR',
  墨西哥: 'MX',
  阿尔及利亚: 'DZ',
  毛里求斯: 'MU',
  英国: 'GB',
  美国: 'US',
  加拿大: 'CA',
  澳大利亚: 'AU',
  瓦努阿图: 'VU',
  马绍尔: 'MH',
  德国: 'DE',
  法国: 'FR',
  意大利: 'IT',
  西班牙: 'ES',
  瑞士: 'CH',
  新西兰: 'NZ',
  多米尼克: 'DM',
  葡萄牙: 'PT',
  希腊: 'GR',
  马耳他: 'MT',
  匈牙利: 'HU',
  爱尔兰: 'IE',
  荷兰: 'NL',
  奥地利: 'AT',
  卢森堡: 'LU',
  比利时: 'BE',
  波兰: 'PL',
  捷克: 'CZ',
  巴拿马: 'PA',
  哥斯达黎加: 'CR',
  阿根廷: 'AR',
  智利: 'CL',
  乌拉圭: 'UY',
  安提瓜和巴布达: 'AG',
  圣基茨和尼维斯: 'KN',
  圣卢西亚: 'LC',
  格林纳达: 'GD',
};

const EXTRA_ALIASES_BY_COUNTRY: Record<string, string[]> = {
  菲律宾: ['菲律賓', 'philippines', 'ph', 'manila', 'makati', 'bgc', 'taguig', 'pasay', 'quezon', 'cebu', 'clark', 'angeles', 'pampanga', 'subic', 'davao'],
  阿联酋: ['阿聯酋', 'uae', 'ae', 'dubai', 'abu dhabi', 'sharjah', 'ajman', 'jlt', 'business bay', 'deira', 'bur dubai'],
  柬埔寨: ['cambodia', 'kh', 'phnom penh', 'sihanoukville', 'poipet', 'bavet', 'siem reap', 'koh kong'],
  泰国: ['泰國', 'thailand', 'th', 'bangkok', 'pattaya', 'phuket', 'chiang mai', 'chiang rai', 'hat yai', 'samui'],
  斯里兰卡: ['斯里蘭卡', 'sri lanka', 'lk', 'colombo', 'kandy', 'galle', 'negombo'],
  日本: ['japan', 'jp', 'tokyo', 'osaka', 'yokohama', 'nagoya', 'fukuoka', 'kyoto', 'sapporo', 'okinawa'],
  韩国: ['韓國', 'south korea', 'korea', 'kr', 'seoul', 'incheon', 'busan', 'jeju', 'daegu'],
  马来西亚: ['馬來西亞', 'malaysia', 'my', 'kuala lumpur', 'kl', 'selangor', 'johor', 'penang', 'malacca', 'sabah', 'genting'],
  缅甸: ['緬甸', 'myanmar', 'burma', 'mm', 'yangon', 'mandalay', 'naypyidaw', 'myawaddy', 'kokang'],
  越南: ['vietnam', 'vn', 'ho chi minh', 'hcmc', 'saigon', 'hanoi', 'danang', 'da nang', 'nha trang', 'haiphong'],
  印尼: ['印度尼西亚', '印尼西亚', 'indonesia', 'id', 'jakarta', 'bali', 'surabaya', 'bandung', 'medan', 'batam', 'yogyakarta'],
  老挝: ['老撾', 'laos', 'lao', 'la', 'vientiane', 'luang prabang', 'pakse', 'bokeo'],
  新加坡: ['singapore', 'sg'],
  香港: ['hong kong', 'hk'],
  澳门: ['澳門', 'macao', 'macau', 'mo'],
  印度: ['india', 'in', 'new delhi', 'delhi', 'mumbai', 'bangalore', 'hyderabad', 'chennai', 'kolkata'],
  孟加拉: ['bangladesh', 'bd', 'dhaka', 'chittagong', 'sylhet'],
  尼泊尔: ['尼泊爾', 'nepal', 'np', 'kathmandu', 'pokhara', 'lumbini'],
  土耳其: ['turkey', 'tr', 'istanbul', 'ankara', 'antalya', 'izmir'],
  塞浦路斯: ['cyprus', 'cy', 'nicosia', 'limassol', 'larnaca'],
  亚美尼亚: ['亞美尼亞', 'armenia', 'am', 'yerevan', 'gyumri', 'vanadzor'],
  格鲁吉亚: ['格魯吉亞', 'georgia', 'ge', 'tbilisi', 'batumi', 'kutaisi'],
  塞尔维亚: ['塞爾維亞', 'serbia', 'rs', 'belgrade', 'novi sad', 'nis'],
  罗马尼亚: ['羅馬尼亞', 'romania', 'ro', 'bucharest', 'cluj', 'timisoara', 'constanta'],
  阿尔巴尼亚: ['阿爾巴尼亞', 'albania', 'al', 'tirana', 'durres', 'vlore'],
  黑山: ['montenegro', 'me', 'podgorica', 'budva', 'kotor'],
  俄罗斯: ['俄羅斯', 'russia', 'ru', 'moscow', 'saint petersburg', 'vladivostok'],
  哈萨克斯坦: ['哈薩克斯坦', 'kazakhstan', 'kz', 'almaty', 'astana', 'shymkent'],
  吉尔吉斯斯坦: ['吉爾吉斯斯坦', 'kyrgyzstan', 'kg', 'bishkek', 'osh'],
  乌兹别克斯坦: ['烏茲別克斯坦', 'uzbekistan', 'uz', 'tashkent', 'samarkand'],
  巴西: ['brazil', 'br', 'sao paulo', 'rio', 'brasilia', 'curitiba'],
  墨西哥: ['mexico', 'mx', 'mexico city', 'cancun', 'guadalajara', 'monterrey', 'tijuana'],
  阿尔及利亚: ['阿爾及利亞', 'algeria', 'dz', 'algiers', 'oran', 'constantine'],
  毛里求斯: ['mauritius', 'mu', 'port louis'],
  英国: ['英國', 'united kingdom', 'uk', 'gb', 'britain', 'london'],
  美国: ['美國', 'united states', 'usa', 'us', 'los angeles', 'new york', 'san francisco', 'seattle'],
  加拿大: ['canada', 'ca', 'vancouver', 'toronto'],
  澳大利亚: ['澳大利亞', 'australia', 'au', 'sydney', 'melbourne'],
  瓦努阿图: ['瓦努阿圖', 'vanuatu', 'vu', 'port vila'],
  马绍尔: ['馬紹爾', 'marshall islands', 'mh', 'majuro'],
  德国: ['德國', 'germany', 'de', 'berlin', 'frankfurt'],
  法国: ['法國', 'france', 'fr', 'paris'],
  意大利: ['italy', 'it', 'rome', 'milan'],
  西班牙: ['spain', 'es', 'madrid'],
  瑞士: ['switzerland', 'ch', 'zurich'],
  新西兰: ['新西蘭', 'new zealand', 'nz', 'auckland'],
  多米尼克: ['dominica', 'dm', 'roseau'],
  葡萄牙: ['portugal', 'pt', 'lisbon', 'porto', 'faro'],
  希腊: ['希臘', 'greece', 'gr', 'athens', 'thessaloniki', 'crete'],
  马耳他: ['馬耳他', 'malta', 'mt', 'valletta', 'sliema'],
  匈牙利: ['hungary', 'hu', 'budapest', 'debrecen'],
  爱尔兰: ['愛爾蘭', 'ireland', 'ie', 'dublin', 'cork'],
  荷兰: ['荷蘭', 'netherlands', 'nl', 'amsterdam', 'rotterdam', 'hague'],
  奥地利: ['奧地利', 'austria', 'at', 'vienna', 'salzburg'],
  卢森堡: ['盧森堡', 'luxembourg', 'lu'],
  比利时: ['比利時', 'belgium', 'be', 'brussels', 'antwerp'],
  波兰: ['波蘭', 'poland', 'pl', 'warsaw', 'krakow'],
  捷克: ['czech', 'cz', 'prague', 'brno'],
  巴拿马: ['巴拿馬', 'panama', 'pa', 'panama city'],
  哥斯达黎加: ['哥斯達黎加', 'costa rica', 'cr', 'san jose'],
  阿根廷: ['argentina', 'ar', 'buenos aires'],
  智利: ['chile', 'cl', 'santiago'],
  乌拉圭: ['烏拉圭', 'uruguay', 'uy', 'montevideo'],
  安提瓜和巴布达: ['安提瓜和巴布達', 'antigua and barbuda', 'ag', 'st john'],
  圣基茨和尼维斯: ['聖基茨和尼維斯', 'saint kitts and nevis', 'st kitts', 'kn', 'basseterre'],
  圣卢西亚: ['聖盧西亞', 'saint lucia', 'st lucia', 'lc', 'castries'],
  格林纳达: ['格林納達', 'grenada', 'gd', 'saint george', 'st george'],
};

function normalizeTextForCountryMatch(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[｜|/\\,，。.;；:：()（）\[\]【】{}<>《》]+/g, ' ')
    .replace(/[-_·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizePresetCountryName(raw: unknown) {
  const country = String(raw || '').replace(/\s+/g, ' ').trim();
  if (country === '迪拜') return '阿联酋';
  if (country === '马来') return '马来西亚';
  if (country === '印度尼西亚') return '印尼';
  return country;
}

function getCountryCode(countryName: string) {
  return COUNTRY_CODE_BY_NAME[countryName] || null;
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    const key = normalizeTextForCountryMatch(text);
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });

  return result;
}

function normalizeLocationPresets(raw: unknown): LocationPresetConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_LOCATION_PRESETS;

  const presets = raw
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      const country = normalizePresetCountryName(entry.country || entry.name || entry.label);
      const cities = Array.isArray(entry.cities)
        ? uniqueStrings(entry.cities)
        : uniqueStrings(String(entry.cities || '').split(/[\n,，]/));
      if (!country || cities.length <= 0) return null;
      return { country, cities };
    })
    .filter((item): item is LocationPresetConfig => Boolean(item));

  return presets.length > 0 ? presets : DEFAULT_LOCATION_PRESETS;
}

function buildRulesFromLocationPresets(presets: LocationPresetConfig[]): CountryRule[] {
  const ruleMap = new Map<string, CountryRule>();

  presets.forEach((preset) => {
    const country = normalizePresetCountryName(preset.country);
    if (!country) return;

    const key = normalizeTextForCountryMatch(country);
    const current = ruleMap.get(key) || {
      code: getCountryCode(country),
      name: country,
      aliases: [],
    };

    current.aliases = uniqueStrings([
      ...current.aliases,
      country,
      ...(preset.cities || []),
      ...(EXTRA_ALIASES_BY_COUNTRY[country] || []),
    ]);

    ruleMap.set(key, current);
  });

  return Array.from(ruleMap.values());
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error;
}

async function getLocationCountryRules() {
  const now = Date.now();
  if (cachedLocationRules && cachedLocationRules.expiresAt > now) {
    return cachedLocationRules.rules;
  }

  let presets: LocationPresetConfig[] = DEFAULT_LOCATION_PRESETS;
  try {
    const configs = await ConfigService.getConfigs();
    presets = normalizeLocationPresets((configs as any).location_presets);
  } catch (error) {
    console.warn('[post-country-resolver] location presets unavailable; using defaults:', getErrorMessage(error));
  }

  const rules = buildRulesFromLocationPresets(presets);
  cachedLocationRules = {
    expiresAt: now + LOCATION_RULE_CACHE_TTL_MS,
    rules,
  };
  return rules;
}

function isShortCodeAlias(alias: string) {
  return /^[a-z]{2}$/i.test(alias);
}

function sourceMatchesAlias(source: MatchSource, alias: string) {
  const normalizedAlias = normalizeTextForCountryMatch(alias);
  if (!source.text || !normalizedAlias) return false;

  if (isShortCodeAlias(normalizedAlias)) {
    if (!source.allowShortCode) return false;
    return new RegExp(`(^|\\s)${normalizedAlias}(\\s|$)`, 'i').test(source.text);
  }

  return source.text.includes(normalizedAlias);
}

export function resolveCountryFromPostText(input: {
  countryCode?: string | null;
  countryName?: string | null;
  location?: string | null;
  title?: string | null;
  content?: string | null;
  categoryMeta?: unknown;
}, rules: CountryRule[] = buildRulesFromLocationPresets(DEFAULT_LOCATION_PRESETS)): ResolvedPostCountry {
  const existingCode = typeof input.countryCode === 'string' ? input.countryCode.trim().toUpperCase() : '';
  const existingName = normalizePresetCountryName(input.countryName);
  if (existingCode && existingName) {
    const existingRule = rules.find((rule) => rule.name === existingName && rule.code === existingCode);
    if (existingRule) return { countryCode: existingRule.code, countryName: existingRule.name };
  }

  const categoryMetaLocation = input.categoryMeta && typeof input.categoryMeta === 'object' && !Array.isArray(input.categoryMeta)
    ? (input.categoryMeta as Record<string, unknown>).location
    : undefined;

  const sources: MatchSource[] = [
    { text: normalizeTextForCountryMatch(input.location), allowShortCode: true },
    { text: normalizeTextForCountryMatch(categoryMetaLocation), allowShortCode: true },
    { text: normalizeTextForCountryMatch(input.title), allowShortCode: false },
    { text: normalizeTextForCountryMatch(input.content), allowShortCode: false },
  ].filter((source) => Boolean(source.text));

  for (const source of sources) {
    for (const rule of rules) {
      if (rule.aliases.some((alias) => sourceMatchesAlias(source, alias))) {
        return { countryCode: rule.code, countryName: rule.name };
      }
    }
  }

  const codeOnlyRule = existingCode
    ? rules.find((rule) => rule.code === existingCode)
    : null;
  if (codeOnlyRule) return { countryCode: codeOnlyRule.code, countryName: codeOnlyRule.name };

  const nameOnlyRule = existingName
    ? rules.find((rule) => rule.name === existingName || rule.aliases.some((alias) => normalizeTextForCountryMatch(alias) === normalizeTextForCountryMatch(existingName)))
    : null;
  if (nameOnlyRule) return { countryCode: nameOnlyRule.code, countryName: nameOnlyRule.name };

  return { countryCode: null, countryName: null };
}

export async function refreshPostCountryFields(postId: string) {
  const id = String(postId || '').trim();
  if (!id || !isDbConfigured()) return null;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      location: true,
      countryCode: true,
      countryName: true,
      categoryMeta: true,
    },
  });
  if (!post) return null;

  const rules = await getLocationCountryRules();
  const resolved = resolveCountryFromPostText(post, rules);
  const nextCode = resolved.countryCode || null;
  const nextName = resolved.countryName || null;

  if (post.countryCode !== nextCode || post.countryName !== nextName) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        countryCode: nextCode,
        countryName: nextName,
      },
    });
  }

  await prisma.postRankingScore.updateMany({
    where: { postId: post.id },
    data: {
      countryCode: nextCode,
      countryName: nextName,
    },
  });

  return resolved;
}

export async function refreshPostCountryFieldsBatch(postIds: string[]) {
  const ids = Array.from(new Set((postIds || []).map((id) => String(id || '').trim()).filter(Boolean))).slice(0, 200);
  const results: Array<ResolvedPostCountry | null> = [];
  for (const id of ids) {
    results.push(await refreshPostCountryFields(id));
  }
  return results;
}
