import {
  RECOMMENDATION_SCORE_PROFILE_FIELDS,
  type RecommendationScoreProfile,
} from './ranking-profile';

const RANKED_CURSOR_PREFIX = 'rank:v1:';

export const RECOMMENDATION_INTERACTION_HALF_LIFE_HOURS = 38;
export const RECOMMENDATION_AUTHOR_FATIGUE_HOURS = 96;
export const RECOMMENDATION_CATEGORY_FATIGUE_HOURS = 64;
export const RECOMMENDATION_VIEW_REPEAT_PENALTY_HOURS = 84;
export const RECOMMENDATION_DIVERSITY_SCAN_WINDOW = 96;
export const RECOMMENDATION_FIRST_PAGE_FAST_MIN = 36;
export const RECOMMENDATION_FIRST_PAGE_FAST_MAX = 72;
export const RECOMMENDATION_FIRST_PAGE_FAST_MULTIPLIER = 3.5;
export const RECOMMENDATION_JOINED_CATEGORY_WEIGHT = 5.6;
export const RECOMMENDATION_VIEW_BASE_WEIGHT = 0.30;
export const RECOMMENDATION_SHARE_BASE_WEIGHT = 4.8;
export const RECOMMENDATION_QUICK_SKIP_REDUCTION_WEIGHT = 1.15;

const AUTHOR_RECOMMENDATION_MULTIPLIER: Record<string, number> = {
  NORMAL: 1.12,
  OFFICIAL: 1.05,
  ROBOT: 0.8,
};

type RankedCursorPayload = {
  s: number;
  a: number;
  c: number;
  id: string;
  i?: number;
};

export type ListResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type RecommendationContext = {
  categoryWeights: Map<string, number>;
  reducedCategoryWeights: Map<string, number>;
  reducedAuthorWeights: Map<string, number>;
  followedAuthorIds: Set<string>;
  recentViewedPostIds: Set<string>;
  recentViewedAtByPostId: Map<string, number>;
  recentlyTouchedAuthorAt: Map<string, number>;
  recentlyTouchedCategoryAt: Map<string, number>;
  interactedPostIds: Set<string>;
  reducedPostIds: Set<string>;
  hiddenPostIds: Set<string>;
  topCategoryIds: string[];
};

export function safeCount(value: unknown) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.max(0, numberValue);
}

export function normalizeDwellMs(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(120_000, Math.max(0, Math.floor(numeric)));
}

export function toDateTimeValue(raw?: unknown) {
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw as any);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function getPostPublishedAt(post: any): number {
  return toDateTimeValue(post?.createdAt) ?? Date.now();
}

export function getPostActivityAt(post: any): number {
  return toDateTimeValue(post?.bumpedAt) ?? getPostPublishedAt(post);
}

function normalizeUserType(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function getAuthorRecommendationMultiplier(post: any) {
  const userType = normalizeUserType(post?.user?.userType);
  return AUTHOR_RECOMMENDATION_MULTIPLIER[userType] ?? 1;
}

export function getAuthorDisplayBoost(_post: any) {
  // Author weighting is inside persisted recommendationScore.
  return 0;
}

export function compareAuthorDisplayPriority(_a: any, _b: any) {
  // Hard author fallback sorting is forbidden in public feeds.
  return 0;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeRankingText(raw: unknown, maxLength = 80) {
  if (Array.isArray(raw)) return normalizeRankingText(raw[0], maxLength);
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function toRelativeHoursFromPublishedAt(post: any, referenceMs = Date.now()) {
  const publishedAt = getPostPublishedAt(post);
  return Math.max(0, (referenceMs - publishedAt) / (1000 * 60 * 60));
}

function ageHours(post: any) {
  const baseAt = getPostActivityAt(post);
  return Math.max(0, (Date.now() - baseAt) / (1000 * 60 * 60));
}

function deterministicJitter(seed: string, scale = 0.08) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * scale;
}

function normalizePostTitleSignature(raw?: unknown) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/["'`~【】[\]{}()<>。！？!?.,:;]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
}

export function getTuiPlusRankingBoostMultiplier(_userLike: any, _now = Date.now()) {
  // Tui Plus is presentation-only unless explicitly persisted into PostRankingScore.
  return 1;
}

export function rankedCandidateTake(limit: number, min: number, max: number, multiplier: number, cursorDepth = 0) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const baseTake = safeLimit * multiplier;
  const depthFactor = 1 + Math.min(0.65, Math.sqrt(Math.max(0, cursorDepth)) / Math.max(1, safeLimit * 0.78));
  return Math.min(max, Math.max(min, Math.ceil(baseTake * depthFactor)));
}

function getRankedScore(item: any, scoreKey: string) {
  const score = Number(item?.[scoreKey] || 0);
  return Number.isFinite(score) ? score : 0;
}

export function encodeRankedCursor(item: any, scoreKey: string, index?: number) {
  if (!item?.id) return null;
  const payload: RankedCursorPayload = {
    s: getRankedScore(item, scoreKey),
    a: getPostActivityAt(item),
    c: getPostPublishedAt(item),
    id: String(item.id),
    ...(Number.isFinite(index) ? { i: Math.max(0, Math.floor(index as number)) } : {}),
  };

  return `${RANKED_CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function decodeRankedCursor(cursor?: string | null): Partial<RankedCursorPayload> | null {
  if (!cursor) return null;
  if (!cursor.startsWith(RANKED_CURSOR_PREFIX)) return { id: cursor };

  try {
    const decoded = JSON.parse(Buffer.from(cursor.slice(RANKED_CURSOR_PREFIX.length), 'base64url').toString('utf8'));
    if (!decoded || typeof decoded.id !== 'string') return null;
    return {
      s: Number(decoded.s || 0),
      a: Number(decoded.a || 0),
      c: Number(decoded.c || 0),
      id: decoded.id,
      i: Number.isFinite(Number(decoded.i)) ? Math.max(0, Math.floor(Number(decoded.i))) : undefined,
    };
  } catch {
    return null;
  }
}

export function getRankedCursorDepth(cursor?: string | null) {
  const decoded = decodeRankedCursor(cursor);
  return typeof decoded?.i === 'number' && Number.isFinite(decoded.i) ? decoded.i + 1 : 0;
}

export function isRankedCursor(cursor?: string | null) {
  return typeof cursor === 'string' && cursor.startsWith(RANKED_CURSOR_PREFIX);
}

export function buildRankedScorePaginationFilter(cursor: string | undefined, scoreKey: 'recommendationScore') {
  if (!cursor || !isRankedCursor(cursor)) return null;
  const decoded = decodeRankedCursor(cursor);
  const score = Number(decoded?.s);
  const postId = typeof decoded?.id === 'string' ? decoded.id : '';
  if (!postId || !Number.isFinite(score)) return null;

  return {
    OR: [
      { [scoreKey]: { lt: score } },
      {
        AND: [
          { [scoreKey]: score },
          { postId: { lt: postId } },
        ],
      },
    ],
  };
}

export function emptyListResult<T = any>(): ListResult<T> {
  return { items: [], nextCursor: null, hasMore: false };
}

function isRankedItemAfterCursor(item: any, cursor: Partial<RankedCursorPayload>, scoreKey: string) {
  if (!cursor.id || !Number.isFinite(cursor.s) || !Number.isFinite(cursor.a) || !Number.isFinite(cursor.c)) {
    return false;
  }

  const score = getRankedScore(item, scoreKey);
  if (Math.abs(score - (cursor.s as number)) > 1e-6) return score < (cursor.s as number);

  const activityAt = getPostActivityAt(item);
  if (activityAt !== cursor.a) return activityAt < (cursor.a as number);

  const publishedAt = getPostPublishedAt(item);
  if (publishedAt !== cursor.c) return publishedAt < (cursor.c as number);

  return String(item.id || '').localeCompare(cursor.id) < 0;
}

export function sliceRankedPage<T extends { id?: string }>(items: T[], limit: number, cursor: string | undefined, scoreKey: string) {
  const decodedCursor = decodeRankedCursor(cursor);
  let startIndex = 0;

  if (decodedCursor?.id) {
    const exactIndex = items.findIndex((item) => item.id === decodedCursor.id);
    if (exactIndex >= 0) {
      startIndex = exactIndex + 1;
    } else if (typeof decodedCursor.i === 'number' && Number.isFinite(decodedCursor.i)) {
      startIndex = Math.min(items.length, Math.max(0, Math.floor(decodedCursor.i) + 1));
    } else if (Number.isFinite(decodedCursor.s) && Number.isFinite(decodedCursor.a) && Number.isFinite(decodedCursor.c)) {
      const afterIndex = items.findIndex((item) => isRankedItemAfterCursor(item, decodedCursor, scoreKey));
      startIndex = afterIndex >= 0 ? afterIndex : items.length;
    }
  }

  const pageItems = items.slice(startIndex, startIndex + limit);
  const hasMore = items.length > startIndex + limit;
  const nextCursor = hasMore && pageItems.length > 0
    ? encodeRankedCursor(pageItems[pageItems.length - 1], scoreKey, startIndex + pageItems.length - 1)
    : null;

  return { pageItems, hasMore, nextCursor };
}

function getLinearlyDecayedPenalty(hoursSince: number, maxPenalty: number, horizonHours: number) {
  if (maxPenalty <= 0 || horizonHours <= 0 || !Number.isFinite(hoursSince)) return 0;
  return Math.max(0, maxPenalty * (1 - Math.min(1, hoursSince / horizonHours)));
}

function toPersonalizationScore(
  post: any,
  context?: RecommendationContext | null,
  now = Date.now(),
  authorFollowBoost = RECOMMENDATION_SCORE_PROFILE_FIELDS.authorFollowBoost,
) {
  if (!context) return 0;

  let score = 0;
  if (post.id && context.reducedPostIds.has(post.id)) score -= 6;
  if (post.userId && context.followedAuthorIds.has(post.userId)) score += Math.min(2.6, Math.max(0, authorFollowBoost));
  if (post.userId) score -= Math.min(2.2, (context.reducedAuthorWeights.get(post.userId) || 0) * 0.20);
  if (post.categoryId) {
    score += Math.min(2.4, (context.categoryWeights.get(post.categoryId) || 0) * 0.18);
    score -= Math.min(3.0, (context.reducedCategoryWeights.get(post.categoryId) || 0) * 0.22);
  }

  if (post.id && context.recentViewedPostIds.has(post.id)) {
    const viewedAt = context.recentViewedAtByPostId.get(post.id);
    const hoursSinceView = viewedAt ? Math.max(0, (now - viewedAt) / (1000 * 60 * 60)) : 168;
    score -= getLinearlyDecayedPenalty(hoursSinceView, 1.95, RECOMMENDATION_VIEW_REPEAT_PENALTY_HOURS)
      + getLinearlyDecayedPenalty(hoursSinceView, 1.15, RECOMMENDATION_VIEW_REPEAT_PENALTY_HOURS / 2);
  }
  if (post.userId && context.recentlyTouchedAuthorAt.has(post.userId)) {
    const touchAt = context.recentlyTouchedAuthorAt.get(post.userId) || 0;
    const hoursSinceAuthorTouch = touchAt ? Math.max(0, (now - touchAt) / (1000 * 60 * 60)) : Number.POSITIVE_INFINITY;
    score -= getLinearlyDecayedPenalty(hoursSinceAuthorTouch, 1.6, RECOMMENDATION_AUTHOR_FATIGUE_HOURS);
  }
  if (post.categoryId && context.recentlyTouchedCategoryAt.has(post.categoryId)) {
    const touchAt = context.recentlyTouchedCategoryAt.get(post.categoryId) || 0;
    const hoursSinceCategoryTouch = touchAt ? Math.max(0, (now - touchAt) / (1000 * 60 * 60)) : Number.POSITIVE_INFINITY;
    score -= getLinearlyDecayedPenalty(hoursSinceCategoryTouch, 1.05, RECOMMENDATION_CATEGORY_FATIGUE_HOURS);
  }
  if (post.id && context.interactedPostIds.has(post.id)) score -= 0.35;

  return Math.max(-6.5, Math.min(5.8, score));
}

function getPostTextLength(post: any) {
  const title = typeof post?.title === 'string' ? post.title : '';
  const content = typeof post?.content === 'string' ? post.content : '';
  return `${title}\n${content}`
    .replace(/#[^\s#]+/g, '')
    .replace(/\s+/g, '')
    .trim()
    .length;
}

function getTextQualityMultiplier(textLength: number, cap: number) {
  const safeCap = Math.max(0, cap);
  if (textLength <= 0) return 0.9;
  if (textLength < 18) return 0.94;
  if (textLength < 45) return 0.99;
  if (textLength < 120) return 1 + Math.min(safeCap * 0.45, (textLength - 45) / 75 * safeCap * 0.45);
  if (textLength < 420) return 1 + Math.min(safeCap, safeCap * 0.45 + (textLength - 120) / 300 * safeCap * 0.55);
  return 1 + safeCap;
}

function getRecommendationContentQualityMultiplier(post: any, imageCount: number, profile: RecommendationScoreProfile) {
  const textMultiplier = getTextQualityMultiplier(getPostTextLength(post), profile.textQualityBoostCap);
  const multiImageMultiplier = imageCount > 1
    ? 1 + Math.min(profile.multiImageBoostCap, Math.log1p(imageCount - 1) * 0.055)
    : 1;
  const contactMultiplier =
    post?.showContact !== false && normalizeRankingText(post?.contact, 120).length > 0
      ? profile.contactBoost
      : 1;
  const anonymousMultiplier = post?.isAnonymous ? profile.anonymousBoost : 1;

  return clampNumber(
    textMultiplier * multiImageMultiplier * contactMultiplier * anonymousMultiplier,
    0.62,
    1.85,
  );
}

function readTrustedCount(post: any, key: string, aggregateKey?: string) {
  return safeCount(
    post?._trustedCounts?.[key]
    ?? (aggregateKey ? post?.engagementAggregate?.[aggregateKey] : undefined)
    ?? post?.[`normal${key[0]?.toUpperCase?.() || ''}${key.slice(1)}Count`]
  );
}

function getTrustedInteractionCounts(post: any) {
  const views = readTrustedCount(post, 'views', 'normalViewCount');
  const likes = readTrustedCount(post, 'likes', 'normalLikeCount');
  const comments = readTrustedCount(post, 'comments', 'normalCommentCount');
  const quotes = readTrustedCount(post, 'quotes', 'normalQuoteCount');
  const shares = readTrustedCount(post, 'shares', 'normalShareCount');
  const dwellMs = normalizeDwellMs(post?._trustedCounts?.dwellMs ?? post?.engagementAggregate?.normalDwellMs ?? post?.normalDwellMs);
  const quickSkips = Math.min(views, readTrustedCount(post, 'quickSkips', 'normalQuickSkipCount'));
  const avgDwellMs = views > 0 ? dwellMs / views : 0;
  const quickSkipRate = views > 0 ? quickSkips / views : 0;
  const dwellBoost = 0.92 + Math.min(0.30, Math.log1p(avgDwellMs / 1600) * 0.095);
  const quickSkipPenalty = quickSkipRate >= 0.42
    ? 0.66
    : quickSkipRate >= 0.24
      ? 0.80
      : quickSkipRate >= 0.12
        ? 0.91
        : 1;

  return {
    views,
    likes,
    comments,
    quotes,
    shares,
    avgDwellMs,
    quickSkipRate,
    trustBoost: dwellBoost * quickSkipPenalty,
  };
}

export function toRecommendationScore(
  post: any,
  context?: RecommendationContext | null,
  now = Date.now(),
  profile: RecommendationScoreProfile = RECOMMENDATION_SCORE_PROFILE_FIELDS,
) {
  const p = profile;
  const activityHours = ageHours(post);
  const publishedHours = toRelativeHoursFromPublishedAt(post);
  const interactions = getTrustedInteractionCounts(post);
  const views = interactions.views;
  const likes = interactions.likes;
  const comments = interactions.comments;
  const quotes = interactions.quotes;
  const shares = interactions.shares;
  const imageCount = Array.isArray(post.images) ? post.images.length : 0;
  const contentQualityMultiplier = getRecommendationContentQualityMultiplier(post, imageCount, p);

  const viewSignal = Math.log1p(views) * p.view * 2.8;
  const engagementSignal = likes * p.like + comments * 1.45 + quotes * p.quote + shares * p.share;
  const interactionSignal = viewSignal + engagementSignal;
  const qualitySignal = Math.log1p(interactionSignal + imageCount * (1.05 + p.mediaBoostCap));
  const meaningfulActions = likes + comments * 1.35 + quotes * 2.15 + shares * 3.05;
  const intentSignal = Math.log1p(likes * 0.85 + comments * 1.10 + quotes * 2.2 + shares * 3.5);
  const engagementRate = (meaningfulActions + 1.2) / (views + 22);
  const rateLift = 0.90 + Math.min(1.42, Math.log1p(engagementRate * 13) * 0.68);
  const densityBoost = 1 + Math.min(0.22, Math.log1p(engagementRate * 9) * 0.13);
  const lowEngagementPenalty =
    views >= 220 && meaningfulActions / Math.max(views, 1) < 0.012
      ? 0.58
      : views >= 100 && meaningfulActions < 1.5
        ? 0.70
        : views >= 60 && meaningfulActions === 0
          ? 0.76
          : 1;
  const velocity = meaningfulActions / Math.max(activityHours, 1.2);
  const velocityBoost = 1 + Math.min(1.24, Math.log1p(velocity) * 0.40 + Math.log1p(engagementRate * 8) * 0.20);
  const effectiveSamples = views * 0.28 + meaningfulActions * 3.4;
  const confidence = Math.min(
    p.confidenceCap,
    0.24 + qualitySignal * p.qualityWeight + Math.min(0.42, Math.log1p(effectiveSamples) / 18),
  );

  const recencyHalfLife = clampNumber(p.freshnessHalfLifeHours, 0.1, 120);
  const halfLifeDecay = 1 / (1 + (activityHours / recencyHalfLife) * Math.log(2));
  const warmBoost = publishedHours <= p.warmHours ? p.warmBoost : 1;
  const mediaBoost = imageCount > 0 ? 1 + Math.min(p.mediaBoostCap, imageCount * p.mediaBoostStep) : p.mediaPenaltyNoImage;
  const hasLocation = normalizeRankingText(post.location, 48).length > 0;
  const titleSignatureLength = normalizePostTitleSignature(post.title).length;
  const businessFitBoost =
    (hasLocation ? 1.035 : 0.985) *
    (titleSignatureLength >= 8 ? 1.025 : titleSignatureLength > 0 ? 1 : 0.965);
  const stalePenalty = 1 + Math.pow(Math.max(0, publishedHours - p.stalePenaltyHours), p.staleExponent) / 20;
  const freshnessPenalty = 1 / stalePenalty;
  const coldStartBoost = meaningfulActions === 0 && publishedHours <= p.coldStartHours ? p.maxColdStartBoost : 0;
  const noveltyBoost = 1 + Math.min(0.28, 1 / Math.sqrt(Math.max(1, views + 16)));
  const underExposedBoost = views <= 36 && publishedHours <= 36
    ? 1 + Math.min(0.20, (hasLocation ? 0.07 : 0) + (imageCount > 0 ? 0.06 : 0) + Math.max(0, 36 - publishedHours) / 420)
    : 1;
  const saturationPenalty =
    views >= 1400 && engagementRate < 0.01
      ? 0.74
      : views >= 700 && engagementRate < 0.007
        ? 0.86
        : 1;

  const personalization = toPersonalizationScore(post, context, now, p.authorFollowBoost);
  const jitterSeed = `${post.id || ''}${post.userId || ''}${getPostPublishedAt(post)}${Math.floor(now / (1000 * 60 * 60 * 24))}`;
  const baseScore =
    (qualitySignal * confidence + intentSignal * 0.78 + coldStartBoost) *
    rateLift *
    densityBoost *
    lowEngagementPenalty *
    velocityBoost *
    warmBoost *
    noveltyBoost *
    underExposedBoost *
    mediaBoost *
    businessFitBoost *
    contentQualityMultiplier *
    interactions.trustBoost *
    halfLifeDecay *
    freshnessPenalty *
    saturationPenalty;

  const effectiveScore = baseScore * getAuthorRecommendationMultiplier(post);
  const score =
    effectiveScore +
    personalization +
    deterministicJitter(jitterSeed, 0.06) * p.scoreScale;

  return Number(Math.max(0, score).toFixed(6));
}

export function toPrecomputedRecommendationScore(
  post: any,
  context?: RecommendationContext | null,
  now = Date.now(),
  profile: RecommendationScoreProfile = RECOMMENDATION_SCORE_PROFILE_FIELDS,
) {
  const baseScore = Number(post?.rankingScore?.recommendationScore || 0);
  if (!Number.isFinite(baseScore) || baseScore <= 0) {
    return toRecommendationScore(post, context, now, profile);
  }

  // Persisted score already includes NORMAL-user trusted engagement and author userType multiplier.
  const personalization = toPersonalizationScore(post, context, now, profile.authorFollowBoost);
  const jitterSeed = `${post.id || ''}${post.userId || ''}${getPostPublishedAt(post)}${Math.floor(now / (1000 * 60 * 60 * 24))}`;
  return Number(Math.max(0, baseScore + personalization + deterministicJitter(jitterSeed, 0.04) * profile.scoreScale).toFixed(6));
}
