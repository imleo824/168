import assert from 'node:assert/strict';

import { normalizeCrawlCategoryMeta } from '../server/services/crawl-category-meta-normalize.service';
import { filterCrawlContentBeforePublish } from '../server/services/crawl-content-quality.service';

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
  ['5000人民币', '$800 以下'],
  ['6000 AED', '$1,500 - $2,000'],
  ['300000日元/月', '$1,500 - $2,000'],
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

const nonSalarySelect = await normalizeCrawlCategoryMeta({
  category: { id: 'category_jobs', name: '招聘', slug: 'jobs' },
  categoryMetaSchema: salaryRangeSchema,
  rawMeta: { jobType: '全职工作' },
  locationPresets: [],
});

assert.equal(nonSalarySelect.meta.jobType, undefined, 'non-salary select fields must not receive loose semantic matching.');
assert.equal(nonSalarySelect.audit.rejected.jobType?.reason, 'database_option_not_matched');

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
  bedrooms: 2,
  depositMonths: 2,
  paymentMonths: 1,
});

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
assert.equal(ambiguousSelect.meta.depositMonths, undefined, 'ambiguous numeric values with multiple Chinese numbers must not be guessed.');
assert.equal(ambiguousSelect.audit.rejected.depositMonths?.reason, 'number_not_matched');

console.log('[auto-crawl-quality-meta-guards] passed');
