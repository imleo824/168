import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { HttpError } from '../server/http/errors';
import {
  parsePublishCategorySchema,
  parseFeedRankProfileForSave,
  parseLocationPresetsForSave,
} from '../server/config.service';
import { normalizeAutoPostConfig } from '../server/services/auto-post.config';
import { normalizePlatformAiConfig } from '../server/services/platform-ai-config.service';

const root = process.cwd();
function read(file: string) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const adminConfigRoutesSource = read('server/routes/admin-config.routes.ts');

assert.deepEqual(
  parsePublishCategorySchema([]),
  { schema: [] },
  'publish_category_schema must allow an empty array so admins can clear all extra publish fields.',
);
assert.match(
  adminConfigRoutesSource,
  /if \(parsed\.schema\.length === 0\) return;/,
  'admin config save route must allow clearing publish category schema instead of forcing at least one category.',
);
assert.doesNotMatch(
  adminConfigRoutesSource,
  /至少需要配置一个分类/,
  'admin config save route must not restore the obsolete non-empty publish category schema requirement.',
);

const validPresets = parseLocationPresetsForSave([
  { country: ' 菲律宾 ', cities: [' 马尼拉 ', '宿务'] },
]);

assert.deepEqual(validPresets, [
  { country: '菲律宾', cities: ['马尼拉', '宿务'] },
]);

for (const [raw, message] of [
  ['{bad json', 'location_presets 不是合法 JSON'],
  [[{ country: '菲律宾', cities: [] }], 'location_presets 城市不能为空：菲律宾'],
  [
    [
      { country: '菲律宾', cities: ['马尼拉'] },
      { country: '菲律宾', cities: ['宿务'] },
    ],
    'location_presets 国家重复：菲律宾',
  ],
  [
    [
      { country: 'Philippines', cities: ['Manila'] },
      { country: 'philippines', cities: ['Cebu'] },
    ],
    'location_presets 国家重复：philippines',
  ],
  [[{ country: '菲律宾', cities: ['马尼拉', '马尼拉'] }], 'location_presets 城市重复：菲律宾'],
  [[{ country: 'Philippines', cities: ['Manila', 'manila'] }], 'location_presets 城市重复：Philippines'],
] as const) {
  assert.throws(
    () => parseLocationPresetsForSave(raw),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400 && error.message === message,
    `${message} must be rejected instead of being saved as an empty preset list.`,
  );
}

assert.deepEqual(
  parseFeedRankProfileForSave('{"candidate":{"recommendationMin":120}}'),
  { candidate: { recommendationMin: 120 } },
);
assert.deepEqual(parseFeedRankProfileForSave({ recommendation: { like: 2 } }), { recommendation: { like: 2 } });

for (const [raw, message] of [
  ['{bad json', 'feed_rank_profile 不是合法 JSON'],
  ['[]', 'feed_rank_profile 必须是对象'],
  [42, 'feed_rank_profile 必须是对象'],
] as const) {
  assert.throws(
    () => parseFeedRankProfileForSave(raw),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400 && error.message === message,
    `${message} must be rejected instead of being saved and ignored by the runtime fallback.`,
  );
}

const clampedPlatformAiConfig = normalizePlatformAiConfig({
  provider: 'openai-compatible',
  model: 'gpt-test-model'.repeat(20),
  baseUrl: 'javascript:alert(1)',
  timeoutMs: -1,
  reviewIntervalMinutes: 0,
});

assert.equal(clampedPlatformAiConfig.provider, 'openai-compatible');
assert.equal(clampedPlatformAiConfig.baseUrl, 'https://api.openai.com/v1');
assert.equal(clampedPlatformAiConfig.timeoutMs, 3000, 'platform AI timeout must clamp to the safe lower bound.');
assert.equal(clampedPlatformAiConfig.reviewIntervalMinutes, 1, 'platform AI review interval must clamp to the safe lower bound.');
assert.ok(clampedPlatformAiConfig.model.length <= 120, 'platform AI model names must be bounded before persistence.');

const maxClampedPlatformAiConfig = normalizePlatformAiConfig({
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1////',
  timeoutMs: 999_999,
  reviewIntervalMinutes: 999_999,
});

assert.equal(maxClampedPlatformAiConfig.baseUrl, 'https://api.deepseek.com/v1');
assert.equal(maxClampedPlatformAiConfig.timeoutMs, 120000, 'platform AI timeout must clamp to the safe upper bound.');
assert.equal(maxClampedPlatformAiConfig.reviewIntervalMinutes, 1440, 'platform AI review interval must clamp to the safe upper bound.');

const clampedAutoPostConfig = normalizeAutoPostConfig({
  enabled: '开启',
  checkIntervalMinutes: -1,
  topicConfigs: {
    QUOTE: {
      enabled: '开启',
      authorUserId: ' user_1 ',
      categoryId: ' category_1 ',
      dailyLimit: 9999,
    },
    FACT: {
      enabled: '关闭',
      dailyLimit: -9,
    },
  },
});

assert.equal(clampedAutoPostConfig.enabled, true, 'auto post config must accept Chinese enabled strings.');
assert.equal(clampedAutoPostConfig.checkIntervalMinutes, 30, 'auto post interval must clamp to the safe lower bound.');
assert.equal(clampedAutoPostConfig.topicConfigs.QUOTE.enabled, true, 'auto post topic config must accept Chinese enabled strings.');
assert.equal(clampedAutoPostConfig.topicConfigs.QUOTE.authorUserId, 'user_1');
assert.equal(clampedAutoPostConfig.topicConfigs.QUOTE.categoryId, 'category_1');
assert.equal(clampedAutoPostConfig.topicConfigs.QUOTE.dailyLimit, 100, 'auto post topic daily limit must clamp to the safe upper bound.');
assert.equal(clampedAutoPostConfig.topicConfigs.FACT.enabled, false, 'auto post topic config must accept Chinese disabled strings.');
assert.equal(clampedAutoPostConfig.topicConfigs.FACT.dailyLimit, 0, 'auto post topic daily limit must clamp to the safe lower bound.');

const maxClampedAutoPostConfig = normalizeAutoPostConfig({
  checkIntervalMinutes: 9999,
});

assert.equal(maxClampedAutoPostConfig.checkIntervalMinutes, 720, 'auto post interval must clamp to the safe upper bound.');

console.log('[admin-config-save-guards] passed');
