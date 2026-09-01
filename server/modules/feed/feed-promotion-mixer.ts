export type FeedPromotionPinMeta = {
  slotIndex: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export type FeedPromotableRow = {
  id: string;
  createdAt: Date | string | number;
};

export type FeedPromotionMixResult<TRow extends FeedPromotableRow> = {
  rows: TRow[];
  pinnedRows: TRow[];
  regularRows: TRow[];
  promotedPostIds: string[];
  regularLimit: number;
};

function toCreatedAtTime(value: FeedPromotableRow['createdAt']) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
}

export function getFeedPromotedPostIds(pinMetaMap: Map<string, FeedPromotionPinMeta> = new Map()) {
  return Array.from(pinMetaMap.keys()).filter(Boolean);
}

export function sortFeedPinnedRows<TRow extends FeedPromotableRow>(
  rows: TRow[],
  pinMetaMap: Map<string, FeedPromotionPinMeta> = new Map(),
) {
  return [...rows].sort((a, b) => {
    const slotDelta = (pinMetaMap.get(a.id)?.slotIndex ?? 99) - (pinMetaMap.get(b.id)?.slotIndex ?? 99);
    if (slotDelta !== 0) return slotDelta;
    const createdDelta = toCreatedAtTime(b.createdAt) - toCreatedAtTime(a.createdAt);
    if (createdDelta !== 0) return createdDelta;
    return b.id.localeCompare(a.id);
  });
}

export function splitFeedPinnedAndRegularRows<TRow extends FeedPromotableRow>(
  rows: TRow[],
  pinMetaMap: Map<string, FeedPromotionPinMeta> = new Map(),
) {
  const promotedPostIds = new Set(getFeedPromotedPostIds(pinMetaMap));
  const pinnedRows: TRow[] = [];
  const regularRows: TRow[] = [];

  for (const row of rows) {
    if (promotedPostIds.has(row.id)) pinnedRows.push(row);
    else regularRows.push(row);
  }

  return {
    pinnedRows: sortFeedPinnedRows(pinnedRows, pinMetaMap),
    regularRows,
    promotedPostIds: Array.from(promotedPostIds),
  };
}

export function mixFeedPinnedRows<TRow extends FeedPromotableRow>(
  params: {
    pinnedRows: TRow[];
    regularRows: TRow[];
    limit: number;
    pinMetaMap?: Map<string, FeedPromotionPinMeta>;
  },
): FeedPromotionMixResult<TRow> {
  const limit = Math.max(0, Math.floor(Number(params.limit) || 0));
  const sortedPinnedRows = sortFeedPinnedRows(params.pinnedRows, params.pinMetaMap).slice(0, limit);
  const regularLimit = Math.max(0, limit - sortedPinnedRows.length);
  const regularRows = params.regularRows.slice(0, regularLimit);
  const promotedPostIds = getFeedPromotedPostIds(params.pinMetaMap);

  return {
    rows: [...sortedPinnedRows, ...regularRows],
    pinnedRows: sortedPinnedRows,
    regularRows,
    promotedPostIds,
    regularLimit,
  };
}

export function buildFeedRegularWhereExclusion<TWhere extends Record<string, unknown>>(
  where: TWhere,
  promotedPostIds: string[],
) {
  if (promotedPostIds.length === 0) return where;
  return {
    AND: [where, { id: { notIn: promotedPostIds } }],
  };
}

export class FeedPromotionMixer {
  getPromotedPostIds(pinMetaMap: Map<string, FeedPromotionPinMeta> = new Map()) {
    return getFeedPromotedPostIds(pinMetaMap);
  }

  sortPinnedRows<TRow extends FeedPromotableRow>(
    rows: TRow[],
    pinMetaMap: Map<string, FeedPromotionPinMeta> = new Map(),
  ) {
    return sortFeedPinnedRows(rows, pinMetaMap);
  }

  mixPinnedRows<TRow extends FeedPromotableRow>(params: {
    pinnedRows: TRow[];
    regularRows: TRow[];
    limit: number;
    pinMetaMap?: Map<string, FeedPromotionPinMeta>;
  }) {
    return mixFeedPinnedRows(params);
  }

  buildRegularWhereExclusion<TWhere extends Record<string, unknown>>(where: TWhere, promotedPostIds: string[]) {
    return buildFeedRegularWhereExclusion(where, promotedPostIds);
  }
}
