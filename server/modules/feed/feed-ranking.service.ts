export type FeedRankingAuthor = {
  id?: string | null;
  userType?: string | null;
  plusStatus?: string | null;
  plusExpiresAt?: Date | string | null;
  isTuiPlus?: boolean | null;
};

export type FeedRankingScore = {
  recommendationScore?: number | null;
};

export type FeedRankingRow = {
  id: string;
  userId?: string | null;
  categoryId?: string | null;
  createdAt: Date | string | number;
  user?: FeedRankingAuthor | null;
  rankingScore?: FeedRankingScore | null;
};

export type FeedRankingOptions = {
  isCursorPage?: boolean;
  promotedPostIds?: Set<string>;
  promotedPostBoost?: number;
  authorFatiguePenalty?: number;
  categoryFatiguePenalty?: number;
  scanWindowBase?: number;
};

const DEFAULT_PROMOTED_POST_RECOMMENDATION_BOOST = 500;
export const DEFAULT_HUMAN_AUTHOR_DISPLAY_BOOST = 1;
const DEFAULT_AUTHOR_FATIGUE_PENALTY = 0.82;
const DEFAULT_CATEGORY_FATIGUE_PENALTY = 0.24;
const DEFAULT_SCAN_WINDOW_BASE = 32;

function toFiniteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toCreatedAtTime(value: FeedRankingRow['createdAt']) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
}

export function getFeedRecommendationScore(row: Pick<FeedRankingRow, 'rankingScore' | 'user'>) {
  // recommendationScore is the persisted final sorting score:
  // NORMAL-user trusted engagement * author userType multiplier.
  // Do not apply author or membership multipliers here, or pagination and display order diverge.
  return toFiniteNumber(row.rankingScore?.recommendationScore, 0);
}

export function getFeedAuthorDisplayPriority(row: Pick<FeedRankingRow, 'user'>) {
  return row.user?.userType === 'NORMAL'
    ? DEFAULT_HUMAN_AUTHOR_DISPLAY_BOOST
    : 1;
}

export function applyFeedPromotedPostBoost<TRow extends FeedRankingRow>(
  row: TRow,
  promotedPostIds: Set<string>,
  boost = DEFAULT_PROMOTED_POST_RECOMMENDATION_BOOST,
): TRow {
  if (!promotedPostIds.has(row.id)) return row;
  return {
    ...row,
    rankingScore: {
      ...row.rankingScore,
      recommendationScore: toFiniteNumber(row.rankingScore?.recommendationScore, 0) + boost,
    },
  };
}

export function sortFeedHumanRankedRows<TRow extends FeedRankingRow>(rows: TRow[]) {
  return [...rows].sort((a, b) => {
    const scoreDiff = getFeedRecommendationScore(b) - getFeedRecommendationScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    const createdDiff = toCreatedAtTime(b.createdAt) - toCreatedAtTime(a.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return b.id.localeCompare(a.id);
  });
}

export function diversifyFeedRecommendedRows<TRow extends FeedRankingRow>(
  rows: TRow[],
  options: FeedRankingOptions = {},
) {
  const authorFatiguePenalty = options.authorFatiguePenalty ?? DEFAULT_AUTHOR_FATIGUE_PENALTY;
  const categoryFatiguePenalty = options.categoryFatiguePenalty ?? DEFAULT_CATEGORY_FATIGUE_PENALTY;
  const scanWindowBase = options.scanWindowBase ?? DEFAULT_SCAN_WINDOW_BASE;
  const pool = sortFeedHumanRankedRows(rows);
  const result: TRow[] = [];
  const authorSeen = new Map<string, number>();
  const categorySeen = new Map<string, number>();

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    const scanLimit = Math.min(pool.length, scanWindowBase + Math.floor(result.length / 4));

    for (let index = 0; index < scanLimit; index += 1) {
      const row = pool[index];
      const baseScore = getFeedRecommendationScore(row);
      const authorPenalty = row.userId ? (authorSeen.get(row.userId) || 0) * authorFatiguePenalty : 0;
      const categoryPenalty = row.categoryId ? (categorySeen.get(row.categoryId) || 0) * categoryFatiguePenalty : 0;
      const adjustedScore = baseScore - authorPenalty - categoryPenalty;
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIndex = index;
      }
    }

    const [picked] = pool.splice(bestIndex, 1);
    if (!picked) continue;
    result.push(picked);
    if (picked.userId) authorSeen.set(picked.userId, (authorSeen.get(picked.userId) || 0) + 1);
    if (picked.categoryId) categorySeen.set(picked.categoryId, (categorySeen.get(picked.categoryId) || 0) + 1);
  }

  return result;
}

export class FeedRankingService {
  rankRecommendedRows<TRow extends FeedRankingRow>(rows: TRow[], options: FeedRankingOptions = {}) {
    const promotedPostIds = options.promotedPostIds || new Set<string>();
    const boosted = rows.map((row) => applyFeedPromotedPostBoost(row, promotedPostIds, options.promotedPostBoost));
    return options.isCursorPage
      ? sortFeedHumanRankedRows(boosted)
      : diversifyFeedRecommendedRows(boosted, options);
  }

  sortStableRows<TRow extends FeedRankingRow>(rows: TRow[]) {
    return sortFeedHumanRankedRows(rows);
  }
}
