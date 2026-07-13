#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const HOME_FEED_PATH = 'server/services/home-feed.service.ts';
const FEED_MODULE_FILES = [
  'server/modules/feed/feed-query.service.ts',
  'server/modules/feed/feed-ranking.service.ts',
  'server/modules/feed/feed-promotion-mixer.ts',
  'server/modules/feed/feed-hydrator.service.ts',
  'server/repositories/feed.repository.ts',
];

const SERVICE_REQUIRED = [
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
  'feedRankingService.rankRecommendedRows',
  'feedPromotionMixer.mixPinnedRows',
];

const SERVICE_FORBIDDEN = [
  'prisma.post.findMany',
  'prisma.postRankingScore.findMany',
  'prisma.postRankingScore.findUnique',
  'prisma.user.findMany',
  'prisma.category.findMany',
  'prisma.like.findMany',
  'prisma.follow.findMany',
  'prisma.block.findMany',
  'promotionBooking.findMany',
  'userRecommendationFeedback.findMany',
  'compactFeedPostPayload',
  'compactQuotedPostPayload',
  'compactPostUser',
  'toPublicHeatScore',
  'attachRecentAuthorPostActivity',
  'function sortHumanRankedRows(',
  'function diversifyRecommendedRows(',
  'function applyPromotedPostBoost(',
];

function lineCount(content) {
  return content.split(/\r?\n/).length;
}

async function read(relativePath) {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function findMissing(content, markers) {
  return markers.filter((marker) => !content.includes(marker));
}

function findPresent(content, markers) {
  return markers.filter((marker) => content.includes(marker));
}

async function main() {
  console.log('\n=== Feed Service Preflight ===');

  const missingFiles = [];
  for (const file of [HOME_FEED_PATH, ...FEED_MODULE_FILES]) {
    if (!(await exists(file))) missingFiles.push(file);
  }

  if (missingFiles.length > 0) {
    console.log('\nMissing required files:');
    missingFiles.forEach((file) => console.log(`  - ${file}`));
    process.exitCode = 1;
    return;
  }

  const homeFeed = await read(HOME_FEED_PATH);
  const missingServiceMarkers = findMissing(homeFeed, SERVICE_REQUIRED);
  const forbiddenServiceMarkers = findPresent(homeFeed, SERVICE_FORBIDDEN);
  const homeFeedLines = lineCount(homeFeed);

  console.log(`HomeFeedService lines: ${homeFeedLines}`);
  console.log('Required module files:');
  FEED_MODULE_FILES.forEach((file) => console.log(`  - ${file}`));

  if (missingServiceMarkers.length > 0) {
    console.log('\nHomeFeedService is missing required wiring markers:');
    missingServiceMarkers.forEach((marker) => console.log(`  - ${marker}`));
  }

  if (forbiddenServiceMarkers.length > 0) {
    console.log('\nHomeFeedService still contains forbidden direct logic markers:');
    forbiddenServiceMarkers.forEach((marker) => console.log(`  - ${marker}`));
  }

  if (missingServiceMarkers.length > 0 || forbiddenServiceMarkers.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('\nFeed service preflight passed.');
  console.log('HomeFeedService is wired through feed modules and no longer contains direct DB/payload/ranking helpers targeted by this migration.');
}

main().catch((error) => {
  console.error('[feed-service-preflight] failed:', error);
  process.exitCode = 1;
});
