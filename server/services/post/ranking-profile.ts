import { ConfigService } from '../../config.service';

export const RECOMMENDATION_CANDIDATE_MIN = 96;
export const RECOMMENDATION_CANDIDATE_MAX = 420;
export const FEED_RANK_PROFILE_CACHE_TTL_MS = 120_000;

export type RecommendationScoreProfile = {
  view: number;
  like: number;
  quote: number;
  share: number;
  freshnessHalfLifeHours: number;
  qualityWeight: number;
  confidenceCap: number;
  stalePenaltyHours: number;
  staleExponent: number;
  maxColdStartBoost: number;
  coldStartHours: number;
  authorFollowBoost: number;
  warmHours: number;
  warmBoost: number;
  mediaBoostStep: number;
  mediaBoostCap: number;
  mediaPenaltyNoImage: number;
  humanSourceBoost: number;
  webhookSourcePenalty: number;
  textQualityBoostCap: number;
  contactBoost: number;
  anonymousBoost: number;
  multiImageBoostCap: number;
  scoreScale: number;
};

export type FeedRankingProfile = {
  recommendation: RecommendationScoreProfile;
  candidate: {
    recommendationMin: number;
    recommendationMax: number;
  };
};

const RECOMMENDATION_SCORE_WEIGHTS: Omit<
  RecommendationScoreProfile,
  | 'authorFollowBoost'
  | 'warmHours'
  | 'warmBoost'
  | 'mediaBoostStep'
  | 'mediaBoostCap'
  | 'mediaPenaltyNoImage'
  | 'humanSourceBoost'
  | 'webhookSourcePenalty'
  | 'textQualityBoostCap'
  | 'contactBoost'
  | 'anonymousBoost'
  | 'multiImageBoostCap'
  | 'scoreScale'
> = {
  view: 0.16,
  like: 1.05,
  quote: 2.55,
  share: 3.85,
  freshnessHalfLifeHours: 18,
  qualityWeight: 0.62,
  confidenceCap: 1.70,
  stalePenaltyHours: 168,
  staleExponent: 0.38,
  maxColdStartBoost: 0.38,
  coldStartHours: 6,
};

export const RECOMMENDATION_SCORE_PROFILE_FIELDS: RecommendationScoreProfile = {
  view: RECOMMENDATION_SCORE_WEIGHTS.view,
  like: RECOMMENDATION_SCORE_WEIGHTS.like,
  quote: RECOMMENDATION_SCORE_WEIGHTS.quote,
  share: RECOMMENDATION_SCORE_WEIGHTS.share,
  freshnessHalfLifeHours: RECOMMENDATION_SCORE_WEIGHTS.freshnessHalfLifeHours,
  qualityWeight: RECOMMENDATION_SCORE_WEIGHTS.qualityWeight,
  confidenceCap: RECOMMENDATION_SCORE_WEIGHTS.confidenceCap,
  stalePenaltyHours: RECOMMENDATION_SCORE_WEIGHTS.stalePenaltyHours,
  staleExponent: RECOMMENDATION_SCORE_WEIGHTS.staleExponent,
  maxColdStartBoost: RECOMMENDATION_SCORE_WEIGHTS.maxColdStartBoost,
  coldStartHours: RECOMMENDATION_SCORE_WEIGHTS.coldStartHours,
  authorFollowBoost: 1.28,
  warmHours: 4,
  warmBoost: 1.08,
  mediaBoostStep: 0.035,
  mediaBoostCap: 0.20,
  mediaPenaltyNoImage: 0.92,
  humanSourceBoost: 1.14,
  webhookSourcePenalty: 0.86,
  textQualityBoostCap: 0.16,
  contactBoost: 1.06,
  anonymousBoost: 1.03,
  multiImageBoostCap: 0.12,
  scoreScale: 1,
};

export const DEFAULT_FEED_RANK_PROFILE: FeedRankingProfile = {
  recommendation: { ...RECOMMENDATION_SCORE_PROFILE_FIELDS },
  candidate: {
    recommendationMin: RECOMMENDATION_CANDIDATE_MIN,
    recommendationMax: RECOMMENDATION_CANDIDATE_MAX,
  },
};

const FEED_RANK_PROFILE_KEY = 'feed_rank_profile';
let feedRankingProfileCache: { expiresAt: number; data: FeedRankingProfile } | null = null;
let feedRankingProfileReady = false;

function normalizeProfileValue(input: unknown, fallback: number, limits: { min?: number; max?: number; integer?: boolean } = {}) {
  const parsed = Number(input as any);
  if (!Number.isFinite(parsed)) return fallback;
  let value = limits.integer ? Math.round(parsed) : parsed;
  if (typeof limits.min === 'number') value = Math.max(limits.min, value);
  if (typeof limits.max === 'number') value = Math.min(limits.max, value);
  return value;
}

function applyRecommendationProfile(raw: unknown): RecommendationScoreProfile {
  if (!raw || typeof raw !== 'object') return { ...RECOMMENDATION_SCORE_PROFILE_FIELDS };
  const value = raw as any;
  const fallback = RECOMMENDATION_SCORE_PROFILE_FIELDS;
  return {
    view: normalizeProfileValue(value?.view, fallback.view, { min: 0, max: 5 }),
    like: normalizeProfileValue(value?.like, fallback.like, { min: 0, max: 20 }),
    quote: normalizeProfileValue(value?.quote, fallback.quote, { min: 0, max: 30 }),
    share: normalizeProfileValue(value?.share, fallback.share, { min: 0, max: 40 }),
    freshnessHalfLifeHours: normalizeProfileValue(value?.freshnessHalfLifeHours, fallback.freshnessHalfLifeHours, { min: 4, max: 72, integer: true }),
    qualityWeight: normalizeProfileValue(value?.qualityWeight, fallback.qualityWeight, { min: 0, max: 2 }),
    confidenceCap: normalizeProfileValue(value?.confidenceCap, fallback.confidenceCap, { min: 0.2, max: 4 }),
    stalePenaltyHours: normalizeProfileValue(value?.stalePenaltyHours, fallback.stalePenaltyHours, { min: 8, max: 720, integer: true }),
    staleExponent: normalizeProfileValue(value?.staleExponent, fallback.staleExponent, { min: 0.1, max: 3 }),
    maxColdStartBoost: normalizeProfileValue(value?.maxColdStartBoost, fallback.maxColdStartBoost, { min: 0, max: 2 }),
    coldStartHours: normalizeProfileValue(value?.coldStartHours, fallback.coldStartHours, { min: 1, max: 72, integer: true }),
    authorFollowBoost: normalizeProfileValue(value?.authorFollowBoost, fallback.authorFollowBoost, { min: 0, max: 6 }),
    warmHours: normalizeProfileValue(value?.warmHours, fallback.warmHours, { min: 1, max: 24, integer: true }),
    warmBoost: normalizeProfileValue(value?.warmBoost, fallback.warmBoost, { min: 1, max: 3 }),
    mediaBoostStep: normalizeProfileValue(value?.mediaBoostStep, fallback.mediaBoostStep, { min: 0, max: 0.25 }),
    mediaBoostCap: normalizeProfileValue(value?.mediaBoostCap, fallback.mediaBoostCap, { min: 0, max: 1 }),
    mediaPenaltyNoImage: normalizeProfileValue(value?.mediaPenaltyNoImage, fallback.mediaPenaltyNoImage, { min: 0.5, max: 1 }),
    humanSourceBoost: normalizeProfileValue(value?.humanSourceBoost, fallback.humanSourceBoost, { min: 1, max: 1.8 }),
    webhookSourcePenalty: normalizeProfileValue(value?.webhookSourcePenalty, fallback.webhookSourcePenalty, { min: 0.55, max: 1 }),
    textQualityBoostCap: normalizeProfileValue(value?.textQualityBoostCap, fallback.textQualityBoostCap, { min: 0, max: 0.6 }),
    contactBoost: normalizeProfileValue(value?.contactBoost, fallback.contactBoost, { min: 1, max: 1.4 }),
    anonymousBoost: normalizeProfileValue(value?.anonymousBoost, fallback.anonymousBoost, { min: 1, max: 1.35 }),
    multiImageBoostCap: normalizeProfileValue(value?.multiImageBoostCap, fallback.multiImageBoostCap, { min: 0, max: 0.5 }),
    scoreScale: normalizeProfileValue(value?.scoreScale, fallback.scoreScale, { min: 0.5, max: 2 }),
  };
}

function applyFeedProfile(raw: unknown): FeedRankingProfile {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FEED_RANK_PROFILE };
  const value = raw as any;
  const recommendation = applyRecommendationProfile(value?.recommendation);
  const candidate = {
    recommendationMin: normalizeProfileValue(value?.candidate?.recommendationMin, DEFAULT_FEED_RANK_PROFILE.candidate.recommendationMin, { min: 60, max: 240, integer: true }),
    recommendationMax: normalizeProfileValue(value?.candidate?.recommendationMax, DEFAULT_FEED_RANK_PROFILE.candidate.recommendationMax, { min: 120, max: 720, integer: true }),
  };
  if (candidate.recommendationMin > candidate.recommendationMax) {
    [candidate.recommendationMin, candidate.recommendationMax] = [candidate.recommendationMax, candidate.recommendationMin];
  }
  return { recommendation, candidate };
}

export async function getFeedRankingProfile(): Promise<FeedRankingProfile> {
  const now = Date.now();
  if (feedRankingProfileReady && feedRankingProfileCache && feedRankingProfileCache.expiresAt > now) {
    return feedRankingProfileCache.data;
  }
  try {
    const configs = await ConfigService.getConfigs();
    const raw = typeof configs?.[FEED_RANK_PROFILE_KEY] === 'string'
      ? JSON.parse(configs[FEED_RANK_PROFILE_KEY] as string)
      : null;
    const profile = applyFeedProfile(raw);
    feedRankingProfileCache = {
      expiresAt: now + FEED_RANK_PROFILE_CACHE_TTL_MS,
      data: profile,
    };
    feedRankingProfileReady = true;
    return profile;
  } catch {
    const profile = { ...DEFAULT_FEED_RANK_PROFILE };
    feedRankingProfileCache = { expiresAt: now + FEED_RANK_PROFILE_CACHE_TTL_MS, data: profile };
    feedRankingProfileReady = true;
    return profile;
  }
}
