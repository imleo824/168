type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type FeedCacheOptions = {
  maxEntries: number;
};

export const FEED_READ_CACHE_TTL_MS = {
  anonymousFeed: 20_000,
  userFeed: 5_000,
  metadata: 120_000,
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

export function buildFeedCacheKey(scope: string, input: Record<string, unknown>) {
  return `${scope}:${JSON.stringify(stableNormalize(input))}`;
}

export class FeedReadCache {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: FeedCacheOptions) {
    this.maxEntries = Math.max(32, options.maxEntries);
  }

  private touchEntry(key: string, entry: CacheEntry<unknown>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) {
      this.touchEntry(key, cached);
      return cached.value as T;
    }

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  get<T>(key: string): T | null {
    const cached = this.entries.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    this.touchEntry(key, cached);
    return cached.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.entries.set(key, { value, expiresAt: Date.now() + Math.max(100, ttlMs) });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  deleteByPrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }
}

export const feedReadCache = new FeedReadCache({ maxEntries: 900 });
