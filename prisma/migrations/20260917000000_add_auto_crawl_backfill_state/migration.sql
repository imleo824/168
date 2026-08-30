ALTER TABLE public."AutoCrawlSource"
  ADD COLUMN IF NOT EXISTS "backfillBeforeCursor" TEXT,
  ADD COLUMN IF NOT EXISTS "backfillTargetCursor" TEXT;

-- The new publishing contract intentionally starts with a clean crawl runtime.
-- Existing user-visible posts and source configuration/cursors are preserved.
DELETE FROM public."AutoCrawlItem";
DELETE FROM public."AutoCrawlRun";

UPDATE public."AutoCrawlSource"
SET
  "backfillBeforeCursor" = NULL,
  "backfillTargetCursor" = NULL,
  "lastFetchedCount" = 0,
  "lastParsedCount" = 0,
  "lastCandidateCount" = 0,
  "lastDeliveredCount" = 0,
  "lastFilteredCount" = 0,
  "lastDuplicateCount" = 0,
  "failCount" = 0,
  "lastError" = NULL,
  "sourceHealth" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

COMMENT ON COLUMN public."AutoCrawlSource"."backfillBeforeCursor"
  IS 'Telegram pagination cursor used to resume bounded historical backfill.';

COMMENT ON COLUMN public."AutoCrawlSource"."backfillTargetCursor"
  IS 'Older Telegram high-water target that completes the current backfill window.';
