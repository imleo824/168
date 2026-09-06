import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';

type RankingAuthorRow = {
  userId?: string | null;
  user?: any | null;
};

const TUI_PLUS_AUTHOR_CACHE_TTL_MS = 30_000;
const TUI_PLUS_AUTHOR_CACHE_MAX_ENTRIES = 2_000;
const tuiPlusAuthorCache = new Map<string, { active: boolean; expiresAt: number }>();

function pruneTuiPlusAuthorCache(nowMs: number, incomingEntries: number) {
  for (const [id, entry] of tuiPlusAuthorCache) {
    if (entry.expiresAt <= nowMs) tuiPlusAuthorCache.delete(id);
  }
  const targetSize = Math.max(0, TUI_PLUS_AUTHOR_CACHE_MAX_ENTRIES - incomingEntries);
  while (tuiPlusAuthorCache.size > targetSize) {
    const oldestId = tuiPlusAuthorCache.keys().next().value;
    if (!oldestId) break;
    tuiPlusAuthorCache.delete(oldestId);
  }
}

function hasEmbeddedTuiPlusState(row: RankingAuthorRow) {
  const user = row?.user;
  return Boolean(
    user &&
    Object.prototype.hasOwnProperty.call(user, 'plusStatus') &&
    Object.prototype.hasOwnProperty.call(user, 'plusExpiresAt')
  );
}

function isEmbeddedTuiPlusActive(row: RankingAuthorRow) {
  const status = String(row?.user?.plusStatus || '').toUpperCase();
  const expiresAt = row?.user?.plusExpiresAt ? new Date(row.user.plusExpiresAt).getTime() : 0;
  return expiresAt > Date.now() && (status === 'TRIALING' || status === 'ACTIVE');
}

function uniqueUserIds(rows: RankingAuthorRow[]) {
  return Array.from(new Set(
    rows
      .map((row) => String(row?.userId || row?.user?.id || '').trim())
      .filter(Boolean),
  ));
}

export async function getActiveTuiPlusUserIdSet(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (ids.length === 0 || !isDbConfigured()) return new Set<string>();
  const nowMs = Date.now();
  const activeIds = new Set<string>();
  const missingIds = ids.filter((id) => {
    const cached = tuiPlusAuthorCache.get(id);
    if (!cached || cached.expiresAt <= nowMs) return true;
    if (cached.active) activeIds.add(id);
    return false;
  });
  if (missingIds.length === 0) return activeIds;
  const now = new Date();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" IN (${Prisma.join(missingIds)})
      AND "plusExpiresAt" > ${now}
      AND "plusStatus" IN ('TRIALING', 'ACTIVE')
  `;
  const queriedActiveIds = new Set(rows.map((row) => String(row.id)));
  pruneTuiPlusAuthorCache(nowMs, missingIds.length);
  missingIds.forEach((id) => {
    const active = queriedActiveIds.has(id);
    tuiPlusAuthorCache.set(id, { active, expiresAt: nowMs + TUI_PLUS_AUTHOR_CACHE_TTL_MS });
    if (active) activeIds.add(id);
  });
  return activeIds;
}

export async function annotateTuiPlusAuthorsForRanking<TRow extends RankingAuthorRow>(rows: TRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const embeddedActiveIds = new Set(
    rows
      .filter(hasEmbeddedTuiPlusState)
      .filter(isEmbeddedTuiPlusActive)
      .map((row) => String(row?.userId || row?.user?.id || '').trim())
      .filter(Boolean),
  );
  const lookupUserIds = uniqueUserIds(rows.filter((row) => !hasEmbeddedTuiPlusState(row)));
  const queriedActiveIds = await getActiveTuiPlusUserIdSet(lookupUserIds).catch((error) => {
    console.warn('[tui-plus] failed to annotate feed ranking authors:', error?.message || error);
    return new Set<string>();
  });
  const activeUserIds = new Set([...embeddedActiveIds, ...queriedActiveIds]);
  if (activeUserIds.size === 0) return rows;

  return rows.map((row) => {
    const userId = String(row?.userId || row?.user?.id || '').trim();
    if (!userId || !activeUserIds.has(userId)) return row;
    return {
      ...row,
      user: {
        ...(row.user || { id: userId }),
        isTuiPlus: true,
      },
    };
  });
}
