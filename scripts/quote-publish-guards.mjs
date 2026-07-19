import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertIncludes(file, source, pattern, message) {
  const ok = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  if (!ok) throw new Error(`${file}: ${message}`);
}

function assertNotIncludes(file, source, pattern, message) {
  const ok = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  if (ok) throw new Error(`${file}: ${message}`);
}

const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260828000000_add_quote_publish_runs/migration.sql');
const service = read('server/services/quote-publish-v5.service.ts');
const config = read('server/services/quote-publish.config.ts');
const routes = read('server/routes/quote-publish.routes.ts');
const automationRuntimeSource = [
  read('server/services/automation/default-automation-modules.ts'),
  read('server/services/automation/automation-runtime.ts'),
].join('\n');
const observedRunner = read('server/services/interaction-observed-runner.service.ts');
const lockService = read('server/services/automation-task-lock.service.ts');
const adminPanel = read('src/features/admin/AdminQuotePublishPanel.tsx');
const interactionPanel = read('src/features/admin/AdminInteractionConfigPanel.tsx');
const adminMeta = read('src/features/admin/adminMeta.tsx');
const packageJson = JSON.parse(read('package.json'));

assertIncludes('prisma/schema.prisma', schema, 'model QuotePublishRun', 'QuotePublishRun model is required.');
assertIncludes('migration.sql', migration, 'CREATE TABLE IF NOT EXISTS "QuotePublishRun"', 'QuotePublishRun migration is required.');
assertIncludes('migration.sql', migration, '"sourcePostId"', 'sourcePostId column is required.');
assertIncludes('migration.sql', migration, '"generatedContent" TEXT', 'generated content audit column is required.');

assertIncludes('quote-publish.config.ts', config, 'enabled: false', 'quote publish must default to disabled.');
assertIncludes('quote-publish.config.ts', config, 'checkIntervalMinutes: { min: 30, max: 720, fallback: 120 }', 'default check interval must stay 2 hours with safe bounds.');
assertIncludes('quote-publish.config.ts', config, 'dailyLimit: { min: 0, max: 50, fallback: 8 }', 'default daily limit must stay 8 with safe bounds.');
assertIncludes('quote-publish.config.ts', config, 'checkIntervalMinutes: LIMITS.checkIntervalMinutes.fallback', 'default check interval must come from shared limits.');
assertIncludes('quote-publish.config.ts', config, 'dailyLimit: LIMITS.dailyLimit.fallback', 'default daily limit must come from shared limits.');
assertIncludes('quote-publish.config.ts', config, 'normalizeQuotePublishConfig(safeInput, current)', 'PATCH must normalize safe input against current saved config.');
assertIncludes('quote-publish.config.ts', config, 'clampInteger(value: unknown, limit:', 'numeric config must clamp into backend-supported limits.');
assertIncludes('quote-publish.config.ts', config, 'Math.min(limit.max, Math.max(limit.min, Math.round(parsed)))', 'numeric config clamp must preserve configured min/max bounds.');

assertIncludes('quote-publish-v5.service.ts', service, 'withAutomationTaskLock', 'quote publish must use the shared task lock wrapper.');
assertIncludes('quote-publish-v5.service.ts', service, "const QUOTE_TASK_LOCK_NAME = 'quote_publish'", 'quote publish must keep an independent lock name.');
assertIncludes('quote-publish-v5.service.ts', service, 'force: options.force', 'manual force must reach lock acquisition.');
assertIncludes('quote-publish-v5.service.ts', service, "skipReason: 'another_instance_running'", 'lock conflict must be recorded.');
assertIncludes('quote-publish-v5.service.ts', service, 'lock: taskLock.lock', 'lock conflict response must include lock details.');
assertIncludes('quote-publish-v5.service.ts', service, 'p."quotedPostId" IS NULL', 'candidate query must exclude quote posts.');
assertIncludes('quote-publish-v5.service.ts', service, "userType: 'ROBOT'", 'robot author selection is required.');
assertIncludes('quote-publish-v5.service.ts', service, 'syncToTelegram: false', 'auto-created quote posts must not auto-sync to Telegram.');
assertIncludes('quote-publish-v5.service.ts', service, 'telegramSyncStatus: TELEGRAM_SYNC_STATUS_NONE as any', 'auto-created quote posts must start as manually syncable.');
assertNotIncludes('quote-publish-v5.service.ts', service, 'syncToTelegram: config.syncToTelegram', 'Telegram auto-sync must stay removed from quote publishing.');
assertNotIncludes('quote-publish.config.ts', config, 'syncToTelegram', 'quote publish config must not expose Telegram auto-sync.');
assertNotIncludes('AdminQuotePublishPanel.tsx', adminPanel, '同步 Telegram', 'quote publish admin must not expose Telegram auto-sync.');
assertIncludes('quote-publish-v5.service.ts', service, 'quoteCount: { increment: 1 }', 'source quoteCount increment is required.');
assertNotIncludes('quote-publish-v5.service.ts', service, 'CREATE TABLE IF NOT EXISTS "QuotePublishRun"', 'QuotePublishRun table creation must stay in migrations.');

assertIncludes('automation-task-lock.service.ts', lockService, 'withAutomationTaskLock', 'shared lock wrapper is required.');
assertIncludes('automation-task-lock.service.ts', lockService, 'heartbeatAutomationTaskLock', 'lock heartbeat is required.');
assertIncludes('automation-task-lock.service.ts', lockService, 'forceReleaseAutomationTaskLock', 'admin force release is required.');
assertIncludes('automation-task-lock.service.ts', lockService, 'cleanupExpiredAutomationTaskLocks', 'expired lock cleanup is required.');

if (fs.existsSync(path.join(root, 'server/services/quote-publish.service.ts'))) {
  throw new Error('quote-publish.service.ts: compatibility facade must stay removed; import quote-publish-v5.service.ts directly.');
}

assertIncludes('automation runtime sources', automationRuntimeSource, "module: 'quote_publish'", 'automation runtime must register quote scheduling.');
assertIncludes('automation runtime sources', automationRuntimeSource, 'runObservedQuotePublish', 'automation runtime must use the observed quote runner.');
assertNotIncludes('automation runtime sources', automationRuntimeSource, 'runQuotePublishOnce', 'automation runtime must not call quote business run directly.');
assertIncludes('interaction-observed-runner.service.ts', observedRunner, 'runQuotePublishOnce', 'observed runner must be the only scheduler-facing quote business caller.');
assertIncludes('interaction-observed-runner.service.ts', observedRunner, "module: 'quote_publish'", 'observed runner must write quote_publish heartbeat.');

assertIncludes('quote-publish.routes.ts', routes, "app.post('/api/admin/quote-publish/run-now'", 'manual run route is required.');
assertIncludes('quote-publish.routes.ts', routes, 'runObservedQuotePublish', 'manual run route must use observed runner.');
assertNotIncludes('quote-publish.routes.ts', routes, 'runQuotePublishOnce', 'manual run route must not call business run directly.');
assertIncludes('quote-publish.routes.ts', routes, 'force: parseForce', 'manual run route must support force.');
assertIncludes('quote-publish.routes.ts', routes, 'adminOnly', 'quote publish routes must be admin only.');

assertIncludes('adminMeta.tsx', adminMeta, "'quote-publish'", 'interaction submenu must include quote publish.');
assertIncludes('AdminInteractionConfigPanel.tsx', interactionPanel, '参数配置', 'interaction child page must expose config tab.');
assertIncludes('AdminInteractionConfigPanel.tsx', interactionPanel, '执行日志', 'interaction child page must expose execution log tab.');
assertIncludes('AdminQuotePublishPanel.tsx', adminPanel, '/api/admin/quote-publish/config', 'panel must load config API.');
assertIncludes('AdminInteractionConfigPanel.tsx', interactionPanel, /\/api\/admin\/\$\{module\}\/run-now/, 'execution log tab must call manual run API.');
assertNotIncludes('AdminQuotePublishPanel.tsx', adminPanel, '/api/admin/quote-publish/runs', 'config panel must not load execution records.');
assertIncludes('AdminInteractionConfigPanel.tsx', interactionPanel, /\/api\/admin\/\$\{module\}\/runs\?limit=20/, 'execution log tab must load quote run records.');
assertIncludes('AdminInteractionConfigPanel.tsx', interactionPanel, 'lockMessage(payload?.lock || payload?.run?.lock)', 'manual run feedback must include lock details.');

assertIncludes('package.json', JSON.stringify(packageJson.scripts || {}), 'test:quote-publish', 'package.json must expose test:quote-publish.');

console.log('Quote publish guards passed.');
