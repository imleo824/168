import prisma, { isDbConfigured } from '../../db';

export const RECENT_AVATAR_RING_HOURS_CONFIG_KEY = 'recent_avatar_ring_hours';
export const DEFAULT_RECENT_AUTHOR_POST_WINDOW_HOURS = 24;
const RECENT_AUTHOR_POST_WINDOW_MIN_HOURS = 1;
const RECENT_AUTHOR_POST_WINDOW_MAX_HOURS = 168;
const RECENT_AUTHOR_ACTIVITY_MAX_AUTHORS = 500;
const RECENT_AUTHOR_WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;

let recentAuthorWindowCache: { value: number; expiresAt: number } | null = null;

type RecentAuthorActivity = {
  hasRecentPost: boolean;
  recentPostCreatedAt: Date | null;
};

function normalizeRecentAuthorPostWindowHours(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RECENT_AUTHOR_POST_WINDOW_HOURS;
  return Math.min(
    RECENT_AUTHOR_POST_WINDOW_MAX_HOURS,
    Math.max(RECENT_AUTHOR_POST_WINDOW_MIN_HOURS, Math.round(parsed)),
  );
}

async function getRecentAuthorPostWindowHours() {
  if (!isDbConfigured()) return DEFAULT_RECENT_AUTHOR_POST_WINDOW_HOURS;

  if (recentAuthorWindowCache && recentAuthorWindowCache.expiresAt > Date.now()) {
    return recentAuthorWindowCache.value;
  }

  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: RECENT_AVATAR_RING_HOURS_CONFIG_KEY },
      select: { value: true },
    });
    const value = normalizeRecentAuthorPostWindowHours(config?.value);
    recentAuthorWindowCache = { value, expiresAt: Date.now() + RECENT_AUTHOR_WINDOW_CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.warn('[recent-author-activity] Failed to load recent avatar ring window config.', error);
    return DEFAULT_RECENT_AUTHOR_POST_WINDOW_HOURS;
  }
}

function uniqueAuthorIds(posts: any[]) {
  return Array.from(
    new Set(
      (posts || [])
        .map((post) => String(post?.userId || post?.user?.id || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, RECENT_AUTHOR_ACTIVITY_MAX_AUTHORS);
}

async function getRecentAuthorActivityMap(authorIds: string[]): Promise<Map<string, RecentAuthorActivity>> {
  const ids = Array.from(new Set(authorIds.map((id) => String(id || '').trim()).filter(Boolean))).slice(0, RECENT_AUTHOR_ACTIVITY_MAX_AUTHORS);
  const activityMap = new Map<string, RecentAuthorActivity>();
  if (!isDbConfigured() || ids.length === 0) return activityMap;

  const windowHours = await getRecentAuthorPostWindowHours();
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  try {
    const rows = await prisma.post.groupBy({
      by: ['userId'],
      where: {
        userId: { in: ids },
        deletedAt: null,
        isPublished: true,
        isAnonymous: false,
        createdAt: { gte: cutoff },
      },
      _max: { createdAt: true },
    });

    rows.forEach((row) => {
      const authorId = String(row.userId || '').trim();
      if (!authorId) return;
      activityMap.set(authorId, {
        hasRecentPost: true,
        recentPostCreatedAt: row._max.createdAt || null,
      });
    });
  } catch (error) {
    console.warn('[recent-author-activity] Failed to load recent author post activity.', error);
  }

  return activityMap;
}

export async function attachRecentAuthorPostActivity<T extends any>(posts: T[]): Promise<T[]> {
  const authorIds = uniqueAuthorIds(posts as any[]);
  if (authorIds.length === 0) return posts;

  const activityMap = await getRecentAuthorActivityMap(authorIds);
  if (activityMap.size === 0) return posts;

  return (posts as any[]).map((post) => {
    const authorId = String(post?.userId || post?.user?.id || '').trim();
    const activity = authorId ? activityMap.get(authorId) : null;
    if (!activity || !post?.user) return post;

    return {
      ...post,
      user: {
        ...post.user,
        hasRecentPost: activity.hasRecentPost,
        recentPostCreatedAt: activity.recentPostCreatedAt,
      },
    };
  }) as T[];
}
