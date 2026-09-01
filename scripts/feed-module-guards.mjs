#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'server/modules/feed/README.md',
  'server/modules/feed/feed-contracts.ts',
  'server/modules/feed/feed-cache-keys.ts',
  'server/modules/feed/feed-observability.ts',
  'server/modules/feed/feed-query.service.ts',
  'server/modules/feed/feed-ranking.service.ts',
  'server/modules/feed/feed-promotion-mixer.ts',
  'server/modules/feed/feed-hydrator.service.ts',
  'server/modules/feed/index.ts',
  'server/repositories/feed.repository.ts',
  'server/routes/feed.routes.ts',
  'server/services/home-feed.service.ts',
];

const REQUIRED_ROUTE_MARKERS = [
  "app.get('/api/home/feed'",
  'registerFeedRoutes',
  'feedRouteModule',
  'measureFeedStep',
  'X-Feed-Result-Cache',
  'X-Feed-Cache-Version',
];

const REQUIRED_QUERY_SERVICE_MARKERS = [
  'FeedQueryService',
  'HomeFeedQueryContext',
  'HomeFeedQueryHandlers',
  'dispatchHomeFeed',
  'feed-query.dispatch.',
  'listRecommendedFeed',
  'listCategoryFeed',
  'getBlockedUserIds',
  'getMutedCategoryIds',
  'measureFeedStep',
];

const REQUIRED_REPOSITORY_MARKERS = [
  'FeedRepository',
  'buildPublishedPostWhere',
  'listRecommendedPosts',
  'listCategoryPosts',
  'listCategoryIdsByRefs',
  'listBlockedUserIds',
  'listReducedPostIds',
  'listFollowingAuthorIds',
  'listActivePinBookings',
  'listPostsByIds',
  'listUsersByIds',
  'listCategoriesByIds',
  'listLikedPostIds',
  'listPostsPage',
  'listHumanRankedCandidatePosts',
  'promotionBooking',
  'postRankingScore',
  'createFeedRepository',
];

const REQUIRED_RANKING_MARKERS = [
  'FeedRankingService',
  'rankRecommendedRows',
  'diversifyFeedRecommendedRows',
  'sortFeedHumanRankedRows',
  'applyFeedPromotedPostBoost',
  'getFeedRecommendationScore',
  'getFeedAuthorDisplayPriority',
  'DEFAULT_HUMAN_AUTHOR_DISPLAY_BOOST',
  'DEFAULT_PROMOTED_POST_RECOMMENDATION_BOOST',
];

const REQUIRED_PROMOTION_MIXER_MARKERS = [
  'FeedPromotionMixer',
  'mixFeedPinnedRows',
  'sortFeedPinnedRows',
  'splitFeedPinnedAndRegularRows',
  'getFeedPromotedPostIds',
  'buildFeedRegularWhereExclusion',
];

const REQUIRED_HYDRATOR_MARKERS = [
  'FeedHydratorService',
  'createFeedHydratorService',
  'hydratePosts',
  'compactFeedPostPayload',
  'compactQuotedPostPayload',
  'compactPostUser',
  'toPublicHeatScore',
  'attachRecentAuthorPostActivity',
  'listUsersByIds',
  'listCategoriesByIds',
  'listLikedPostIds',
];

const REQUIRED_HOME_FEED_SERVICE_MARKERS = [
  'createFeedRepository',
  'createFeedQueryService',
  'createFeedHydratorService',
  'feedQueryService.dispatchHomeFeed',
  'feedHydratorService.hydratePosts',
  'feedRepository.listCategoryIdsByRefs',
  'feedRepository.listBlockedUserIds',
  'feedRepository.listReducedPostIds',
  'feedRepository.listFollowingAuthorIds',
  'feedRepository.listActivePinBookings',
  'feedRepository.listPostsByIds',
  'feedRepository.listPostsPage',
  'feedRepository.listHumanRankedCandidatePosts',
  'new FeedRankingService()',
  'new FeedPromotionMixer()',
  'feedRankingService.rankRecommendedRows',
  'feedPromotionMixer.getPromotedPostIds',
  'feedPromotionMixer.sortPinnedRows',
  'feedPromotionMixer.buildRegularWhereExclusion',
  'feedPromotionMixer.mixPinnedRows',
];

const FORBIDDEN_HOME_FEED_INLINE_MARKERS = [
  'function getRecommendationScore(',
  'function getAuthorDisplayPriority(',
  'function sortHumanRankedRows(',
  'function diversifyRecommendedRows(',
  'function applyPromotedPostBoost(',
  'prisma.follow.findMany',
  'prisma.block.findMany',
  'userRecommendationFeedback.findMany',
  'prisma.postRankingScore.findUnique',
  'prisma.postRankingScore.findMany',
  'promotionBooking.findMany',
  'prisma.post.findMany',
  'prisma.user.findMany',
  'prisma.category.findMany',
  'prisma.like.findMany',
  'compactFeedPostPayload',
  'compactQuotedPostPayload',
  'compactPostUser',
  'toPublicHeatScore',
  'attachRecentAuthorPostActivity',
];

const FEED_SCHEMA_COMPAT_FILES = [
  'server/bootstrap.ts',
  'server/post.service.ts',
  'server/services/post/index.ts',
  'server/services/post/ranking-utils.ts',
  'server/services/post/ranking-profile.ts',
  'server/services/home-feed.service.ts',
  'server/repositories/feed.repository.ts',
  'server/modules/feed/feed-ranking.service.ts',
  'server/modules/feed/feed-query.service.ts',
  'server/routes/feed.routes.ts',
  'prisma/schema.prisma',
];

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readFile(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

function assertMarkers(label, content, markers) {
  const missingMarkers = markers.filter((marker) => !content.includes(marker));
  if (missingMarkers.length > 0) {
    console.log(`\n${label} is missing required markers:`);
    missingMarkers.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

function assertForbiddenMarkersAbsent(label, content, markers) {
  const foundMarkers = markers.filter((marker) => content.includes(marker));
  if (foundMarkers.length > 0) {
    console.log(`\n${label} still contains forbidden inline markers:`);
    foundMarkers.forEach((marker) => console.log(`  - ${marker}`));
    process.exitCode = 1;
    return false;
  }
  return true;
}

function assertNoObsoleteRankingValue(label, content) {
  const obsoleteRankingField = `ranking${'Value'}`;
  if (!content.includes(obsoleteRankingField)) return true;
  console.log(`\n${label} contains obsolete ${obsoleteRankingField} field usage. Use PostRankingScore.recommendationScore instead.`);
  process.exitCode = 1;
  return false;
}

async function assertFeedSchemaCompat() {
  let ok = true;
  for (const file of FEED_SCHEMA_COMPAT_FILES) {
    if (!(await pathExists(file))) continue;
    const content = await readFile(file);
    ok = assertNoObsoleteRankingValue(file, content) && ok;
  }
  return ok;
}

async function main() {
  const missing = [];
  for (const relativePath of REQUIRED_FILES) {
    if (!(await pathExists(relativePath))) missing.push(relativePath);
  }

  console.log('\n=== Feed Module Guard ===');
  console.log('Required feed module files:');
  REQUIRED_FILES.forEach((file) => console.log(`  - ${file}`));

  if (missing.length > 0) {
    console.log('\nMissing feed module files:');
    missing.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const routeContent = await readFile('server/routes/feed.routes.ts');
  const queryServiceContent = await readFile('server/modules/feed/feed-query.service.ts');
  const rankingContent = await readFile('server/modules/feed/feed-ranking.service.ts');
  const promotionMixerContent = await readFile('server/modules/feed/feed-promotion-mixer.ts');
  const hydratorContent = await readFile('server/modules/feed/feed-hydrator.service.ts');
  const repositoryContent = await readFile('server/repositories/feed.repository.ts');
  const homeFeedServiceContent = await readFile('server/services/home-feed.service.ts');

  const ok = [
    assertMarkers('Feed route module', routeContent, REQUIRED_ROUTE_MARKERS),
    assertMarkers('Feed query service', queryServiceContent, REQUIRED_QUERY_SERVICE_MARKERS),
    assertMarkers('Feed ranking service', rankingContent, REQUIRED_RANKING_MARKERS),
    assertMarkers('Feed promotion mixer', promotionMixerContent, REQUIRED_PROMOTION_MIXER_MARKERS),
    assertMarkers('Feed hydrator service', hydratorContent, REQUIRED_HYDRATOR_MARKERS),
    assertMarkers('Feed repository', repositoryContent, REQUIRED_REPOSITORY_MARKERS),
    assertMarkers('HomeFeedService feed wiring', homeFeedServiceContent, REQUIRED_HOME_FEED_SERVICE_MARKERS),
    assertForbiddenMarkersAbsent('HomeFeedService', homeFeedServiceContent, FORBIDDEN_HOME_FEED_INLINE_MARKERS),
    await assertFeedSchemaCompat(),
  ].every(Boolean);

  if (!ok) return;

  console.log('\nFeed module architecture scaffold is present.');
  console.log('Feed route module exists and preserves the expected route/cache/performance markers.');
  console.log(`Feed schema compatibility guard passed: no obsolete ${`ranking${'Value'}`} field references.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
