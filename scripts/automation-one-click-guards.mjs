import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const schema = read('prisma/schema.prisma');
const migration = read('prisma/migrations/20260916000000_add_automation_batch_runs/migration.sql');
const batch = read('server/services/automation/automation-batch.service.ts');
const routes = read('server/routes/admin-automation.routes.ts');
const status = read('server/services/automation/automation-status.service.ts');
const overview = read('src/features/admin/AdminAutomationOverviewPanel.tsx');
const api = read('src/features/admin/services/automationApi.ts');

assert.match(schema, /model AutomationBatchRun\s*\{/, 'automation batch persistence model is required.');
assert.match(schema, /activeKey\s+String\?\s+@unique/, 'automation batch must have a unique active key.');
assert.match(migration, /CREATE TABLE IF NOT EXISTS "AutomationBatchRun"/, 'automation batch migration must create the table.');
assert.match(migration, /AutomationBatchRun_activeKey_key/, 'automation batch migration must enforce one active batch.');
assert.match(migration, /ALTER TABLE "AutomationBatchRun" ENABLE ROW LEVEL SECURITY/, 'automation batch migration must enable RLS.');

for (const moduleName of ['auto_crawl', 'auto_post', 'auto_like', 'quote_publish', 'comment_publish']) {
  assert.match(batch, new RegExp(`'${moduleName}'`), `one-click batch must include ${moduleName}.`);
}
assert.match(batch, /'auto_crawl',[\s\S]*'auto_post',[\s\S]*'auto_like',[\s\S]*'quote_publish',[\s\S]*'comment_publish'/, 'one-click modules must execute in dependency order.');
assert.match(batch, /withAutomationTaskLock\(/, 'one-click batch must use a global task lock.');
assert.match(batch, /activeKey: AUTOMATION_BATCH_ACTIVE_KEY/, 'one-click batch creation must be idempotent.');
assert.match(batch, /updateManyAndReturn|updateProgress/, 'one-click batch must persist progress.');
assert.match(batch, /manual_run_all/, 'one-click tasks must have a distinct manual trigger reason.');
assert.match(batch, /runTaskWithTimeout/, 'one-click tasks must have a bounded execution time.');
assert.match(batch, /kind: 'failed'/, 'one-click timeout wrapper must consume late task failures.');
assert.doesNotMatch(batch, /force: true/, 'one-click execution must honor each module configuration instead of bypassing it.');
assert.match(batch, /for \(const \[index, task\] of tasks\.entries\(\)\)/, 'one-click batch must isolate and continue module failures.');

assert.match(routes, /\/api\/admin\/automation\/run-all/, 'admin must expose the one-click endpoint.');
assert.match(routes, /\/api\/admin\/automation\/batches\/:id/, 'admin must expose batch progress polling.');
assert.match(status, /getAutomationBatchSnapshot/, 'automation status must include the batch snapshot.');
assert.match(api, /\/api\/admin\/automation\/run-all/, 'admin UI API layer must trigger one-click automation.');
assert.match(api, /\/api\/admin\/automation\/batches\//, 'admin UI API layer must poll batch progress.');
assert.match(overview, /抓取 → 发帖 → 点赞 → 引用 → 评论/, 'admin UI must show the actual execution order.');

console.log('[automation-one-click-guards] passed');
