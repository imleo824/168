-- Tui Plus membership foundation.
-- This migration keeps payment on the existing points/recharge system while adding
-- a separate membership entitlement model that can evolve independently.

ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'TUI_PLUS';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "plusStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "plusPlan" TEXT,
  ADD COLUMN IF NOT EXISTS "plusExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "plusTrialUsed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_user_plus_status_expires"
  ON "User" ("plusStatus", "plusExpiresAt");

ALTER TABLE "AutoCrawlSource"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceScope" TEXT NOT NULL DEFAULT 'PLATFORM';

CREATE INDEX IF NOT EXISTS "idx_auto_crawl_source_owner_scope"
  ON "AutoCrawlSource" ("ownerUserId", "sourceScope", "disabled");

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

CREATE INDEX IF NOT EXISTS "idx_tui_plus_subscription_user_status_expires"
  ON "TuiPlusSubscription" ("userId", "status", "expiresAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_tui_plus_subscription_status_expires"
  ON "TuiPlusSubscription" ("status", "expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "TuiPlusUsage" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "benefit" TEXT NOT NULL,
  "refType" TEXT,
  "refId" TEXT,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "bucketDay" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_tui_plus_usage_user_benefit_day"
  ON "TuiPlusUsage" ("userId", "benefit", "bucketDay" DESC);

CREATE TABLE IF NOT EXISTS "TuiPlusTelegramChannel" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "channelUrl" TEXT NOT NULL,
  "channelHandle" TEXT NOT NULL,
  "sourceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastCrawledAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_tui_plus_channel_user_handle_unique"
  ON "TuiPlusTelegramChannel" ("userId", "channelHandle");

CREATE INDEX IF NOT EXISTS "idx_tui_plus_channel_user_status"
  ON "TuiPlusTelegramChannel" ("userId", "status");
