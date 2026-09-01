import prisma from '../db';
import {
  getTuiPlusStatus,
  TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT,
  listTuiPlusChannels,
  listTuiPlusContacts,
  listTuiPlusWebsites,
} from './tui-plus.service';
import { filterSupportedTuiPlusContacts } from './tui-plus-contact-policy.service';

export type PublicUserProfileCacheEntry = {
  expiresAt: number;
  payload: any;
};

export type PublicUserProfileCache = Map<string, PublicUserProfileCacheEntry>;
export type PublicUserProfileInflight = Map<string, Promise<any>>;

async function getPublicTuiPlusLinks(userId: string) {
  try {
    const status = await getTuiPlusStatus(userId);
    if (!status.active) return { isTuiPlus: false, tuiPlusChannels: [], tuiPlusWebsites: [], tuiPlusContacts: [] };

    const [channels, websites, contacts] = await Promise.all([
      listTuiPlusChannels(userId),
      listTuiPlusWebsites(userId),
      listTuiPlusContacts(userId),
    ]);
    const supportedContacts = filterSupportedTuiPlusContacts(contacts);

    return {
      isTuiPlus: true,
      tuiPlusChannels: channels
        .filter((channel) => String(channel?.status || '').toUpperCase() === 'ACTIVE')
        .map((channel) => ({
          id: String(channel.id || ''),
          channelUrl: String(channel.channelUrl || ''),
          channelHandle: String(channel.channelHandle || ''),
          title: String(channel.title || '').trim() || `@${String(channel.channelHandle || '')}`,
          autoPostEnabled: Boolean(channel.autoPostEnabled),
          status: 'ACTIVE',
        }))
        .filter((channel) => channel.id && channel.channelUrl && channel.channelHandle)
        .slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT),
      tuiPlusWebsites: websites
        .filter((website) => String(website?.status || '').toUpperCase() === 'ACTIVE')
        .map((website) => ({
          id: String(website.id || ''),
          url: String(website.url || ''),
          label: String(website.label || '').trim() || '链接',
          status: 'ACTIVE',
        }))
        .filter((website) => website.id && website.url)
        .slice(0, TUI_PLUS_SINGLE_PROFILE_LINK_LIMIT),
      tuiPlusContacts: supportedContacts
        .filter((contact) => String((contact as any)?.status || '').toUpperCase() === 'ACTIVE')
        .map((contact) => ({
          id: String((contact as any).id || ''),
          contact: String((contact as any).contact || ''),
          contactUrl: String((contact as any).contactUrl || ''),
          label: String((contact as any).label || '').trim() || String((contact as any).contact || '').trim() || '联系方式',
          status: 'ACTIVE',
        }))
        .filter((contact) => contact.id && contact.contact),
    };
  } catch {
    return { isTuiPlus: false, tuiPlusChannels: [], tuiPlusWebsites: [], tuiPlusContacts: [] };
  }
}

export async function getCachedPublicUserProfile(options: {
  userId: string;
  cache: PublicUserProfileCache;
  inflight: PublicUserProfileInflight;
  ttlMs: number;
  maxEntries: number;
}) {
  const { userId, cache, inflight, ttlMs, maxEntries } = options;
  const now = Date.now();
  let cachedProfile = cache.get(userId);
  let cacheStatus = 'HIT';

  if (!cachedProfile || cachedProfile.expiresAt <= now) {
    cacheStatus = 'MISS';
    if (cachedProfile) cache.delete(userId);

    let inflightProfile = inflight.get(userId);
    if (!inflightProfile) {
      inflightProfile = Promise.all([
        (prisma as any).user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            loginAccount: true,
            photoUrl: true,
            coverUrl: true,
            contact: true,
            userType: true,
            viewCount: true,
            bio: true,
            createdAt: true,
            _count: { select: { followers: true, following: true, likes: true } },
          },
        }),
        prisma.post.count({
          where: {
            userId,
            deletedAt: null,
            isPublished: true,
          },
        }),
        getPublicTuiPlusLinks(userId),
      ]).then(([user, visiblePostCount, tuiPlusLinks]) => {
        if (!user) return null;
        const publicUser = { ...(user as any) };
        const count = publicUser._count;
        delete publicUser._count;
        delete publicUser.contact;
        return {
          ...publicUser,
          photoUrl: user.photoUrl,
          coverUrl: (user as any).coverUrl || null,
          viewCount: Math.max(0, user.viewCount || 0),
          bio: user.bio,
          followerCount: count.followers,
          followingCount: count.following,
          postCount: visiblePostCount,
          likeCount: count.likes,
          isTuiPlus: Boolean(tuiPlusLinks.isTuiPlus),
          tuiPlusChannels: tuiPlusLinks.tuiPlusChannels,
          tuiPlusWebsites: tuiPlusLinks.tuiPlusWebsites,
          tuiPlusContacts: tuiPlusLinks.tuiPlusContacts,
        };
      }).finally(() => {
        inflight.delete(userId);
      });
      inflight.set(userId, inflightProfile);
    }

    const payload = await inflightProfile;
    if (!payload) return { payload: null, cacheStatus };

    cachedProfile = {
      expiresAt: Date.now() + ttlMs,
      payload,
    };
    cache.set(userId, cachedProfile);
    prunePublicUserProfileCache(cache, maxEntries);
  }

  return { payload: cachedProfile?.payload || null, cacheStatus };
}

function prunePublicUserProfileCache(cache: PublicUserProfileCache, maxEntries: number) {
  if (cache.size <= maxEntries) return;
  const now = Date.now();
  for (const [cacheKey, entry] of cache) {
    if (entry.expiresAt <= now || cache.size > maxEntries) {
      cache.delete(cacheKey);
    }
    if (cache.size <= maxEntries) break;
  }
}
