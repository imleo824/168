-- Tui Plus core schema.
-- Idempotent because early versions provisioned membership tables from runtime guards.

DO $$
BEGIN
  ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'TUI_PLUS';
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "plusStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "plusPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "plusExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "plusTrialUsed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AutoCrawlSource"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceScope" TEXT NOT NULL DEFAULT 'PLATFORM';

ALTER TABLE "AutoCrawlSource" ADD COLUMN IF NOT EXISTS "claimedFromAuthorUserId" TEXT;
ALTER TABLE "AutoCrawlSource" ADD COLUMN IF NOT EXISTS "claimedFromSourceName" TEXT;
ALTER TABLE "AutoCrawlSource" ADD COLUMN IF NOT EXISTS "claimedFromCategoryName" TEXT;

CREATE TABLE IF NOT EXISTS "TuiPlusSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "pricePaid" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TuiPlusUsage" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "benefit" TEXT NOT NULL,
  "refType" TEXT,
  "refId" TEXT,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bucketDay" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "TuiPlusTelegramChannel" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "channelUrl" TEXT NOT NULL,
  "channelHandle" TEXT NOT NULL,
  "title" TEXT,
  "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastCrawledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TuiPlusWebsite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "url" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TuiPlusContact" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "contact" TEXT NOT NULL,
  "contactUrl" TEXT,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tui_plus_channel_user_handle_unique" ON "TuiPlusTelegramChannel" ("userId", "channelHandle");
CREATE INDEX IF NOT EXISTS "idx_tui_plus_channel_user_status" ON "TuiPlusTelegramChannel" ("userId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tui_plus_website_user_url_unique" ON "TuiPlusWebsite" ("userId", "url");
CREATE INDEX IF NOT EXISTS "idx_tui_plus_website_user_status" ON "TuiPlusWebsite" ("userId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tui_plus_contact_user_contact_unique" ON "TuiPlusContact" ("userId", "contact");
CREATE INDEX IF NOT EXISTS "idx_tui_plus_contact_user_status" ON "TuiPlusContact" ("userId", "status");
CREATE INDEX IF NOT EXISTS "idx_user_plus_status_expires" ON "User" ("plusStatus", "plusExpiresAt");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_source_owner_scope" ON "AutoCrawlSource" ("ownerUserId", "sourceScope", "disabled");

UPDATE "User" u
SET "plusTrialUsed" = true
WHERE "plusTrialUsed" = false
  AND EXISTS (SELECT 1 FROM "TuiPlusSubscription" sub WHERE sub."userId" = u."id" LIMIT 1);
