import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function mustHave(label, content, text) {
  assert.ok(content.includes(text), `${label} must include ${text}`);
}
function mustNotHave(label, content, text) {
  assert.ok(!content.includes(text), `${label} must not include ${text}`);
}
function mustNotMatch(label, content, pattern, message) {
  assert.ok(!pattern.test(content), `${label} must not match ${pattern}: ${message}`);
}

const packageJson = JSON.parse(read('package.json'));
const serverEntry = read('server.ts');
const bootstrap = read('server/bootstrap.ts');
const serverRuntime = read('server/startup/server-runtime.ts');
const automationModule = read('server/services/automation/automation-module.ts');
const automationRuntime = read('server/services/automation/automation-runtime.ts');
const defaultAutomationModules = read('server/services/automation/default-automation-modules.ts');
const automationStatus = read('server/services/automation/automation-status.service.ts');
const autoCrawlBusiness = read('server/services/auto-crawl.service.ts');
const autoCrawlRoutes = read('server/routes/auto-crawl.routes.ts');
const autoCrawlObservedRunner = read('server/services/auto-crawl-observed-runner.service.ts');
const autoCrawlRuntimeStatus = read('server/services/auto-crawl-runtime-status.service.ts');
const autoPostObservedRunner = read('server/services/auto-post-observed-runner.service.ts');
const interactionObservedRunner = read('server/services/interaction-observed-runner.service.ts');
const automationHealth = read('server/services/automation-health.service.ts');
const lock = read('server/services/automation-task-lock.service.ts');
const autoPost = read('server/services/auto-post.service.ts');
const autoLike = read('server/services/auto-like.service.ts');
const quote = read('server/services/quote-publish-v5.service.ts');
const comment = read('server/services/comment-publish-v8.service.ts');
const interactionExecutionLog = read('server/services/interaction-automation-execution-log.service.ts');
const platformAi = read('server/services/platform-ai-config.service.ts');
const automationAi = read('server/services/automation-ai.service.ts');
const crawlContentAi = read('server/services/crawl-content-ai.service.ts');
const crawlMetaNormalizer = read('server/services/crawl-category-meta-normalize.service.ts');
const configDefaults = read('server/config-defaults.ts');
const adminInteractionPanel = read('src/features/admin/AdminInteractionConfigPanel.tsx');
const adminAutomationRoutes = read('server/routes/admin-automation.routes.ts');
const quoteRoutes = read('server/routes/quote-publish.routes.ts');
const commentRoutes = read('server/routes/admin-comment-publish.routes.ts');
const autoLikeRoutes = read('server/routes/admin-auto-like.routes.ts');
const depositScanner = read('server/services/deposit-scanner.service.ts');

assert.match(packageJson.scripts?.start || '', /node dist\/server\.cjs/, 'production start must run the bundled server entry.');
mustHave('server entry', serverEntry, "await import('./server/bootstrap')");
mustHave('bootstrap', bootstrap, 'startServerRuntime(app, {');

// One automation entrypoint only. New automation capabilities must register modules here,
// never by starting their own ad-hoc scheduler from server startup.
mustHave('server runtime', serverRuntime, 'startAutomationRuntime(createDefaultAutomationModules({');
mustHave('server runtime', serverRuntime, "../services/automation/default-automation-modules");
mustHave('server runtime', serverRuntime, "../services/automation/automation-runtime");
mustNotHave('server runtime', serverRuntime, 'startAutoCrawlScheduler()');
mustNotHave('server runtime', serverRuntime, 'startAutoPostScheduler({');
mustNotHave('server runtime', serverRuntime, 'startAutomationSupervisor({');
mustNotHave('server runtime', serverRuntime, '../services/auto-crawl-scheduler.service');
mustNotHave('server runtime', serverRuntime, '../services/auto-post-scheduler.service');
mustNotHave('server runtime', serverRuntime, '../services/automation-supervisor.service');
mustNotHave('server runtime', serverRuntime, 'runAutoCrawlOnce');
mustNotHave('server runtime', serverRuntime, 'runAutoPostOnce');
mustNotHave('server runtime', serverRuntime, 'runQuotePublishOnce');
mustNotHave('server runtime', serverRuntime, 'runCommentPublishOnce');
mustNotHave('server runtime', serverRuntime, 'runAutoLikeOnce');
mustNotHave('server runtime', serverRuntime, 'recordAutomationHeartbeat');
mustHave('server runtime', serverRuntime, 'startTronDepositScanner()');

// Runtime contract: scheduler is generic; modules own business behavior through observed runners.
mustHave('automation module contract', automationModule, 'export type AutomationRuntimeModule');
mustHave('automation module contract', automationModule, 'module: AutomationModuleName');
mustHave('automation module contract', automationModule, 'nextIntervalMs?: () => Promise<number> | number');
mustHave('automation runtime', automationRuntime, 'startAutomationRuntime(modules: AutomationRuntimeModule[])');
mustHave('automation runtime', automationRuntime, 'dedupeModules(modules)');
mustHave('automation runtime', automationRuntime, "module.run({ trigger: 'SCHEDULED', reason })");
mustHave('automation runtime', automationRuntime, 'scheduleModule(module, false)');
mustNotHave('automation runtime', automationRuntime, 'runAutoCrawlOnce');
mustNotHave('automation runtime', automationRuntime, 'runAutoPostOnce');
mustNotHave('automation runtime', automationRuntime, 'runQuotePublishOnce');
mustNotHave('automation runtime', automationRuntime, 'runCommentPublishOnce');
mustNotHave('automation runtime', automationRuntime, 'runAutoLikeOnce');

for (const moduleName of ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish']) {
  mustHave('default automation modules', defaultAutomationModules, `module: '${moduleName}'`);
}
mustHave('default automation modules', defaultAutomationModules, 'STARTUP_DELAY_MS');
mustHave('default automation modules', defaultAutomationModules, 'startupDelayMs: STARTUP_DELAY_MS.autoCrawl');
mustHave('default automation modules', defaultAutomationModules, 'startupDelayMs: STARTUP_DELAY_MS.autoPost');
mustHave('default automation modules', defaultAutomationModules, 'startupDelayMs: STARTUP_DELAY_MS.autoLike');
mustHave('default automation modules', defaultAutomationModules, 'startupDelayMs: STARTUP_DELAY_MS.quotePublish');
mustHave('default automation modules', defaultAutomationModules, 'startupDelayMs: STARTUP_DELAY_MS.commentPublish');
mustNotHave('default automation modules', defaultAutomationModules, 'startupDelayMs: 1_000');
mustHave('default automation modules', defaultAutomationModules, 'runObservedAutoCrawl');
mustHave('default automation modules', defaultAutomationModules, 'runObservedAutoPost');
mustHave('default automation modules', defaultAutomationModules, 'runObservedAutoLike');
mustHave('default automation modules', defaultAutomationModules, 'runObservedQuotePublish');
mustHave('default automation modules', defaultAutomationModules, 'runObservedCommentPublish');
mustNotHave('default automation modules', defaultAutomationModules, 'runAutoCrawlOnce');
mustNotHave('default automation modules', defaultAutomationModules, 'runAutoPostOnce');
mustNotHave('default automation modules', defaultAutomationModules, 'runQuotePublishOnce');
mustNotHave('default automation modules', defaultAutomationModules, 'runCommentPublishOnce');
mustNotHave('default automation modules', defaultAutomationModules, 'runAutoLikeOnce');

// Unified automation status and lock operations are the stable admin read/ops model.
mustHave('automation status service', automationStatus, 'getAutomationStatusSnapshot');
mustHave('automation status service', automationStatus, 'getAutomationTaskLocks');
mustHave('automation status service', automationStatus, 'listAutomationHeartbeats');
mustHave('automation status service', automationStatus, "'auto_crawl'");
mustHave('automation status service', automationStatus, "'auto_post'");
mustHave('automation status service', automationStatus, "'auto_like'");
mustHave('automation status service', automationStatus, "'quote_publish'");
mustHave('automation status service', automationStatus, "'comment_publish'");
mustHave('admin automation routes', adminAutomationRoutes, 'registerAdminAutomationRoutes');
mustHave('admin automation routes', adminAutomationRoutes, '/api/admin/automation/status');
mustHave('admin automation routes', adminAutomationRoutes, '/api/admin/automation/heartbeats');
mustHave('admin automation routes', adminAutomationRoutes, '/api/admin/automation/locks/:module/release');
mustHave('admin automation routes', adminAutomationRoutes, 'getAutomationStatusSnapshot');
mustHave('admin automation routes', adminAutomationRoutes, 'forceReleaseAutomationTaskLock(moduleName)');
mustHave('admin automation routes', adminAutomationRoutes, 'const moduleName = parseAutomationModule(req.params.module)');
mustNotHave('admin automation routes', adminAutomationRoutes, 'forceReleaseAutomationTaskLock(req.params.module');
mustHave('quote routes', quoteRoutes, 'registerAdminAutomationRoutes(app, {');
mustNotHave('quote routes', quoteRoutes, '/api/admin/automation/status');
mustNotHave('quote routes', quoteRoutes, 'forceReleaseAutomationTaskLock');

// Routes may trigger observed/manual runs, but config/source saves must not force full crawl scans.
mustHave('auto-crawl routes', autoCrawlRoutes, 'runObservedAutoCrawl');
mustHave('auto-crawl routes', autoCrawlRoutes, "trigger: 'MANUAL', force: true, reason: 'manual_run_now'");
mustHave('auto-crawl routes', autoCrawlRoutes, "trigger: 'SCHEDULED', force: false, reason");
mustHave('auto-crawl routes source save wake', autoCrawlRoutes, 'markAutoCrawlSourceDueNow(saved.sourceId)');
mustHave('auto-crawl routes source save wake', autoCrawlRoutes, "scheduleRun('source_saved_due')");
mustNotHave('auto-crawl routes source save sync run', autoCrawlRoutes, 'source_saved_run_now');
mustNotHave('auto-crawl routes', autoCrawlRoutes, "trigger: 'SCHEDULED', force: true");
mustNotHave('auto-crawl routes', autoCrawlRoutes, 'runAutoCrawlOnce');
mustNotHave('auto-crawl routes', autoCrawlRoutes, 'recordAutomationHeartbeat');

// Auto crawl is platform-locked at the observed-runner boundary. The inner business
// service may keep its legacy defensive lock while migrations continue, but every
// real entrypoint must hit AutomationTaskLock first and runtime status must read that lock.
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, 'withAutomationTaskLock');
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, "const AUTO_CRAWL_TASK_LOCK_NAME = 'auto_crawl'");
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, 'AUTO_CRAWL_TASK_LOCK_TTL_MS');
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, 'runAutoCrawlOnce');
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, 'recordAutomationHeartbeat');
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, "module: 'auto_crawl'");
mustHave('auto-crawl observed runner', autoCrawlObservedRunner, 'force: false');
mustHave('auto-crawl runtime status', autoCrawlRuntimeStatus, "getAutomationTaskLock('auto_crawl')");
mustNotHave('auto-crawl runtime status', autoCrawlRuntimeStatus, 'FROM "AutoCrawlLock"');

// Observed runners are the only layer allowed to write automation heartbeats.
mustHave('auto-post observed runner', autoPostObservedRunner, 'runAutoPostOnce');
mustHave('auto-post observed runner', autoPostObservedRunner, "module: 'auto_post'");
mustHave('auto-post observed runner', autoPostObservedRunner, 'recordAutomationHeartbeat');
mustHave('interaction observed runner', interactionObservedRunner, 'runQuotePublishOnce');
mustHave('interaction observed runner', interactionObservedRunner, 'runCommentPublishOnce');
mustHave('interaction observed runner', interactionObservedRunner, 'runAutoLikeOnce');
mustHave('interaction observed runner', interactionObservedRunner, "module: 'quote_publish'");
mustHave('interaction observed runner', interactionObservedRunner, "module: 'comment_publish'");
mustHave('interaction observed runner', interactionObservedRunner, "module: 'auto_like'");
mustHave('interaction observed runner', interactionObservedRunner, 'recordAutomationHeartbeat');

// Business services may run business logic and locks, but must not own startup scheduling or heartbeat writes.
mustHave('auto-crawl business service', autoCrawlBusiness, 'runAutoCrawlOnce');
mustNotHave('auto-crawl business service', autoCrawlBusiness, 'export function startAutoCrawlScheduler');
mustNotHave('auto-crawl business service', autoCrawlBusiness, 'function scheduleNextAutoCrawl');
mustHave('auto-post business service', autoPost, 'withAutomationTaskLock');
mustNotHave('auto-post business service', autoPost, 'startAutoPostScheduler');
mustNotHave('auto-post business service', autoPost, 'recordAutomationHeartbeat');
mustHave('auto-like business service', autoLike, 'withAutomationTaskLock');
mustHave('auto-like business service', autoLike, 'runAutoLikeOnce');
mustNotHave('auto-like business service', autoLike, 'startAutoLikeScheduler');
mustNotHave('auto-like business service', autoLike, 'stopAutoLikeScheduler');
mustNotHave('auto-like business service', autoLike, 'setManagedTimeout');
mustNotHave('auto-like business service', autoLike, 'scheduleNext(');
mustNotHave('auto-like business service', autoLike, 'runScheduledTick');
mustHave('quote publish business service', quote, 'withAutomationTaskLock');
mustNotHave('quote publish business service', quote, 'recordAutomationHeartbeat');
mustHave('comment publish business service', comment, 'withAutomationTaskLock');
mustNotHave('comment publish business service', comment, 'recordAutomationHeartbeat');

// Crawl AI meta must be platform-schema driven, not free-form LLM output.
mustHave('crawl content AI', crawlContentAi, 'normalizeCrawlCategoryMeta');
mustHave('crawl content AI', crawlContentAi, 'metaStandardization');
mustHave('crawl content AI', crawlContentAi, '当前分类允许的 Meta Schema');
mustHave('crawl content AI', crawlContentAi, 'Meta 提取多少写多少，不完整不影响发布');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'assertSchemaMatchesCategory');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'normalizeToLocationPreset');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'exactConfiguredOption');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'normalizePlainNumber');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'strict_number');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'strict_boolean');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'unexpectedKeys');
mustHave('crawl meta normalizer', crawlMetaNormalizer, 'rejected');

// Health and lock infrastructure are the shared substrate for modules.
for (const moduleName of ['auto_like', 'quote_publish', 'comment_publish', 'auto_post', 'auto_crawl']) {
  mustHave('automation health modules', automationHealth, `'${moduleName}'`);
}
mustHave('task lock', lock, 'heartbeatStaleMsForTtl');
mustHave('task lock', lock, 'withAutomationTaskLock');
mustHave('task lock', lock, 'forceReleaseAutomationTaskLock');
mustHave('admin automation logs', adminInteractionPanel, 'AdminAutoCrawlExecutionLogsCompactPanel');
mustHave('admin automation logs', adminInteractionPanel, '执行过程');
mustHave('admin automation logs', adminInteractionPanel, 'processEvents');
mustHave('interaction execution logs', interactionExecutionLog, 'InteractionAutomationExecutionEvent');
mustHave('interaction execution logs', interactionExecutionLog, 'logInteractionAutomationEvent');
mustHave('interaction execution logs', interactionExecutionLog, 'attachInteractionAutomationExecutionEvents');
mustHave('interaction execution logs', interactionExecutionLog, "module: InteractionAutomationModule");
mustHave('auto post execution logs', autoPost, "module: 'auto_post'");
mustHave('auto post execution logs', autoPost, "phase: 'run_started'");
mustHave('quote execution logs', quote, "module: 'quote_publish'");
mustHave('quote execution logs', quote, "phase: 'quality_checked'");
mustHave('comment execution logs', comment, "module: 'comment_publish'");
mustHave('auto like execution logs', autoLike, "module: 'auto_like'");
for (const phase of ['run_started', 'config_loaded', 'lock_acquired', 'candidates_loaded', 'candidate_selected', 'run_finished']) {
  mustHave('auto like execution logs', autoLike, `phase: '${phase}'`);
}
mustNotHave('admin automation logs', adminInteractionPanel, '原始明细');
mustNotHave('admin automation logs', adminInteractionPanel, '批量数量');

// AI and deposit scanner contracts stay explicit because automation quality depends on them.
mustHave('platform AI', platformAi, 'PLATFORM_AI_API_KEY');
mustHave('platform AI config clamps', platformAi, 'PLATFORM_AI_TIMEOUT_LIMIT');
mustHave('platform AI config clamps', platformAi, 'PLATFORM_AI_REVIEW_INTERVAL_LIMIT');
mustHave('platform AI config clamps', platformAi, 'normalizePlatformAiBaseUrl');
mustHave('platform AI runtime timeout clamp', platformAi, 'clampInt(input.timeoutMs ?? config.timeoutMs, PLATFORM_AI_TIMEOUT_LIMIT)');
mustHave('platform AI', platformAi, 'jsonMode?: boolean');
mustHave('platform AI', platformAi, "responseMimeType: 'application/json'");
mustHave('platform AI', platformAi, "response_format: { type: 'json_object' }");
mustNotHave('platform AI', platformAi, 'if (!config.enabled)');
mustNotHave('automation AI', automationAi, `platform_ai_${'disabled'}`);
mustHave('automation AI', automationAi, 'jsonMode: input.jsonMode');
mustHave('deposit scanner', depositScanner, 'tronDepositScannerStopped');

// Manual/admin routes must stay observed.
mustHave('quote routes', quoteRoutes, 'runObservedQuotePublish');
mustNotHave('quote routes', quoteRoutes, 'runQuotePublishOnce');
mustHave('comment routes', commentRoutes, 'runObservedCommentPublish');
mustNotHave('comment routes', commentRoutes, 'runCommentPublishOnce');
mustHave('auto-like routes', autoLikeRoutes, 'runObservedAutoLike');
mustNotHave('auto-like routes', autoLikeRoutes, 'runAutoLikeOnce');

console.log('[automation-engine-contract-guards] passed');
