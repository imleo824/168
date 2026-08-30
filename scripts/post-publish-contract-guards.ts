import assert from 'node:assert/strict';

import { preparePostPublishData, PostPublishError } from '../server/services/post/post-publish-contract';

const category = { id: 'category-1', name: '招聘', slug: 'jobs' };
const schema = {
  categorySlug: 'jobs',
  name: '招聘',
  schemaVersion: 7,
  fields: [
    { key: 'role', label: '岗位', type: 'text' as const, required: true, maxLength: 20 },
    { key: 'location', label: '地点', type: 'location' as const, required: true },
    { key: 'remote', label: '远程', type: 'boolean' as const, required: false },
  ],
};
const locations = new Set(['柬埔寨', '柬埔寨 · 金边']);
const normalizeLocation = (raw: unknown) => String(raw || '').trim() || null;
const deriveLocation = (raw: unknown) => ({ location: normalizeLocation(raw), countryCode: null, countryName: null });
const normalizeContact = (raw: unknown) => /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(String(raw || '')) ? String(raw) : '';
const normalizeBoolean = (raw: unknown, fallback = false) => typeof raw === 'boolean' ? raw : fallback;
const normalizeShowContact = (raw: unknown, contact: string | null | undefined) => raw === undefined ? Boolean(contact) : raw === true;
const canonicalizeImageUrl = (url: string) => url.startsWith('/uploads/') ? url : '';

const context = {
  category,
  categoryMetaSchema: schema,
  locationPresetValues: locations,
  normalizeLocation,
  deriveLocation,
  normalizeContact,
  normalizeBoolean,
  normalizeShowContact,
  canonicalizeImageUrl,
};

const draft = {
  title: '高级开发工程师',
  content: '招聘高级开发工程师',
  images: ['/uploads/jobs/a.jpg'],
  location: '柬埔寨 · 金边',
  contact: '@valid_user',
  showContact: true,
  categoryMeta: { role: '开发工程师', location: '柬埔寨 · 金边', remote: false },
};

const userPrepared = preparePostPublishData(draft, context);
const automationPrepared = preparePostPublishData(draft, { ...context, forcePublicIdentity: true });
assert.deepEqual(
  { ...automationPrepared, clientNonce: null, source: null },
  { ...userPrepared, clientNonce: null, source: null },
  '人工发布和自动抓取必须生成相同的核心帖子结构',
);
assert.equal(userPrepared.categoryMetaSchemaVersion, 7);
assert.deepEqual(userPrepared.categoryMeta, { role: '开发工程师', location: '柬埔寨 · 金边', remote: false });

assert.throws(
  () => preparePostPublishData({ ...draft, categoryMeta: { role: '开发工程师' } }, context),
  (error) => error instanceof PostPublishError && error.code === 'category_meta_invalid' && error.retryable,
);
assert.throws(
  () => preparePostPublishData({ ...draft, images: ['https://cdn.example/image.jpg'] }, context),
  (error) => error instanceof PostPublishError && error.code === 'image_not_persistent' && error.retryable,
);
assert.throws(
  () => preparePostPublishData({ ...draft, categoryMeta: { ...draft.categoryMeta, unknown: 'x' } }, context),
  (error) => error instanceof PostPublishError && error.code === 'category_meta_invalid',
);

const longPrepared = preparePostPublishData({ ...draft, title: '超长标题'.repeat(10), content: '正文'.repeat(4000) }, {
  ...context,
  allowTitleTruncation: true,
  allowContentTruncation: true,
});
assert.ok(Array.from(longPrepared.title).length <= 18);
assert.ok(longPrepared.content.length <= 5000);

console.log('post publish contract guards passed');
