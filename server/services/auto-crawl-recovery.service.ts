import prisma from '../db';
import { reprocessAutoCrawlItems } from './auto-crawl.service';

const STALE_RUN_MINUTES = 30;
const STALE_ITEM_MINUTES = 30;
const AUTO_RETRY_LIMIT = 10;

function db() {
  return prisma as any;
}

export async function reconcileInterruptedAutoCrawlState() {
  const staleRuns = await db().$executeRawUnsafe(
    `UPDATE "AutoCrawlRun" SET
      "status"='FAILED',
      "finishedAt"=CURRENT_TIMESTAMP,
      "error"=GREATEST("error",1),
      "errorMessage"=COALESCE(NULLIF("errorMessage",''),'process_interrupted')
     WHERE "status"='RUNNING'
       AND "startedAt"<CURRENT_TIMESTAMP-($1::text||' minutes')::interval`,
    STALE_RUN_MINUTES,
  );

  const staleItems = await db().$executeRawUnsafe(
    `UPDATE "AutoCrawlItem" SET
      "status"='RETRYABLE',
      "retryCount"=GREATEST("retryCount",1),
      "errorMessage"=COALESCE(NULLIF("errorMessage",''),'processing_interrupted'),
      "updatedAt"=CURRENT_TIMESTAMP
     WHERE "status"='RAW'
       AND "postId" IS NULL
       AND "updatedAt"<CURRENT_TIMESTAMP-($1::text||' minutes')::interval`,
    STALE_ITEM_MINUTES,
  );

  const recoverableFailures = await db().$executeRawUnsafe(
    `UPDATE "AutoCrawlItem" SET
      "status"='RETRYABLE',
      "updatedAt"=CURRENT_TIMESTAMP
     WHERE "status"='FAILED'
       AND "postId" IS NULL
       AND "retryCount"<3`,
  );

  return {
    staleRuns: Number(staleRuns || 0),
    staleItems: Number(staleItems || 0),
    recoverableFailures: Number(recoverableFailures || 0),
  };
}

async function claimDueAutoCrawlRetries(limit = AUTO_RETRY_LIMIT) {
  const result = await db().$queryRawUnsafe(
    `WITH due AS (
       SELECT "id"
       FROM "AutoCrawlItem"
       WHERE "status"='RETRYABLE'
         AND "postId" IS NULL
         AND "retryCount"<3
         AND "updatedAt"<=CURRENT_TIMESTAMP-(CASE
           WHEN "retryCount"<=1 THEN INTERVAL '5 minutes'
           WHEN "retryCount"=2 THEN INTERVAL '30 minutes'
           ELSE INTERVAL '2 hours'
         END)
       ORDER BY "updatedAt" ASC,"id" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1::integer
     )
     UPDATE "AutoCrawlItem" item
     SET "status"='RAW',"updatedAt"=CURRENT_TIMESTAMP
     FROM due
     WHERE item."id"=due."id"
     RETURNING item."id"`,
    Math.max(1, Math.min(AUTO_RETRY_LIMIT, Number(limit) || AUTO_RETRY_LIMIT)),
  ) as Array<{ id: string }>;
  return result.map((row) => String(row.id));
}

export async function runAutoCrawlRecoveryQueue() {
  const claimedIds = await claimDueAutoCrawlRetries();
  if (!claimedIds.length) {
    return {
      due: 0,
      attempted: 0,
      delivered: 0,
      filtered: 0,
      duplicate: 0,
      error: 0,
    };
  }

  const result = await reprocessAutoCrawlItems({
    status: 'RAW',
    ids: claimedIds,
    limit: claimedIds.length,
  });
  return {
    due: claimedIds.length,
    attempted: Number(result.summary?.scanned || 0),
    delivered: Number(result.summary?.delivered || 0),
    filtered: Number(result.summary?.filtered || 0),
    duplicate: Number(result.summary?.duplicate || 0),
    error: Number(result.summary?.error || 0),
  };
}
