import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const presetFiles = [
  'server/config-defaults.ts',
  'src/features/post-create/postCreateLocation.ts',
  'scripts/sync-publish-location-config.mjs',
  'scripts/deploy-main-schema.mjs',
];

for (const relativePath of presetFiles) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');

  assert.doesNotMatch(source, /country:\s*'迪拜'/, `${relativePath} must not use Dubai as a country`);
  assert.doesNotMatch(source, /country:\s*'台湾'/, `${relativePath} must not include Taiwan in initialized location presets`);
  assert.doesNotMatch(source, /country:\s*'马来'/, `${relativePath} should use 马来西亚 as the country name`);
  assert.match(source, /country:\s*'阿联酋'[\s\S]*'迪拜'/, `${relativePath} should put Dubai under UAE`);
  assert.match(source, /country:\s*'澳门'/, `${relativePath} should include Macau region presets`);
  assert.match(source, /country:\s*'印度'/, `${relativePath} should include expanded South Asia presets`);
  assert.match(source, /country:\s*'土耳其'/, `${relativePath} should include expanded transregional presets`);
  assert.match(source, /country:\s*'柬埔寨'[\s\S]*'七星海'[\s\S]*'桔井'/, `${relativePath} should include expanded Cambodia presets`);
  assert.match(source, /country:\s*'菲律宾'[\s\S]*'MOA'[\s\S]*'碧瑶'[\s\S]*'长滩岛'/, `${relativePath} should include expanded Philippines presets`);
  assert.match(source, /country:\s*'泰国'[\s\S]*'华欣'[\s\S]*'苏梅岛'/, `${relativePath} should include expanded Thailand presets`);
  assert.match(source, /country:\s*'英国'[\s\S]*'伦敦'/, `${relativePath} should include UK presets`);
  assert.match(source, /country:\s*'美国'[\s\S]*'洛杉矶'[\s\S]*'纽约'[\s\S]*'旧金山'[\s\S]*'西雅图'/, `${relativePath} should include US presets`);
  assert.match(source, /country:\s*'澳大利亚'[\s\S]*'悉尼'[\s\S]*'墨尔本'/, `${relativePath} should include Australia presets`);
  assert.match(source, /country:\s*'葡萄牙'[\s\S]*'里斯本'/, `${relativePath} should include visa and immigration destination presets`);
  assert.match(source, /country:\s*'希腊'[\s\S]*'雅典'/, `${relativePath} should include Greece presets`);
  assert.match(source, /country:\s*'马耳他'[\s\S]*'瓦莱塔'/, `${relativePath} should include Malta presets`);
  assert.match(source, /country:\s*'安提瓜和巴布达'[\s\S]*'圣约翰'/, `${relativePath} should include Caribbean immigration destination presets`);
  assert.doesNotMatch(source, /\bwords\s*:/, `${relativePath} must not add words aliases to location presets`);
}

const configSource = fs.readFileSync(path.join(root, 'server/config.service.ts'), 'utf8');
const crawlDatabaseConfigSource = fs.readFileSync(path.join(root, 'server/services/auto-crawl-database-config.service.ts'), 'utf8');
const postCreateLocationSource = fs.readFileSync(path.join(root, 'src/features/post-create/postCreateLocation.ts'), 'utf8');
const categoryMetaServiceSource = fs.readFileSync(path.join(root, 'server/services/category-meta.service.ts'), 'utf8');
const adminConfigSchemaSource = fs.readFileSync(path.join(root, 'src/features/admin/adminConfigSchema.ts'), 'utf8');

assert.doesNotMatch(
  configSource,
  /function mergeRequiredLocationPresets|shouldDropLocationCountry|normalizeLocationCountryAlias/,
  'ConfigService must not merge, remove, or alias persisted location presets',
);
assert.match(
  configSource,
  /if \(!Array\.isArray\(source\)\) return \[\]/,
  'ConfigService must only accept the database location preset array',
);
assert.match(
  crawlDatabaseConfigSource,
  /parseLocationPresetsStrict[\s\S]*auto_crawl_database_location_presets_not_array/,
  'Auto crawl must strictly read location presets from SystemConfig',
);
assert.doesNotMatch(
  crawlDatabaseConfigSource,
  /DEFAULT_LOCATION_PRESETS|mergeRequiredLocationPresets|normalizeLocationCountryAlias|shouldDropLocationCountry/,
  'Auto crawl must not use location defaults or compatibility transforms',
);
assert.match(
  postCreateLocationSource,
  /buildLocationCountryOption[\s\S]*buildLocationOptionsFromPresets[\s\S]*buildLocationCountryOption/,
  'Post create location options should include country-level choices',
);
assert.match(
  categoryMetaServiceSource,
  /function buildLocationPresetValueSet[\s\S]*values\.add\(country\)/,
  'Server location preset validation should accept country-level choices',
);
assert.doesNotMatch(
  adminConfigSchemaSource,
  /fields\.length\s*===\s*0[\s\S]*return null/,
  'Admin publish category normalization must allow categories without structured fields',
);
assert.match(
  adminConfigSchemaSource,
  /normalizePublishCategorySlug\(rawSlug\)/,
  'Admin publish category normalization must submit canonical categorySlug values.',
);
assert.match(
  adminConfigSchemaSource,
  /categorySlug,\s*slug:\s*categorySlug/,
  'Admin publish category normalization must keep categorySlug and slug aligned for backend/public compatibility.',
);
assert.match(
  adminConfigSchemaSource,
  /schemaVersion/,
  'Admin publish category normalization must submit schemaVersion for the database schema trigger.',
);
assert.match(
  configSource,
  /entry\.categorySlug\s*\|\|\s*entry\.slug\s*\|\|\s*entry\.id/,
  'ConfigService must accept legacy admin category identifiers before canonical save.',
);
assert.match(
  configSource,
  /normalizePublishCategorySchemaVersion\(entry\.schemaVersion\)/,
  'ConfigService must normalize missing or malformed publish schema versions before save.',
);
assert.match(
  configSource,
  /id:\s*categoryBySlug\.get\(schema\.categorySlug\s*\|\|\s*''\)!\.id/,
  'Admin publish category config responses must include database category id so the binding select can stay selected after save.',
);
assert.match(
  configSource,
  /'telegram_sync_require_image'/,
  'ConfigService must persist the admin Telegram image requirement toggle.',
);
assert.match(
  configSource,
  /BOOLEAN_STRING_TOP_LEVEL_CONFIG_KEYS[\s\S]*telegram_sync_require_image[\s\S]*tron_deposit_scan_enabled/,
  'ConfigService must normalize boolean-like admin toggles on read and save so button state echoes reliably.',
);
assert.match(
  adminConfigSchemaSource,
  /categorySlug,\s*slug:\s*categorySlug/,
  'Admin publish category normalization must keep categorySlug and slug aligned for backend/public compatibility.',
);

const adminSystemConfigSectionsSource = fs.readFileSync(path.join(root, 'src/features/admin/AdminSystemConfigSections.tsx'), 'utf8');
assert.match(
  adminSystemConfigSectionsSource,
  /hasCategoryOverride\s*&&\s*Number\.isFinite\(current\)\s*\?\s*current\s*:\s*fallback/,
  'Admin category price overrides must echo zero values instead of falling back to the global price.',
);
assert.match(
  adminSystemConfigSectionsSource,
  /const selectedCategorySlug = category\.categorySlug \|\| category\.slug \|\| ''/,
  'Admin publish category binding select must use slug/categorySlug as the stable selected value.',
);
assert.match(
  adminSystemConfigSectionsSource,
  /value=\{selectedCategoryValue\}/,
  'Admin publish category binding select must not use database UUID as the option value.',
);
assert.match(
  adminSystemConfigSectionsSource,
  /<option key=\{item\.id\} value=\{item\.slug \|\| item\.id\}>/,
  'Admin publish category binding options must use slug first because public category ids may be slugs.',
);
assert.match(
  adminSystemConfigSectionsSource,
  /\{\s*id:\s*matched\.id,\s*categorySlug:\s*matched\.slug,\s*slug:\s*matched\.slug,\s*name:\s*matched\.name\s*\}/,
  'Admin publish category binding must write categorySlug, slug, and id together when selecting an existing category.',
);

console.log('[location-presets-guards] passed');
