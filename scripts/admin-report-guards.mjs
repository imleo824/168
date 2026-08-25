import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function listFiles(dir, suffix = '.ts') {
  const absoluteDir = path.join(root, dir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(relativePath, suffix);
    return entry.isFile() && entry.name.endsWith(suffix) ? [relativePath] : [];
  });
}

function extractRoute(source, route) {
  const start = source.indexOf(route);
  assert.notEqual(start, -1, `${route} must exist`);
  const nextRoute = source.indexOf("\napp.", start + route.length);
  return source.slice(start, nextRoute === -1 ? source.length : nextRoute);
}

function assertNoBareAdminAsyncRoutes() {
  const routeFiles = [
    ...listFiles('server/routes'),
    ...listFiles('server/chat'),
  ];
  const offenders = [];
  const bareAdminAsyncRouteLine = /app\.(?:get|post|patch|put|delete)\('\/api\/admin[^'\n]*'[^;\n]*,\s*async\s*\(/;
  for (const file of routeFiles) {
    const source = read(file);
    source.split('\n').forEach((lineText, index) => {
      if (bareAdminAsyncRouteLine.test(lineText)) {
        offenders.push(`${file}:${index + 1}: ${lineText.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `admin routes must use catchAsync instead of bare async handlers:\n${offenders.join('\n')}`);
}

const bootstrap = read('server/bootstrap.ts');
const platformTime = read('server/platform-time.ts');
const promotionService = read('server/promotion.service.ts');
const promotionUtils = read('server/promotion-utils.ts');
const sharedDomain = read('shared/domain.ts');
const schema = read('prisma/schema.prisma');
const configRoutes = read('server/routes/config.routes.ts');
const adminBillingRoutes = read('server/routes/admin-billing.routes.ts');
const adminDepositRoutes = read('server/routes/admin-deposit.routes.ts');
const adminDepositService = read('server/services/admin-deposit.service.ts');
const adminPostRoutes = read('server/routes/admin-post.routes.ts');
const adminPromotionRoutes = read('server/routes/admin-promotion.routes.ts');
const adminReportRoutes = read('server/routes/admin-report.routes.ts');
const adminUserRoutes = read('server/routes/admin-user.routes.ts');
const quotePublishRoutes = read('server/routes/quote-publish.routes.ts');
const commentPublishRoutes = read('server/routes/admin-comment-publish.routes.ts');
const autoLikeRoutes = read('server/routes/admin-auto-like.routes.ts');
const autoLikeService = read('server/services/auto-like.service.ts');
const automationRuntime = read('server/services/automation/automation-runtime.ts');
const automationHealth = read('server/services/automation-health.service.ts');
const adminFiltersPanel = read('src/features/admin/AdminFiltersPanel.tsx');
const adminPage = read('src/features/admin/AdminPage.tsx');
const adminDataPanel = read('src/features/admin/AdminDataPanel.tsx');
const adminDesktopDataTable = read('src/features/admin/AdminDesktopDataTable.tsx');
const adminMeta = read('src/features/admin/adminMeta.tsx');
const adminAutoPostPanel = read('src/features/admin/AdminAutoPostPanel.tsx');
const adminAutoLikePanel = read('src/features/admin/AdminAutoLikePanel.tsx');
const adminInteractionPanel = read('src/features/admin/AdminInteractionConfigPanel.tsx');
const adminCommentPublishPanel = read('src/features/admin/AdminCommentPublishPanel.tsx');
const adminQuotePublishPanel = read('src/features/admin/AdminQuotePublishPanel.tsx');
const adminChatPanel = read('src/features/admin/AdminChatPanel.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.match(platformTime, /export const PLATFORM_TIMEZONE = 'Asia\/Shanghai'/, 'admin report timezone must stay explicit');
assert.match(platformTime, /export function getPlatformDayRange\(/, 'platform day range helper is required');
assert.match(platformTime, /export function getPlatformDateRangeFilter\(/, 'admin date filters must share the platform day helper');
assert.match(platformTime, /export function getPlatformSqlDateKeyExpression\(/, 'admin report SQL date buckets must share the platform timezone helper');
assert.match(adminReportRoutes, /from '\.\.\/platform-time'/, 'admin reports must import the shared platform time helper');
assert.match(adminReportRoutes, /async function runAdminReportQuery/, 'admin reports must tolerate individual metric query failures.');
assert.match(adminReportRoutes, /\[admin-report:\$\{label\}\]/, 'admin report query fallback must log failed metric labels.');
assertNoBareAdminAsyncRoutes();

const usersRoute = extractRoute(adminUserRoutes, "app.get('/api/admin/users'");
const postsRoute = extractRoute(adminPostRoutes, "app.get('/api/admin/posts'");
const promotionsRoute = extractRoute(adminPromotionRoutes, "app.get('/api/admin/promotions'");
const transactionsRoute = extractRoute(adminBillingRoutes, "app.get('/api/admin/transactions'");
const ordersRoute = extractRoute(adminBillingRoutes, "app.get('/api/admin/orders'");
for (const [name, route] of [
  ['users route', usersRoute],
  ['promotions route', promotionsRoute],
  ['transactions route', transactionsRoute],
  ['orders route', ordersRoute],
]) {
  assert.match(route, /getPlatformDateRangeFilter\(startDate, endDate\)/, `${name} must filter date inputs in platform timezone`);
  assert.doesNotMatch(route, /T00:00:00\.000Z|setUTCDate/, `${name} must not use UTC date-only parsing for admin filters`);
}
assert.match(promotionsRoute, /orderBy:\s*\[\{ targetDate: 'desc' \}, \{ slotIndex: 'asc' \}, \{ createdAt: 'desc' \}, \{ id: 'desc' \}\]/, 'promotions route pagination must use a stable id tiebreaker');
assert.match(promotionService, /bookingDefaultEndAt,/, 'admin promotion service must import the shared display restore helper');
assert.match(promotionUtils, /export function bookingDefaultEndAt\(targetDate: Date, startsAt\?: Date \| null\)/, 'admin promotion restore must accept the original effective start time');
assert.match(promotionUtils, /return addUtcDays\(new Date\(startAtTime\), 1\)/, 'admin promotion restore must recover the original platform-day end from startsAt');
assert.match(promotionUtils, /getPlatformDateKeyRange\(targetDate\.toISOString\(\)\.slice\(0, 10\)\)/, 'admin promotion restore fallback must use platform date ranges');
assert.match(promotionService, /select:\s*\{[\s\S]*targetDate:\s*true,[\s\S]*startsAt:\s*true,[\s\S]*\}[\s\S]*const targetDateEndAt = bookingDefaultEndAt\(new Date\(booking\.targetDate\), booking\.startsAt\)/, 'admin promotion display-state route must load startsAt before restoring display');

assert.match(postsRoute, /userType/, 'admin content management must accept an author type filter.');
assert.match(postsRoute, /normalizeAdminUserTypeFilter\(userType\)/, 'admin content management author type filter must use the shared user type validator.');
assert.match(postsRoute, /user:\s*\{\s*userType:\s*normalizedUserType as any\s*\}/, 'admin content management must apply the author type filter in the post query.');
for (const [name, route] of [
  ['promotions route', promotionsRoute],
  ['transactions route', transactionsRoute],
  ['orders route', ordersRoute],
]) {
  assert.match(route, /normalizeAdminUserTypeFilter\(userType\)/, `${name} must accept the shared user type filter.`);
  assert.match(route, /userType 参数不合法/, `${name} must reject invalid user type filters.`);
}
assert.match(transactionsRoute, /Object\.values\(PromotionType\)\.includes/, 'admin transactions must accept promotion type values for promotion-related transaction filtering.');
assert.match(transactionsRoute, /normalizedAction === PromotionType\.PIN_CATEGORY[\s\S]*description:\s*\{\s*contains:\s*'分类'/, 'admin transactions must filter category pin transactions with the promotion type value.');
assert.match(transactionsRoute, /normalizedAction === PromotionType\.PIN_HOME[\s\S]*NOT:\s*\{\s*description:\s*\{\s*contains:\s*'分类'/, 'admin transactions must filter home pin transactions separately from category pins.');
assert.match(promotionsRoute, /effectStats/, 'admin promotions must return effectStats.');
assert.match(promotionsRoute, /loadAdminPromotionEffectStats/, 'admin promotions must compute dedicated backend effect stats.');
assert.match(adminPromotionRoutes, /SELECT pv\."postId" AS "postId"[\s\S]*author\."userType"::text <> 'ROBOT'/, 'admin promotion views must at least exclude robot-authored posts.');
assert.match(adminPromotionRoutes, /FROM "Like" l[\s\S]*actor\."userType"::text <> 'ROBOT'[\s\S]*author\."userType"::text <> 'ROBOT'/, 'admin promotion likes must exclude robot actors and robot-authored posts.');
assert.match(adminPromotionRoutes, /FROM "PostShare" ps[\s\S]*author\."userType"::text <> 'ROBOT'[\s\S]*actor\."userType"::text <> 'ROBOT'/, 'admin promotion shares must exclude robot shares and robot-authored posts.');
assert.match(adminPromotionRoutes, /FROM "Post" q[\s\S]*actor\."userType"::text <> 'ROBOT'[\s\S]*author\."userType"::text <> 'ROBOT'/, 'admin promotion quotes must exclude robot quote authors and robot-authored source posts.');
assert.match(adminPromotionRoutes, /comments:\s*0/, 'admin promotion comments must stay explicitly zero until a comment model exists.');

assert.match(sharedDomain, /PROMOTION_TYPE_LABELS[\s\S]*AD_HOME[\s\S]*首页横幅广告[\s\S]*PIN_HOME[\s\S]*热门置顶[\s\S]*PIN_CATEGORY[\s\S]*分类置顶[\s\S]*PIN_CHAT[\s\S]*聊天室置顶/, 'promotion type labels must live in the shared domain map.');
assert.match(sharedDomain, /TRANSACTION_ACTION_LABELS[\s\S]*RECHARGE[\s\S]*积分充值[\s\S]*SIGNUP_REWARD[\s\S]*注册赠送[\s\S]*ANONYMOUS_PUBLISH[\s\S]*PIN_POST[\s\S]*PromotionType\.PIN_HOME[\s\S]*PIN_CHAT[\s\S]*PromotionType\.PIN_CHAT[\s\S]*AD[\s\S]*PromotionType\.AD_HOME[\s\S]*TELEGRAM_SYNC[\s\S]*频道同步/, 'transaction action labels must live in the shared domain map.');
assert.match(sharedDomain, /ADMIN_TRANSACTION_TYPE_OPTIONS[\s\S]*PromotionType\.AD_HOME[\s\S]*PromotionType\.PIN_HOME[\s\S]*PromotionType\.PIN_CATEGORY[\s\S]*PromotionType\.PIN_CHAT/, 'admin transaction filters must expose promotion types with the same values as promotion management.');
assert.match(sharedDomain, /ADMIN_USER_TYPE_FILTER_OPTIONS[\s\S]*全部用户类型[\s\S]*USER_TYPE_OPTIONS/, 'admin user type filter options must be shared.');
assert.match(adminFiltersPanel, /ADMIN_USER_TYPE_FILTER_OPTIONS/, 'admin filters must reuse shared user type options.');
assert.match(adminFiltersPanel, /PROMOTION_TYPE_OPTIONS/, 'admin promotion filters must reuse shared promotion type options.');
assert.match(adminFiltersPanel, /ADMIN_TRANSACTION_TYPE_OPTIONS/, 'admin transaction filters must reuse shared transaction type options.');
assert.doesNotMatch(adminFiltersPanel, /activeTab === 'users'[\s\S]*ADMIN_USER_TYPE_FILTER_OPTIONS[\s\S]*ADMIN_USER_TYPE_FILTER_OPTIONS[\s\S]*activeTab === 'orders'/, 'admin user filters must not render duplicate user type dropdowns.');
assert.match(adminDesktopDataTable, /getPromotionTypeLabel/, 'admin promotion rows must use the shared promotion label helper.');
assert.match(adminDesktopDataTable, /getTransactionActionLabel/, 'admin transaction rows must use the shared transaction label helper.');

assert.match(configRoutes, /ref === 'exposure' \|\| ref === '曝光' \|\| ref === '爆料'/, 'public categories must normalize exposure aliases to one 爆料 category.');
assert.match(configRoutes, /getPublicCategoryCanonicalRefs/, 'public categories must dedupe after public-name normalization.');

assert.match(adminDepositService, /const todayRange = getPlatformDayRange\(\)/, 'deposit stats today must use platform day range');
assert.match(adminDepositService, /creditedAt:\s*\{\s*gte:\s*todayRange\.start,\s*lt:\s*todayRange\.end\s*\}/, 'deposit stats today recharge metrics must be bounded by platform today');

const opsReportRoute = extractRoute(adminReportRoutes, "app.get('/api/admin/ops-report'");
assert.doesNotMatch(opsReportRoute, /INTERVAL '8 hours'/, 'ops report date buckets must not hardcode Shanghai offset');
assert.match(opsReportRoute, /getPlatformSqlDateKeyExpression\(Prisma\.sql`(?:[a-z]+\.)?"createdAt"`\)/, 'ops report createdAt buckets must use the platform SQL date helper');
assert.match(opsReportRoute, /getPlatformSqlDateKeyExpression\(Prisma\.sql`o\."creditedAt"`\)/, 'ops report creditedAt buckets must use the platform SQL date helper');
assert.match(opsReportRoute, /"userType"::text <> 'ROBOT'/, 'ops report must exclude robot-related metrics with a stable text comparison');
assert.match(opsReportRoute, /COUNT\(\*\)::int AS "shareCount"[\s\S]*FROM "PostShare" ps[\s\S]*ps\."createdAt" >= \$\{trendStart\}[\s\S]*ps\."createdAt" < \$\{reportEnd\}/, 'ops report shareCount must count human PostShare events by share time');
assert.match(opsReportRoute, /FROM "PostShare" ps[\s\S]*author\."userType"::text <> 'ROBOT'[\s\S]*actor\."userType"::text <> 'ROBOT'/, 'ops report historical shareCount must exclude robot shares and robot-authored posts');
assert.doesNotMatch(opsReportRoute, /prisma\.postShare\.count\(\)/, 'ops report historical shareCount needs relational robot filtering');
assert.doesNotMatch(opsReportRoute, /_sum:\s*\{\s*shareCount:\s*true\s*\}/, 'ops report must not sum Post.shareCount by post createdAt');
assert.match(opsReportRoute, /pt\."action"::text IN \(\$\{Prisma\.join\(consumedPointActions\)\}\)/, 'trend consumed points must be limited to real spend actions without enum casts');
assert.match(opsReportRoute, /action:\s*\{\s*in:\s*consumedPointActions as any\s*\}/, 'historical consumed points must be limited to real spend actions');
assert.doesNotMatch(opsReportRoute, /CAST\(\$\{RECHARGE_STATUS\.CREDITED\} AS "OrderStatus"\)|CAST\(\$\{action\} AS "PointAction"\)/, 'ops report raw SQL must not depend on enum type casts');
assert.match(opsReportRoute, /timezone:\s*PLATFORM_TIMEZONE/, 'ops report payload must expose the platform timezone constant');

assert.doesNotMatch(adminPage, /推荐效果|recommendation-report|RecommendationReport/, 'admin ops report page must not render or request the recommendation effect module.');

assert.doesNotMatch(adminChatPanel, /运行状态|后台自动聊天日志保留 3 天|队列中|生成中|24h 成功/, 'auto chat config panel must not render runtime monitoring details.');

// Admin automation closed-loop guards.
assert.match(adminMeta, /id:\s*'interaction-config',[\s\S]*label:\s*'互动配置'/, 'interaction config menu must stay visible as 互动配置.');
assert.doesNotMatch(adminMeta, /adminNavigationTabs\s*=\s*\[[^\]]*interactionSubTabs/, 'interaction automation submenus must not be merged into top-level navigation.');
assert.match(adminMeta, /interactionSubTabs[\s\S]*id:\s*'auto-like'[\s\S]*label:\s*'自动点赞'/, 'auto-like must stay available as an interaction submenu.');
assert.match(adminAutoLikePanel, /自动点赞配置/, 'auto-like panel must stay available inside interaction config.');
assert.match(adminMeta, /id:\s*'model-config',[\s\S]*label:\s*'模型配置'/, 'model config menu must stay visible as 模型配置.');
assert.doesNotMatch(adminMeta, /'auto-post':[\s\S]*自动点赞参数/, 'auto post intro must not describe auto-like as a nested sub panel.');
assert.doesNotMatch(adminChatPanel, /AI 模型|当前模型/, 'auto chat panel must not render model config fields.');
assert.doesNotMatch(adminCommentPublishPanel, /AI 模型/, 'auto comment panel must not render model config fields.');
assert.doesNotMatch(adminQuotePublishPanel, /AI 模型/, 'auto quote panel must not render model config fields.');

assert.match(commentPublishRoutes, /app\.get\('\/api\/admin\/comment-publish\/runs'/, 'auto comment must expose run history route.');
assert.match(commentPublishRoutes, /parseCursorPagination/, 'auto comment run history must support cursor pagination.');
assert.match(commentPublishRoutes, /setCursorPaginationHeaders/, 'auto comment run history must expose pagination headers.');
assert.doesNotMatch(adminCommentPublishPanel, /\/api\/admin\/comment-publish\/runs|运行状态|最近运行|任务锁|最近心跳/, 'auto comment config panel must not render execution details.');
assert.match(adminInteractionPanel, /\/api\/admin\/\$\{module\}\/runs\?limit=20/, 'auto comment execution logs must load run history in the logs tab.');
assert.match(adminInteractionPanel, /质量分/, 'auto comment execution logs must show quality score for audits.');
assert.match(adminInteractionPanel, /原因/, 'auto comment execution logs must show skip reasons.');

assert.match(quotePublishRoutes, /app\.get\('\/api\/admin\/quote-publish\/runs'/, 'auto quote must expose run history route.');
assert.match(quotePublishRoutes, /parseCursorPagination/, 'auto quote run history must support cursor pagination.');
assert.match(quotePublishRoutes, /setCursorPaginationHeaders/, 'auto quote run history must expose pagination headers.');
assert.doesNotMatch(adminQuotePublishPanel, /\/api\/admin\/quote-publish\/runs|运行状态|最近运行|任务锁|最近心跳/, 'auto quote config panel must not render execution details.');
assert.match(adminInteractionPanel, /\/api\/admin\/\$\{module\}\/runs\?limit=20/, 'auto quote execution logs must load run history in the logs tab.');

assert.doesNotMatch(autoLikeService, /CREATE TABLE|ALTER TABLE/, 'auto like schema changes must stay in migrations.');
assert.match(autoLikeService, /export async function listAutoLikeRuns/, 'auto like service must expose run history list.');
assert.match(autoLikeService, /todayRunSucceeded/, 'auto like stats must include successful run count.');
assert.match(autoLikeService, /todayRunSkipped/, 'auto like stats must include skipped run count.');
assert.match(autoLikeService, /todayRunFailed/, 'auto like stats must include failed run count.');
assert.match(automationHealth, /'auto_like' \| 'quote_publish' \| 'comment_publish' \| 'auto_post' \| 'auto_crawl'/, 'automation heartbeat module type must include all unified runtime modules.');
assert.match(automationRuntime, /startAutomationRuntime/, 'unified automation runtime must own scheduling startup.');
assert.match(automationRuntime, /scheduleModule\(module, true\)/, 'unified automation runtime must schedule registered modules.');
assert.match(automationRuntime, /getAutomationRuntimeSnapshot/, 'unified automation runtime must expose runtime state snapshots.');
assert.doesNotMatch(automationRuntime, /startAutoLikeScheduler/, 'unified automation runtime must not delegate auto-like to an unobserved scheduler.');
assert.match(autoLikeRoutes, /runObservedAutoLike/, 'auto-like admin route must support observed manual auto-like execution.');
assert.match(schema, /model AutoLikeRun/, 'AutoLikeRun must be in Prisma schema.');
assert.match(schema, /model AutomationTaskLock/, 'AutomationTaskLock must be in Prisma schema.');
assert.match(schema, /model AutomationHeartbeat/, 'AutomationHeartbeat must be in Prisma schema.');
assert.match(autoLikeRoutes, /app\.get\('\/api\/admin\/auto-like\/runs'/, 'auto like must expose run history route.');
assert.match(autoLikeRoutes, /parseCursorPagination/, 'auto like run history must support cursor pagination.');
assert.match(autoLikeRoutes, /setCursorPaginationHeaders/, 'auto like run history must expose pagination headers.');
assert.doesNotMatch(adminAutoPostPanel, /\/api\/admin\/auto-like\//, 'auto post panel must not contain nested auto-like controls.');
assert.doesNotMatch(adminAutoLikePanel, /\/api\/admin\/auto-like\/runs|\/api\/admin\/auto-like\/stats|最近 12 条点赞运行记录|今日自动点赞|今日任务记录|机器人范围|分类范围/, 'auto like config panel must not render duplicated execution or scope blocks.');

assert.equal(packageJson.scripts?.['test:admin-report'], 'node scripts/admin-report-guards.mjs', 'package.json must expose test:admin-report');
assert.match(packageJson.scripts?.test || '', /test:admin-report/, 'full test chain must include test:admin-report');

console.log('[admin-report-guards] passed');
