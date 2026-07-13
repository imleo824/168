import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mustHave = (label, content, text) => assert.ok(content.includes(text), `${label} must include ${text}`);
const mustNotHave = (label, content, text) => assert.ok(!content.includes(text), `${label} must not include ${text}`);

const serverRuntime = read('server/startup/server-runtime.ts');
const automationRuntime = read('server/services/automation/automation-runtime.ts');
const defaultModules = read('server/services/automation/default-automation-modules.ts');
const autoCrawlRunner = read('server/services/auto-crawl-observed-runner.service.ts');
const interactionRunner = read('server/services/interaction-observed-runner.service.ts');
const obsoleteRankingField = ['ranking', 'Value'].join('');

mustHave('server runtime', serverRuntime, 'startAutomationRuntime(createDefaultAutomationModules({');
mustHave('server runtime', serverRuntime, 'stopAutomationRuntime()');
mustNotHave('server runtime', serverRuntime, 'startAutoCrawlScheduler()');
mustNotHave('server runtime', serverRuntime, 'startAutoPostScheduler({');
mustNotHave('server runtime', serverRuntime, 'startAutomationSupervisor({');

mustHave('automation runtime', automationRuntime, 'scheduler_startup_tick');
mustHave('automation runtime', automationRuntime, 'scheduler_tick');
mustHave('automation runtime', automationRuntime, 'dedupeModules');
mustNotHave('automation runtime', automationRuntime, 'runAutoCrawlOnce');
mustNotHave('automation runtime', automationRuntime, 'recordAutomationHeartbeat');

for (const moduleName of ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish']) {
  mustHave('default modules', defaultModules, `module: '${moduleName}'`);
}
mustHave('default modules', defaultModules, 'runObservedAutoCrawl');
mustHave('default modules', defaultModules, 'runObservedAutoPost');
mustHave('default modules', defaultModules, 'runObservedAutoLike');
mustHave('default modules', defaultModules, 'runObservedQuotePublish');
mustHave('default modules', defaultModules, 'runObservedCommentPublish');

mustHave('auto-crawl runner', autoCrawlRunner, 'withAutomationTaskLock');
mustHave('auto-crawl runner', autoCrawlRunner, "AUTO_CRAWL_TASK_LOCK_NAME = 'auto_crawl'");
mustHave('auto-crawl runner', autoCrawlRunner, 'runAutoCrawlOnce');
mustHave('auto-crawl runner', autoCrawlRunner, 'recordAutomationHeartbeat');

mustHave('interaction runner', interactionRunner, "enabled: input.trigger === 'MANUAL' ? true : undefined");
mustNotHave('interaction runner', interactionRunner, 'enabled: true,');

mustNotHave('comment publish runner', interactionRunner, `p."${obsoleteRankingField}"`);

console.log('[automation-startup-guards] passed');
