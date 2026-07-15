import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOTS = ['server', 'src'];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.vite']);
const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const FILES = {
  serverRuntime: 'server/startup/server-runtime.ts',
  automationRuntime: 'server/services/automation/automation-runtime.ts',
  automationModule: 'server/services/automation/automation-module.ts',
  defaultModules: 'server/services/automation/default-automation-modules.ts',
  autoCrawlRunner: 'server/services/auto-crawl-observed-runner.service.ts',
  autoCrawlRuntimeStatus: 'server/services/auto-crawl-runtime-status.service.ts',
  autoCrawlRoutes: 'server/routes/auto-crawl.routes.ts',
  autoCrawlService: 'server/services/auto-crawl.service.ts',
  autoPostRunner: 'server/services/auto-post-observed-runner.service.ts',
  autoPostRoutes: 'server/routes/auto-post.routes.ts',
  autoPostService: 'server/services/auto-post.service.ts',
  interactionRunner: 'server/services/interaction-observed-runner.service.ts',
  quoteRoutes: 'server/routes/quote-publish.routes.ts',
  commentRoutes: 'server/routes/admin-comment-publish.routes.ts',
  autoLikeRoutes: 'server/routes/admin-auto-like.routes.ts',
  quoteService: 'server/services/quote-publish.service.ts',
  commentService: 'server/services/comment-publish.service.ts',
  autoLikeService: 'server/services/auto-like.service.ts',
  adminAutomationRoutes: 'server/routes/admin-automation.routes.ts',
  automationHealth: 'server/services/automation-health.service.ts',
  adminPanel: 'src/features/admin/AdminInteractionConfigPanel.tsx',
};

const deletedPaths = [
  'server/routes/automation-debug.routes.ts',
  'server/services/chat-automation-observer.service.ts',
  'server/services/observed-auto-crawl-scheduler.service.ts',
  'server/services/auto-crawl-ai-review.service.ts',
];

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}
function read(relativePath) {
  assert.ok(fileExists(relativePath), `Missing required file: ${relativePath}`);
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}
function includes(file, token, reason) {
  assert.ok(read(file).includes(token), `${file} must include ${token}: ${reason}`);
}
function notIncludes(file, token, reason) {
  assert.ok(!read(file).includes(token), `${file} must not include ${token}: ${reason}`);
}
function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      yield* walkFiles(absolute);
      continue;
    }
    if (entry.isFile() && INCLUDED_EXTENSIONS.has(path.extname(entry.name))) yield absolute;
  }
}
function* walkProductionSourceFiles() {
  for (const sourceRoot of SOURCE_ROOTS) {
    const absolute = path.join(ROOT, sourceRoot);
    if (fs.existsSync(absolute)) yield* walkFiles(absolute);
  }
}
function assertOnlyFilesContain(token, allowedFiles, reason) {
  const offenders = [];
  for (const file of walkProductionSourceFiles()) {
    const relative = path.relative(ROOT, file);
    const normalized = path.normalize(relative);
    if (allowedFiles.has(normalized)) continue;
    if (fs.readFileSync(file, 'utf8').includes(token)) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `${reason}: ${offenders.join(', ')}`);
}

for (const deletedPath of deletedPaths) {
  assert.ok(!fileExists(deletedPath), `Deleted automation side path must not come back: ${deletedPath}`);
}

includes(FILES.serverRuntime, 'startAutomationRuntime(createDefaultAutomationModules({', 'scheduled modules start from unified runtime');
includes(FILES.serverRuntime, 'stopAutomationRuntime()', 'runtime has one shutdown hook');
notIncludes(FILES.serverRuntime, 'startAutoCrawlScheduler()', 'standalone crawl scheduler must not be used at startup');
notIncludes(FILES.serverRuntime, 'startAutoPostScheduler({', 'standalone post scheduler must not be used at startup');
notIncludes(FILES.serverRuntime, 'startAutomationSupervisor({', 'standalone interaction supervisor must not be used at startup');
notIncludes(FILES.serverRuntime, 'runAutoCrawlOnce', 'startup must not call business runs directly');
notIncludes(FILES.serverRuntime, 'recordAutomationHeartbeat', 'startup must not write heartbeat directly');

includes(FILES.automationModule, 'AutomationRuntimeModule', 'module contract exists');
includes(FILES.automationModule, 'fallbackIntervalMs', 'module fallback interval exists');
includes(FILES.automationModule, 'nextIntervalMs', 'module dynamic interval exists');
includes(FILES.automationRuntime, 'dedupeModules', 'runtime dedupes modules');
includes(FILES.automationRuntime, 'scheduler_startup_tick', 'startup reason exists');
includes(FILES.automationRuntime, 'scheduler_tick', 'scheduled reason exists');
notIncludes(FILES.automationRuntime, 'runAutoCrawlOnce', 'runtime must not call business runs directly');
notIncludes(FILES.automationRuntime, 'recordAutomationHeartbeat', 'runtime must not write heartbeat directly');

for (const moduleName of ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish']) {
  includes(FILES.defaultModules, `module: '${moduleName}'`, `${moduleName} registered`);
}
for (const token of ['runObservedAutoCrawl', 'runObservedAutoPost', 'runObservedAutoLike', 'runObservedQuotePublish', 'runObservedCommentPublish']) {
  includes(FILES.defaultModules, token, `${token} registered`);
}
for (const token of ['runAutoCrawlOnce', 'runAutoPostOnce', 'runQuotePublishOnce', 'runCommentPublishOnce', 'runAutoLikeOnce']) {
  notIncludes(FILES.defaultModules, token, 'default runtime must call observed runners only');
}

includes(FILES.autoCrawlRunner, 'withAutomationTaskLock', 'auto-crawl runner uses unified lock');
includes(FILES.autoCrawlRunner, "AUTO_CRAWL_TASK_LOCK_NAME = 'auto_crawl'", 'auto-crawl lock name is unified');
includes(FILES.autoCrawlRunner, 'runAutoCrawlOnce', 'observed runner calls business run');
includes(FILES.autoCrawlRunner, "module: 'auto_crawl'", 'auto-crawl heartbeat module is explicit');
includes(FILES.autoCrawlRunner, 'recordAutomationHeartbeat', 'auto-crawl heartbeat is observed');
includes(FILES.autoCrawlRuntimeStatus, "getAutomationTaskLock('auto_crawl')", 'auto-crawl status reads unified lock');
notIncludes(FILES.autoCrawlRuntimeStatus, 'FROM "AutoCrawlLock"', 'legacy lock table must not drive status');
includes(FILES.autoCrawlRoutes, 'runObservedAutoCrawl', 'routes use observed runner');
includes(FILES.autoCrawlRoutes, "trigger: 'SCHEDULED', force: false, reason", 'config kicks are non-force');
includes(FILES.autoCrawlRoutes, "trigger: 'MANUAL', force: true, reason: 'manual_run_now'", 'admin run-now remains explicit');
notIncludes(FILES.autoCrawlRoutes, "trigger: 'SCHEDULED', force: true, reason", 'config kicks must not force');
notIncludes(FILES.autoCrawlRoutes, 'runAutoCrawlOnce', 'routes must not call business run directly');
notIncludes(FILES.autoCrawlRoutes, 'recordAutomationHeartbeat', 'routes must not write heartbeat directly');

includes(FILES.autoPostRunner, 'runAutoPostOnce', 'auto-post observed runner calls business run');
includes(FILES.autoPostRunner, "module: 'auto_post'", 'auto-post heartbeat module explicit');
includes(FILES.autoPostRunner, 'recordAutomationHeartbeat', 'auto-post heartbeat observed');
includes(FILES.autoPostRoutes, 'runObservedAutoPost', 'auto-post route uses observed runner');
notIncludes(FILES.autoPostRoutes, 'runAutoPostOnce', 'auto-post route must not call business run directly');
notIncludes(FILES.autoPostService, 'startAutoPostScheduler', 'business service must not own scheduler');
notIncludes(FILES.autoPostService, 'recordAutomationHeartbeat', 'business service must not write heartbeat');

for (const token of ['runQuotePublishOnce', 'runCommentPublishOnce', 'runAutoLikeOnce', 'recordAutomationHeartbeat']) {
  includes(FILES.interactionRunner, token, `interaction runner must include ${token}`);
}
for (const moduleName of ['quote_publish', 'comment_publish', 'auto_like']) {
  includes(FILES.interactionRunner, `module: '${moduleName}'`, `${moduleName} heartbeat module explicit`);
}
includes(FILES.quoteRoutes, 'runObservedQuotePublish', 'quote route uses observed runner');
includes(FILES.commentRoutes, 'runObservedCommentPublish', 'comment route uses observed runner');
includes(FILES.autoLikeRoutes, 'runObservedAutoLike', 'auto-like route uses observed runner');
notIncludes(FILES.quoteRoutes, 'runQuotePublishOnce', 'quote route must not call business run directly');
notIncludes(FILES.commentRoutes, 'runCommentPublishOnce', 'comment route must not call business run directly');
notIncludes(FILES.autoLikeRoutes, 'runAutoLikeOnce', 'auto-like route must not call business run directly');
notIncludes(FILES.quoteService, 'startQuotePublishScheduler', 'quote facade must not expose legacy scheduler');

for (const moduleName of ['auto_like', 'quote_publish', 'comment_publish', 'auto_post', 'auto_crawl']) {
includes(FILES.automationHealth, `'${moduleName}'`, `heartbeat supports ${moduleName}`);
}
notIncludes(FILES.automationHealth, 'auto_crawl_ai_review', 'removed crawl AI review module must not return');
includes(FILES.adminAutomationRoutes, '/api/admin/automation/heartbeats', 'admin heartbeat route exists');
includes(FILES.adminPanel, 'AdminAutoCrawlExecutionLogsCompactPanel', 'admin execution log UI exists');

assertOnlyFilesContain('runAutoCrawlOnce', new Set([path.normalize(FILES.autoCrawlService), path.normalize(FILES.autoCrawlRunner)]), 'runAutoCrawlOnce must stay behind observed runner');
assertOnlyFilesContain('runAutoPostOnce', new Set([path.normalize(FILES.autoPostService), path.normalize(FILES.autoPostRunner)]), 'runAutoPostOnce must stay behind observed runner');
assertOnlyFilesContain('runQuotePublishOnce', new Set([path.normalize(FILES.quoteService), path.normalize('server/services/quote-publish-v5.service.ts'), path.normalize(FILES.interactionRunner)]), 'runQuotePublishOnce must stay behind observed runner');
assertOnlyFilesContain('runCommentPublishOnce', new Set([path.normalize(FILES.commentService), path.normalize('server/services/comment-publish-v8.service.ts'), path.normalize(FILES.interactionRunner)]), 'runCommentPublishOnce must stay behind observed runner');
assertOnlyFilesContain('runAutoLikeOnce', new Set([path.normalize(FILES.autoLikeService), path.normalize(FILES.interactionRunner)]), 'runAutoLikeOnce must stay behind observed runner');

console.log('[automation-runtime-chain-brutal-guards] passed');
