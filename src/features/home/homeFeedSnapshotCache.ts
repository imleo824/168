import { safeLocalStorage } from '@/utils/storage';
import type { CategoryMetaFeedFilters, Post } from '@/types';
import type { HomeFeedKind } from '@/features/home/homeTypes';

const HOME_FEED_SNAPSHOT_PREFIX = 'tuitui:home-feed-snapshot:';
const HOME_FEED_SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 12;
const HOME_FEED_SNAPSHOT_MAX_ITEMS = 10;

type HomeFeedSnapshotPage = {
  items: Post[];
  nextCursor: string | null;
  hasMore: boolean;
};

type HomeFeedSnapshot = {
  version: string;
  viewer: string;
  params: HomeFeedSnapshotParams;
  updatedAt: number;
  page: HomeFeedSnapshotPage;
};

export type HomeFeedSnapshotParams = {
  feed: HomeFeedKind;
  categorySlug?: string;
  categoryMetaScope?: string;
  categoryMetaFilters?: CategoryMetaFeedFilters;
};

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next !== undefined && next !== null && next !== '') acc[key] = stableNormalize(next);
        return acc;
      }, {});
  }
  return value;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function buildHomeFeedSnapshotKey(version: string, viewerId: string | null | undefined, params: HomeFeedSnapshotParams) {
  const viewer = viewerId ? `user:${viewerId}` : 'anonymous';
  return `${HOME_FEED_SNAPSHOT_PREFIX}${version}:${viewer}:${JSON.stringify(stableNormalize(params))}`;
}

function isValidSnapshot(snapshot: HomeFeedSnapshot | null, version: string, viewerId: string | null | undefined) {
  if (!snapshot || snapshot.version !== version) return false;
  const viewer = viewerId ? `user:${viewerId}` : 'anonymous';
  if (snapshot.viewer !== viewer) return false;
  if (!snapshot.updatedAt || Date.now() - snapshot.updatedAt > HOME_FEED_SNAPSHOT_TTL_MS) return false;
  if (!snapshot.page || !Array.isArray(snapshot.page.items) || snapshot.page.items.length <= 0) return false;
  return true;
}

export function readHomeFeedSnapshot(version: string, viewerId: string | null | undefined, params: HomeFeedSnapshotParams) {
  const snapshot = safeJsonParse<HomeFeedSnapshot>(safeLocalStorage.getItem(buildHomeFeedSnapshotKey(version, viewerId, params)));
  if (!isValidSnapshot(snapshot, version, viewerId)) return null;
  return snapshot;
}

export function writeHomeFeedSnapshot(
  version: string,
  viewerId: string | null | undefined,
  params: HomeFeedSnapshotParams,
  page: HomeFeedSnapshotPage | undefined | null,
) {
  if (!page || !Array.isArray(page.items) || page.items.length <= 0) return;
  const key = buildHomeFeedSnapshotKey(version, viewerId, params);
  const viewer = viewerId ? `user:${viewerId}` : 'anonymous';
  const snapshot: HomeFeedSnapshot = {
    version,
    viewer,
    params,
    updatedAt: Date.now(),
    page: {
      items: page.items.slice(0, HOME_FEED_SNAPSHOT_MAX_ITEMS),
      nextCursor: page.nextCursor || null,
      hasMore: Boolean(page.hasMore),
    },
  };

  try {
    safeLocalStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota / private mode failures; network data remains the source of truth.
  }
}

export function clearHomeFeedSnapshots() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(HOME_FEED_SNAPSHOT_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => safeLocalStorage.removeItem(key));
  } catch {
    // Snapshot cleanup is best-effort. React Query invalidation remains the source of truth.
  }
}
