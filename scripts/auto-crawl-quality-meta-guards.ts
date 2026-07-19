import assert from 'node:assert/strict';

import { buildRuleBasedCrawlMetaCandidates } from '../server/services/crawl-content-ai.service';
import { normalizeCrawlCategoryMeta } from '../server/services/crawl-category-meta-normalize.service';
import { filterCrawlContentBeforePublish } from '../server/services/crawl-content-quality.service';
import { normalizeToLocationPreset } from '../server/services/location-preset-normalize.service';

const quality = filterCrawlContentBeforePublish({
  title: '东京兼职招聘 TG: helper1234',
  content: [
    '东京便利店晚班招聘，时薪 1200 日元，要求可长期稳定出勤，日语基础沟通即可，排班可以面谈。',
    'TG: helper1234',
    'https://t.me/helper1234',
    '频道赞助商',
    '@channelname',
  ].join('\n'),
  images: [],
});

assert.equal(quality.shouldPublish, true, 'valid content must survive contact and tail cleanup.');
assert.doesNotMatch(quality.cleanedTitle, /\$1|helper1234|t\.me/i, 'cleaned title must not leak contact replacement artifacts.');
assert.doesNotMatch(quality.cleanedContent, /\$1|helper1234|t\.me|频道赞助商|@channelname/i, 'cleaned content must remove contacts and source tails.');
assert.equal(quality.contact, '@helper1234', 'post author contact must be extracted before contact lines are removed from cleaned content.');
assert.ok(quality.removed.contactLines >= 2, 'contact removal must be audited.');
assert.ok(quality.removed.tailLines >= 2, 'tail removal must be audited.');

for (const keyword of ['官网', '网址', '.com', '下载', 'TRX', '注册']) {
  const rejected = filterCrawlContentBeforePublish({
    title: keyword === '官网' ? '官网活动入口' : '东京本地信息',
    content: `东京本地福利内容，更多请${keyword}后查看。`,
    images: [],
  });

  assert.equal(rejected.shouldPublish, false, `${keyword} content must be rejected before publish.`);
  assert.equal(rejected.reason, 'ad_keyword', `${keyword} rejection must use the ad keyword reason.`);
  assert.ok(rejected.flags.includes('direct_reject_keyword'), `${keyword} rejection must be auditable.`);
}

const meta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 3,
    name: '招聘',
    fields: [
      { key: 'salary', label: '薪资', type: 'number', required: false, min: 0, max: 100000 },
      { key: 'city', label: '地点', type: 'location', required: false },
      { key: 'jobType', label: '类型', type: 'select', required: false, options: ['全职', '兼职'] },
      { key: 'note', label: '备注', type: 'text', required: false, maxLength: 12 },
    ],
  },
  rawMeta: {
    薪资: '1000USD',
    ' 地点 ': '日本 东京',
    类型: '兼职',
    备注: 42,
    extra: 'ignored',
  },
  locationPresets: [{ country: '日本', cities: ['东京'] }],
});

assert.deepEqual(meta.meta, {
  salary: 1000,
  city: '日本 · 东京',
  jobType: '兼职',
  note: '42',
});
assert.deepEqual(meta.audit.unexpectedKeys, ['extra'], 'only non-schema inputs should be audited as unexpected.');

const booleanMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 2,
    name: '租房',
    fields: [
      { key: 'furnished', label: '带家具', type: 'boolean', required: false },
      { key: 'hasParking', label: '停车位', type: 'boolean', required: false },
      { key: 'petFriendly', label: '可养宠', type: 'boolean', required: false },
    ],
  },
  rawMeta: {
    furnished: '是',
    hasParking: '无',
    petFriendly: 1,
  },
  locationPresets: [],
});

assert.deepEqual(booleanMeta.meta, {
  furnished: true,
  hasParking: false,
  petFriendly: true,
}, 'boolean meta must tolerate common AI/string outputs instead of silently dropping them.');

const sriLankaPresets = [{ country: '斯里兰卡', cities: ['科伦坡', '康提', '加勒'] }];
assert.equal(normalizeToLocationPreset('SLK', sriLankaPresets), '斯里兰卡', 'SLK must semantically normalize to Sri Lanka.');
assert.equal(normalizeToLocationPreset('Sri Lanka', sriLankaPresets), '斯里兰卡', 'English country names must normalize to configured country presets.');
assert.equal(normalizeToLocationPreset('科伦坡', sriLankaPresets), '斯里兰卡 · 科伦坡', 'city names must still normalize to configured city presets.');

const globalCountryPresets = [
  { country: '阿联酋', cities: ['迪拜', '阿布扎比', '沙迦', '阿治曼'] },
  { country: '美国', cities: ['洛杉矶'] },
  { country: '日本', cities: ['东京'] },
  { country: '英国', cities: ['伦敦'] },
  { country: '澳大利亚', cities: ['悉尼'] },
  { country: '马来西亚', cities: ['吉隆坡'] },
  { country: '缅甸', cities: ['仰光', '曼德勒', '内比都', '妙瓦底', '老街', '果敢', '木姐', '大其力'] },
  { country: '柬埔寨', cities: ['金边', '西港', '暹粒', '波贝', '巴域'] },
  { country: '老挝', cities: ['万象', '琅勃拉邦', '巴色', '磨丁', '金三角'] },
  { country: '塞浦路斯', cities: ['尼科西亚', '利马索尔', '拉纳卡', '北塞'] },
  { country: '塞尔维亚', cities: ['贝尔格莱德', '诺维萨德', '尼什'] },
  { country: '亚美尼亚', cities: ['埃里温', '久姆里', '瓦纳佐尔'] },
  { country: '格鲁吉亚', cities: ['第比利斯', '巴统', '库塔伊西'] },
  { country: '菲律宾', cities: ['马尼拉'] },
  { country: '泰国', cities: ['曼谷'] },
];

for (const [rawLocation, expectedLocation] of [
  ['UAE', '阿联酋'],
  ['USA', '美国'],
  ['JP', '日本'],
  ['UK', '英国'],
  ['AU', '澳大利亚'],
  ['MY', '马来西亚'],
  ['MM', '缅甸'],
  ['KH', '柬埔寨'],
  ['LA', '老挝'],
  ['CY', '塞浦路斯'],
  ['塞普洛斯', '塞浦路斯'],
  ['RS', '塞尔维亚'],
  ['AM', '亚美尼亚'],
  ['GE', '格鲁吉亚'],
  ['PH', '菲律宾'],
  ['TH', '泰国'],
] as const) {
  assert.equal(
    normalizeToLocationPreset(rawLocation, globalCountryPresets),
    expectedLocation,
    `${rawLocation} must semantically normalize to ${expectedLocation}.`,
  );
}

for (const [rawLocation, expectedLocation] of [
  ['迪拜', '阿联酋 · 迪拜'],
  ['Dubai', '阿联酋 · 迪拜'],
  ['工作地点：迪拜，月休四天', '阿联酋 · 迪拜'],
  ['Yangon', '缅甸 · 仰光'],
  ['驻地 Myawaddy，接受轮休', '缅甸 · 妙瓦底'],
  ['Myawaddy', '缅甸 · 妙瓦底'],
  ['Phnom Penh', '柬埔寨 · 金边'],
  ['地点金边，包吃住', '柬埔寨 · 金边'],
  ['Sihanoukville', '柬埔寨 · 西港'],
  ['Vientiane', '老挝 · 万象'],
  ['Nicosia', '塞浦路斯 · 尼科西亚'],
  ['Belgrade', '塞尔维亚 · 贝尔格莱德'],
  ['Yerevan', '亚美尼亚 · 埃里温'],
  ['Tbilisi', '格鲁吉亚 · 第比利斯'],
] as const) {
  assert.equal(
    normalizeToLocationPreset(rawLocation, globalCountryPresets),
    expectedLocation,
    `${rawLocation} must semantically normalize to ${expectedLocation}.`,
  );
}

assert.equal(
  normalizeToLocationPreset('business development', globalCountryPresets),
  '',
  'short country aliases such as US must not match inside ordinary words.',
);

const countryLevelLocationMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 3,
    name: '招聘',
    fields: [
      { key: 'location', label: '地点', type: 'location', required: false },
    ],
  },
  rawMeta: {
    location: 'SLK',
  },
  locationPresets: sriLankaPresets,
});

assert.equal(countryLevelLocationMeta.meta.location, '斯里兰卡', 'auto-crawl location meta must accept semantic country-level preset matches.');

const schemaOnlyMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 3,
    name: '招聘',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: false, options: ['客服', '风控', '设计'] },
      { key: 'location', label: '地点', type: 'location', required: false },
    ],
  },
  rawMeta: {
    position: '客服',
    location: 'PH',
    age: '21-30',
    gender: '不限',
    nationality: '外籍',
    language: '中文流利',
    education: '大学',
    workTime: '9小时',
  },
  locationPresets: [{ country: '菲律宾', cities: ['马尼拉'] }],
});

assert.deepEqual(schemaOnlyMeta.meta, {
  position: '客服',
  location: '菲律宾',
}, 'auto-crawl meta must only keep backend schema fields.');
assert.deepEqual(
  schemaOnlyMeta.audit.unexpectedKeys.sort(),
  ['age', 'education', 'gender', 'language', 'nationality', 'workTime'].sort(),
  'non-schema extracted attributes must be audited as discarded, not normalized.',
);

const metaWithoutRangeGate = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 3,
    name: '招聘',
    fields: [
      { key: 'salary', label: '薪资', type: 'number', required: false, min: 0, max: 100000 },
    ],
  },
  rawMeta: { salary: '150000USD' },
  locationPresets: [],
});

assert.equal(metaWithoutRangeGate.meta.salary, 150000, 'crawl meta numbers must not be rejected by min/max range gates.');

const salaryRangeSchema = {
  categorySlug: 'jobs',
  schemaVersion: 3,
  name: '招聘',
  fields: [
    {
      key: 'salaryRange',
      label: '薪资',
      type: 'select' as const,
      required: false,
      options: ['面议', '$800 以下', '$800 - $1,200', '$1,200 - $1,500', '$1,500 - $2,000', '$2,000 - $3,000', '$3,000 - $5,000', '$5,000 以上'],
    },
    { key: 'jobType', label: '类型', type: 'select' as const, required: false, options: ['全职', '兼职'] },
  ],
};

for (const [rawSalary, expectedRange] of [
  ['1000U/月', '$800 - $1,200'],
  ['1500/月', '$1,200 - $1,500'],
  ['5000人民币', '$800 以下'],
  ['1.5w RMB/月', '$2,000 - $3,000'],
  ['6000 AED', '$1,500 - $2,000'],
  ['300000日元/月', '$1,500 - $2,000'],
  ['年薪120000人民币', '$1,200 - $1,500'],
  ['一万二人民币/月', '$1,500 - $2,000'],
  ['待遇从优，薪资详聊', '面议'],
] as const) {
  const normalizedSalary = await normalizeCrawlCategoryMeta({
    category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
    categoryMetaSchema: salaryRangeSchema,
    rawMeta: { salaryRange: rawSalary },
    locationPresets: [],
  });

  assert.equal(normalizedSalary.meta.salaryRange, expectedRange, `${rawSalary} must normalize to ${expectedRange}.`);
}

const salaryKeyVariant = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: salaryRangeSchema,
  rawMeta: { salaryrange: '1000U/月' },
  locationPresets: [],
});

assert.equal(salaryKeyVariant.meta.salaryRange, '$800 - $1,200', 'schema key matching must tolerate model case drift.');
assert.deepEqual(salaryKeyVariant.audit.unexpectedKeys, [], 'case-only schema key drift must not be treated as unexpected.');

const falseSalary = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: salaryRangeSchema,
  rawMeta: { salaryRange: '东京' },
  locationPresets: [],
});

assert.equal(falseSalary.meta.salaryRange, undefined, 'salary ranges must not force unrelated text into 面议.');
assert.equal(falseSalary.audit.rejected.salaryRange?.reason, 'database_option_not_matched');

const nonSalarySelect = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: salaryRangeSchema,
  rawMeta: { jobType: '全职工作' },
  locationPresets: [],
});

assert.equal(nonSalarySelect.meta.jobType, '全职', 'select fields must accept clear backend option text embedded in model output.');
assert.equal(nonSalarySelect.audit.rejected.jobType, undefined);

const adminArchivePosition = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 3,
    name: '招聘',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: false, options: ['行政', '人事', '风控', '客服'] },
    ],
  },
  rawMeta: {
    position: 'RZ 档案信息组，收集审核相关信息，完成归纳整理，档案保管和安全防护',
  },
  locationPresets: [],
});

assert.equal(adminArchivePosition.meta.position, '行政', 'archive/info/document collection roles must normalize to administrative roles, not risk-control.');

const legalPrPosition = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: {
    categorySlug: 'jobs',
    schemaVersion: 4,
    name: '招聘',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: false, options: ['行政', '风控', '法务公关'] },
      { key: 'location', label: '地点', type: 'location', required: false },
    ],
  },
  rawMeta: {
    position: '法务公关代表员，负责签证、许可证、执照、政府机构联络、合同审查和合规法务问题',
    location: 'DB',
  },
  locationPresets: [{ country: '阿联酋', cities: ['迪拜'] }],
});

assert.deepEqual(legalPrPosition.meta, {
  position: '法务公关',
  location: '阿联酋 · 迪拜',
}, 'legal/public affairs roles and DB location must normalize to configured backend options.');

const allMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_all', name: '全量Meta测试', slug: 'all' },
  categoryMetaSchema: {
    categorySlug: 'all',
    schemaVersion: 1,
    name: '全量Meta测试',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: false, options: ['客服', '推广', '后端开发', '前端开发', 'DBA', '运维'] },
      { key: 'itemCategory', label: '品类', type: 'select', required: false, options: ['手机', '电脑', '数码配件', '家电', '家具', '摩托', '电动车', '汽车', '汽车用品', '宠物'] },
      { key: 'documentType', label: '类型', type: 'select', required: false, options: ['签证', '移民', '护照', '工作证明', '保关', '捞人', '洗白'] },
      { key: 'nightlifeType', label: '分类', type: 'select', required: false, options: ['KTV', '按摩', '修车'] },
      { key: 'supplyDemandType', label: '分类', type: 'select', required: false, options: ['刷量', '数据', '包网', '游戏', '支付'] },
      { key: 'price', label: '价格', type: 'number', required: false },
      { key: 'area', label: '面积', type: 'number', required: false },
      { key: 'bedrooms', label: '卧室', type: 'number', required: false },
      { key: 'depositMonths', label: '押几', type: 'number', required: false },
      { key: 'paymentMonths', label: '付几', type: 'number', required: false },
    ],
  },
  rawMeta: {
    position: 'React 前端工程师',
    itemCategory: 'MacBook Pro 二手转让',
    documentType: '旅游签办理',
    nightlifeType: 'SPA 按摩',
    supplyDemandType: '支付通道资源',
    price: '1.2万',
    area: '一百平',
    bedrooms: '两室',
    depositMonths: '押二',
    paymentMonths: '付一',
  },
  locationPresets: [],
});

assert.deepEqual(allMeta.meta, {
  position: '前端开发',
  itemCategory: '电脑',
  documentType: '签证',
  nightlifeType: '按摩',
  supplyDemandType: '支付',
  price: 12000,
  area: 100,
  bedrooms: 2,
  depositMonths: 2,
  paymentMonths: 1,
});
assert.equal(allMeta.audit.rejected.price, undefined, 'money fields without currency units must keep the original number.');

const rentMoneyMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 1,
    name: '租房',
    fields: [
      { key: 'price', label: '租金', type: 'number', required: false },
      { key: 'area', label: '面积', type: 'number', required: false },
      { key: 'bedrooms', label: '卧室', type: 'number', required: false },
    ],
  },
  rawMeta: {
    price: '800元一个月',
    area: '一百平',
    bedrooms: '1房',
  },
  locationPresets: [],
});

assert.deepEqual(rentMoneyMeta.meta, {
  price: 112,
  area: 100,
  bedrooms: 1,
}, 'rent prices must convert currency units to USD while non-money numeric fields stay as quantities.');

const usdRentMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 1,
    name: '租房',
    fields: [
      { key: 'price', label: '价格', type: 'number', required: false },
    ],
  },
  rawMeta: { price: '700$/月' },
  locationPresets: [],
});

assert.equal(usdRentMeta.meta.price, 700, 'USD rent should keep the USD amount.');

const unitlessRentMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 1,
    name: '租房',
    fields: [
      { key: 'price', label: '租金', type: 'number', required: false },
    ],
  },
  rawMeta: { price: '800' },
  locationPresets: [],
});

assert.equal(unitlessRentMeta.meta.price, 800, 'unitless money fields must keep their numeric amount instead of being dropped.');
assert.equal(unitlessRentMeta.audit.rejected.price, undefined);

const abbreviatedChineseNumberMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 1,
    name: '租房',
    fields: [
      { key: 'price', label: '租金', type: 'number', required: false },
      { key: 'area', label: '面积', type: 'number', required: false },
    ],
  },
  rawMeta: {
    price: '一万二人民币',
    area: '三千五平',
  },
  locationPresets: [],
});

assert.deepEqual(abbreviatedChineseNumberMeta.meta, {
  price: 1680,
  area: 3500,
}, 'abbreviated Chinese numeric meta such as 一万二 and 三千五 must be parsed as 12000 and 3500.');

const secondhandNumericPriceMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_secondhand', name: '二手', slug: 'secondhand' },
  categoryMetaSchema: {
    categorySlug: 'secondhand',
    schemaVersion: 2,
    name: '二手',
    fields: [
      { key: 'itemCategory', label: '品类', type: 'select', required: false, options: ['汽车', '摩托', '电脑'] },
      { key: 'price', label: '价格', type: 'number', required: false },
    ],
  },
  rawMeta: {
    itemCategory: '代步车带城内牌',
    price: '6000元',
  },
  locationPresets: [],
});

assert.deepEqual(secondhandNumericPriceMeta.meta, {
  itemCategory: '汽车',
  price: 840,
}, 'secondhand prices must remain numeric and convert currency units to USD.');

const numericPriceCannotStoreNegotiable = await normalizeCrawlCategoryMeta({
  category: { id: 'category_secondhand', name: '二手', slug: 'secondhand' },
  categoryMetaSchema: {
    categorySlug: 'secondhand',
    schemaVersion: 2,
    name: '二手',
    fields: [
      { key: 'price', label: '价格', type: 'number', required: false },
    ],
  },
  rawMeta: {
    price: '面议',
  },
  locationPresets: [],
});

assert.equal(numericPriceCannotStoreNegotiable.meta.price, undefined, 'numeric price fields cannot store negotiable text.');
assert.equal(numericPriceCannotStoreNegotiable.audit.rejected.price?.reason, 'money_number_not_matched');

const priceMustNotReadChineseNumberFromCommonWords = await normalizeCrawlCategoryMeta({
  category: { id: 'category_secondhand', name: '二手', slug: 'secondhand' },
  categoryMetaSchema: {
    categorySlug: 'secondhand',
    schemaVersion: 2,
    name: '二手',
    fields: [
      { key: 'price', label: '价格', type: 'number', required: false },
    ],
  },
  rawMeta: {
    price: '二手车出售',
  },
  locationPresets: [],
});

assert.equal(priceMustNotReadChineseNumberFromCommonWords.meta.price, undefined, 'Chinese numerals inside ordinary words such as 二手车 must not become numeric meta.');
assert.equal(priceMustNotReadChineseNumberFromCommonWords.audit.rejected.price?.reason, 'money_number_not_matched');

const compositeSelect = await normalizeCrawlCategoryMeta({
  category: { id: 'category_secondhand', name: '二手', slug: 'secondhand' },
  categoryMetaSchema: {
    categorySlug: 'secondhand',
    schemaVersion: 1,
    name: '二手',
    fields: [
      { key: 'itemCategory', label: '品类', type: 'select', required: false, options: ['手机', '电脑', '电动车/摩托', '汽车用品'] },
    ],
  },
  rawMeta: {
    itemCategory: '摩托车转让',
  },
  locationPresets: [],
});

assert.equal(compositeSelect.meta.itemCategory, '电动车/摩托', 'composite backend options must classify by clear member terms.');

const ambiguousSelect = await normalizeCrawlCategoryMeta({
  category: { id: 'category_all', name: '全量Meta测试', slug: 'all' },
  categoryMetaSchema: {
    categorySlug: 'all',
    schemaVersion: 1,
    name: '全量Meta测试',
    fields: [
      { key: 'position', label: '岗位', type: 'select', required: false, options: ['产品', '运营'] },
      { key: 'depositMonths', label: '押几', type: 'number', required: false },
    ],
  },
  rawMeta: {
    position: '产品运营',
    depositMonths: '押二付一',
  },
  locationPresets: [],
});

assert.equal(ambiguousSelect.meta.position, undefined, 'ambiguous select values must not be guessed.');
assert.equal(ambiguousSelect.audit.rejected.position?.reason, 'database_option_not_matched');
assert.equal(ambiguousSelect.meta.depositMonths, 2, 'deposit fields must extract the deposit number from composite rent phrases.');
assert.equal(ambiguousSelect.audit.rejected.depositMonths, undefined);

const rentPaymentMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_housing', name: '租房', slug: 'housing' },
  categoryMetaSchema: {
    categorySlug: 'housing',
    schemaVersion: 1,
    name: '租房',
    fields: [
      { key: 'depositMonths', label: '押几', type: 'number', required: false },
      { key: 'paymentMonths', label: '付几', type: 'number', required: false },
      { key: 'bedrooms', label: '卧室', type: 'number', required: false },
    ],
  },
  rawMeta: {
    depositMonths: '押二付一',
    paymentMonths: '押二付一',
    bedrooms: '两室一厅',
  },
  locationPresets: [],
});

assert.deepEqual(rentPaymentMeta.meta, {
  depositMonths: 2,
  paymentMonths: 1,
  bedrooms: 2,
}, 'rent composite phrases must extract field-specific numeric meta.');

const ruleBasedFallbackSchema = {
  categorySlug: 'jobs',
  schemaVersion: 5,
  name: '招聘',
  fields: [
    { key: 'position', label: '岗位', type: 'select' as const, required: false, options: ['行政', '客服', '前端开发', '后端开发'] },
    { key: 'salaryRange', label: '薪资', type: 'select' as const, required: false, options: ['面议', '$800 以下', '$800 - $1,200', '$1,200 - $1,500', '$1,500 - $2,000'] },
    { key: 'location', label: '地点', type: 'location' as const, required: false },
    { key: 'depositMonths', label: '押几', type: 'number' as const, required: false },
    { key: 'paymentMonths', label: '付几', type: 'number' as const, required: false },
  ],
};

const ruleBasedCandidates = buildRuleBasedCrawlMetaCandidates({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  schema: ruleBasedFallbackSchema,
  locationPresets: [{ country: '阿联酋', cities: ['迪拜'] }],
}, [
  '迪拜急招 React 前端工程师，接受远程面试。',
  '薪资 1000U/月，押二付一，包住，试用期后可转全职。',
].join('\n'));
const ruleBasedNormalized = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: ruleBasedFallbackSchema,
  rawMeta: ruleBasedCandidates,
  locationPresets: [{ country: '阿联酋', cities: ['迪拜'] }],
});

assert.deepEqual(ruleBasedNormalized.meta, {
  position: '前端开发',
  salaryRange: '$800 - $1,200',
  location: '阿联酋 · 迪拜',
  depositMonths: 2,
  paymentMonths: 1,
}, 'rule-based crawl meta fallback must recover configured fields from cleaned body when AI returns no usable meta.');
assert.deepEqual(ruleBasedNormalized.audit.unexpectedKeys, [], 'rule-based fallback must only emit configured schema keys.');

const lineScopedRuleSchema = {
  categorySlug: 'jobs',
  schemaVersion: 6,
  name: '招聘',
  fields: [
    { key: 'note', label: '备注', type: 'text' as const, required: false, maxLength: 80 },
    { key: 'position', label: '岗位', type: 'select' as const, required: false, options: ['前端开发', '后端开发'] },
    { key: 'salaryRange', label: '薪资', type: 'select' as const, required: false, options: ['面议', '$800 - $1,200', '$1,200 - $1,500'] },
  ],
};
const lineScopedRuleCandidates = buildRuleBasedCrawlMetaCandidates({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  schema: lineScopedRuleSchema,
  locationPresets: [],
}, [
  '备注：可带电脑设备',
  '岗位：React 前端工程师',
  '薪资：1000U/月',
].join('\n'));
const lineScopedRuleMeta = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: lineScopedRuleSchema,
  rawMeta: lineScopedRuleCandidates,
  locationPresets: [],
});

assert.deepEqual(lineScopedRuleMeta.meta, {
  note: '可带电脑设备',
  position: '前端开发',
  salaryRange: '$800 - $1,200',
}, 'rule-based meta fallback must preserve line boundaries so one text field cannot swallow following fields.');

console.log('[auto-crawl-quality-meta-guards] passed');
