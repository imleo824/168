export const TUI_PLUS_SOURCE_SCOPE = 'USER_PLUS';
export const PLATFORM_SOURCE_SCOPE = 'PLATFORM';
const TUI_PLUS_GENERATED_SOURCE_PREFIX = 'plus_';

export function isTuiPlusGeneratedSourceId(sourceId?: unknown) {
  return String(sourceId || '').startsWith(TUI_PLUS_GENERATED_SOURCE_PREFIX);
}

async function releaseClaimedPlatformSource(tx: any, params: { sourceId: string; userId: string }) {
  const released = await tx.$executeRaw`
    UPDATE "AutoCrawlSource"
    SET "disabled" = false,
        "authorUserId" = COALESCE(NULLIF("claimedFromAuthorUserId", ''), ''),
        "sourceName" = COALESCE(NULLIF("claimedFromSourceName", ''), "sourceName"),
        "categoryName" = COALESCE(NULLIF("claimedFromCategoryName", ''), "categoryName"),
        "ownerUserId" = NULL,
        "sourceScope" = ${PLATFORM_SOURCE_SCOPE},
        "claimedFromAuthorUserId" = NULL,
        "claimedFromSourceName" = NULL,
        "claimedFromCategoryName" = NULL,
        "updatedAt" = ${new Date()}
    WHERE "id" = ${params.sourceId}
      AND "ownerUserId" = ${params.userId}
      AND "sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
  `;
  return Number(released || 0);
}

export async function pauseOrReleaseTuiPlusSource(tx: any, params: { sourceId?: string | null; userId: string }) {
  const sourceId = String(params.sourceId || '').trim();
  if (!sourceId) return { disabled: 0, released: 0 };

  const disabled = await tx.$executeRaw`
    UPDATE "AutoCrawlSource"
    SET "disabled" = true,
        "updatedAt" = ${new Date()}
    WHERE "id" = ${sourceId}
      AND "ownerUserId" = ${params.userId}
      AND "sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
  `;
  return { disabled: Number(disabled || 0), released: 0 };
}

export async function releaseOrDeleteTuiPlusSource(tx: any, params: { sourceId?: string | null; userId: string }) {
  const sourceId = String(params.sourceId || '').trim();
  if (!sourceId) return { deleted: 0, released: 0 };

  if (isTuiPlusGeneratedSourceId(sourceId)) {
    const deleted = await tx.$executeRaw`
      DELETE FROM "AutoCrawlSource"
      WHERE "id" = ${sourceId}
        AND "ownerUserId" = ${params.userId}
        AND "sourceScope" = ${TUI_PLUS_SOURCE_SCOPE}
    `;
    return { deleted: Number(deleted || 0), released: 0 };
  }

  const released = await releaseClaimedPlatformSource(tx, { sourceId, userId: params.userId });
  return { deleted: 0, released };
}
