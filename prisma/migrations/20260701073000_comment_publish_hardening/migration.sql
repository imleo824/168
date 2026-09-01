-- Comment publish hardening
-- 1) Promote comment automation runtime tables into migrations.
-- 2) Keep legacy runtime ensure functions as compatibility only.
-- 3) Remove deprecated per-module model fields; platform AI / Railway env controls model/provider/key.

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "PostComment" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT NOT NULL REFERENCES "Post"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VISIBLE',
  "source" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE TABLE IF NOT EXISTS "CommentPublishRun" (
  "id" TEXT PRIMARY KEY,
  "postId" TEXT REFERENCES "Post"("id") ON DELETE SET NULL,
  "commentId" TEXT,
  "robotUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "content" TEXT,
  "contentSignature" TEXT,
  "qualityScore" INTEGER,
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

CREATE INDEX IF NOT EXISTS "idx_post_comment_post_created" ON "PostComment" ("postId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_post_comment_source_created" ON "PostComment" ("source", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_comment_publish_run_created" ON "CommentPublishRun" ("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_comment_publish_run_status_created" ON "CommentPublishRun" ("status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_comment_publish_run_post" ON "CommentPublishRun" ("postId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_robot_content_signature_module_sig_created" ON "RobotContentSignature" ("module", "signature", "createdAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_comment_robot_source_unique"
ON "PostComment" ("postId", "userId", "source")
WHERE "source" = 'comment_publish_robot' AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_quote_robot_source_unique"
ON "Post" ("quotedPostId", "userId", "source")
WHERE "source" = 'quote_publish_robot' AND "quotedPostId" IS NOT NULL AND "deletedAt" IS NULL;

-- Remove legacy per-module model fields from comment config. Runtime model/provider/key is platform AI config.
UPDATE "SystemConfig"
SET "value" = ((("value"::jsonb - 'model') - 'aiModel')::text)
WHERE "key" = 'comment_publish_config'
  AND TRIM("value") ~ '^\{';
