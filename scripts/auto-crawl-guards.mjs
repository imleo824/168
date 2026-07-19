import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const mustHave = (label, source, pattern) => {
  if (!pattern.test(source)) throw new Error(`${label} is missing ${pattern}`);
};
const mustNotHave = (label, source, pattern) => {
  if (pattern.test(source)) throw new Error(`${label} still contains ${pattern}`);
};

for (const file of [
  'server/services/auto-crawl-category-routing.service.ts',
  'server/services/auto-crawl-seed-sources.ts',
  'scripts/init-auto-crawl-sources.ts',
  'server/services/auto-crawl-final-category.service.ts',
]) {
  if (exists(file)) throw new Error(`${file} must remain deleted.`);
}

const routes = read('server/routes/auto-crawl.routes.ts');
const types = read('server/services/auto-crawl.types.ts');
const normalize = read('server/services/auto-crawl-normalize.ts');
const crawl = read('server/services/auto-crawl.service.ts');
const crawlAi = read('server/services/crawl-content-ai.service.ts');
const crawlRecovery = read('server/services/auto-crawl-recovery.service.ts');
const observedRunner = read('server/services/auto-crawl-observed-runner.service.ts');
const crawlDatabaseConfig = read('server/services/auto-crawl-database-config.service.ts');
const crawlMeta = read('server/services/crawl-category-meta-normalize.service.ts');
const crawlQuality = read('server/services/crawl-content-quality.service.ts');
const locationNormalize = read('server/services/location-preset-normalize.service.ts');
const strictMetaMigration = read('prisma/migrations/20260915000000_auto_crawl_meta_number_no_range_gate/migration.sql');
const packageJson = read('package.json');
const crawlLogsPanel = read('src/features/admin/AdminAutoCrawlExecutionLogsCompactPanel.tsx');
const crawlPanel = read('src/features/admin/AdminAutoCrawlPanel.tsx');

mustNotHave('domain types', types, /syncToTelegram|localOnlyMode|aiEnabled|QUARANTINED|FILTERED/);
mustHave('domain types', types, /RETRYABLE/);
mustNotHave('source normalization', normalize, /normalizeSeed|shouldDisableSeedSource|normalizeCategoryName|syncToTelegram/);
mustHave('source normalization', normalize, /sanitizeDatabaseText/);

mustHave('source routes', routes, /categoryId/);
mustHave('source routes', routes, /prisma\.category\.findUnique/);
mustNotHave('source routes', routes, /sources\/seed|category-routing-rules|resolveDefaultAutoCrawlAuthorUserId|repairEnabledAutoCrawlSourcesWithoutAuthor|localOnlyMode|aiEnabled|syncToTelegram/);
mustNotHave('package scripts', packageJson, /seed:auto-crawl-sources/);

mustHave('crawl database config', crawlDatabaseConfig, /prisma\.systemConfig\.findMany/);
mustHave('crawl database config', crawlDatabaseConfig, /prisma\.category\.findMany/);
mustHave('crawl database config', crawlDatabaseConfig, /categoriesById/);
mustHave('crawl database config', crawlDatabaseConfig, /schemasBySlug/);
mustHave('crawl database config', crawlDatabaseConfig, /getAutoCrawlDatabaseCategory/);
mustHave('crawl database config', crawlDatabaseConfig, /getAutoCrawlCategorySchema/);
mustHave('crawl database config', crawlDatabaseConfig, /auto_crawl_database_meta_category_not_found/);
mustNotHave('crawl database config', crawlDatabaseConfig, /ConfigService|getDefaultConfigs|DEFAULT_|fallback|entry\.slug|entry\.id/);

mustHave('main flow', crawl, /loadAutoCrawlDatabaseConfig/);
mustHave('config payload', crawl, /categoryOptions/);
mustHave('config payload', crawl, /listAutoCrawlCategoryOptions/);
mustHave('config save upsert', crawl, /INSERT INTO "AutoCrawlConfig"[\s\S]*ON CONFLICT\("id"\) DO UPDATE/);
mustHave('config enable wakes sources', crawl, /function markEnabledAutoCrawlSourcesDueNow\(\)[\s\S]*"nextRunAt"=CURRENT_TIMESTAMP[\s\S]*WHERE "disabled"=FALSE/);
mustHave('config enable wakes sources', crawl, /if \(enabled === true\) await markEnabledAutoCrawlSourcesDueNow\(\)/);
mustHave('main flow', crawl, /getAutoCrawlDatabaseCategory\(databaseConfig, source\.categoryId\)/);
mustHave('main flow', crawl, /getAutoCrawlCategorySchema\(databaseConfig, category\)/);
mustHave('main flow', crawl, /category: \{ connect: \{ id: category\.id \} \}/);
mustHave('main flow', crawl, /categoryMeta: extracted\.meta/);
mustHave('main flow', crawl, /set_config\('app\.auto_crawl_write','1',true\)/);
mustHave('main flow', crawl, /images: item\.images/);
mustHave('main flow', crawl, /publishContentHash/);
mustHave('main flow', crawl, /duplicate_after_clean/);
mustHave('main flow', crawl, /"contentHash"=COALESCE\(\$8,"contentHash"\)/);
mustHave('main flow log start', crawl, /phase: 'run_started'/);
mustHave('main flow', crawl, /帖子发布失败，已进入失败队列/);
mustHave('source failure backoff', crawl, /function sourceFailureBackoffMinutes[\s\S]*"nextRunAt"=CURRENT_TIMESTAMP\+\(\$3::text\|\|' minutes'\)::interval/);
mustHave('main flow', crawl, /auto_crawl_database_migration_required/);
mustNotHave('main flow', crawl, /resolveCategoryById|findPublishCategoryMetaSchema|ConfigService|AutoCrawlLock|AutoCrawlCategoryAuthor|heartbeatAutoCrawlLock|resolveAutoCrawlFinalCategoryByRules|initializeAutoCrawlSourcesFromSeed|AUTO_CRAWL_SEED|CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS|syncToTelegram|telegramSyncStatus/);
mustNotHave('main flow metadata', crawl, /metadata:\s*\{[\s\S]{0,160}\bcategory\s*[,}]|metadata:\s*\{[\s\S]{0,180}\bmeta\s*:/);
mustNotHave('auto crawl logs panel', crawlLogsPanel, /同步 Telegram|syncToTelegram/);
mustHave('auto crawl execution logs fallback', read('server/services/auto-crawl-execution-log.service.ts'), /FROM "AutoCrawlRun"[\s\S]*ORDER BY "startedAt" DESC/);
mustHave('auto crawl execution logs fallback', read('server/services/auto-crawl-execution-log.service.ts'), /listDatabaseRunSummaries/);
mustHave('auto crawl execution logs fallback', read('server/services/auto-crawl-execution-log.service.ts'), /getDatabaseRun/);
mustHave('auto crawl execution logs fallback', read('server/services/auto-crawl-execution-log.service.ts'), /runEventsFromSummary/);
mustHave('auto crawl admin panel category options', crawlPanel, /categoryOptions/);
mustNotHave('auto crawl admin panel category options', crawlPanel, /useCategories|@\/hooks\/useData/);
mustHave('source identity', crawl, /duplicateBy: 'sourcePostId' \| 'fingerprint' \| 'contentHash'/);
mustHave('source identity', crawl, /\(\"sourceId\"=\$1 AND \"sourcePostId\"=\$2\)/);
mustHave('source identity', crawl, /ON CONFLICT\(\"sourceId\",\"sourcePostId\"\)/);
mustNotHave('source identity', crawl, /fingerprint\(source, item, itemHash\)/);

mustHave('recovery', crawlRecovery, /reconcileInterruptedAutoCrawlState/);
mustHave('recovery', crawlRecovery, /runAutoCrawlRecoveryQueue/);
mustHave('recovery exact claim', crawlRecovery, /ids:\s*claimedIds/);
mustHave('reprocess exact ids', crawl, /conditions\.push\(`i\."id"=ANY\(\$\$\{params\.length\}::text\[\]\)`\)/);
mustHave('observed runner', observedRunner, /runRecoverySafely/);

mustHave('AI extraction', crawlAi, /context: AutoCrawlExtractionContext/);
mustHave('AI extraction', crawlAi, /jsonMode: true/);
mustHave('AI extraction', crawlAi, /enrichmentStatus/);
mustHave('AI extraction', crawlAi, /数据库 Category 是分类唯一事实源/);
mustHave('AI extraction', crawlAi, /Meta Schema 是 Meta 唯一事实源/);
mustHave('AI extraction', crawlAi, /输出字段只能是 title、contact、meta/);
mustHave('AI extraction', crawlAi, /const sourceContent = publishContent\.slice\(0, 12_000\)/);
mustHave('AI extraction', crawlAi, /title 和 meta 只能基于 SOURCE_DATA 判断/);
mustHave('AI extraction', crawlAi, /本次只处理这些后台字段/);
mustHave('AI extraction', crawlAi, /未配置的原文属性必须完全忽略/);
mustHave('AI extraction', crawlAi, /年龄、性别、国籍、语言、学历、工作时间、休假、班次、人数、经验要求/);
mustHave('AI extraction', crawlAi, /优先识别城市、地区、园区、口岸/);
mustHave('AI extraction', crawlAi, /能匹配城市\/地区时输出“国家 · 城市”/);
mustHave('AI extraction', crawlAi, /U、USDT、USD、美元、刀按美元等值处理/);
mustHave('AI extraction', crawlAi, /RMB\/CNY\/人民币[\s\S]*PHP\/披索\/比索[\s\S]*THB\/泰铢[\s\S]*AED\/迪拉姆/);
mustHave('AI extraction', crawlAi, /能按原文语义合理换算到美元月薪区间/);
mustHave('AI extraction', crawlAi, /没有明确数字金额[\s\S]*必须输出“面议”/);
mustNotHave('AI extraction', crawlAi, /AUTO_CRAWL_META_REQUIRED_MISSING|auto_crawl_ai_required_failed|auto_crawl_ai_required_json_parse_failed|输出字段只能是 title、location|parsed\?\.location/);
mustNotHave('AI extraction', crawlAi, /import prisma|loadAutoCrawlDatabaseConfig|findPublishCategoryMetaSchema|extractSchemaLabeledMeta|repairAiJson|aiRequest|rawAiMeta/);

mustHave('Meta normalization', crawlMeta, /database_option_exact/);
mustHave('Meta normalization', crawlMeta, /database_option_semantic/);
mustHave('Meta normalization', crawlMeta, /OPTION_ALIASES/);
mustHave('Meta normalization', crawlMeta, /chinese_number_extracted/);
mustHave('Meta normalization', crawlMeta, /numeric_unit_extracted/);
mustHave('Meta normalization', crawlMeta, /salaryPeriodMonthlyFactor/);
mustHave('Meta normalization', crawlMeta, /strict_number/);
mustHave('Meta normalization', crawlMeta, /strict_boolean/);
mustHave('Meta normalization', crawlMeta, /buildSchemaKeyMap/);
mustHave('Meta normalization', crawlMeta, /buildSchemaLabelKeyMap/);
mustHave('Meta normalization', crawlMeta, /buildRawInputKeyMap/);
mustHave('Meta normalization', crawlMeta, /unexpectedKeys/);
mustHave('Meta normalization', crawlMeta, /rejected/);
mustNotHave('Meta normalization', crawlMeta, /missingRequiredKeys|salaryBucket|normalizeCurrency|fallback/i);

mustHave('strict auto-crawl meta migration', strictMetaMigration, /v_type = 'number' AND jsonb_typeof\(v_raw\) = 'number'/);
mustHave('strict auto-crawl meta migration', strictMetaMigration, /final schema\/type fence/);
mustNotHave('strict auto-crawl meta migration', strictMetaMigration, /\bv_min\b|\bv_max\b|v_number\s*[<>]=/);

mustHave('location normalization', locationNormalize, /buildLocationPresetIndex/);
mustHave('location normalization', locationNormalize, /const ambiguous = new Set<string>/);
mustHave('location normalization', locationNormalize, /COUNTRY_ALIASES/);
mustHave('location normalization', locationNormalize, /CITY_ALIASES/);
mustHave('location normalization', locationNormalize, /containsLocationAlias/);
mustHave('location normalization', locationNormalize, /left\.kind === 'city'/);
mustHave('location normalization', locationNormalize, /斯里兰卡:[\s\S]*slk/);
mustHave('location normalization', locationNormalize, /阿联酋:[\s\S]*uae/);
mustHave('location normalization', locationNormalize, /美国:[\s\S]*usa/);
mustHave('location normalization', locationNormalize, /英国:[\s\S]*uk/);
mustHave('location normalization', locationNormalize, /澳大利亚:[\s\S]*au/);
mustHave('location normalization', locationNormalize, /柬埔寨:[\s\S]*kh/);
mustNotHave('location normalization', locationNormalize, /scan\.includes|DEFAULT_LOCATION_PRESETS|normalizeLocationCountryAlias/);

mustHave('quality', crawlQuality, /canonicalContent\(input\.content\)/);
mustHave('quality', crawlQuality, /source_tail_removed/);
mustHave('quality', crawlQuality, /images\?: string\[\]/);
mustHave('quality', crawlQuality, /imageCount === 0/);
mustHave('quality', crawlQuality, /captures\[0\]/);
mustHave('quality', crawlQuality, /removeInlineContacts\(titleSource\)/);
mustNotHave('quality', crawlQuality, /replace\(pattern, '\$1'\)/);
mustNotHave('quality', crawlQuality, /EMOJI_EXCESSIVE_COUNT_THRESHOLD|emojiCount >= 24|CrawlAdDecision|CrawlCategoryValueDecision|extractFirstContact|CATEGORY_INTENT_RULES/);

console.log('[auto-crawl-guards] passed');
