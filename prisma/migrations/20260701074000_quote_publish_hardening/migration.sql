-- Quote publish hardening
-- Runtime model/provider/key is platform AI / Railway env. Quote publish no longer keeps a separate model config.

DELETE FROM "SystemConfig"
WHERE "key" IN ('quote_publish_aiModel', 'quote_publish_model');

CREATE TABLE IF NOT EXISTS "QuotePublishRun" (
  "id" TEXT PRIMARY KEY,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RobotContentSignature" (
  "id" TEXT PRIMARY KEY,
  "module" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "content" TEXT,
  "postId" TEXT,
  "robotUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_robot_content_signature_module_sig_created"
ON "RobotContentSignature" ("module", "signature", "createdAt" DESC);

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
