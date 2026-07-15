ALTER TABLE "TuiPlusTelegramChannel"
  ADD COLUMN IF NOT EXISTS "autoPostEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TuiPlusTelegramChannel"
SET "autoPostEnabled" = false
WHERE "autoPostEnabled" IS DISTINCT FROM false;

UPDATE "AutoCrawlSource" AS source
SET "disabled" = true, "updatedAt" = now()
FROM "TuiPlusTelegramChannel" AS channel
WHERE source."id" = channel."sourceId"
  AND source."ownerUserId" = channel."userId"
  AND source."sourceScope" = 'USER_PLUS'
  AND channel."autoPostEnabled" = false
  AND source."disabled" = false;
