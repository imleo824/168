import prisma from '../../db';
import { listUserJoinedTopics } from '../../joined-topic.service';
import {
  RECOMMENDATION_INTERACTION_HALF_LIFE_HOURS,
  RECOMMENDATION_JOINED_CATEGORY_WEIGHT,
  RECOMMENDATION_QUICK_SKIP_REDUCTION_WEIGHT,
  RECOMMENDATION_SHARE_BASE_WEIGHT,
  RECOMMENDATION_VIEW_BASE_WEIGHT,
  normalizeDwellMs,
  toDateTimeValue,
  type RecommendationContext,
} from './ranking-utils';
import { isOptionalFeedDependencyUnavailable } from './feed-dependency';

const RECOMMENDATION_CONTEXT_TTL_MS = 120 * 1000;
const RECOMMENDATION_CONTEXT_CACHE_MAX_ENTRIES = 500;
const RECOMMENDATION_CONTEXT_SOFT_TIMEOUT_MS = 140;
const RECOMMENDATION_VIEW_CONTEXT_TAKE = 160;
const RECOMMENDATION_FEEDBACK_CONTEXT_TAKE = 120;
const RECOMMENDATION_JOINED_TOPIC_CONTEXT_TAKE = 96;
const RECOMMENDATION_SHARE_CONTEXT_TAKE = 80;
const RECOMMENDATION_VIEW_CONTEXT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const RECOMMENDATION_HIDDEN_POST_LIMIT = 500;

const recommendationContextCache = new Map<string, { expiresAt: number; data: RecommendationContext }>();
const recommendationContextInflight = new Map<string, Promise<RecommendationContext | null>>();
const recommendationContextUserGenerations = new Map<string, number>();
let recommendationContextGlobalGeneration = 0;

function normalizeSearchText(raw: unknown, maxLength = 80) {
  if (Array.isArray(raw)) return normalizeSearchText(raw[0], maxLength);
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function clearRecommendationContextCache(userId?: string | null) {
  if (userId) {
    recommendationContextCache.delete(userId);
    recommendationContextInflight.delete(userId);
    recommendationContextUserGenerations.set(
      userId,
      (recommendationContextUserGenerations.get(userId) || 0) + 1,
    );
    return;
  }
  recommendationContextGlobalGeneration += 1;
  recommendationContextCache.clear();
  recommendationContextInflight.clear();
}

function pruneRecommendationContextCache() {
  if (recommendationContextCache.size <= RECOMMENDATION_CONTEXT_CACHE_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [cacheKey, cached] of recommendationContextCache.entries()) {
    if (cached.expiresAt <= now) {
      recommendationContextCache.delete(cacheKey);
    }
  }

  while (recommendationContextCache.size > RECOMMENDATION_CONTEXT_CACHE_MAX_ENTRIES) {
    const firstKey = recommendationContextCache.keys().next().value;
    if (!firstKey) break;
    recommendationContextCache.delete(firstKey);
  }
}

function emptyRecommendationContext(): RecommendationContext {
  return {
    categoryWeights: new Map(),
    reducedCategoryWeights: new Map(),
    reducedAuthorWeights: new Map(),
    followedAuthorIds: new Set(),
    recentViewedPostIds: new Set(),
    recentViewedAtByPostId: new Map(),
    recentlyTouchedAuthorAt: new Map(),
    recentlyTouchedCategoryAt: new Map(),
    interactedPostIds: new Set(),
    reducedPostIds: new Set(),
    hiddenPostIds: new Set(),
    topCategoryIds: [],
  };
}

function addMapWeight(map: Map<string, number>, key: string | null | undefined, weight: number) {
  if (!key || weight <= 0) return;
  map.set(key, (map.get(key) || 0) + weight);
}

function addPreferenceFromPost(
  context: RecommendationContext,
  post: { id?: string; categoryId?: string | null },
  weight: number,
) {
  if (!post || weight <= 0) return;
  if (post.id) {
    context.interactedPostIds.add(post.id);
  }
  addMapWeight(context.categoryWeights, post.categoryId, weight);
}

function addRecentTouchAt(
  context: RecommendationContext,
  post: { userId?: string | null; categoryId?: string | null } | null | undefined,
  touchedAt: unknown,
) {
  const touchedTime = toDateTimeValue(touchedAt);
  if (!Number.isFinite(touchedTime)) return;

  if (post?.userId) {
    context.recentlyTouchedAuthorAt.set(post.userId, Math.max(
      context.recentlyTouchedAuthorAt.get(post.userId) || 0,
      touchedTime,
    ));
  }

  if (post?.categoryId) {
    context.recentlyTouchedCategoryAt.set(post.categoryId, Math.max(
      context.recentlyTouchedCategoryAt.get(post.categoryId) || 0,
      touchedTime,
    ));
  }
}

function addJoinedTopicPreference(context: RecommendationContext, topic: any, index: number) {
  const topicId = normalizeSearchText(topic?.topicId, 120);
  if (!topicId) return;

  const topicType = normalizeSearchText(topic?.topicType, 32).toLowerCase();
  if (topicType !== 'category') return;

  const decay = 1 / (1 + Math.max(0, index) * 0.055);
  addMapWeight(context.categoryWeights, topicId, RECOMMENDATION_JOINED_CATEGORY_WEIGHT * decay);
}

function getViewDwellPreferenceMultiplier(dwellMs: unknown) {
  const dwell = normalizeDwellMs(dwellMs);
  if (dwell <= 0) return 0.84;
  if (dwell < 2_000) return 0.92;
  if (dwell < 6_000) return 1.12;
  if (dwell < 15_000) return 1.55;
  return Math.min(2.5, 2.05 + Math.log1p((dwell - 15_000) / 5_000) * 0.12);
}

function getRecencyDecay(hoursSince: number, halfLifeHours: number) {
  if (!Number.isFinite(hoursSince) || !Number.isFinite(halfLifeHours) || halfLifeHours <= 0) return 0;
  return 1 / Math.pow(2, Math.max(0, hoursSince / halfLifeHours));
}

function addReductionFromPost(
  context: RecommendationContext,
  post: { userId?: string | null; categoryId?: string | null } | null | undefined,
  fallback: { authorId?: string | null; categoryId?: string | null },
  weight: number,
) {
  if (weight <= 0) return;
  addMapWeight(context.reducedAuthorWeights, post?.userId || fallback.authorId, weight * 0.72);
  addMapWeight(context.reducedCategoryWeights, post?.categoryId || fallback.categoryId, weight);
}

function finalizePreferenceContext(context: RecommendationContext) {
  context.topCategoryIds = Array.from(context.categoryWeights.entries())
    .map(([categoryId, weight]) => [
      categoryId,
      weight - (context.reducedCategoryWeights.get(categoryId) || 0) * 1.45,
    ] as const)
    .filter(([, score]) => score > 0.25)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([categoryId]) => categoryId);
  return context;
}

async function buildRecommendationContext(currentUserId?: string | null): Promise<RecommendationContext | null> {
  if (!currentUserId) return null;

  const cached = recommendationContextCache.get(currentUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inflight = recommendationContextInflight.get(currentUserId);
  if (inflight) return inflight;

  const pending = buildRecommendationContextUncached(currentUserId)
    .catch((error) => {
      console.warn('Recommendation context unavailable; falling back to base feed ranking:', error);
      return null;
    })
    .finally(() => {
      recommendationContextInflight.delete(currentUserId);
    });
  recommendationContextInflight.set(currentUserId, pending);
  return pending;
}

async function buildRecommendationContextUncached(currentUserId: string): Promise<RecommendationContext> {
  const globalGeneration = recommendationContextGlobalGeneration;
  const userGeneration = recommendationContextUserGenerations.get(currentUserId) || 0;
  const context = emptyRecommendationContext();
  const postPreferenceSelect = {
    id: true,
    userId: true,
    categoryId: true,
  };

  const [follows, joinedTopics, likes, shares, views, feedbacks] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: currentUserId },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { followingId: true },
    }),
    listUserJoinedTopics(currentUserId, RECOMMENDATION_JOINED_TOPIC_CONTEXT_TAKE),
    prisma.like.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: { postId: true, createdAt: true, post: { select: postPreferenceSelect } },
    }),
    prisma.postShare.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: 'desc' },
      take: RECOMMENDATION_SHARE_CONTEXT_TAKE,
      select: { postId: true, createdAt: true, post: { select: postPreferenceSelect } },
    }),
    prisma.postView.findMany({
      where: {
        viewerKey: `u:${currentUserId}`,
        createdAt: {
          gte: new Date(Date.now() - RECOMMENDATION_VIEW_CONTEXT_WINDOW_MS),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: RECOMMENDATION_VIEW_CONTEXT_TAKE,
      select: { postId: true, dwellMs: true, quickSkip: true, createdAt: true, post: { select: postPreferenceSelect } },
    }),
    (prisma as any).userRecommendationFeedback.findMany({
      where: {
        userId: currentUserId,
        action: 'REDUCE',
      },
      orderBy: { updatedAt: 'desc' },
      take: RECOMMENDATION_FEEDBACK_CONTEXT_TAKE,
      select: {
        postId: true,
        categoryId: true,
        authorId: true,
        updatedAt: true,
        post: { select: postPreferenceSelect },
      },
    }),
  ]);

  for (const follow of follows) {
    if (follow.followingId) {
      context.followedAuthorIds.add(follow.followingId);
    }
  }
  (joinedTopics as any[]).forEach((topic, index) => {
    addJoinedTopicPreference(context, topic, index);
  });

  likes.forEach((like, index) => {
    const likeAt = toDateTimeValue(like.createdAt);
    const ageHours = Number.isFinite(likeAt) ? (Date.now() - likeAt) / (1000 * 60 * 60) : 0;
    const weight = (3.2 / (1 + index * 0.045)) * getRecencyDecay(ageHours, RECOMMENDATION_INTERACTION_HALF_LIFE_HOURS);
    addPreferenceFromPost(context, like.post, weight);
    addRecentTouchAt(context, like.post, like.createdAt);
  });
  shares.forEach((share, index) => {
    const sharedAt = toDateTimeValue(share.createdAt);
    const ageHours = Number.isFinite(sharedAt) ? (Date.now() - sharedAt) / (1000 * 60 * 60) : 0;
    const weight = (
      RECOMMENDATION_SHARE_BASE_WEIGHT / (1 + index * 0.05)
    ) * getRecencyDecay(ageHours, RECOMMENDATION_INTERACTION_HALF_LIFE_HOURS * 1.45);
    addPreferenceFromPost(context, share.post, weight);
    addRecentTouchAt(context, share.post, share.createdAt);
  });
  let uniqueViewIndex = 0;
  views.forEach((view) => {
    if (!view.postId || context.recentViewedPostIds.has(view.postId)) return;
    context.recentViewedPostIds.add(view.postId);
    context.hiddenPostIds.add(view.postId);
    context.recentViewedAtByPostId.set(view.postId, new Date(view.createdAt).getTime());
    const viewAgeHours = (Date.now() - new Date(view.createdAt).getTime()) / (1000 * 60 * 60);
    const recencyWeight = getRecencyDecay(viewAgeHours, RECOMMENDATION_INTERACTION_HALF_LIFE_HOURS * 0.5);
    const positionWeight = 1 / (1 + uniqueViewIndex * 0.045);
    if (view.quickSkip) {
      addReductionFromPost(
        context,
        view.post,
        { authorId: view.post?.userId, categoryId: view.post?.categoryId },
        RECOMMENDATION_QUICK_SKIP_REDUCTION_WEIGHT * positionWeight * recencyWeight,
      );
    } else {
      const dwellMultiplier = getViewDwellPreferenceMultiplier(view.dwellMs);
      const weight = RECOMMENDATION_VIEW_BASE_WEIGHT * dwellMultiplier * positionWeight * recencyWeight;
      addPreferenceFromPost(context, view.post, weight);
    }
    addRecentTouchAt(context, view.post, view.createdAt);
    uniqueViewIndex += 1;
  });

  feedbacks.forEach((feedback: any, index: number) => {
    if (feedback.postId) {
      context.reducedPostIds.add(feedback.postId);
      context.hiddenPostIds.add(feedback.postId);
      context.recentViewedPostIds.add(feedback.postId);
      if (feedback.updatedAt) {
        context.recentViewedAtByPostId.set(feedback.postId, new Date(feedback.updatedAt).getTime());
      }
    }
    addReductionFromPost(
      context,
      feedback.post,
      {
        authorId: feedback.authorId,
        categoryId: feedback.categoryId,
      },
      4.6 / (1 + index * 0.04),
    );
    addRecentTouchAt(context, feedback.post, feedback.updatedAt || feedback.createdAt);
  });

  if (context.hiddenPostIds.size > RECOMMENDATION_HIDDEN_POST_LIMIT) {
    context.hiddenPostIds = new Set(Array.from(context.hiddenPostIds).slice(0, RECOMMENDATION_HIDDEN_POST_LIMIT));
  }

  const finalized = finalizePreferenceContext(context);
  if (
    globalGeneration === recommendationContextGlobalGeneration &&
    userGeneration === (recommendationContextUserGenerations.get(currentUserId) || 0)
  ) {
    recommendationContextCache.set(currentUserId, {
      expiresAt: Date.now() + RECOMMENDATION_CONTEXT_TTL_MS,
      data: finalized,
    });
    pruneRecommendationContextCache();
  }

  return finalized;
}

export async function safeBuildRecommendationContext(currentUserId?: string | null) {
  try {
    if (!currentUserId) return null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), RECOMMENDATION_CONTEXT_SOFT_TIMEOUT_MS);
      timeout.unref?.();
    });
    return await Promise.race([
      buildRecommendationContext(currentUserId),
      timeoutPromise,
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  } catch (error) {
    if (!isOptionalFeedDependencyUnavailable(error)) throw error;
    console.warn('Recommendation context unavailable; falling back to default feed:', error);
    return null;
  }
}
