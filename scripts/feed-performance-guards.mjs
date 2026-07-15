import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

const packageJson = read('package.json');
const server = read('server/bootstrap.ts');
const postRoutes = read('server/routes/post.routes.ts');
const feedRoutes = read('server/routes/feed.routes.ts');
const postService = read('server/services/post/index.ts');
const recommendationContext = read('server/services/post/recommendation-context.ts');
const rankingUtils = read('server/services/post/ranking-utils.ts');
const homeFeedService = read('server/services/home-feed.service.ts');
const feedRankingService = read('server/modules/feed/feed-ranking.service.ts');
const publicFeedCache = read('server/public-feed-cache.ts');
const publicFeedWarmup = read('server/services/public-feed-warmup.service.ts');
const httpCache = read('server/http-cache.ts');
const performanceBudget = read('scripts/performance-budget-production.mjs');
const productionSmoke = read('scripts/smoke-production.mjs');
const rankingSyncSql = read('prisma/sql/sync_post_engagement_aggregates.sql');
const prismaSchema = read('prisma/schema.prisma');
const apiClient = read('src/services/api.ts');
const homeFeedQueries = read('src/hooks/useHomeFeedQueries.ts');
const homeFeedCacheKey = read('src/features/home/homeFeedCacheKey.ts');
const homePage = read('src/pages/Home.tsx');
const homeTopicTabs = read('src/features/home/HomeTopicTabs.tsx');

for (const path of [
  '/api/me',
  '/api/home/feed?feed=recommended&limit=20',
  '/api/posts?limit=20',
  '/api/notifications/home-summary',
  '/api/me/likes?limit=20',
  '/api/me/following?limit=30',
  '/api/me/fans?limit=30',
  '/api/me/transactions?limit=50',
  '/api/me/orders?limit=30',
  '/api/me/promotions',
]) {
  assert.ok(
    performanceBudget.includes(path),
    `production performance budget should cover logged-in endpoint ${path}`,
  );
}

assert.match(
  packageJson,
  /"test:feed-performance": "node scripts\/feed-performance-guards\.mjs"/,
  'feed performance guard should stay wired into npm test',
);

assert.match(
  postRoutes,
  /app\.get\('\/api\/posts'[\s\S]*?getPublicFeedResultCacheKey\(req, 'posts'/,
  'public feed should continue using the shared result cache',
);

assert.match(
  feedRoutes,
  /app\.get\('\/api\/home\/feed'[\s\S]*?getPublicFeedResultCacheKey\(req, 'home-feed'/,
  'dedicated home feed should use the shared result cache for anonymous recommended/category reads',
);

assert.match(
  server,
  /PUBLIC_FEED_RESPONSE_BUDGET_MS\s*=\s*200[\s\S]*registerPostRoutes\([\s\S]*PUBLIC_FEED_RESPONSE_BUDGET_MS[\s\S]*registerFeedRoutes\([\s\S]*PUBLIC_FEED_RESPONSE_BUDGET_MS/,
  'public feed requests should keep a server-side response budget below one second',
);

assert(
  publicFeedCache.includes('.then((result) => {') &&
    publicFeedCache.includes('setPublicFeedResultCache(key, result, result.items);'),
  'Timed-out public feed reads must populate the cache when their background work completes.',
);

assert.match(
  server,
  /PUBLIC_FEED_INITIAL_WARM_DELAY_MS\s*=\s*250[\s\S]*initialDelayMs: PUBLIC_FEED_INITIAL_WARM_DELAY_MS/,
  'public feed warmup should start almost immediately after the server begins listening',
);

assert.match(
  publicFeedWarmup,
  /setTimeout\(run, options\.initialDelayMs\)/,
  'public feed warmup service should honor the configured initial warm delay',
);

assert.match(
  [postRoutes, feedRoutes].join('\n'),
  /getPublicFeedFallbackCache\(publicCacheKey\)/,
  'public feed requests should be able to fall back to the last successful cached result under load',
);

assert.match(
  feedRoutes,
  /recommendedPostsFallbackKey[\s\S]*buildPublicFeedCacheKey\('posts'[\s\S]*getPublicFeedFallbackCache\(recommendedPostsFallbackKey\)/,
  'dedicated recommended home feed should reuse the legacy recommended feed last-good cache during cold starts',
);

assert.match(
  feedRoutes,
  /feedKind === 'recommended'[\s\S]*?PostService\.listPosts\(\{[\s\S]*?currentUserId[\s\S]*?limit[\s\S]*?cursor/,
  'dedicated recommended home feed should reuse the optimized PostService recommendation path',
);

assert.match(
  publicFeedCache,
  /feed[\s\S]*categorySlug[\s\S]*categoryMetaScope[\s\S]*categoryMetaFilters/,
  'public feed cache key should include home feed mode, category slug, and structured filters',
);

assert.match(
  homeFeedCacheKey,
  /export function stableHomeFeedParamsKey[\s\S]*JSON\.stringify\(stableHomeFeedParams\(params\)\)/,
  'home feed client cache keys should use stable sorted params for structured filters',
);

assert.match(
  homeFeedQueries,
  /const homeFeedRequestParamsKey = useMemo\([\s\S]*stableHomeFeedParamsKey\([\s\S]*categoryMetaFilters[\s\S]*\['posts', 'home-feed', HOME_FEED_QUERY_VERSION, viewerId \|\| 'anonymous', homeFeedRequestParamsKey\]/,
  'home feed React Query key must use the stable params string instead of the raw filters object',
);

assert.match(
  publicFeedCache,
  /publicFeedLastGoodCache[\s\S]*cacheState: 'FALLBACK'/,
  'public feed cache should retain the last successful payload for response-budget fallback',
);

assert.match(
  publicFeedCache,
  /toVersionlessFeedCacheKey[\s\S]*!part\.startsWith\('feedVersion='\)[\s\S]*publicFeedLastGoodCache\.set\(stableKey/,
  'public feed fallback cache should survive feed cache version bumps for short response-budget fallback',
);

assert.match(
  httpCache,
  /return false;/,
  'public feed responses should remain eligible for HTTP compression to reduce concurrent transfer time',
);

assert.doesNotMatch(
  httpCache,
  /req\.path === '\/api\/posts'|req\.path === '\/api\/home\/feed'/,
  'public feed endpoints must not be excluded from HTTP compression',
);

assert.doesNotMatch(
  httpCache,
  /no-transform/,
  'public feed cache headers must not disable HTTP compression transforms',
);

assert.match(
  postService,
  /recommendationScore[\s\S]*rankedCandidateTake[\s\S]*sliceRankedPage/,
  'recommendation feed should keep ranked pagination',
);

assert.doesNotMatch(
  homeFeedService,
  /function buildVisiblePostWhere[\s\S]*?userType\s*:\s*['"]NORMAL['"][\s\S]*?function buildCategoryMetaWhereFilters/,
  'home feed recall must not filter by author type; human/non-human only affects ranking order',
);

assert.match(
  feedRankingService,
  /function getFeedAuthorDisplayPriority[\s\S]*user\?\.userType === 'NORMAL'/,
  'home feed should keep author type as a ranking-only display priority',
);

assert.match(
  homeFeedService,
  /HOME_FEED_READ_CACHE_VERSION\s*=\s*'v11-config-driven-category-refs'[\s\S]*home-feed:result:\$\{HOME_FEED_READ_CACHE_VERSION\}/,
  'home feed result cache should stay versioned after category reference and avatar activity payload changes',
);

assert.match(
  recommendationContext,
  /RECOMMENDATION_CONTEXT_SOFT_TIMEOUT_MS\s*=\s*140/,
  'logged-in recommendation context should keep a soft timeout so cold personalization cannot block first feed paint',
);

assert.match(
  recommendationContext,
  /RECOMMENDATION_SHARE_CONTEXT_TAKE[\s\S]*prisma\.postShare\.findMany[\s\S]*addPreferenceFromPost\(context, share\.post/,
  'logged-in recommendation context should use real share events as a strong positive preference signal',
);

assert.match(
  rankingUtils,
  /RECOMMENDATION_FIRST_PAGE_FAST_MAX\s*=\s*72/,
  'logged-in recommendation first page should keep a bounded fast-path candidate window',
);

assert.match(
  prismaSchema,
  /model PostRankingScore \{[\s\S]*recommendationScore\s+Float\s+@default\(0\)[\s\S]*@@index\(\[recommendationScore\(sort: Desc\), postId\]/,
  'PostRankingScore should only expose the active recommendation rank path',
);

assert.match(
  rankingSyncSql,
  /INSERT INTO "PostRankingScore"[\s\S]*"recommendationScore"/,
  'rank sync should still maintain recommendation scores',
);

assert.match(
  rankingSyncSql,
  /ON CONFLICT \("postId"\) DO UPDATE SET[\s\S]*"recommendationScore" = EXCLUDED\."recommendationScore"/,
  'rank sync should refresh existing recommendation scores when the scoring algorithm changes',
);

assert.match(
  performanceBudget,
  /ENDPOINT_TIERS[\s\S]*health:\s*\{[\s\S]*p99Ms:\s*250[\s\S]*reference:\s*\{[\s\S]*p99Ms:\s*400[\s\S]*feed:\s*\{[\s\S]*p99Ms:\s*800[\s\S]*detail:\s*\{[\s\S]*p99Ms:\s*700[\s\S]*private:\s*\{[\s\S]*p99Ms:\s*900/,
  'production API performance budget should keep all core p99 tiers below one second',
);

assert.match(
  performanceBudget,
  /\/api\/home\/feed\?feed=recommended&limit=20/,
  'feed concurrency performance should cover the dedicated recommended home feed',
);

assert.match(
  productionSmoke,
  /assertFeed\('\/api\/home\/feed\?feed=recommended&limit=1'\)/,
  'production smoke should cover the dedicated recommended home feed contract',
);

assert.match(
  apiClient,
  /getPostsPage[\s\S]*categoryMetaFilters/,
  'legacy client feed requests should keep structured filter support',
);

assert.match(
  apiClient,
  /getHomeFeedPage[\s\S]*\/api\/home\/feed\?[\s\S]*categoryMetaFilters/,
  'home feed requests should keep the dedicated structured filter endpoint',
);

assert.match(
  homeFeedQueries,
  /useInfiniteQuery[\s\S]*getHomeFeedPage[\s\S]*getNextPageParam/,
  'home feed should keep paginated dedicated feed fetching',
);

assert.equal(
  (homeFeedQueries.match(/readHomeFeedSnapshot\(/g) || []).length,
  1,
  'home feed initial state should read the local snapshot once per query key',
);

assert.match(
  homeFeedQueries,
  /function getSnapshotInitialState[\s\S]*initialDataUpdatedAt: snapshot\.updatedAt/,
  'home feed should derive initial data and timestamp from the same snapshot read',
);

assert.match(
  homePage,
  /DEFAULT_HOME_TOPIC_TAB_ID/,
  'home page should fall back to a valid public topic tab',
);

assert.match(
  homeTopicTabs,
  /DEFAULT_HOME_TOPIC_TAB_ID: HomeTopicTabId = 'hot'/,
  'public home default should stay on the recommended hot tab',
);

console.log('[feed-performance-guards] passed');
