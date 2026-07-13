import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function fail(message) {
  console.error(`[feed-ranking-integrity] ${message}`);
  process.exitCode = 1;
}

function assertIncludes(relativePath, content, needle, message) {
  if (!content.includes(needle)) fail(`${relativePath}: ${message}`);
}

function assertNotIncludes(relativePath, content, needle, message) {
  if (content.includes(needle)) fail(`${relativePath}: ${message}`);
}

const rankingUtilsPath = 'server/services/post/ranking-utils.ts';
const rankingUtils = read(rankingUtilsPath);
assertIncludes(rankingUtilsPath, rankingUtils, 'ROBOT: 0.8', 'ROBOT author multiplier must stay 0.8.');
assertIncludes(rankingUtilsPath, rankingUtils, 'NORMAL: 1.12', 'NORMAL author multiplier must stay 1.12.');
assertIncludes(rankingUtilsPath, rankingUtils, 'OFFICIAL: 1.05', 'OFFICIAL author multiplier must stay 1.05.');
assertIncludes(rankingUtilsPath, rankingUtils, 'normalViewCount', 'recommendation scoring must read NORMAL trusted view counts.');
assertIncludes(rankingUtilsPath, rankingUtils, 'normalCommentCount', 'recommendation scoring must read NORMAL trusted comment counts.');
assertIncludes(rankingUtilsPath, rankingUtils, 'normalQuoteCount', 'recommendation scoring must read NORMAL trusted quote counts.');
assertIncludes(rankingUtilsPath, rankingUtils, 'Tui Plus is presentation-only unless explicitly persisted into PostRankingScore', 'Tui Plus must not be a display-layer ranking multiplier.');
assertNotIncludes(rankingUtilsPath, rankingUtils, 'HUMAN_AUTHOR_DISPLAY_BOOST', 'hard human display boost is forbidden.');
assertNotIncludes(rankingUtilsPath, rankingUtils, '100_000', 'hard 100000 display priority is forbidden.');
assertNotIncludes(rankingUtilsPath, rankingUtils, 'sourceMultiplier', 'Post.source must not be a ranking multiplier.');
assertNotIncludes(rankingUtilsPath, rankingUtils, 'webhookSourcePenalty', 'source/webhook penalty must not affect recommendation score.');
assertNotIncludes(rankingUtilsPath, rankingUtils, 'membershipBoostedScore', 'Tui Plus must not be multiplied into precomputed ranking score at display time.');

const feedRankingPath = 'server/modules/feed/feed-ranking.service.ts';
const feedRanking = read(feedRankingPath);
assertIncludes(feedRankingPath, feedRanking, 'recommendationScore is the persisted final sorting score', 'feed sorting must treat stored recommendationScore as final effective score.');
assertIncludes(feedRankingPath, feedRanking, 'Do not apply author or membership multipliers here', 'feed sorting must not double-apply author or Tui Plus multipliers.');
assertNotIncludes(feedRankingPath, feedRanking, 'AUTHOR_RECOMMENDATION_MULTIPLIER', 'feed display layer must not own author multipliers.');
assertNotIncludes(feedRankingPath, feedRanking, 'TUI_PLUS_RECOMMENDATION_MULTIPLIER = 1.2', 'feed display layer must not own Tui Plus ranking multiplier.');

const homeFeedPath = 'server/services/home-feed.service.ts';
const homeFeed = read(homeFeedPath);
assertIncludes(homeFeedPath, homeFeed, 'Author userType never removes a post from candidate pools', 'home feed must document candidate-pool rule.');
assertIncludes(homeFeedPath, homeFeed, "HOME_FEED_READ_CACHE_VERSION = 'v11-config-driven-category-refs'", 'home feed cache version must isolate the config-driven category/cache rollout.');
assertIncludes(homeFeedPath, homeFeed, 'getPublicFeedCacheVersion()', 'home feed read cache must follow the global feed cache version.');
assertIncludes(homeFeedPath, homeFeed, 'if (currentUserId) return listFeedUncached', 'logged-in feeds must bypass read cache so follow/block/reduce changes are immediate.');
assertIncludes(homeFeedPath, homeFeed, 'encodeHomeRankCursor', 'home feed must emit compound rank cursor.');
assertIncludes(homeFeedPath, homeFeed, 'buildRankCursorWhere', 'home feed must query with compound rank cursor conditions.');
assertIncludes(homeFeedPath, homeFeed, 'useRankCursor: true', 'recommended/category feeds must use compound rank cursor.');
assertNotIncludes(homeFeedPath, homeFeed, 'HOME_CATEGORY_ALIASES', 'category resolution must be config/database driven, not hardcoded.');
assertNotIncludes(homeFeedPath, homeFeed, 'AUTO_POST_CURATED_SOURCE', 'home feed must not use source-based robot exclusion.');
assertNotIncludes(homeFeedPath, homeFeed, 'source: AUTO_POST_CURATED_SOURCE', 'home feed must not filter by source.');
assertNotIncludes(homeFeedPath, homeFeed, "user: { userType: 'ROBOT'", 'home feed must not exclude ROBOT authors.');
assertNotIncludes(homeFeedPath, homeFeed, "userType: 'ROBOT'", 'home feed candidate pools must not mention ROBOT filters.');

const configRoutesPath = 'server/routes/config.routes.ts';
const configRoutes = read(configRoutesPath);
assertIncludes(configRoutesPath, configRoutes, 'getSavedPublishCategorySchema', 'public categories must be read from the saved backend publish_category_schema only.');
assertIncludes(configRoutesPath, configRoutes, "where: { key: 'publish_category_schema' }", 'public categories must read the real SystemConfig publish_category_schema row.');
assertIncludes(configRoutesPath, configRoutes, 'publish_category_schema: normalizePublicPublishCategorySchema(options.publishCategorySchema || [])', 'public config must return empty publish_category_schema when backend has no saved category config.');
assertNotIncludes(configRoutesPath, configRoutes, 'getEffectivePublishCategorySchema', 'public categories must not use an effective/default schema fallback.');
assertNotIncludes(configRoutesPath, configRoutes, 'ConfigService.getDefaultConfigs().publish_category_schema', 'public categories must not fall back to default publish_category_schema.');
assertNotIncludes(configRoutesPath, configRoutes, '.catch(() => ConfigService.getDefaultConfigs())', 'public categories must not fall back to default configs.');

const tagFeedPath = 'server/services/tag-feed-search.service.ts';
const tagFeed = read(tagFeedPath);
assertNotIncludes(tagFeedPath, tagFeed, 'AUTO_POST_CURATED_SOURCE', 'tag feed must not use source-based robot exclusion.');
assertNotIncludes(tagFeedPath, tagFeed, 'p."source"', 'tag feed must not filter or rank by Post.source.');
assertNotIncludes(tagFeedPath, tagFeed, 'userType', 'tag feed candidate pool must not filter by author userType.');

const publicFeedCachePath = 'server/public-feed-cache.ts';
const publicFeedCache = read(publicFeedCachePath);
assertIncludes(publicFeedCachePath, publicFeedCache, "'posts-tag'", 'public feed cache kind must include tag feeds.');
assertIncludes(publicFeedCachePath, publicFeedCache, "'tag'", 'public feed cache key must include tag query value.');

const rankingMaintenancePath = 'server/services/post/post-ranking-maintenance.ts';
const rankingMaintenance = read(rankingMaintenancePath);
for (const field of [
  'normalLikeCount',
  'normalViewCount',
  'normalShareCount',
  'normalCommentCount',
  'normalQuoteCount',
  'normalDwellMs',
  'normalQuickSkipCount',
]) {
  assertIncludes(rankingMaintenancePath, rankingMaintenance, field, `single-post refresh must use ${field}.`);
}
assertNotIncludes(rankingMaintenancePath, rankingMaintenance, 'verifiedLikeCount', 'single-post refresh must not use verified/raw like count.');
assertNotIncludes(rankingMaintenancePath, rankingMaintenance, 'verifiedViewCount', 'single-post refresh must not use verified/raw view count.');
assertNotIncludes(rankingMaintenancePath, rankingMaintenance, 'verifiedShareCount', 'single-post refresh must not use verified/raw share count.');

const engagementPath = 'server/services/post/post-engagement.ts';
const engagement = read(engagementPath);
assertIncludes(engagementPath, engagement, 'viewerUserId', 'view writes must store viewerUserId.');
assertIncludes(engagementPath, engagement, 'u."userType" = \'NORMAL\'', 'view aggregation must only count NORMAL users.');
assertIncludes(engagementPath, engagement, 'incrementNormalShareAggregate', 'NORMAL share aggregation helper must be called.');

const postReadPath = 'server/routes/post-read.routes.ts';
const postRead = read(postReadPath);
assertNotIncludes(postReadPath, postRead, 'source: deps.HIDDEN_AUTO_POST_CURATED_SOURCE', 'view reporting must not hide robot-authored posts by source.');
assertNotIncludes(postReadPath, postRead, "user: { is: { userType: 'ROBOT'", 'view reporting must not exclude ROBOT authors.');

const trustedAggregatePath = 'server/services/post/trusted-engagement-aggregate.ts';
const trustedAggregate = read(trustedAggregatePath);
for (const helper of [
  'incrementNormalLikeAggregate',
  'decrementNormalLikeAggregate',
  'incrementNormalShareAggregate',
  'incrementNormalCommentAggregate',
  'decrementNormalCommentAggregate',
  'incrementNormalQuoteAggregate',
  'decrementNormalQuoteAggregate',
]) {
  assertIncludes(trustedAggregatePath, trustedAggregate, helper, `trusted aggregate helper ${helper} is required.`);
}
assertNotIncludes(trustedAggregatePath, trustedAggregate, 'verifiedCommentCount', 'PostEngagementAggregate has no verifiedCommentCount column.');
assertNotIncludes(trustedAggregatePath, trustedAggregate, 'verifiedQuoteCount', 'PostEngagementAggregate has no verifiedQuoteCount column.');

const postActionsPath = 'server/routes/post-actions.routes.ts';
const postActions = read(postActionsPath);
assertIncludes(postActionsPath, postActions, "actor?.userType === 'NORMAL'", 'post actions must check actor userType before trusted updates.');
assertIncludes(postActionsPath, postActions, 'incrementNormalLikeAggregate', 'like action must increment normalLikeCount for NORMAL users.');
assertIncludes(postActionsPath, postActions, 'decrementNormalLikeAggregate', 'unlike action must decrement normalLikeCount for NORMAL users.');
assertIncludes(postActionsPath, postActions, 'incrementNormalQuoteAggregate', 'publish action must increment normalQuoteCount for NORMAL quotes.');
assertIncludes(postActionsPath, postActions, 'decrementNormalQuoteAggregate', 'delete/unpublish action must decrement normalQuoteCount for NORMAL quotes.');
assertIncludes(postActionsPath, postActions, 'if (trusted) {', 'share bump must be gated by trusted NORMAL actor.');

const postCommentsPath = 'server/routes/post-comments.routes.ts';
const postComments = read(postCommentsPath);
assertIncludes(postCommentsPath, postComments, 'incrementNormalCommentAggregate', 'comment create must increment normalCommentCount for NORMAL users.');
assertIncludes(postCommentsPath, postComments, 'decrementNormalCommentAggregate', 'comment delete must decrement normalCommentCount for NORMAL users.');
assertIncludes(postCommentsPath, postComments, 'PostService.schedulePostRankingRefresh', 'comment mutations must refresh ranking score.');
assertNotIncludes(postCommentsPath, postComments, '$executeRawUnsafe', 'comment routes must not run schema DDL at request time.');
assertNotIncludes(postCommentsPath, postComments, 'CREATE TABLE IF NOT EXISTS', 'comment routes must not create tables at request time.');
assertNotIncludes(postCommentsPath, postComments, 'ALTER TABLE', 'comment routes must not alter tables at request time.');

const rankSyncPath = 'prisma/sql/sync_post_engagement_aggregates.sql';
const rankSync = read(rankSyncPath);
assertIncludes(rankSyncPath, rankSync, 'Ranking uses only NORMAL-user engagement', 'rank sync must document NORMAL-only rule.');
assertIncludes(rankSyncPath, rankSync, 'ROBOT 0.8', 'rank sync must persist ROBOT 0.8 author multiplier.');
assertIncludes(rankSyncPath, rankSync, 'Post.source is never used', 'rank sync must not use Post.source for ranking.');
assertIncludes(rankSyncPath, rankSync, 'JOIN "User" u ON u."id" = l."userId" AND u."userType" = \'NORMAL\'', 'likes must be NORMAL-only in rank sync.');
assertIncludes(rankSyncPath, rankSync, 'JOIN "User" u ON u."id" = v."viewerUserId" AND u."userType" = \'NORMAL\'', 'views must be NORMAL-only in rank sync.');

const postServiceFacadePath = 'server/post.service.ts';
const postServiceFacade = read(postServiceFacadePath);
assertIncludes(postServiceFacadePath, postServiceFacade, "kind: 'recommended'", 'default /api/posts must route to HomeFeedService recommended feed.');
assertIncludes(postServiceFacadePath, postServiceFacade, "kind: 'category'", 'category /api/posts must route to HomeFeedService category feed.');
assertIncludes(postServiceFacadePath, postServiceFacade, "kind: 'following'", 'following feed must route to HomeFeedService following feed.');
assertIncludes(postServiceFacadePath, postServiceFacade, 'listRobotSafePublicPosts', 'filtered /api/posts reads must use the robot-safe public reader.');
assertIncludes(postServiceFacadePath, postServiceFacade, 'static async getPost', 'post detail must be implemented in the public facade.');
assertIncludes(postServiceFacadePath, postServiceFacade, 'static async listPostQuotes', 'quote list must be implemented in the public facade.');
assertNotIncludes(postServiceFacadePath, postServiceFacade, 'BasePostService.listPosts(...args)', 'public listPosts must not fall back to legacy BasePostService.');
assertNotIncludes(postServiceFacadePath, postServiceFacade, 'BasePostService.listFollowingPosts', 'following feed must not fall back to legacy BasePostService.');
assertNotIncludes(postServiceFacadePath, postServiceFacade, 'BasePostService.listPostQuotes', 'quote list must not fall back to legacy BasePostService.');
assertNotIncludes(postServiceFacadePath, postServiceFacade, 'BasePostService.getPost', 'post detail must not fall back to legacy BasePostService.');

if (process.exitCode) process.exit(process.exitCode);
console.log('[feed-ranking-integrity] OK');
