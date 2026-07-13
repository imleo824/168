CREATE TABLE IF NOT EXISTS "QuotePublishRun" (
  "id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sourcePostId" TEXT,
  "quotePostId" TEXT,
  "robotUserId" TEXT,
  "aiModel" TEXT,
  "generatedContent" TEXT,
  "skipReason" TEXT,
  "error" TEXT,
  "candidateScore" DOUBLE PRECISION,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuotePublishRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_quote_publish_run_status_created"
  ON "QuotePublishRun" ("status", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_quote_publish_run_source_created"
  ON "QuotePublishRun" ("sourcePostId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_quote_publish_run_robot_created"
  ON "QuotePublishRun" ("robotUserId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_quote_publish_run_quote_post"
  ON "QuotePublishRun" ("quotePostId");

CREATE INDEX IF NOT EXISTS "idx_quote_publish_run_created"
  ON "QuotePublishRun" ("createdAt" DESC, "id" DESC);
