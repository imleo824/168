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

const UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE = '\\d[\\d,]*(?:\\.\\d+)?\\s*(?:k|K|千|w|W|万)?|[零一二两三四五六七八九十百千万]{1,12}';
const NUMBER_TOKEN_PATTERN_SOURCE = '[+-]?\\d[\\d,]*(?:\\.\\d+)?\\s*(?:k|K|千|w|W|万)?|[零一二两三四五六七八九十百千万]{1,12}';
const NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE = '\\s*(?:-|~|～|—|–|至|到|－)\\s*';
const MONEY_CURRENCY_PATTERN_SOURCE = [
  'usdt',
  'usd',
  'u(?![a-z])',
  '美元',
  '美金',
  '刀',
  '\\$',
  'rmb',
  'cny',
  '人民币',
  '元',
  '¥',
  'php',
  '披索',
  '比索',
  'peso',
  'thb',
  '泰铢',
  'khr',
  '瑞尔',
  'vnd',
  '越南盾',
  'aed',
  '迪拉姆',
  'myr',
  '马币',
  '林吉特',
  'sgd',
  '新币',
  '新加坡元',
  'idr',
  '印尼盾',
  'lak',
  '基普',
  'mmk',
  '缅币',
  'jpy',
  '日元',
  'krw',
  '韩元',
  'hkd',
  '港币',
  'mop',
  '澳门币',
  'eur',
  '欧元',
].join('|');

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function escapeRegex(raw: unknown) {
  return String(raw ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  let lastUnit = 1;
  for (const char of token) {
    if (char in values) {
      number = values[char];
      continue;
    }
    if (char === '万') {
      total += Math.max(section + number, 1) * 10000;
      section = 0;
      number = 0;
      lastUnit = 10000;
      continue;
    }
    const unit = unitValues[char];
    if (!unit) return null;
    lastUnit = unit;
    section += Math.max(number, 1) * unit;
    number = 0;
  }
  if (number > 0 && lastUnit > 10 && /[十百千万][一二三四五六七八九]$/.test(token)) {
    return total + section + number * (lastUnit / 10);
  }
  return total + section + number;
}

function parseChineseAmounts(raw: string) {
  return [...raw.matchAll(/[零一二两三四五六七八九十百千万]{1,12}/g)]
    .filter((match) => {
      const token = match[0] || '';
      if (!token) return false;
      if (token.length > 1 || /[十百千万]/.test(token)) return true;
      const text = raw.trim();
      const start = match.index ?? 0;
      const nextChar = text[start + token.length] || '';
      return text === token || /[年月日天房室平个台张辆人件份次]/.test(nextChar);
    })
    .map((match) => parseChineseNumber(match[0]))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function numericUnitFactor(unit: string | undefined) {
  if (/^(?:k|K|千)$/.test(unit || '')) return 1000;
  if (/^(?:w|W|万)$/.test(unit || '')) return 10000;
  return 1;
}

function parseNumericAmounts(raw: string) {
  const matches = [...raw.matchAll(/(?<![\d.])([+-]?\d[\d,]*(?:\.\d+)?)\s*(k|K|千|w|W|万)?/g)];
  const parsed = matches
    .map((match) => {
      const parsed = Number(String(match[1] || '').replace(/,/g, ''));
      if (!Number.isFinite(parsed)) return null;
      const unit = match[2];
      const unitFactor = numericUnitFactor(unit);
      return {
        value: parsed * unitFactor,
        unitFactor,
        hasUnit: Boolean(unit),
        start: match.index ?? 0,
        end: (match.index ?? 0) + String(match[0] || '').length,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  for (let index = 0; index < parsed.length - 1; index += 1) {
    const current = parsed[index];
    const next = parsed[index + 1];
    const between = raw.slice(current.end, next.start);
    if (!current.hasUnit && next.hasUnit && new RegExp(`^${NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE}$`).test(between)) {
      current.value *= next.unitFactor;
      current.unitFactor = next.unitFactor;
      current.hasUnit = true;
    }
  }

  return parsed
    .map((match) => match.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function normalizePlainNumber(raw: unknown) {
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

  const chineseMatches = parseChineseAmounts(value);
  if (chineseMatches.length !== 1) return { value: null, reason: 'number_not_matched' };
  const parsed = chineseMatches[0];
  return parsed !== null
    ? { value: parsed, reason: 'chinese_number_extracted' }
    : { value: null, reason: 'number_not_matched' };
}

function contextualNumberPattern(field: PublishCategoryMetaFieldConfig) {
  const key = normalizedComparable(field.key);
  const label = normalizedComparable(field.label);
  if (/deposit/.test(key) || /押/.test(label)) return new RegExp(`押\\s*(${NUMBER_TOKEN_PATTERN_SOURCE})`);
  if (/payment/.test(key) || /付/.test(label)) return new RegExp(`付\\s*(${NUMBER_TOKEN_PATTERN_SOURCE})`);
  if (/bed(room)?s?/.test(key) || /卧室|房间|几房|房型/.test(label)) return new RegExp(`(${NUMBER_TOKEN_PATTERN_SOURCE})\\s*(?:房|室|bedrooms?|br)(?:\\b|$)?`, 'i');
  if (/area|size/.test(key) || /面积|平方|平米/.test(label)) return new RegExp(`(${NUMBER_TOKEN_PATTERN_SOURCE})\\s*(?:平|平方|平米|㎡|m2|sqm|sq\\.m)`, 'i');
  return null;
}

function normalizeContextualNumber(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return { value: null, reason: 'contextual_number_not_matched' };
  const pattern = contextualNumberPattern(field);
  if (!pattern) return { value: null, reason: 'contextual_number_not_matched' };
  const match = raw.normalize('NFKC').match(pattern);
  if (!match?.[1]) return { value: null, reason: 'contextual_number_not_matched' };
  return normalizePlainNumber(match[1]);
}

function exactConfiguredOption(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return null;
  const rawKey = normalizedComparable(raw);
  if (!rawKey) return null;
  const matches = (field.options || []).filter((option) => normalizedComparable(option) === rawKey);
  return matches.length === 1 ? matches[0] : null;
}

const OPTION_ALIASES: Record<string, string[]> = {
  客服: ['客服专员', '在线客服', '售后', '客服代表', 'cs', '客服组长'],
  推广: ['地推', '拉新', '投放', '引流', '市场推广', '海外推广', 'seo', 'sem'],
  电销: ['电话销售', '电话营销', 'telemarketing'],
  运营: ['社群运营', '内容运营', '用户运营', '活动运营', '新媒体运营'],
  人事: ['hr', '招聘专员', '人力资源', '人资', '猎头', '招聘hr'],
  财务: ['会计', '出纳', '财务专员', '核算员'],
  法务公关: ['法务', '公关', '法务公关', '政府事务', '政府关系', '外联', '许可证', '签证许可', '居留许可', '劳工移民', '合同审查', '法律培训', '合规法务'],
  后端开发: ['后端', '后台开发', 'backend', 'server', 'java开发', 'java', 'golang', 'go开发', 'go', 'php开发', 'php', 'python开发', 'python', 'nodejs', 'c++'],
  前端开发: ['前端', 'web前端', 'frontend', 'react', 'vue', 'h5', 'html5', 'flutter'],
  DBA: ['数据库', 'mysql', 'postgres', 'postgresql', 'oracle'],
  运维: ['devops', 'sre', 'linux', 'k8s', 'kubernetes', '系统运维', '网络运维'],
  测试: ['qa', '测试工程师', '软件测试', '自动化测试', '功能测试'],
  产品: ['产品经理', 'pm', '产品专员', '产品助理'],
  设计: ['设计师', 'ui', 'ui设计', '平面设计', '视觉设计', '美工'],
  风控: ['风控专员', '风险控制', '风险审核', '合规审核'],
  市场: ['market', '市场专员', '市场主管'],
  销售: ['业务', '销售代表', '商务拓展', 'bd'],
  行政: ['助理', '文员', '档案', '档案信息', '资料员', '资料整理', '资料归档', '信息组', '行政文员', '办公室文员', '前台'],
  司机: ['驾驶员', '专职司机', '商务司机'],
  安保: ['保安', 'security', '保镖'],
  厨师: ['后厨', '面点师', '中餐厨师', '西餐厨师', '主厨', '帮厨'],
  服务员: ['waiter', '服务生', '收银员', '吧台'],
  翻译: ['translator', '英语翻译', '西语翻译', '泰语翻译', '菲语翻译', '口译', '笔译'],
  主播: ['直播', '网络主播', '带货主播'],
  剪辑: ['视频剪辑', '后期制作', '视频制作', '剪映'],
  手机: ['iphone', '苹果手机', '安卓手机', '华为手机', '小米手机', 'oppo', 'vivo', '三星手机'],
  电脑: ['笔记本', 'laptop', 'macbook', '台式机', '台式电脑', 'pc', '主机', '显示器'],
  数码配件: ['耳机', '充电器', '数据线', '鼠标', '键盘', '移动硬盘', '硬盘', '音响', '蓝牙耳机', 'airpods'],
  家电: ['冰箱', '洗衣机', '空调', '电视', '微波炉', '热水器', '电饭煲', '电风扇'],
  家具: ['沙发', '床', '桌子', '椅子', '柜子', '衣柜', '餐桌', '茶几', '床垫'],
  摩托: ['机车', '摩托车', '踏板车', '雅马哈', '本田摩托'],
  电动车: ['电瓶车', 'e-bike', 'ebike', '小牛', '九号'],
  汽车: ['轿车', '二手车', '代步车', '车牌', '带牌', '城内牌', 'suv', 'mpv', '越野车'],
  汽车用品: ['车载', '轮胎', '行车记录仪', '车载支架', '脚垫'],
  服饰鞋包: ['衣服', '鞋子', '包包', '服装', '外套', '运动鞋', '皮包'],
  美妆个护: ['化妆品', '护肤品', '香水', '面膜', '口红', '洗护'],
  母婴用品: ['婴儿', '奶粉', '尿不湿', '婴儿车', '童装'],
  运动户外: ['健身', '球拍', '帐篷', '鱼竿', '羽毛球拍', '游泳装备'],
  游戏娱乐: ['游戏机', 'ps5', 'ps4', 'switch', 'xbox', '游戏手柄', '显卡'],
  办公用品: ['打印机', '办公桌', '办公椅', '复印机', '投影仪'],
  票券卡券: ['门票', '礼品卡', '充值卡', '卡券', '电影票', '健身卡'],
  宠物: ['猫', '狗', '猫咪', '狗狗', '宠物狗', '宠物猫', '英短', '美短', '金毛', '法斗'],
  签证: ['visa', '旅游签', '工签', '商务签', '办签', '续签', '降签', '转签', '9g工签'],
  移民: ['永居', 'pr', '居留', '绿卡', '护照项目', '投资移民'],
  护照: ['passport', '护照补办', '旅行证', '回国证明'],
  工作证明: ['在职证明', '工证', '收入证明'],
  保关: ['清关', '机场保关', 'vip保关', '快速通关'],
  捞人: ['救人', '放人', '拘留', '保释'],
  洗白: ['黑名单解除', 'blacklist', '洗黑', '遣返解除'],
  一室一厅: ['1室1厅', '1房1厅', '一房一厅', '1b1b', '1bed', '单房一厅'],
  两室一厅: ['2室1厅', '2房1厅', '两房一厅', '2b1b', '2b2b', '2bed'],
  三室一厅: ['3室1厅', '3房1厅', '三房一厅', '3b2b', '3bed'],
  单间: ['studio', '开间', '大单间', '独栋单间', '标间', '一居室'],
  整租: ['整套出租', '全套整租', '整套'],
  合租: ['分租', '单间合租', '主卧合租', '次卧合租'],
  公寓: ['condo', 'apartment', '高级公寓', '海景公寓', '电梯公寓'],
  别墅: ['villa', '独栋别墅', '联排别墅'],
  办公室: ['写字楼', '办公楼', '卡位', '办公场地', 'office'],
  商铺: ['店铺', '门面', '档口', '店面', '餐饮铺'],
  全新: ['brand new', '未拆封', '全新未用', '纯新', '箱说全', '100%新'],
  '99新': ['几乎全新', '充新', '仅拆封', '99成新', '9.9成新', '极品成色'],
  '95新': ['微瑕', '95成新', '9.5成新', '成色极好', '九五新'],
  '9成新': ['九成新', '9成新', '正常使用痕迹'],
  '8成新': ['八成新', '8成新', '有明显使用痕迹'],
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
    const optionKey = compactComparable(optionText);
    const candidates = [
      optionText,
      ...(OPTION_ALIASES[option] || []),
      ...optionParts,
      ...optionParts.flatMap((part) => OPTION_ALIASES[part] || []),
    ].map(compactComparable).filter(Boolean);
    if (rawKey === optionKey || rawKey.includes(optionKey) || candidates.some((candidate) => rawKey === candidate || rawKey.includes(candidate))) {
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

function currencyRate(raw: string) {
  if (/(?:usdt|usd|(?:^|[^a-z])u(?:$|[^a-z])|美元|美金|刀|\$)/i.test(raw)) return 1;
  if (/(?:jpy|日元)/i.test(raw)) return 0.0064;
  if (/(?:rmb|cny|人民币|(?<!日)元|¥)/i.test(raw)) return 0.14;
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
  if (/(?:krw|韩元)/i.test(raw)) return 0.00072;
  if (/(?:hkd|港币)/i.test(raw)) return 0.128;
  if (/(?:mop|澳门币)/i.test(raw)) return 0.124;
  if (/(?:eur|欧元)/i.test(raw)) return 1.08;
  return null;
}

function moneyField(field: PublishCategoryMetaFieldConfig) {
  const key = normalizedComparable(field.key);
  const label = normalizedComparable(field.label);
  return /price|rent|salary|cost|fee|amount/.test(key)
    || /价格|租金|房租|薪资|工资|待遇|费用|金额|月租/.test(label);
}

function moneyFieldSearchTerms(field: PublishCategoryMetaFieldConfig) {
  const key = normalizedComparable(field.key);
  const label = normalizedComparable(field.label);
  const terms = new Set<string>([String(field.label || '').trim(), String(field.key || '').trim()].filter(Boolean));
  if (/salary|wage|pay/.test(key) || /薪资|工资|待遇|月薪|薪酬/.test(label)) {
    ['薪资', '工资', '待遇', '月薪', '薪酬', '底薪', 'salary', 'wage', 'pay'].forEach((term) => terms.add(term));
  }
  if (/price|rent|cost|fee|amount/.test(key) || /价格|租金|房租|费用|金额|月租/.test(label)) {
    ['价格', '租金', '房租', '费用', '金额', '月租', 'price', 'rent', 'cost', 'fee', 'amount'].forEach((term) => terms.add(term));
  }
  return Array.from(terms).map((term) => term.trim()).filter(Boolean);
}

function moneyAmountRangeMatched(raw: string) {
  const text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (/^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?$/.test(text)) return false;
  const rangePattern = new RegExp(`(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})${NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE}(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})`, 'i');
  if (!rangePattern.test(text)) return false;
  const hasCurrency = currencyRate(text) !== null;
  const hasMoneyTerm = /薪资|工资|待遇|月薪|薪酬|底薪|价格|租金|房租|费用|金额|月租|salary|wage|pay|price|rent|cost|fee|amount/i.test(text);
  const standaloneRange = new RegExp(`^\\s*(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})${NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE}(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})(?:\\s*(?:${MONEY_CURRENCY_PATTERN_SOURCE}))?(?:\\s*(?:\\/|每)?\\s*(?:月|年|天|日|周|小时|h|hr|hour|day|week|month|year))?\\s*$`, 'i');
  return hasCurrency || hasMoneyTerm || standaloneRange.test(text);
}

function hasUnsupportedMoneyUnitWord(raw: string, rate: number | null) {
  if (rate !== null) return false;
  const normalized = raw.normalize('NFKC').toLowerCase();
  const withoutAllowedWords = normalized
    .replace(/\b(?:rent|price|salary|wage|pay|cost|fee|amount|per|month|monthly|year|yearly|day|daily|week|weekly|hour|hourly)\b/g, ' ')
    .replace(/\s+/g, ' ');
  return /\b[a-z]{2,}\b/.test(withoutAllowedWords);
}

function contextualMoneySource(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (typeof raw !== 'string') return '';
  const text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  for (const term of moneyFieldSearchTerms(field)) {
    const pattern = new RegExp(`${escapeRegex(term)}\\s*[:：]?\\s*(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})(?:${NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE}(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE}))?(?:\\s*(?:${MONEY_CURRENCY_PATTERN_SOURCE}))?`, 'i');
    const match = text.match(pattern);
    if (match?.[0]) return match[0];
  }

  const explicitMoneyPattern = new RegExp(`(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE})(?:${NUMBER_RANGE_SEPARATOR_PATTERN_SOURCE}(?:${UNSIGNED_NUMBER_TOKEN_PATTERN_SOURCE}))?\\s*(?:${MONEY_CURRENCY_PATTERN_SOURCE})`, 'gi');
  const explicitMatches = [...text.matchAll(explicitMoneyPattern)];
  return explicitMatches.length === 1 ? explicitMatches[0]?.[0] || '' : '';
}

function normalizeMoneyNumber(raw: unknown) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, reason: 'money_number_without_currency' } : { value: null, reason: 'money_number_not_matched' };
  }
  if (typeof raw !== 'string') return { value: null, reason: 'money_number_not_matched' };
  const text = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!text) return { value: null, reason: 'money_number_not_matched' };

  const rate = currencyRate(text);
  if (hasUnsupportedMoneyUnitWord(text, rate)) return { value: null, reason: 'money_number_not_matched' };
  const numericAmounts = parseNumericAmounts(text);
  const amounts = numericAmounts.length ? numericAmounts : parseChineseAmounts(text);
  if (amounts.length === 2 && moneyAmountRangeMatched(text)) {
    const usd = ((amounts[0] + amounts[1]) / 2) * (rate || 1);
    if (!Number.isFinite(usd)) return { value: null, reason: 'money_number_not_matched' };
    return {
      value: Math.round(usd * 100) / 100,
      reason: !rate ? 'money_range_without_currency' : rate === 1 ? 'money_usd_range_average' : 'money_currency_range_converted_usd',
    };
  }
  if (amounts.length !== 1) return { value: null, reason: 'money_number_not_matched' };
  const usd = amounts[0] * (rate || 1);
  if (!Number.isFinite(usd)) return { value: null, reason: 'money_number_not_matched' };
  return {
    value: Math.round(usd * 100) / 100,
    reason: !rate ? 'money_number_without_currency' : rate === 1 ? 'money_usd_amount' : 'money_currency_converted_usd',
  };
}

function normalizeNumber(raw: unknown, field: PublishCategoryMetaFieldConfig) {
  if (moneyField(field)) {
    const contextualSource = contextualMoneySource(raw, field);
    const contextual = contextualSource
      ? normalizeMoneyNumber(contextualSource)
      : { value: null, reason: 'contextual_money_number_not_matched' };
    return contextual.value !== null && contextual.value !== undefined
      ? { ...contextual, reason: `contextual_${contextual.reason}` }
      : normalizeMoneyNumber(raw);
  }
  const contextual = normalizeContextualNumber(raw, field);
  return contextual.value !== null && contextual.value !== undefined
    ? { ...contextual, reason: 'contextual_number_extracted' }
    : normalizePlainNumber(raw);
}

function normalizeBoolean(raw: unknown) {
  if (typeof raw === 'boolean') return { value: raw, reason: 'strict_boolean' };
  if (typeof raw === 'number') {
    if (raw === 1) return { value: true, reason: 'numeric_boolean' };
    if (raw === 0) return { value: false, reason: 'numeric_boolean' };
    return { value: null, reason: 'strict_boolean_not_matched' };
  }
  if (typeof raw !== 'string') return { value: null, reason: 'strict_boolean_not_matched' };
  const value = normalizedComparable(raw);
  if (/^(?:true|yes|y|1|是|有|可|支持|需要|提供|包含|包)$/.test(value)) {
    return { value: true, reason: 'semantic_boolean' };
  }
  if (/^(?:false|no|n|0|否|无|不|不可|不支持|无需|没有|未提供|不包含|不包)$/.test(value)) {
    return { value: false, reason: 'semantic_boolean' };
  }
  return { value: null, reason: 'strict_boolean_not_matched' };
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

  const rate = typeof raw === 'number' ? 1 : currencyRate(text);
  const periodFactor = salaryPeriodMonthlyFactor(text);
  if (periodFactor === null) return option;

  const amounts = typeof raw === 'number'
    ? [raw]
    : (() => {
      const numericAmounts = parseNumericAmounts(text);
      return numericAmounts.length ? numericAmounts : parseChineseAmounts(text);
    })();
  if (!amounts.length) return isNegotiableSalaryText(text) ? option : null;
  const averageAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const salaryOption = chooseSalaryRangeOption(averageAmount * (rate || 1) * periodFactor, field);
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
    return normalizeNumber(raw, field);
  }

  if (field.type === 'boolean') {
    return normalizeBoolean(raw);
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
