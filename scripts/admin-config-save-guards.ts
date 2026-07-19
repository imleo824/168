import assert from 'node:assert/strict';

import { HttpError } from '../server/http/errors';
import {
  parseFeedRankProfileForSave,
  parseLocationPresetsForSave,
} from '../server/config.service';

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

console.log('[admin-config-save-guards] passed');
