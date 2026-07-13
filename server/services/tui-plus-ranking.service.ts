import { Prisma } from '@prisma/client';

import prisma, { isDbConfigured } from '../db';

type RankingAuthorRow = {
  userId?: string | null;
  user?: any | null;
};

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
  const now = new Date();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" IN (${Prisma.join(ids)})
      AND "plusExpiresAt" > ${now}
      AND "plusStatus" IN ('TRIALING', 'ACTIVE')
  `;
  return new Set(rows.map((row) => String(row.id)));
}

export async function annotateTuiPlusAuthorsForRanking<TRow extends RankingAuthorRow>(rows: TRow[]) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const activeUserIds = await getActiveTuiPlusUserIdSet(uniqueUserIds(rows)).catch((error) => {
    console.warn('[tui-plus] failed to annotate feed ranking authors:', error?.message || error);
    return new Set<string>();
  });
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
