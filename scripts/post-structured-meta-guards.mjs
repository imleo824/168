import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const modulePath = path.join(root, 'src/utils/postStructuredMeta.ts');
const moduleUrl = `${pathToFileURL(modulePath).href}?guard=${Date.now()}`;
const {
  buildPostStructuredMetaItems,
  isPostStructuredLocationMeta,
  normalizePostStructuredMetaValue,
} = await import(moduleUrl);

const items = buildPostStructuredMetaItems({
  salary: { min: 20000, max: 30000 },
  location: '马尼拉',
  remote: true,
  empty: '',
});

assert.deepEqual(
  items.map((item) => item.value),
  ['马尼拉', '20000$-30000$', '是'],
  'structured meta should format values and include location by default',
);

assert.deepEqual(
  buildPostStructuredMetaItems({ location: '马尼拉', salary: 20000 }, { skipLocation: true }).map((item) => item.value),
  ['20000$'],
  'skipLocation should remain available for explicit callers',
);

assert.deepEqual(
  buildPostStructuredMetaItems({ location: '菲律宾 · 马尼拉' }).map((item) => item.value),
  ['马尼拉'],
  'structured location cards should display only the leaf location node',
);

assert.equal(
  normalizePostStructuredMetaValue('菲律宾 · 马尼拉'),
  '菲律宾·马尼拉',
  'structured location normalization should keep the full hierarchy for matching/filtering',
);

assert.deepEqual(
  buildPostStructuredMetaItems({
    position: '客服',
    salaryRange: '20k-30k',
    itemCategory: '手机',
    price: 1200,
    bedrooms: 2,
    bathrooms: 1,
    area: 88,
    depositMonths: 2,
    paymentMonths: 1,
  }).map((item) => item.label),
  ['卧室', '浴室', '价格', '面积', '押付', '岗位', '薪资', '品类'],
  'structured meta labels should put housing display fields in the requested order',
);

assert.deepEqual(
  buildPostStructuredMetaItems({
    price: 1200,
    rent: '800',
    salaryRange: '$500 - $800',
    salary: '$500 以下',
    area: 88,
    depositMonths: 2,
    paymentMonths: 1,
  }).map((item) => item.value),
  ['1200$', '800$', '88㎡', '押2付1', '500$-800$', '500$ 以下'],
  'price, salary, area, and deposit/payment should render as compact suffix values without separate labels',
);

assert.equal(
  isPostStructuredLocationMeta(items[0]),
  true,
  'structured location items should be detectable so cards can hide standalone location chips',
);

const cardSource = fs.readFileSync(path.join(root, 'src/features/post/PostCard.tsx'), 'utf8');
assert.match(
  cardSource,
  /buildPostStructuredMetaItems\(post\.categoryMeta\)/,
  'post cards should render all structured meta items without a maxItems cap',
);
assert.match(
  cardSource,
  /structuredMetaItems\.some\(isPostStructuredLocationMeta\)\s*\?\s*\[\]\s*:\s*locationTags/,
  'post cards should hide standalone location chips when structured location exists',
);
assert.doesNotMatch(
  cardSource,
  /item\.label\}：\{item\.value/,
  'post cards should render structured meta visible text as value only',
);

const detailSource = [
  fs.readFileSync(path.join(root, 'src/pages/PostDetail.tsx'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/pages/PostDetailLegacy.tsx'), 'utf8'),
].join('\n');
const metaValueSource = fs.readFileSync(path.join(root, 'src/features/post/PostStructuredMetaValue.tsx'), 'utf8');

assert.match(
  cardSource,
  /PostStructuredMetaValue item=\{item\}/,
  'post cards should render structured meta values with the shared icon helper',
);
assert.match(
  detailSource,
  /PostStructuredMetaValue item=\{item\}/,
  'post detail should render structured meta values with the shared icon helper',
);
assert.match(
  detailSource,
  /structuredMetaItems\.some\(isPostStructuredLocationMeta\)\s*\?\s*\[\]\s*:\s*locationTags/,
  'post detail should hide standalone location chips when structured location exists',
);
assert.doesNotMatch(
  detailSource,
  /item\.label\}：\{item\.value/,
  'post detail should render structured meta visible text as value only',
);
assert.match(
  metaValueSource,
  /aria-hidden="true"/,
  'structured meta icons should be decorative for assistive technology',
);
assert.match(
  metaValueSource,
  /Bath/,
  'structured meta icon helper should include an icon for bathrooms',
);
assert.match(
  metaValueSource,
  /BedDouble/,
  'structured meta icon helper should include an icon for bedrooms',
);
[
  'MapPin',
  'IdCard',
  'Tag',
  'CheckCircle2',
  'XCircle',
  'BadgeCheck',
].forEach((iconName) => {
  assert.match(
    metaValueSource,
    new RegExp(`\\b${iconName}\\b`),
    `structured meta icon helper should include ${iconName}`,
  );
});
['Banknote', 'CircleDollarSign', 'Ruler', 'CalendarDays'].forEach((iconName) => {
  assert.doesNotMatch(
    metaValueSource,
    new RegExp(`\\b${iconName}\\b`),
    `${iconName} should not be used for compact price, area, or deposit/payment display`,
  );
});

const homeFeedSource = fs.readFileSync(path.join(root, 'server/services/home-feed.service.ts'), 'utf8');
const postSelectsSource = fs.readFileSync(path.join(root, 'server/services/post/post-selects.ts'), 'utf8');
const configRoutesSource = fs.readFileSync(path.join(root, 'server/routes/config.routes.ts'), 'utf8');
const adminConfigRoutesSource = fs.readFileSync(path.join(root, 'server/routes/admin-config.routes.ts'), 'utf8');
assert.match(
  homeFeedSource,
  /select:\s*postFeedListSelect\(/,
  'home feed should use the shared post feed select',
);
assert.match(
  postSelectsSource,
  /categoryMeta:\s*true/,
  'shared home/post feed select should include categoryMeta',
);
assert.doesNotMatch(
  homeFeedSource,
  /categoryMeta:\s*undefined/,
  'home feed payload should not strip categoryMeta',
);
assert.match(
  configRoutesSource,
  /export function clearCachedCategories\(\)[\s\S]*categoriesCache\s*=\s*null[\s\S]*categoriesCachePromise\s*=\s*null/,
  'config routes should expose a category cache invalidator',
);
assert.match(
  adminConfigRoutesSource,
  /app\.patch\('\/api\/admin\/config'[\s\S]*ConfigService\.updateConfigs\(req\.body\)[\s\S]*clearCachedCategories\(\)/,
  'admin config saves should invalidate cached public categories immediately',
);

console.log('[post-structured-meta-guards] passed');
