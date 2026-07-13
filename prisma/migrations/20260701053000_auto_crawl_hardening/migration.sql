-- Auto crawl production hardening
-- This migration makes the automatic crawl chain explicit and repeatable outside runtime bootstrapping.

CREATE TABLE IF NOT EXISTS "AutoCrawlConfig" (
  "id" TEXT PRIMARY KEY DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "maxItemsPerSource" INTEGER NOT NULL DEFAULT 20,
  "maxSourcesPerRun" INTEGER NOT NULL DEFAULT 20,
  "localOnlyMode" BOOLEAN NOT NULL DEFAULT TRUE,
  "aiEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AutoCrawlSource" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'telegram',
  "sourceName" TEXT NOT NULL,
  "trustLevel" TEXT NOT NULL DEFAULT 'NORMAL',
  "categoryId" TEXT,
  "categoryName" TEXT NOT NULL DEFAULT '新闻',
  "authorUserId" TEXT NOT NULL,
  "showContact" BOOLEAN NOT NULL DEFAULT TRUE,
  "syncToTelegram" BOOLEAN NOT NULL DEFAULT FALSE,
  "disabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "cursor" TEXT NOT NULL DEFAULT '',
  "cursorKind" TEXT NOT NULL DEFAULT 'baseline_pending',
  "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "nextRunAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "lastFetchedCount" INTEGER NOT NULL DEFAULT 0,
  "lastParsedCount" INTEGER NOT NULL DEFAULT 0,
  "lastCandidateCount" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveredCount" INTEGER NOT NULL DEFAULT 0,
  "lastFilteredCount" INTEGER NOT NULL DEFAULT 0,
  "lastDuplicateCount" INTEGER NOT NULL DEFAULT 0,
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastVisibleMinCursor" TEXT,
  "lastVisibleMaxCursor" TEXT,
  "lastGapDetectedAt" TIMESTAMP(3),
  "lastGapMissingCount" INTEGER NOT NULL DEFAULT 0,
  "sourceHealth" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AutoCrawlRun" (
  "id" TEXT PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "trigger" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "lockOwner" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "scanned" INTEGER NOT NULL DEFAULT 0,
  "delivered" INTEGER NOT NULL DEFAULT 0,
  "filtered" INTEGER NOT NULL DEFAULT 0,
  "duplicate" INTEGER NOT NULL DEFAULT 0,
  "error" INTEGER NOT NULL DEFAULT 0,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "skipReason" TEXT,
  "errorMessage" TEXT,
  "latestTitle" TEXT
);

CREATE TABLE IF NOT EXISTS "AutoCrawlItem" (
  "id" TEXT PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "runId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourcePostId" TEXT,
  "sourceUrl" TEXT,
  "rawTitle" TEXT,
  "rawContent" TEXT,
  "cleanTitle" TEXT,
  "cleanContent" TEXT,
  "contentHash" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "cursorValue" TEXT,
  "cursorNumber" DOUBLE PRECISION,
  "sourcePublishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'RAW',
  "filterReason" TEXT,
  "errorMessage" TEXT,
  "postId" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AutoCrawlLock" (
  "name" TEXT PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "AutoCrawlCategoryAuthor" (
  "categoryName" TEXT PRIMARY KEY,
  "categoryId" TEXT,
  "authorUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "AutoCrawlConfig" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_auto_crawl_source_source_unique" ON "AutoCrawlSource" ("source");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_source_due" ON "AutoCrawlSource" ("disabled", "nextRunAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_source_category" ON "AutoCrawlSource" ("categoryId", "categoryName");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_run_started" ON "AutoCrawlRun" ("startedAt" DESC, "id" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_auto_crawl_item_fingerprint_unique" ON "AutoCrawlItem" ("fingerprint");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_item_source_cursor" ON "AutoCrawlItem" ("sourceId", "cursorNumber");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_item_content_hash" ON "AutoCrawlItem" ("contentHash", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_item_status" ON "AutoCrawlItem" ("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_category_author_user" ON "AutoCrawlCategoryAuthor" ("authorUserId");

ALTER TABLE "AutoCrawlConfig"
  ADD CONSTRAINT "chk_auto_crawl_check_interval" CHECK ("checkIntervalMinutes" BETWEEN 5 AND 240) NOT VALID,
  ADD CONSTRAINT "chk_auto_crawl_items_per_source" CHECK ("maxItemsPerSource" BETWEEN 1 AND 50) NOT VALID,
  ADD CONSTRAINT "chk_auto_crawl_sources_per_run" CHECK ("maxSourcesPerRun" BETWEEN 1 AND 50) NOT VALID;

ALTER TABLE "AutoCrawlSource"
  ADD CONSTRAINT "chk_auto_crawl_source_poll_interval" CHECK ("pollIntervalMinutes" BETWEEN 5 AND 240) NOT VALID,
  ADD CONSTRAINT "chk_auto_crawl_source_trust_level" CHECK ("trustLevel" IN ('TRUSTED', 'NORMAL', 'RISKY', 'BLOCKED')) NOT VALID;
