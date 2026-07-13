import prisma from '../../db';
import { getFeedRankingProfile } from './ranking-profile';
import { toRecommendationScore } from './ranking-utils';
import { POST_UUID_PATTERN, normalizePostIds } from './post-identifiers';
import { rankedPostScoreSelect } from './post-selects';

const RANKING_REFRESH_BATCH_DELAY_MS = 450;
export const RANKING_REFRESH_BATCH_MAX_IDS = 160;
const RANKING_REFRESH_QUEUE_MAX_IDS = 1200;
const RANKING_REFRESH_CONCURRENCY = 4;

const pendingRankingRefreshIds = new Set<string>();
let rankingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

type TrustedAggregateRow = {
  normalLikeCount: number;
  normalViewCount: number;
  normalShareCount: number;
  normalCommentCount: number;
  normalQuoteCount: number;
  normalDwellMs: number;
  normalQuickSkipCount: number;
};

function resolvePostCountryFields(post: {
  countryCode?: string | null;
  countryName?: string | null;
  location?: string | null;
  title?: string | null;
  content?: string | null;
}) {
  return {
    countryCode: post.countryCode || null,
    countryName: post.countryName || null,
  };
}

function stripMembershipFieldsFromRankingUser(user: any) {
  if (!user) return user;
  return {
    id: user.id,
    userType: user.userType,
  };
}

async function readTrustedAggregate(postId: string): Promise<TrustedAggregateRow> {
  const rows = await prisma.$queryRaw<TrustedAggregateRow[]>`
    SELECT
      COALESCE("normalLikeCount", 0)::int AS "normalLikeCount",
      COALESCE("normalViewCount", 0)::int AS "normalViewCount",
      COALESCE("normalShareCount", 0)::int AS "normalShareCount",
      COALESCE("normalCommentCount", 0)::int AS "normalCommentCount",
      COALESCE("normalQuoteCount", 0)::int AS "normalQuoteCount",
      COALESCE("normalDwellMs", 0)::int AS "normalDwellMs",
      COALESCE("normalQuickSkipCount", 0)::int AS "normalQuickSkipCount"
    FROM "PostEngagementAggregate"
    WHERE "postId" = ${postId}
    LIMIT 1
  `;

  return rows[0] || {
    normalLikeCount: 0,
    normalViewCount: 0,
    normalShareCount: 0,
    normalCommentCount: 0,
    normalQuoteCount: 0,
    normalDwellMs: 0,
    normalQuickSkipCount: 0,
  };
}

export async function refreshPostRankingScore(postId: string) {
  if (!POST_UUID_PATTERN.test(String(postId || ''))) return false;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      ...rankedPostScoreSelect,
      deletedAt: true,
      isPublished: true,
    },
  });

  if (!post || (post as any).deletedAt || !(post as any).isPublished) {
    await prisma.postRankingScore.deleteMany({ where: { postId } });
    return false;
  }

  const aggregate = await readTrustedAggregate(postId);
  const scoredPost = {
    ...post,
    user: stripMembershipFieldsFromRankingUser((post as any).user),
    _trustedCounts: {
      likes: aggregate.normalLikeCount || 0,
      views: aggregate.normalViewCount || 0,
      shares: aggregate.normalShareCount || 0,
      comments: aggregate.normalCommentCount || 0,
      quotes: aggregate.normalQuoteCount || 0,
      dwellMs: aggregate.normalDwellMs || 0,
      quickSkips: aggregate.normalQuickSkipCount || 0,
    },
  };
  const rankingProfile = await getFeedRankingProfile();
  const now = Date.now();
  const recommendationScore = toRecommendationScore(scoredPost, null, now, rankingProfile.recommendation);
  const countryFields = resolvePostCountryFields(post as any);

  if (
    countryFields.countryCode &&
    ((post as any).countryCode !== countryFields.countryCode || (post as any).countryName !== countryFields.countryName)
  ) {
    await prisma.post.updateMany({
      where: { id: postId },
      data: countryFields,
    });
  }

  await prisma.postRankingScore.upsert({
    where: { postId },
    create: {
      postId,
      recommendationScore,
      countryCode: countryFields.countryCode,
      countryName: countryFields.countryName,
    },
    update: {
      recommendationScore,
      countryCode: countryFields.countryCode,
      countryName: countryFields.countryName,
    },
  });
  return true;
}

export async function refreshPostRankingScores(postIds: string[]) {
  const ids = normalizePostIds(postIds, RANKING_REFRESH_BATCH_MAX_IDS);
  if (ids.length <= 0) return;

  const workerCount = Math.min(RANKING_REFRESH_CONCURRENCY, ids.length);
  await Promise.all(
    Array.from({ length: workerCount }, async (_item, workerIndex) => {
      for (let index = workerIndex; index < ids.length; index += workerCount) {
        await refreshPostRankingScore(ids[index]);
      }
    }),
  );
}

export function schedulePostRankingRefresh(postIds: string | string[]) {
  const ids = (Array.isArray(postIds) ? postIds : [postIds])
    .map((id) => String(id || '').trim())
    .filter((id) => POST_UUID_PATTERN.test(id));
  if (ids.length <= 0) return;

  for (const id of ids) {
    if (pendingRankingRefreshIds.size >= RANKING_REFRESH_QUEUE_MAX_IDS) {
      console.warn('Post ranking refresh queue is full; dropping newest ids');
      break;
    }
    pendingRankingRefreshIds.add(id);
  }

  if (rankingRefreshTimer) return;
  rankingRefreshTimer = setTimeout(() => {
    rankingRefreshTimer = null;
    const batch = Array.from(pendingRankingRefreshIds).slice(0, RANKING_REFRESH_BATCH_MAX_IDS);
    batch.forEach((id) => pendingRankingRefreshIds.delete(id));
    void refreshPostRankingScores(batch)
      .catch((error) => {
        console.error('Failed to refresh queued post ranking scores', error);
        for (const id of batch) {
          if (pendingRankingRefreshIds.size >= RANKING_REFRESH_QUEUE_MAX_IDS) break;
          pendingRankingRefreshIds.add(id);
        }
      })
      .finally(() => {
        const nextId = pendingRankingRefreshIds.values().next().value;
        if (nextId) schedulePostRankingRefresh(nextId);
      });
  }, RANKING_REFRESH_BATCH_DELAY_MS);
  rankingRefreshTimer.unref?.();
}
