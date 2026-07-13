import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertIncludes(file, source, pattern, message) {
  const ok = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  assert(ok, `${file}: ${message}`);
}

function parsePrismaModels(source) {
  return new Set(
    Array.from(source.matchAll(/^model\s+([A-Za-z0-9_]+)/gm))
      .map((match) => match[1])
      .filter(Boolean),
  );
}

function parsePrismaModelBodies(source) {
  return new Map(
    Array.from(source.matchAll(/^model\s+([A-Za-z0-9_]+)\s+\{([\s\S]*?)^\}/gm))
      .map((match) => [match[1], match[2]]),
  );
}

function readMigrationSql() {
  const migrationsRoot = path.join(root, 'prisma/migrations');
  return fs.readdirSync(migrationsRoot)
    .sort()
    .map((directory) => path.join(migrationsRoot, directory, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

const bootstrap = read('server/bootstrap.ts');
const postService = [
  read('server/services/post/index.ts'),
  read('server/services/post/post-engagement.ts'),
].join('\n');
const opsReportRoute = read('server/routes/admin-report.routes.ts');
const publicFeedCache = read('server/public-feed-cache.ts');
const seoRoutes = read('server/routes/seo.routes.ts');
const schema = read('prisma/schema.prisma');
const migrationSql = readMigrationSql();
const opsIndexesMigration = read('prisma/migrations/20260830000000_add_ops_report_indexes/migration.sql');
const removeLegacyTagsMigration = read('prisma/migrations/20260831000000_remove_legacy_tags/migration.sql');
const pruneJoinedTopicTagMigration = read('prisma/migrations/20260901000000_prune_joined_topic_tag_type/migration.sql');
const telegramSyncPointActionMigration = read('prisma/migrations/20260827000000_add_point_action_telegram_sync/migration.sql');
const promotionConstraintsMigration = read('prisma/migrations/20260904000000_constrain_promotion_records/migration.sql');
const webhookConstraintsMigration = read('prisma/migrations/20260905000000_constrain_webhook_idempotency_records/migration.sql');
const recommendationViewSweepMigration = read('prisma/migrations/20260906000000_prune_recommendation_view_sweep_state/migration.sql');
const formalizePostPublishMigration = read('prisma/migrations/20260907000000_formalize_post_publish_schema/migration.sql');
const feedRankIndexesMigration = read('prisma/migrations/20260605000000_optimize_feed_rank_indexes/migration.sql');
const packageJson = JSON.parse(read('package.json'));


assert(
  fs.existsSync(path.join(root, 'scripts/security-guards.mjs')),
  'security-guards.mjs must exist because package.json test:security references it.',
);

const scripts = packageJson.scripts || {};
assert(
  typeof scripts['test:security'] === 'string' && scripts['test:security'].includes('scripts/security-guards.mjs'),
  'package.json must keep test:security wired to scripts/security-guards.mjs.',
);

const prismaModels = parsePrismaModels(schema);
const prismaModelBodies = parsePrismaModelBodies(schema);
const publicRlsTables = new Set(
  Array.from(migrationSql.matchAll(/ALTER\s+TABLE\s+(?:public\.)?"([^"]+)"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi))
    .map((match) => match[1]),
);
const implicitPrismaTables = new Set();

assert(
  !/@ignore\b/.test(schema),
  'prisma/schema.prisma must not keep ignored relation stubs; remove unused schema fields instead.',
);

for (const modelName of prismaModels) {
  assert(
    publicRlsTables.has(modelName) || implicitPrismaTables.has(modelName),
    `prisma/schema.prisma defines "${modelName}", but no migration enables RLS for it.`,
  );
}

assert(
  !/FROM\s+"Comment"/.test(bootstrap),
  'server/bootstrap.ts must not query the removed Comment table.',
);

assert(
  !/['"]CommentLike['"]/.test(bootstrap),
  'server/bootstrap.ts must not reference the removed CommentLike table.',
);

assert(
  !/^model\s+Tag\b/m.test(schema),
  'prisma/schema.prisma must not reintroduce the removed legacy Tag model.',
);

assert(
  !/['"](?:Tag|_PostToTag)['"]/.test(bootstrap),
  'server/bootstrap.ts must not enable RLS for removed legacy tag tables.',
);

assert(
  !/prisma\.tag\b|tags:\s*\{/.test(bootstrap),
  'server/bootstrap.ts must not query the removed legacy Tag relation.',
);

[
  ['server/services/post/index.ts', postService],
  ['server/public-feed-cache.ts', publicFeedCache],
  ['server/routes/seo.routes.ts', seoRoutes],
].forEach(([file, source]) => {
  assert(
    !/\b(?:tagId|relatedTag)\b|prisma\.tag\b|tags:\s*\{/.test(source),
    `${file} must not reintroduce legacy tag query parameters or Prisma tag relations.`,
  );
});

assertIncludes(
  '20260831000000_remove_legacy_tags/migration.sql',
  removeLegacyTagsMigration,
  /DROP TABLE IF EXISTS "_PostToTag" CASCADE;[\s\S]*DROP TABLE IF EXISTS "Tag" CASCADE;/,
  'legacy tag migration must drop the implicit post/tag join table before Tag.',
);

assertIncludes(
  '20260901000000_prune_joined_topic_tag_type/migration.sql',
  pruneJoinedTopicTagMigration,
  /DELETE FROM "UserJoinedTopic"[\s\S]*"topicType" = 'tag'[\s\S]*CHECK \("topicType" IN \('category', 'topic'\)\)/,
  'joined topic cleanup must remove legacy tag topics and constrain topicType to category/topic.',
);

assertIncludes(
  '20260827000000_add_point_action_telegram_sync/migration.sql',
  telegramSyncPointActionMigration,
  'ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS \'TELEGRAM_SYNC\'',
  'TELEGRAM_SYNC point action must be owned by migration, not runtime schema patching.',
);

assert(
  !/ensureTelegramSyncPointActionReady|ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'TELEGRAM_SYNC'/.test(bootstrap),
  'server/bootstrap.ts must not run the legacy TELEGRAM_SYNC enum migration at request time.',
);

[
  'PromotionBooking_type_check',
  'PromotionBooking_time_check',
  'PromotionBooking_price_check',
  'PromotionBooking_slot_check',
  'PromotionBooking_scope_check',
  'PromotionBooking_target_check',
  'PromotionCampaign_type_check',
  'PromotionCampaign_time_check',
  'PromotionCampaign_price_check',
  'PromotionCampaign_scope_check',
  'PromotionCampaign_target_check',
].forEach((constraintName) => {
  assertIncludes(
    '20260904000000_constrain_promotion_records/migration.sql',
    promotionConstraintsMigration,
    constraintName,
    `promotion data constraint ${constraintName} must be created.`,
  );
});

['PromotionBooking', 'PromotionCampaign'].forEach((modelName) => {
  const body = prismaModelBodies.get(modelName) || '';
  assert(
    /AD_HOME,\s*PIN_HOME,\s*PIN_CATEGORY,\s*PIN_CHAT/.test(body),
    `prisma/schema.prisma ${modelName}.type comment must document every live promotion type.`,
  );
});

[
  'WebhookRequest_endpoint_check',
  'WebhookRequest_idempotency_key_check',
  'WebhookRequest_request_hash_check',
  'WebhookRequest_response_status_check',
  'WebhookRequest_error_code_check',
  'WebhookPostOperation_endpoint_check',
  'WebhookPostOperation_idempotency_key_check',
  'WebhookPostOperation_post_user_check',
].forEach((constraintName) => {
  assertIncludes(
    '20260905000000_constrain_webhook_idempotency_records/migration.sql',
    webhookConstraintsMigration,
    constraintName,
    `webhook idempotency constraint ${constraintName} must be created.`,
  );
});

assertIncludes(
  '20260905000000_constrain_webhook_idempotency_records/migration.sql',
  webhookConstraintsMigration,
  /'\/api\/webhooks\/posts'[\s\S]*'\/api\/webhooks\/likes'/,
  'webhook idempotency records must be constrained to the two live webhook endpoints.',
);

[
  'UserRecommendationFeedback_action_check',
  'PostView_source_check',
  'PostView_viewer_key_check',
  'PostView_dwell_ms_check',
].forEach((constraintName) => {
  assertIncludes(
    '20260906000000_prune_recommendation_view_sweep_state/migration.sql',
    recommendationViewSweepMigration,
    constraintName,
    `recommendation/view data constraint ${constraintName} must be created.`,
  );
});

assertIncludes(
  '20260906000000_prune_recommendation_view_sweep_state/migration.sql',
  recommendationViewSweepMigration,
  /DELETE FROM "UserRecommendationFeedback"[\s\S]*"action" <> 'REDUCE'/,
  'invalid recommendation feedback actions must be deleted before constraining the column.',
);

assertIncludes(
  '20260906000000_prune_recommendation_view_sweep_state/migration.sql',
  recommendationViewSweepMigration,
  /UPDATE "PostView"[\s\S]*'view'[\s\S]*'feed'[\s\S]*'like'[\s\S]*'webhook_like'/,
  'legacy unknown PostView sources must be collapsed to the neutral view source.',
);

assertIncludes(
  '20260906000000_prune_recommendation_view_sweep_state/migration.sql',
  recommendationViewSweepMigration,
  /ALTER TABLE "SweepJob" DROP COLUMN "triggerType"/,
  'unused SweepJob.triggerType column must be dropped.',
);

assert(
  !/\btriggerType\b/.test(prismaModelBodies.get('SweepJob') || ''),
  'prisma/schema.prisma must not keep unused SweepJob.triggerType.',
);

assert(
  !/triggerType:\s*['"]MANUAL['"]/.test(bootstrap),
  'server/bootstrap.ts must not write the removed SweepJob.triggerType field.',
);

assertIncludes(
  'server/services/post/index.ts',
  postService,
  /POST_VIEW_SOURCES[\s\S]*'view'[\s\S]*'feed'[\s\S]*'like'[\s\S]*'webhook_like'/,
  'PostView source normalization must stay limited to live sources.',
);

assertIncludes(
  'server/services/post/index.ts',
  postService,
  /action:\s*'REDUCE'/,
  'recommendation feedback must keep using the single live REDUCE action.',
);

[
  '"contact" TEXT NOT NULL DEFAULT \'\'',
  '"categoryId" TEXT',
  '"showContact" BOOLEAN NOT NULL DEFAULT true',
  '"categoryMeta" JSONB',
  '"countryCode" TEXT',
  '"countryName" TEXT',
  '"source" TEXT',
  '"bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
  '"telegramSyncStatus" "TelegramSyncStatus" NOT NULL DEFAULT \'NONE\'',
  '"quoteCount" INTEGER NOT NULL DEFAULT 0',
  '"quotedPostId" TEXT',
  'ALTER TABLE "Post" ALTER COLUMN "categoryId" DROP NOT NULL',
  'ALTER TABLE "Post" ALTER COLUMN "contact" SET NOT NULL',
  'ALTER TABLE "Post" ALTER COLUMN "showContact" SET NOT NULL',
  'ALTER TABLE "Post" ALTER COLUMN "bumpedAt" SET NOT NULL',
  'ALTER TABLE "Post" ALTER COLUMN "telegramSyncStatus" SET NOT NULL',
  'ALTER TABLE "Post" ALTER COLUMN "quoteCount" SET NOT NULL',
  'Post_categoryId_fkey',
  'Post_quotedPostId_fkey',
].forEach((fragment) => {
  assertIncludes(
    '20260907000000_formalize_post_publish_schema/migration.sql',
    formalizePostPublishMigration,
    fragment,
    `formal post publish schema migration must include ${fragment}.`,
  );
});

[
  'idx_post_visible_created',
  'idx_post_visible_bumped_desc',
  'idx_post_category_visible_bumped_desc',
  'idx_post_country_visible_bumped_desc',
  'idx_post_location_visible_bumped',
  'idx_post_visible_share_created',
  'idx_post_visible_share_bumped_desc',
].forEach((indexName) => {
  assertIncludes(
    '20260907000000_formalize_post_publish_schema/migration.sql',
    formalizePostPublishMigration,
    indexName,
    `${indexName} must be created by the formal Post publish schema migration.`,
  );
});

assert(
  !/ensurePostPublishSchema|getPostPublishSchemaRepairStatements|postPublishSchemaPromise|ALTER TABLE public\."Post" ADD COLUMN IF NOT EXISTS/.test(bootstrap),
  'server/bootstrap.ts must not repair Post publish schema at API runtime; use migrations instead.',
);

[
  ['server/joined-topic.service.ts', read('server/joined-topic.service.ts')],
  ['server/bootstrap.ts', bootstrap],
  ['server/services/post/index.ts', postService],
  ['src/types.ts', read('src/types.ts')],
  ['src/features/post/PostCard.tsx', read('src/features/post/PostCard.tsx')],
].forEach(([file, source]) => {
  assert(
    !/\|\s*['"]tag['"]|\btype\??:\s*['"]tag['"]|topicType\s*={0,2}\s*['"]tag['"]|legacyTopicTags|buildLegacyTopicTags/.test(source),
    `${file} must not reintroduce legacy joined-topic tag semantics.`,
  );
});

assertIncludes(
  '20260605000000_optimize_feed_rank_indexes/migration.sql',
  feedRankIndexesMigration,
  /information_schema\.columns[\s\S]*column_name = 'commentCount'[\s\S]*idx_post_visible_like_comment_created_desc/,
  'legacy commentCount index must be guarded by a column-existence check.',
);

assert(
  !/const\s+getRangeMetrics\s*=\s*async/.test(bootstrap),
  'server/bootstrap.ts /api/admin/ops-report must not issue per-day metric query batches.',
);

const redundantIndexPatterns = [
  ['SweepTransaction', /@@index\(\[jobId,\s*status\]\)/, 'SweepTransaction jobId/status is covered by jobId/status/createdAt.'],
  ['Block', /@@index\(\[blockerId\]\)/, 'Block.blockerId is already covered by the primary key.'],
  ['Post', /@@index\(\[isPublished,\s*deletedAt\]\)/, 'Post visibility is already covered by longer feed indexes.'],
  ['Like', /@@index\(\[postId\]\)/, 'Like.postId is already covered by Like.postId/createdAt.'],
  ['DepositAddress', /@@index\(\[userId\]\)/, 'DepositAddress.userId is already covered by the unique constraint.'],
  ['PromotionBooking', /idx_promotion_active_scope/, 'PromotionBooking active scope is already covered by idx_promotion_ads_effective_order.'],
];

redundantIndexPatterns.forEach(([modelName, pattern, reason]) => {
  const body = prismaModelBodies.get(modelName) || '';
  assert(!pattern.test(body), `prisma/schema.prisma must not keep redundant index: ${reason}`);
});

[
  'FROM "User"',
  'FROM "Order"',
  'FROM "PointTransaction"',
  'FROM "Post"',
  'FROM "Like"',
  'FROM "PostShare"',
  'FROM "Follow"',
].forEach((sqlFragment) => {
  assertIncludes(
    'server/routes/admin-report.routes.ts',
    opsReportRoute,
    new RegExp(`${sqlFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*GROUP BY date`),
    `/api/admin/ops-report must keep batched daily aggregate query for ${sqlFragment}.`,
  );
});

[
  'idx_follow_created_desc',
  'idx_block_created_desc',
  'idx_post_created_id_desc',
  'idx_like_created_post_desc',
  'idx_post_view_source_created_desc',
  'idx_post_share_created_post_desc',
  'idx_user_recommendation_feedback_action_updated',
  'idx_user_recommendation_feedback_post_updated',
  'idx_order_status_credited_id',
  'idx_sweep_transaction_job_status_created',
].forEach((indexName) => {
  assertIncludes(
    'prisma/schema.prisma',
    schema,
    indexName,
    `${indexName} must stay in the Prisma schema for operations/report query performance.`,
  );
  assertIncludes(
    '20260830000000_add_ops_report_indexes/migration.sql',
    opsIndexesMigration,
    indexName,
    `${indexName} must stay in the SQL migration for migration-based deploys.`,
  );
});

if (failures.length > 0) {
  console.error('[security-guards] failed');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[security-guards] passed');
