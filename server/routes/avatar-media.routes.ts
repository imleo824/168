import crypto from 'node:crypto';
import type { Express } from 'express';

import prisma, { isDbConfigured } from '../db';
import { setNoStore, setPublicCache } from '../http-cache';
import {
  canonicalizePersistentUploadedImageUrl,
  fetchSocialPreviewImage,
} from '../services/social-image.service';

type CachedAvatar = {
  buffer: Buffer;
  contentType: string;
  etag: string;
  expiresAt: number;
};

const AVATAR_MEMORY_CACHE_TTL_MS = 15 * 60_000;
const AVATAR_MEMORY_CACHE_MAX_ENTRIES = 500;
const avatarMemoryCache = new Map<string, CachedAvatar>();

function normalizeUserId(raw: unknown) {
  const value = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : '';
}

function avatarCacheKey(userId: string, sourceUrl: string, updatedAt: Date | null | undefined) {
  return crypto
    .createHash('sha256')
    .update(`${userId}\n${sourceUrl}\n${updatedAt?.getTime() || 0}`)
    .digest('hex');
}

function pruneAvatarMemoryCache() {
  const now = Date.now();
  for (const [key, value] of avatarMemoryCache) {
    if (value.expiresAt <= now) avatarMemoryCache.delete(key);
  }

  while (avatarMemoryCache.size > AVATAR_MEMORY_CACHE_MAX_ENTRIES) {
    const oldestKey = avatarMemoryCache.keys().next().value;
    if (!oldestKey) break;
    avatarMemoryCache.delete(oldestKey);
  }
}

function setAvatarResponseHeaders(res: any, avatar: CachedAvatar) {
  res.setHeader('Content-Type', avatar.contentType);
  res.setHeader('Content-Length', String(avatar.buffer.byteLength));
  res.setHeader('ETag', avatar.etag);
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  setPublicCache(res, 86_400, 604_800, 86_400);
}

export function registerAvatarMediaRoutes(app: Express) {
  app.get('/media/avatar/:userId', async (req, res) => {
    const userId = normalizeUserId(req.params.userId);
    if (!userId || !isDbConfigured()) {
      setNoStore(res);
      return res.status(404).end();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { photoUrl: true, updatedAt: true },
      });
      const sourceUrl = canonicalizePersistentUploadedImageUrl(user?.photoUrl || '');
      if (!user || !sourceUrl) {
        setNoStore(res);
        return res.status(404).end();
      }

      pruneAvatarMemoryCache();
      const key = avatarCacheKey(userId, sourceUrl, user.updatedAt);
      let avatar = avatarMemoryCache.get(key);

      if (!avatar || avatar.expiresAt <= Date.now()) {
        const fetched = await fetchSocialPreviewImage(sourceUrl);
        const etag = `"${crypto
          .createHash('sha256')
          .update(sourceUrl)
          .update(fetched.buffer)
          .digest('base64url')
          .slice(0, 32)}"`;

        avatar = {
          buffer: fetched.buffer,
          contentType: fetched.contentType,
          etag,
          expiresAt: Date.now() + AVATAR_MEMORY_CACHE_TTL_MS,
        };
        avatarMemoryCache.set(key, avatar);
        pruneAvatarMemoryCache();
      }

      setAvatarResponseHeaders(res, avatar);
      if (req.get('if-none-match') === avatar.etag) {
        return res.status(304).end();
      }

      return res.status(200).send(avatar.buffer);
    } catch (error) {
      console.warn('[avatar-media] failed to serve avatar:', {
        userId,
        error: error instanceof Error ? error.message : String(error || ''),
      });
      setNoStore(res);
      return res.status(404).end();
    }
  });
}
