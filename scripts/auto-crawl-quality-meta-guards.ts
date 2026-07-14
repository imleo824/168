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
    薪资: '1200',
    ' 地点 ': '日本 东京',
    类型: '兼职',
    备注: 42,
    extra: 'ignored',
  },
  locationPresets: [{ country: '日本', cities: ['东京'] }],
});

assert.deepEqual(meta.meta, {
  salary: 1200,
  city: '日本 · 东京',
  jobType: '兼职',
  note: '42',
});
assert.deepEqual(meta.audit.unexpectedKeys, ['extra'], 'only non-schema inputs should be audited as unexpected.');

console.log('[auto-crawl-quality-meta-guards] passed');
