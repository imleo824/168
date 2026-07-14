import type {
  LocationPresetConfig,
  PublishCategoryMetaConfig,
  PublishCategoryMetaFieldConfig,
} from '../config-types';
import { normalizeToLocationPreset } from './location-preset-normalize.service';

export type CrawlCategoryRef = {
  id: string;
  name: string;
  slug: string;
};

export type CrawlCategoryMetaNormalizationInput = {
  category: CrawlCategoryRef;
  rawMeta: unknown;
  categoryMetaSchema: PublishCategoryMetaConfig | null;
  locationPresets: LocationPresetConfig[];
};

export type CrawlCategoryMetaNormalizationResult = {
  meta: Record<string, unknown>;
  audit: {
    schemaFound: boolean;
    categoryId: string;
    categorySlug: string;
    schemaVersion: number | null;
    configuredKeys: string[];
    normalizedKeys: string[];
    unexpectedKeys: string[];
    rejected: Record<string, { raw: unknown; reason: string }>;
  };
};

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fieldKey(field: PublishCategoryMetaFieldConfig) {
  return String(field.key || '').trim();
}

function normalizedComparable(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactComparable(value: unknown) {
  return normalizedComparable(value).replace(/[\s#＃_\-\/\\|·.,，。:：;；、()（）\[\]【】"'“”‘’]+/g, '');
}

function textValue(raw: unknown, maxLength: number) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  return value ? value.slice(0, maxLength) : null;
}

function parseChineseNumber(raw: string) {
  const values: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const unitValues: Record<string, number> = {
    十: 10,
    百: 100,
    千: 1000,
  };
  const token = raw.normalize('NFKC').replace(/两/g, '二').trim();
  if (!/^[零一二三四五六七八九十百千万]+$/.test(token)) return null;
  if (!/[十百千万]/.test(token)) return token.length === 1 ? values[token] ?? null : null;

  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of token) {
    if (char in values) {
      number = values[char];
      continue;
    }
    if (char === '万') {
      total += Math.max(section + number, 1) * 10000;
      section = 0;
      number = 0;
      continue;
    }
    const unit = unitValues[char];
    if (!unit) return null;
    section += Math.max(number, 1) * unit;
    number = 0;
  }
  return total + section + number;
}

function parseNumericAmounts(raw: string) {
  const matches = [...raw.matchAll(/([+-]?\d[\d,]*(?:\.\d+)?)\s*(k|K|千|w|W|万)?/g)];
  return matches
    .map((match) => {
      const parsed = Number(String(match[1] || '').replace(/,/g, ''));
      if (!Number.isFinite(parsed)) return null;
      const unit = match[2];
      if (/^(?:k|K|千)$/.test(unit || '')) return parsed * 1000;
      if (/^(?:w|W|万)$/.test(unit || '')) return parsed * 10000;
      return parsed;
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function normalizeNumber(raw: unknown) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, reason: 'strict_number' } : { value: null, reason: 'number_not_matched' };
  }
  if (typeof raw !== 'string') return { value: null, reason: 'number_not_matched' };
  const value = raw.normalize('NFKC').trim();
  const strict = /^[+-]?\d+(?:\.\d+)?$/.test(value);
  if (strict) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? { value: parsed, reason: 'strict_number' } : { value: null, reason: 'number_not_matched' };
  }

  const matches = parseNumericAmounts(value);
  if (matches.length === 1) return { value: matches[0], reason: /(?:k|K|千|w|W|万)/.test(value) ? 'numeric_unit_extracted' : 'numeric_amount_extracted' };
  if (matches.length > 1) return { value: null, reason: 'number_not_matched' };

  const chineseMatches = value.match(/[一二两三四五六七八九十百千万]{1,12}/g) || [];
  if (chineseMatches.length !== 1) return { value: null, reason: 'number_not_matched' };
  const parsed = parseChineseNumber(chineseMatches[0]);
  return parsed !== null
    ? { value: parsed, reason: 'chinese_number_extracted' }
    : { value: null, reason: 'number_not_matched' };
}

function exactConfiguredOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return null;
  const rawKey = normalizedComparable(raw);
  if (!rawKey) return null;
  const matches = (field.options || []).filter((option) => normalizedComparable(option) === rawKey);
  return matches.length === 1 ? matches[0] : null;
}

const OPTION_ALIASES: Record<string, string[]> = {
  客服: ['客服专员', '在线客服', '售后', '客服代表', 'cs'],
  推广: ['地推', '拉新', '投放', '引流', '市场推广'],
  电销: ['电话销售', '电话营销', 'telemarketing'],
  运营: ['社群运营', '内容运营', '用户运营', '活动运营'],
  人事: ['hr', '招聘专员', '人力资源', '人资'],
  财务: ['会计', '出纳'],
  法务公关: ['法务', '公关', '法务公关', '政府事务', '政府关系', '外联', '许可证', '签证许可', '居留许可', '劳工移民', '合同审查', '法律培训', '合规法务'],
  后端开发: ['后端', '后台开发', 'backend', 'server', 'java开发', 'golang', 'go开发', 'php开发', 'python开发', 'nodejs'],
  前端开发: ['前端', 'web前端', 'frontend', 'react', 'vue', 'h5'],
  DBA: ['数据库', 'mysql', 'postgres', 'postgresql', 'oracle'],
  运维: ['devops', 'sre', 'linux', 'k8s', 'kubernetes'],
  产品: ['产品经理', 'pm'],
  设计: ['设计师', 'ui', '平面设计'],
  风控: ['风控专员', '风险控制', '风险审核', '合规审核'],
  市场: ['market'],
  销售: ['业务', '销售代表'],
  行政: ['助理', '文员', '档案', '档案信息', '资料员', '资料整理', '资料归档', '信息组', '行政文员', '办公室文员'],
  司机: ['驾驶员'],
  安保: ['保安', 'security'],
  厨师: ['后厨'],
  服务员: ['waiter'],
  翻译: ['translator'],
  主播: ['直播'],
  剪辑: ['视频剪辑'],
  手机: ['iphone', '苹果手机', '安卓手机', '华为手机', '小米手机', 'oppo', 'vivo'],
  电脑: ['笔记本', 'laptop', 'macbook', '台式机', '台式电脑', 'pc'],
  数码配件: ['耳机', '充电器', '数据线', '鼠标', '键盘', '移动硬盘', '硬盘'],
  家电: ['冰箱', '洗衣机', '空调', '电视', '微波炉'],
  家具: ['沙发', '床', '桌子', '椅子', '柜子'],
  摩托: ['机车', '摩托车'],
  电动车: ['电瓶车', 'e-bike', 'ebike'],
  汽车: ['轿车', '二手车'],
  汽车用品: ['车载', '轮胎', '行车记录仪'],
  服饰鞋包: ['衣服', '鞋子', '包包', '服装'],
  美妆个护: ['化妆品', '护肤品', '香水'],
  母婴用品: ['婴儿', '奶粉', '尿不湿'],
  运动户外: ['健身', '球拍', '帐篷'],
  游戏娱乐: ['游戏机', 'ps5', 'switch'],
  办公用品: ['打印机', '办公桌', '办公椅'],
  票券卡券: ['门票', '礼品卡', '充值卡', '卡券'],
  宠物: ['猫', '狗', '猫咪', '狗狗'],
  签证: ['visa', '旅游签', '工签', '商务签', '办签'],
  移民: ['永居', 'pr', '居留'],
  护照: ['passport'],
  工作证明: ['在职证明', '工证'],
  保关: ['清关'],
  捞人: ['救人', '放人', '拘留'],
  洗白: ['黑名单解除', 'blacklist'],
  KTV: ['会所', '夜总会'],
  按摩: ['spa', '足疗', '马杀鸡'],
  修车: ['开车'],
  刷量: ['跑量', '点赞', '评论', '播放', '粉丝', '流量'],
  数据: ['客资', '名单', '数据包'],
  包网: ['平台搭建', '建站', '系统搭建'],
  游戏: ['棋牌', '彩票', '电竞'],
  支付: ['代收', '代付', '通道', '支付通道', '四方'],
};

function semanticConfiguredOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return null;
  const rawKey = compactComparable(raw);
  if (!rawKey) return null;
  const matches = new Set<string>();
  for (const option of field.options || []) {
    const optionText = String(option || '');
    const optionParts = /[\/|、,，&+]/.test(optionText)
      ? optionText.split(/[\/|、,，&+]+/g).map((part) => part.trim()).filter(Boolean)
      : [];
    const candidates = [
      ...(OPTION_ALIASES[option] || []),
      ...optionParts,
      ...optionParts.flatMap((part) => OPTION_ALIASES[part] || []),
    ].map(compactComparable).filter(Boolean);
    if (candidates.some((candidate) => rawKey === candidate || rawKey.includes(candidate))) {
      matches.add(option);
    }
  }
  return matches.size === 1 ? Array.from(matches)[0] : null;
}

function negotiableOption(field: PublishCategoryMetaFieldConfig) {
  return (field.options || []).find((option) => normalizedComparable(option) === normalizedComparable('面议')) || null;
}

function isSalarySelectField(field: PublishCategoryMetaFieldConfig) {
  return field.type === 'select'
    && /薪资|工资|待遇/i.test(field.label)
    && (field.options || []).some((option) => /\$|面议/.test(option));
}

function salaryCurrencyRate(raw: string) {
  if (/(?:usdt|usd|(?:^|[^a-z])u(?:$|[^a-z])|美元|美金|刀|\$)/i.test(raw)) return 1;
  if (/(?:rmb|cny|人民币|¥)/i.test(raw)) return 0.14;
  if (/(?:php|披索|比索|peso)/i.test(raw)) return 0.017;
  if (/(?:thb|泰铢)/i.test(raw)) return 0.027;
  if (/(?:khr|瑞尔)/i.test(raw)) return 0.00025;
  if (/(?:vnd|越南盾)/i.test(raw)) return 0.000039;
  if (/(?:aed|迪拉姆)/i.test(raw)) return 0.272;
  if (/(?:myr|马币|林吉特)/i.test(raw)) return 0.21;
  if (/(?:sgd|新币|新加坡元)/i.test(raw)) return 0.74;
  if (/(?:idr|印尼盾)/i.test(raw)) return 0.000061;
  if (/(?:lak|基普)/i.test(raw)) return 0.000046;
  if (/(?:mmk|缅币)/i.test(raw)) return 0.00048;
  if (/(?:jpy|日元)/i.test(raw)) return 0.0064;
  if (/(?:krw|韩元)/i.test(raw)) return 0.00072;
  if (/(?:hkd|港币)/i.test(raw)) return 0.128;
  if (/(?:mop|澳门币)/i.test(raw)) return 0.124;
  if (/(?:eur|欧元)/i.test(raw)) return 1.08;
  return null;
}

function salaryOptionRange(option: string) {
  const text = String(option || '').normalize('NFKC').replace(/,/g, '');
  const numbers = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  if (!numbers.length) return null;
  if (/以下/.test(text)) return { min: Number.NEGATIVE_INFINITY, max: numbers[0] };
  if (/以上/.test(text)) return { min: numbers[0], max: Number.POSITIVE_INFINITY };
  if (numbers.length >= 2) return { min: Math.min(numbers[0], numbers[1]), max: Math.max(numbers[0], numbers[1]) };
  return null;
}

function chooseSalaryRangeOption(usdAmount: number, field: PublishCategoryMetaFieldConfig) {
  for (const option of field.options || []) {
    const range = salaryOptionRange(option);
    if (!range) continue;
    if (usdAmount >= range.min && usdAmount <= range.max) return option;
  }
  return null;
}

function salaryPeriodMonthlyFactor(raw: string) {
  if (/(?:时薪|小时|hourly|per hour|日薪|每天|daily|per day|周薪|weekly|per week)/i.test(raw)) return null;
  if (/(?:年薪|annual|yearly|per year)/i.test(raw)) return 1 / 12;
  return 1;
}

function isNegotiableSalaryText(raw: string) {
  return /面议|面谈|详聊|从优|看能力|negotiable|tbd|薪资|工资|待遇|高薪|底薪|提成|月薪|薪酬|包吃住/i.test(raw);
}

function semanticSalaryOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (!isSalarySelectField(field)) return null;

  const option = negotiableOption(field);
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  const text = String(raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (/面议|面谈|详聊|从优|看能力|negotiable|tbd/i.test(text)) return option;

  const rate = typeof raw === 'number' ? 1 : salaryCurrencyRate(text);
  const periodFactor = salaryPeriodMonthlyFactor(text);
  if (periodFactor === null) return option;

  const amounts = typeof raw === 'number'
    ? [raw]
    : parseNumericAmounts(text);
  if (!amounts.length) return isNegotiableSalaryText(text) ? option : null;
  if (!rate) return option;
  const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const salaryOption = chooseSalaryRangeOption(averageAmount * rate * periodFactor, field);
  return salaryOption || option;
}

function normalizeFieldValue(
  raw: unknown,
  field: PublishCategoryMetaFieldConfig,
  locationPresets: LocationPresetConfig[],
): { value: unknown; reason: string } {
  if (raw === undefined || raw === null || raw === '') return { value: null, reason: 'not_provided' };

  if (field.type === 'location') {
    const value = normalizeToLocationPreset(raw, locationPresets);
    return value
      ? { value, reason: 'database_location_preset_exact' }
      : { value: null, reason: 'database_location_preset_not_matched' };
  }

  if (field.type === 'select') {
    const exactValue = exactConfiguredOption(raw, field);
    if (exactValue) return { value: exactValue, reason: 'database_option_exact' };
    const salaryValue = semanticSalaryOption(raw, field);
    if (salaryValue) return { value: salaryValue, reason: 'salary_option_semantic' };
    const semanticValue = semanticConfiguredOption(raw, field);
    return semanticValue
      ? { value: semanticValue, reason: 'database_option_semantic' }
      : { value: null, reason: 'database_option_not_matched' };
  }

  if (field.type === 'number') {
    return normalizeNumber(raw);
  }

  if (field.type === 'boolean') {
    return typeof raw === 'boolean'
      ? { value: raw, reason: 'strict_boolean' }
      : { value: null, reason: 'strict_boolean_not_matched' };
  }

  const value = textValue(raw, Number(field.maxLength) || 300);
  return value
    ? { value, reason: 'schema_text' }
    : { value: null, reason: 'schema_text_not_matched' };
}

function assertSchemaMatchesCategory(category: CrawlCategoryRef, schema: PublishCategoryMetaConfig | null) {
  if (!schema) return;
  if (String(schema.categorySlug || '') !== category.slug) {
    throw new Error('auto_crawl_category_meta_schema_mismatch');
  }
}

function buildSchemaLabelKeyMap(fields: PublishCategoryMetaFieldConfig[]) {
  const labelEntries = fields
    .map((field) => [normalizedComparable(field.label), fieldKey(field)] as const)
    .filter(([label, key]) => label && key);
  const counts = new Map<string, number>();
  for (const [label] of labelEntries) counts.set(label, (counts.get(label) || 0) + 1);
  return new Map(labelEntries.filter(([label]) => counts.get(label) === 1));
}

function buildSchemaKeyMap(fields: PublishCategoryMetaFieldConfig[]) {
  const keyEntries = fields
    .map((field) => [normalizedComparable(fieldKey(field)), fieldKey(field)] as const)
    .filter(([normalized, key]) => normalized && key);
  const counts = new Map<string, number>();
  for (const [normalized] of keyEntries) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  return new Map(keyEntries.filter(([normalized]) => counts.get(normalized) === 1));
}

function buildRawInputKeyMap(rawMeta: Record<string, unknown>) {
  const entries = Object.keys(rawMeta)
    .map((key) => [normalizedComparable(key), key] as const)
    .filter(([normalized]) => normalized);
  const counts = new Map<string, number>();
  for (const [normalized] of entries) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  return new Map(entries.filter(([normalized]) => counts.get(normalized) === 1));
}

function rawFieldValue(
  rawMeta: Record<string, unknown>,
  field: PublishCategoryMetaFieldConfig,
  schemaKeyMap: ReadonlyMap<string, string>,
  labelKeyMap: ReadonlyMap<string, string>,
  rawInputKeyMap: ReadonlyMap<string, string>,
) {
  const key = fieldKey(field);
  if (Object.prototype.hasOwnProperty.call(rawMeta, key)) return rawMeta[key];
  const normalizedKey = normalizedComparable(key);
  const rawKeyInputKey = rawInputKeyMap.get(normalizedKey);
  if (schemaKeyMap.get(normalizedKey) === key && rawKeyInputKey) return rawMeta[rawKeyInputKey];
  const labelKey = normalizedComparable(field.label);
  const rawInputKey = rawInputKeyMap.get(labelKey);
  return labelKeyMap.get(labelKey) === key && rawInputKey ? rawMeta[rawInputKey] : undefined;
}

export async function normalizeCrawlCategoryMeta(
  input: CrawlCategoryMetaNormalizationInput,
): Promise<CrawlCategoryMetaNormalizationResult> {
  assertSchemaMatchesCategory(input.category, input.categoryMetaSchema);

  const fields = input.categoryMetaSchema?.fields || [];
  const rawMeta = objectValue(input.rawMeta);
  const configuredKeys = fields.map(fieldKey);
  const configuredKeySet = new Set(configuredKeys);
  const schemaKeyMap = buildSchemaKeyMap(fields);
  const labelKeyMap = buildSchemaLabelKeyMap(fields);
  const rawInputKeyMap = buildRawInputKeyMap(rawMeta);
  const acceptedInputKeys = new Set([...Array.from(schemaKeyMap.keys()), ...Array.from(labelKeyMap.keys())]);
  const meta: Record<string, unknown> = {};
  const rejected: Record<string, { raw: unknown; reason: string }> = {};

  for (const field of fields) {
    const key = fieldKey(field);
    const rawValue = rawFieldValue(rawMeta, field, schemaKeyMap, labelKeyMap, rawInputKeyMap);
    const normalized = normalizeFieldValue(rawValue, field, input.locationPresets);
    if (normalized.value !== null && normalized.value !== undefined && normalized.value !== '') {
      meta[key] = normalized.value;
    } else if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      rejected[key] = { raw: rawValue, reason: normalized.reason };
    }
  }

  return {
    meta,
    audit: {
      schemaFound: Boolean(input.categoryMetaSchema),
      categoryId: input.category.id,
      categorySlug: input.category.slug,
      schemaVersion: typeof input.categoryMetaSchema?.schemaVersion === 'number'
        ? input.categoryMetaSchema.schemaVersion
        : null,
      configuredKeys,
      normalizedKeys: Object.keys(meta),
      unexpectedKeys: Object.keys(rawMeta).filter((key) => !configuredKeySet.has(key) && !acceptedInputKeys.has(normalizedComparable(key))),
      rejected,
    },
  };
}
