import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}
function assertMissing(relativePath, reason) {
  assert.ok(!exists(relativePath), `${relativePath} must stay deleted: ${reason}`);
}
function assertNotIncludes(relativePath, token, reason) {
  if (!exists(relativePath)) return;
  const content = read(relativePath);
  assert.ok(!content.includes(token), `${relativePath} must not include ${token}: ${reason}`);
}

assertMissing('server/routes/automation-debug.routes.ts', 'official admin run-now endpoints and AutomationHeartbeat are the only supported automation inspection path');
assertMissing('server/services/chat-automation-observer.service.ts', 'chat bot observation must go through chat-observed-runner');
assertMissing('server/services/auto-crawl-scheduler.service.ts', 'auto-crawl scheduling must go through unified AutomationRuntime');
assertMissing('server/services/auto-post-scheduler.service.ts', 'auto-post scheduling must go through unified AutomationRuntime');
assertMissing('server/services/automation-supervisor.service.ts', 'interaction scheduling must go through unified AutomationRuntime');
assertMissing('server/routes/admin-automation-lock.routes.ts', 'admin automation locks must go through the normalized /api/admin/automation status and module-release routes');
assertMissing('server/services/quote-publish.service.ts', 'quote publish must import the real v5 implementation directly, without a compatibility facade');
assertMissing('server/services/comment-publish.service.ts', 'comment publish must import the real v8 implementation directly, without a compatibility facade');
assertMissing('server/routes/webhook.routes.ts', 'removed external automation webhook APIs must not keep an empty route registrar');
assertMissing('server/webhooks/webhook-handlers.ts', 'removed external automation webhook APIs must not keep 410 handler shims');

assertNotIncludes('server/routes/config.routes.ts', 'registerAdminAutomationLockRoutes', 'obsolete raw lock routes must not be registered from config routes');
assertNotIncludes('server/bootstrap.ts', 'registerWebhookRoutes', 'removed external automation webhook routes must not be registered at startup');
assertNotIncludes('server/bootstrap.ts', 'createWebhookHandlers', 'removed external automation webhook handlers must not be constructed at startup');
assertNotIncludes('server/middlewares/rateLimit.ts', 'webhookLimiter', 'removed external automation webhook APIs must not keep a dedicated limiter alias');
assertNotIncludes('server/routes/quote-publish.routes.ts', 'registerAutomationDebugRoutes', 'obsolete internal automation side route must not be registered');
assertNotIncludes('server/startup/server-runtime.ts', 'startQuotePublishScheduler', 'server runtime must not use quote scheduler directly');
assertNotIncludes('server/startup/server-runtime.ts', 'startAutoCrawlScheduler', 'server runtime must not use standalone crawl scheduler');
assertNotIncludes('server/startup/server-runtime.ts', 'startAutoPostScheduler', 'server runtime must not use standalone post scheduler');
assertNotIncludes('server/startup/server-runtime.ts', 'startAutomationSupervisor', 'server runtime must not use standalone interaction supervisor');
assertNotIncludes('server/services/quote-publish-v5.service.ts', 'startQuotePublishScheduler', 'quote-publish service must not expose legacy scheduler compatibility');
assertNotIncludes('server/services/quote-publish-v5.service.ts', 'Legacy bootstrap', 'legacy scheduler comments must not remain');
assertNotIncludes('server/services/quote-publish-v5.service.ts', 'automation-supervisor.service', 'quote service must not lazy-import supervisor');

assertNotIncludes('server/services/auto-post.service.ts', 'recordAutoPostSchedulerHeartbeat', 'auto-post scheduler heartbeat belongs in observed runner, not business service');
assertNotIncludes('server/services/auto-post.service.ts', 'recordAutomationHeartbeat', 'auto-post business service must not write scheduler heartbeat directly');
assertNotIncludes('server/services/auto-post.service.ts', 'AutomationHeartbeatStatus', 'auto-post business service must not own heartbeat status logic');
assertNotIncludes('server/services/auto-post.service.ts', 'AutomationHeartbeatTrigger', 'auto-post business service must not own heartbeat trigger logic');

console.log('[automation-cleanup-guards] passed');
