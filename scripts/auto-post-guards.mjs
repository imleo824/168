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
const migration = read('prisma/migrations/20260829000000_add_auto_post_content/migration.sql');
const removeLegacyConfigMigration = read('prisma/migrations/20260902000000_remove_legacy_auto_post_global_config/migration.sql');
const runStateConstraintsMigration = read('prisma/migrations/20260903000000_constrain_automation_run_state/migration.sql');
const service = read('server/services/auto-post.service.ts');
const scheduler = [
  read('server/services/automation/default-automation-modules.ts'),
  read('server/services/automation/automation-runtime.ts'),
].join('\n');
const observedRunner = read('server/services/auto-post-observed-runner.service.ts');
const config = read('server/services/auto-post.config.ts');
const routes = read('server/routes/auto-post.routes.ts');
const autoCrawlService = read('server/services/auto-crawl.service.ts');
const autoCrawlRoutes = read('server/routes/auto-crawl.routes.ts');
const feedRepository = read('server/repositories/feed.repository.ts');
const bootstrap = read('server/bootstrap.ts');
const serverRuntime = read('server/startup/server-runtime.ts');
const postService = read('server/services/post/index.ts');
const homeFeedService = read('server/services/home-feed.service.ts');
const adminTypes = read('src/features/admin/adminTypes.ts');
const adminMeta = read('src/features/admin/adminMeta.tsx');
const adminPage = read('src/features/admin/AdminPage.tsx');
const adminPanel = read('src/features/admin/AdminAutoPostPanel.tsx');
const adminInteractionPanel = read('src/features/admin/AdminInteractionConfigPanel.tsx');
const appTypes = read('src/types.ts');
const seed = read('scripts/seed-auto-post-content.mjs');
const seedContent = read('data/auto-post-content.seed.jsonl');
const packageJson = JSON.parse(read('package.json'));

assertIncludes('prisma/schema.prisma', schema, 'model AutoPostContent', 'AutoPostContent model is required.');
assertIncludes('prisma/schema.prisma', schema, 'model AutoPostRun', 'AutoPostRun model is required.');
assertIncludes('prisma/schema.prisma', schema, 'contentHash  String    @unique', 'contentHash must be globally unique.');
assertIncludes('prisma/schema.prisma', schema, 'usedAt       DateTime?', 'usedAt is required for permanent no-repeat behavior.');
assertIncludes('prisma/schema.prisma', schema, 'sourceName   String', 'sourceName audit field is required.');
assertIncludes('prisma/schema.prisma', schema, 'sourceUrl    String', 'sourceUrl audit field is required.');
assertIncludes('prisma/schema.prisma', schema, 'license      String', 'license audit field is required.');

assertIncludes('migration.sql', migration, 'CREATE TABLE IF NOT EXISTS "AutoPostContent"', 'AutoPostContent migration is required.');
assertIncludes('migration.sql', migration, 'CREATE TABLE IF NOT EXISTS "AutoPostRun"', 'AutoPostRun migration is required.');
assertIncludes('migration.sql', migration, 'AutoPostContent_contentHash_key', 'contentHash unique index is required.');
assertIncludes('remove legacy auto post config migration', removeLegacyConfigMigration, 'auto_post_topicConfigs', 'legacy global config migration must preserve topicConfigs.');
assertIncludes('remove legacy auto post config migration', removeLegacyConfigMigration, 'WHERE "key" IN (\'auto_post_authorUserId\', \'auto_post_categoryId\', \'auto_post_dailyLimit\')', 'legacy global config keys must be deleted.');
assertIncludes('automation run state migration', runStateConstraintsMigration, 'AutoPostContent_topic_check', 'auto post content topic check constraint is required.');
assertIncludes('automation run state migration', runStateConstraintsMigration, 'AutoPostRun_trigger_check', 'auto post run trigger check constraint is required.');
assertIncludes('automation run state migration', runStateConstraintsMigration, 'AutoPostRun_status_check', 'auto post run status check constraint is required.');
assertIncludes('automation run state migration', runStateConstraintsMigration, 'AutoPostRun_topic_check', 'auto post run topic check constraint is required.');

assertIncludes('auto-post.config.ts', config, 'enabled: false', 'auto post must default to disabled.');
assertIncludes('auto-post.config.ts', config, 'checkIntervalMinutes: 60', 'default interval must be one hour.');
assertIncludes('auto-post.config.ts', config, 'dailyLimit: 12', 'default daily limit must be 12.');
assertNotIncludes('auto-post.config.ts', config, 'legacyAuthorUserId', 'auto post config must not keep legacy global author fallback.');
assertNotIncludes('auto-post.config.ts', config, 'legacyCategoryId', 'auto post config must not keep legacy global category fallback.');
assertNotIncludes('auto-post.config.ts', config, 'legacyDailyLimit', 'auto post config must not keep legacy global daily limit fallback.');
assertNotIncludes('auto-post.config.ts', config, "'authorUserId',", 'CONFIG_KEYS must not write legacy global author config.');
assertNotIncludes('auto-post.config.ts', config, "'categoryId',", 'CONFIG_KEYS must not write legacy global category config.');

assertIncludes('auto-post.service.ts', service, 'AUTO_POST_TOPICS', 'fixed topic list is required.');
assertNotIncludes('auto-post.service.ts', service, 'ensureAutoPostSchema', 'auto post service must not repair schema at runtime.');
assertNotIncludes('auto-post.service.ts', service, 'CREATE TABLE IF NOT EXISTS "AutoPostContent"', 'AutoPostContent table creation must stay in migrations.');
assertNotIncludes('auto-post.service.ts', service, 'CREATE TABLE IF NOT EXISTS "AutoPostRun"', 'AutoPostRun table creation must stay in migrations.');
assertNotIncludes('auto-post.service.ts', service, 'CREATE INDEX IF NOT EXISTS "idx_auto_post', 'AutoPost indexes must stay in migrations.');
assertIncludes('auto-post.service.ts', service, 'buildAutoPostContentHash', 'content hash helper is required.');
assertIncludes('auto-post.service.ts', service, 'usedAt: null', 'run must only pick unused content.');
assertIncludes('auto-post.service.ts', service, 'usedAt: now', 'successful claim must mark content used.');
assertIncludes('auto-post.service.ts', service, 'postId: created.id', 'successful post must be linked back to content.');
assertIncludes('auto-post.service.ts', service, 'withAutomationTaskLock', 'auto post must use the shared TTL task lock.');
assertIncludes('auto-post.service.ts', service, "AUTO_POST_TASK_LOCK_NAME = 'auto_post'", 'auto post must keep an independent task lock name.');
assertIncludes('auto-post.service.ts', service, 'AUTO_POST_TASK_LOCK_TTL_MS = 20 * 60 * 1000', 'auto post lock TTL must cover long scheduled runs.');
assertIncludes('auto-post.service.ts', service, 'another_instance_running', 'auto post must record lock contention as skipped.');
assertIncludes('auto-post.service.ts', service, "skipReason: 'disabled'", 'disabled must be recorded as a skipped AutoPostRun inside the business run.');
assertNotIncludes('auto-post.service.ts', service, 'pg_try_advisory_lock', 'auto post must not use session advisory locks.');
assertNotIncludes('auto-post.service.ts', service, 'pg_advisory_unlock', 'auto post must not release session advisory locks.');
assertNotIncludes('auto-post.service.ts', service, 'startAutoPostScheduler', 'auto post business service must not own scheduler.');
assertNotIncludes('auto-post.service.ts', service, 'recordAutomationHeartbeat', 'auto post business service must not write heartbeat directly.');
assertIncludes('auto-post.service.ts', service, "source: AUTO_POST_SOURCE", 'post source must be auto_post_curated_content.');
assertIncludes('server/services/post/index.ts', postService, "AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content'", 'public post service must know the hidden auto-post source.');
assertIncludes('server/services/post/index.ts', postService, 'buildHiddenAutoPostRobotFilter', 'public post service must filter robot auto-post curated content.');
assertIncludes('server/services/post/index.ts', postService, 'isHiddenAutoPostRobotPost(post)', 'post detail must hide robot auto-post curated content from non-owners.');
assertNotIncludes('server/services/home-feed.service.ts', homeFeedService, 'AUTO_POST_CURATED_SOURCE', 'home feed service must not source-filter recommendation candidates.');
assertIncludes('server/repositories/feed.repository.ts', feedRepository, 'isLegacyRobotSourceExclusion', 'feed repository must guard against stale hidden auto-post source filters.');
assertIncludes('server/bootstrap.ts', bootstrap, "HIDDEN_AUTO_POST_CURATED_SOURCE = 'auto_post_curated_content'", 'bootstrap visibility checks must know hidden auto-post source.');
assertIncludes('server/bootstrap.ts', bootstrap, "post?.source !== HIDDEN_AUTO_POST_CURATED_SOURCE || user?.userType !== 'ROBOT'", 'auto-post robot content must not be broadcast into chat display.');
assertIncludes('auto-post.service.ts', service, "from '../platform-time'", 'daily run limit must use the shared platform timezone helper.');
assertIncludes('auto-post.service.ts', service, 'const todayRange = getPlatformDayRange();', 'daily run limit must be based on platform today.');
assertIncludes('auto-post.service.ts', service, 'createdAt: { gte: todayRange.start, lt: todayRange.end }', 'daily run limit must use a closed platform-day range.');
assertIncludes('auto-post.service.ts', service, 'AUTO_POST_RUN_RETENTION_DAYS = 3', 'auto post backend run logs must be retained for only 3 days.');
assertIncludes('auto-post.service.ts', service, 'cleanupExpiredAutoPostRuns', 'auto post backend run logs must be cleaned automatically.');
assertIncludes('auto-post.service.ts', service, 'autoPostRun.deleteMany', 'auto post cleanup must delete only backend run logs.');
assertIncludes('auto-post.service.ts', service, 'export async function getAutoPostContentStats()', 'content stats must be computed on the backend.');
assertNotIncludes('auto-post.service.ts', service, 'GoogleGenAI', 'auto post must not generate content with AI.');
assertNotIncludes('auto-post.service.ts', service, 'generateContent', 'auto post must not call AI generation.');

assertIncludes('automation runtime sources', scheduler, 'runObservedAutoPost', 'scheduler must call the observed auto-post runner.');
assertIncludes('automation runtime sources', scheduler, "trigger: 'SCHEDULED'", 'scheduler must use scheduled trigger.');
assertIncludes('automation runtime sources', scheduler, /run:\s*\(\{ reason \}\)[\s\S]*runObservedAutoPost\(\{[\s\S]*reason/, 'scheduler must label scheduled ticks.');
assertNotIncludes('automation runtime sources', scheduler, 'runAutoPostOnce', 'scheduler must not call business run directly.');
assertNotIncludes('automation runtime sources', scheduler, 'recordAutomationHeartbeat', 'scheduler must not write heartbeat directly.');
assertIncludes('auto-post-observed-runner.service.ts', observedRunner, 'runAutoPostOnce', 'observed runner must call auto-post business run.');
assertIncludes('auto-post-observed-runner.service.ts', observedRunner, "module: 'auto_post'", 'observed runner must write auto_post heartbeat.');
assertIncludes('auto-post-observed-runner.service.ts', observedRunner, 'runId: run?.id || null', 'observed runner must bind heartbeat to run id.');

assertIncludes('auto-post.routes.ts', routes, "app.get('/api/admin/auto-post/config'", 'config read route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.get('/api/admin/auto-post/stats'", 'content stats route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.patch('/api/admin/auto-post/config'", 'config update route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.post('/api/admin/auto-post/run-now'", 'manual run route is required.');
assertIncludes('auto-post.routes.ts', routes, 'runObservedAutoPost', 'manual run route must use observed runner.');
assertNotIncludes('auto-post.routes.ts', routes, 'runAutoPostOnce', 'manual run route must not call business run directly.');
assertIncludes('auto-post.routes.ts', routes, "app.get('/api/admin/auto-post/runs'", 'run list route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.get('/api/admin/auto-post/contents'", 'content list route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.post('/api/admin/auto-post/contents/import'", 'content import route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.post('/api/admin/auto-post/contents/seed'", 'seed initialization route is required.');
assertIncludes('auto-post.routes.ts', routes, "app.patch('/api/admin/auto-post/contents/:id'", 'content update route is required.');
assertIncludes('auto-post.routes.ts', routes, 'adminOnly', 'auto post routes must be admin only.');
assertNotIncludes('auto-post.routes.ts', routes, 'registerAutoCrawlRoutes', 'auto post routes must not register auto crawl routes as a side effect.');
assertNotIncludes('auto-crawl.routes.ts', autoCrawlRoutes, 'startAutoCrawlScheduler', 'auto crawl route registration must not start the crawl scheduler.');
assertNotIncludes('auto-crawl.routes.ts', autoCrawlRoutes, 'startAutoCrawlAiPipelineScheduler', 'auto crawl route registration must not start the AI pipeline scheduler.');

assertIncludes('server/bootstrap.ts', bootstrap, 'registerAutoPostRoutes(app', 'auto post routes must be registered.');
assertIncludes('server/bootstrap.ts', bootstrap, 'registerAutoCrawlRoutes(app', 'auto crawl routes must be registered explicitly.');
assertNotIncludes('server/bootstrap.ts', bootstrap, 'startAutoPostScheduler', 'bootstrap must not start runtime schedulers directly.');
assertNotIncludes('server/bootstrap.ts', bootstrap, 'startAutoCrawlScheduler', 'bootstrap must not start runtime schedulers directly.');
assertNotIncludes('server/bootstrap.ts', bootstrap, 'startAutoCrawlAiPipelineScheduler', 'removed auto crawl AI pipeline scheduler must not return.');
assertIncludes('server/startup/server-runtime.ts', serverRuntime, 'startAutomationRuntime(createDefaultAutomationModules({', 'server runtime must start automation runtime.');
assertIncludes('server/startup/server-runtime.ts', serverRuntime, 'afterAutoPostCreated: deps.afterAutoPostCreated', 'server runtime must wire auto-post post-created hook.');
assertNotIncludes('server/bootstrap.ts', bootstrap, 'ensureAutoPostSchema', 'auto post schema readiness must be handled by migrations, not server startup.');

assertIncludes('adminTypes.ts', adminTypes, "'auto-post'", 'AdminTab must include auto-post.');
assertIncludes('adminTypes.ts', adminTypes, "'interaction-config'", 'AdminTab must include interaction config.');
assertIncludes('adminMeta.tsx', adminMeta, '互动配置', 'admin menu must include 互动配置.');
assertIncludes('AdminPage.tsx', adminPage, 'AdminInteractionConfigPanel', 'admin page must render interaction config panel.');
assertIncludes('adminMeta.tsx', adminMeta, 'interactionSubTabs', 'interaction automations must be exposed as sidebar submenus.');
assertIncludes('adminMeta.tsx', adminMeta, '自动聊天', 'interaction submenu must include auto chat.');
assertIncludes('adminMeta.tsx', adminMeta, '自动引用', 'interaction submenu must include auto quote.');
assertIncludes('adminMeta.tsx', adminMeta, '自动评论', 'interaction submenu must include auto comment.');
assertIncludes('adminMeta.tsx', adminMeta, '自动发帖', 'interaction submenu must include auto post.');
assertIncludes('adminMeta.tsx', adminMeta, '自动抓取', 'interaction submenu must include auto fetch.');
assertIncludes('AdminInteractionConfigPanel.tsx', adminInteractionPanel, '参数配置', 'interaction child page must have config tab.');
assertIncludes('AdminInteractionConfigPanel.tsx', adminInteractionPanel, '执行日志', 'interaction child page must have execution log tab.');
assertIncludes('AdminAutoPostPanel.tsx', adminPanel, '/api/admin/auto-post/config', 'panel must load config API.');
assertIncludes('AdminInteractionConfigPanel.tsx', adminInteractionPanel, /\/api\/admin\/\$\{module\}\/run-now/, 'execution log tab must call manual run API.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '/api/admin/auto-post/stats', 'config panel must not load content stats.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '/api/admin/auto-post/runs', 'config panel must not load run records.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '内容总量', 'config panel must not show content total.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '最近运行记录', 'config panel must not show run records.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '当前状态：', 'config panel must not show duplicated status card.');
assertNotIncludes('AdminAutoPostPanel.tsx', adminPanel, '开关', 'config panel must not show duplicated global switch card.');
assertNotIncludes('auto-crawl.service.ts', autoCrawlService, 'initializeAutoCrawlSourcesFromSeed', 'deleted auto crawl source seed initializer must not return.');
assertNotIncludes('auto-crawl.service.ts', autoCrawlService, 'AUTO_CRAWL_SEED_SOURCES', 'hard-coded auto crawl source seeds must not return.');
assertNotIncludes('auto-crawl.routes.ts', autoCrawlRoutes, "app.post('/api/admin/auto-crawl/sources/seed'", 'deleted auto crawl seed route must not return.');
assertIncludes('prisma/schema.prisma', schema, 'model AutoCrawlConfig', 'AutoCrawlConfig model is required.');
assertIncludes('prisma/schema.prisma', schema, 'model AutoCrawlSource', 'AutoCrawlSource model is required.');
assertIncludes('prisma/schema.prisma', schema, 'model AutoCrawlRun', 'AutoCrawlRun model is required.');
assertIncludes('prisma/schema.prisma', schema, 'model AutoCrawlItem', 'AutoCrawlItem model is required.');
assertNotIncludes('prisma/schema.prisma', schema, 'model AutoCrawlLock', 'deleted AutoCrawlLock model must not return.');
assertIncludes('auto-crawl.service.ts', autoCrawlService, 'upsertAutoCrawlSource', 'backend source CRUD must exist.');
assertIncludes('auto-crawl.service.ts', autoCrawlService, 'deleteAutoCrawlSource', 'backend source delete must exist.');
assertIncludes('auto-crawl.routes.ts', autoCrawlRoutes, "app.post('/api/admin/auto-crawl/sources'", 'source create route is required.');
assertIncludes('auto-crawl.routes.ts', autoCrawlRoutes, "app.patch('/api/admin/auto-crawl/sources/:id'", 'source update route is required.');
assertIncludes('auto-crawl.routes.ts', autoCrawlRoutes, "app.delete('/api/admin/auto-crawl/sources/:id'", 'source delete route is required.');
assertIncludes('auto-crawl.routes.ts', autoCrawlRoutes, "app.post('/api/admin/auto-crawl/run-now'", 'manual crawl route is required.');
assertIncludes('auto-crawl.routes.ts', autoCrawlRoutes, 'runObservedAutoCrawl', 'manual crawl route must use observed runner.');
assertNotIncludes('auto-crawl.service.ts', autoCrawlService, "Apple: 'apple'", 'hard-coded category mapping must not return.');

assertIncludes('seed-auto-post-content.mjs', seed, 'MIN_ACTIVE_PER_TOPIC = 1000', 'seed script must enforce at least 1000 items per topic.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, '"license":"User-curated"', 'seed content must write safe curated seed license.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, 'docs/curated/', 'seed content must write stable curated source URLs.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, '"topic":"QUOTE"', 'seed content must contain quote items.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, '"topic":"FACT"', 'seed content must contain fact items.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, '"topic":"RIDDLE"', 'seed content must contain riddle items.');
assertIncludes('data/auto-post-content.seed.jsonl', seedContent, '"topic":"JOKE"', 'seed content must contain joke items.');

assertIncludes('package.json', JSON.stringify(packageJson.scripts || {}), 'test:auto-post', 'package.json must expose test:auto-post.');
assertIncludes('package.json', JSON.stringify(packageJson.scripts || {}), 'seed:auto-post-content', 'package.json must expose seed:auto-post-content.');
assertNotIncludes('package.json', JSON.stringify(packageJson.scripts || {}), 'seed:auto-crawl-sources', 'package.json must not expose deleted crawl source seeds.');

console.log('Auto post guards passed.');
