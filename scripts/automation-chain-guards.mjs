import assert from 'node:assert/strict';
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

const schema = read('prisma/schema.prisma');
const serverRuntime = read('server/startup/server-runtime.ts');
const automationRuntime = read('server/services/automation/automation-runtime.ts');
const defaultModules = read('server/services/automation/default-automation-modules.ts');
const lock = read('server/services/automation-task-lock.service.ts');
const crawl = read('server/services/auto-crawl.service.ts');
const crawlDatabaseConfig = read('server/services/auto-crawl-database-config.service.ts');
const crawlRunner = read('server/services/auto-crawl-observed-runner.service.ts');
const crawlRuntime = read('server/services/auto-crawl-runtime-status.service.ts');
const crawlLog = read('server/services/auto-crawl-execution-log.service.ts');
const crawlAi = read('server/services/crawl-content-ai.service.ts');
const crawlRoutes = read('server/routes/auto-crawl.routes.ts');
const crawlPanel = read('src/features/admin/AdminAutoCrawlPanel.tsx');
const crawlExecutionPanel = read('src/features/admin/AdminAutoCrawlExecutionLogsCompactPanel.tsx');
const interactionPanel = read('src/features/admin/AdminInteractionConfigPanel.tsx');
const autoPost = read('server/services/auto-post.service.ts');
const autoPostConfig = read('server/services/auto-post.config.ts');
const autoPostRunner = read('server/services/auto-post-observed-runner.service.ts');
const autoPostPanel = read('src/features/admin/AdminAutoPostPanel.tsx');
const interactionRunner = read('server/services/interaction-observed-runner.service.ts');
const quote = read('server/services/quote-publish-v5.service.ts');
const health = read('server/services/automation-health.service.ts');
const packageScripts = JSON.stringify(JSON.parse(read('package.json')).scripts || {});

for (const removed of [
  'server/routes/automation-debug.routes.ts',
  'server/services/chat-automation-observer.service.ts',
  'server/services/observed-auto-crawl-scheduler.service.ts',
  'server/services/auto-crawl-ai-review.service.ts',
  'server/services/auto-crawl-category-routing.service.ts',
  'server/services/auto-crawl-seed-sources.ts',
  'scripts/init-auto-crawl-sources.ts',
]) assert.equal(exists(removed), false, `${removed} must stay removed.`);

for (const model of [
  'AutoLikeRun',
  'AutomationTaskLock',
  'AutomationHeartbeat',
  'QuotePublishRun',
  'CommentPublishRun',
  'AutoCrawlConfig',
  'AutoCrawlSource',
  'AutoCrawlRun',
  'AutoCrawlItem',
]) mustHave('schema', schema, new RegExp(`model ${model}\\b`));
mustNotHave('schema', schema, /model AutoCrawlLock\b|model AutoCrawlCategoryAuthor\b/);
mustHave('schema', schema, /autoCrawlSources\s+AutoCrawlSource\[\]/);
mustHave('schema', schema, /category\s+Category\s+@relation\(fields: \[categoryId\], references: \[id\], onDelete: Restrict, onUpdate: Cascade\)/);

mustHave('server runtime', serverRuntime, /startAutomationRuntime\(createDefaultAutomationModules\(\{/);
mustHave('server runtime', serverRuntime, /stopAutomationRuntime\(\)/);
mustNotHave('server runtime', serverRuntime, /startAutoCrawlScheduler|startAutoPostScheduler|startAutomationSupervisor/);

mustHave('automation runtime', automationRuntime, /dedupeModules/);
mustHave('automation runtime', automationRuntime, /scheduler_startup_tick/);
mustHave('automation runtime', automationRuntime, /scheduler_tick/);
mustNotHave('automation runtime', automationRuntime, /runAutoCrawlOnce|recordAutomationHeartbeat/);
for (const moduleName of ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish']) {
  mustHave('default modules', defaultModules, new RegExp(`module: '${moduleName}'`));
}
for (const runner of ['runObservedAutoCrawl', 'runObservedAutoPost', 'runObservedAutoLike', 'runObservedQuotePublish', 'runObservedCommentPublish']) {
  mustHave('default modules', defaultModules, new RegExp(runner));
}

mustHave('shared task lock', lock, /heartbeatAutomationTaskLock/);
mustHave('shared task lock', lock, /cleanupExpiredAutomationTaskLocks/);
mustHave('shared task lock', lock, /forceReleaseAutomationTaskLock/);
mustHave('shared task lock', lock, /finally[\s\S]{0,300}releaseAutomationTaskLock/);

mustHave('crawl observed runner', crawlRunner, /withAutomationTaskLock/);
mustHave('crawl observed runner', crawlRunner, /AUTO_CRAWL_TASK_LOCK_NAME = 'auto_crawl'/);
mustHave('crawl observed runner', crawlRunner, /runAutoCrawlOnce/);
mustHave('crawl observed runner', crawlRunner, /recordAutomationHeartbeat/);
mustHave('crawl runtime status', crawlRuntime, /getAutomationTaskLock\('auto_crawl'\)/);
mustNotHave('crawl runtime status', crawlRuntime, /AutoCrawlLock|categoryMeta[\s\S]{0,80}autoCrawl/);

mustHave('crawl database config', crawlDatabaseConfig, /prisma\.category\.findMany/);
mustHave('crawl database config', crawlDatabaseConfig, /categoriesById/);
mustHave('crawl database config', crawlDatabaseConfig, /schemasBySlug/);
mustHave('crawl database config', crawlDatabaseConfig, /getAutoCrawlDatabaseCategory/);
mustHave('crawl database config', crawlDatabaseConfig, /getAutoCrawlCategorySchema/);
mustNotHave('crawl database config', crawlDatabaseConfig, /ConfigService|getDefaultConfigs|DEFAULT_|fallback|entry\.slug|entry\.id/);

mustHave('crawl main flow', crawl, /loadAutoCrawlDatabaseConfig/);
mustHave('crawl main flow', crawl, /getAutoCrawlDatabaseCategory\(databaseConfig, source\.categoryId\)/);
mustHave('crawl main flow', crawl, /getAutoCrawlCategorySchema\(databaseConfig, category\)/);
mustHave('crawl main flow', crawl, /category: \{ connect: \{ id: category\.id \} \}/);
mustHave('crawl main flow', crawl, /categoryMeta: extracted\.meta/);
mustHave('crawl main flow', crawl, /set_config\('app\.auto_crawl_write','1',true\)/);
mustHave('crawl main flow', crawl, /fetchStoredItemsForReprocess/);
mustHave('crawl main flow', crawl, /quality_checked/);
mustHave('crawl main flow', crawl, /publish_succeeded/);
mustHave('crawl main flow', crawl, /publish_failed/);
mustHave('crawl main flow', crawl, /帖子发布失败，已进入失败队列/);
mustNotHave('crawl main flow', crawl, /resolveCategoryById|findPublishCategoryMetaSchema|ConfigService|AutoCrawlLock|AutoCrawlCategoryAuthor|heartbeatAutoCrawlLock|resolveAutoCrawlFinalCategoryByRules|initializeAutoCrawlSourcesFromSeed|lastGapDetectedAt|lastGapMissingCount|CREATE TABLE IF NOT EXISTS|CREATE INDEX IF NOT EXISTS/);

mustHave('crawl AI', crawlAi, /context: AutoCrawlExtractionContext/);
mustHave('crawl AI', crawlAi, /jsonMode: true/);
mustHave('crawl AI', crawlAi, /enrichmentStatus/);
mustHave('crawl AI', crawlAi, /数据库 Category 是分类唯一事实源/);
mustHave('crawl AI', crawlAi, /后台 Meta Schema 是 Meta 唯一事实源/);
mustNotHave('crawl AI', crawlAi, /AUTO_CRAWL_META_REQUIRED_MISSING|auto_crawl_ai_required_failed|auto_crawl_ai_required_json_parse_failed|输出字段只能是 title、location|parsed\?\.location/);
mustNotHave('crawl AI', crawlAi, /import prisma|loadAutoCrawlDatabaseConfig|repairAiJson|extractSchemaLabeledMeta|categoryMetaKeys|aiStatus: 'success'/);

mustHave('crawl routes', crawlRoutes, /\/api\/admin\/auto-crawl\/execution-logs/);
mustHave('crawl routes', crawlRoutes, /runObservedAutoCrawl\(\{ trigger: 'SCHEDULED', force: false, reason \}\)/);
mustHave('crawl routes', crawlRoutes, /runObservedAutoCrawl\(\{[\s\S]{0,120}trigger: 'MANUAL'[\s\S]{0,120}force: true/);
mustHave('crawl routes', crawlRoutes, /prisma\.category\.findUnique/);
mustNotHave('crawl routes', crawlRoutes, /sources\/seed|category-routing-rules|resolveDefaultAutoCrawlAuthorUserId|repairEnabledAutoCrawlSourcesWithoutAuthor|localOnlyMode|aiEnabled|syncToTelegram/);

mustHave('crawl log', crawlLog, /MAX_STRING_LENGTH/);
mustHave('crawl log', crawlLog, /\[redacted\]/);
mustHave('crawl log', crawlLog, /FROM "AutoCrawlRun"[\s\S]*ORDER BY "startedAt" DESC/);
mustHave('crawl log', crawlLog, /runEventsFromSummary/);
mustHave('crawl log', crawlLog, /listAutoCrawlExecutionLogDetails/);
mustHave('crawl log panel', crawlExecutionPanel, /buildRunGroups/);
mustHave('crawl log panel', crawlExecutionPanel, /\/api\/admin\/auto-crawl\/execution-logs\/details/);
mustHave('crawl runtime', crawlRuntime, /staleRunningRun/);
mustHave('crawl runtime', crawlRuntime, /needsRecovery/);
mustHave('crawl admin panel', crawlPanel, /executionLogs/);
mustHave('crawl admin panel', crawlPanel, /categoryId/);
mustNotHave('crawl admin panel', crawlPanel, /restoreSeeds|localOnlyMode|aiEnabled|syncToTelegram/);
mustHave('crawl execution panel', crawlExecutionPanel, /phase/);
mustHave('interaction panel', interactionPanel, /AdminAutoCrawlExecutionLogsCompactPanel/);

mustHave('auto post runner', autoPostRunner, /runAutoPostOnce/);
mustHave('auto post runner', autoPostRunner, /module: 'auto_post'/);
mustNotHave('auto post service', autoPost, /startAutoPostScheduler|recordAutomationHeartbeat/);
mustHave('auto post service manual Telegram only', autoPost, /syncToTelegram: false/);
mustHave('auto post service manual Telegram only', autoPost, /telegramSyncStatus: TELEGRAM_SYNC_STATUS_NONE as any/);
mustNotHave('auto post service manual Telegram only', autoPost, /syncToTelegram: config\.syncToTelegram|TELEGRAM_SYNC_STATUS_PENDING/);
mustNotHave('auto post config manual Telegram only', autoPostConfig, /syncToTelegram/);
mustNotHave('auto post admin manual Telegram only', autoPostPanel, /同步 Telegram|syncToTelegram/);
for (const moduleName of ['auto_like', 'quote_publish', 'comment_publish']) {
  mustHave('interaction runner', interactionRunner, new RegExp(`module: '${moduleName}'`));
}
mustHave('quote publish', quote, /no_quality_candidate_post/);
mustHave('automation health', health, /'auto_crawl'/);
mustHave('package scripts', packageScripts, /test:automation-chain/);

console.log('[automation-chain-guards] passed');
