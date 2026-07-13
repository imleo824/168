-- Comment publish v3 quality controls.
-- Adds global observability fields and content signature history so repeated machine-like comments can be skipped.

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "commentCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PostComment"
  ADD COLUMN IF NOT EXISTS "source" TEXT;

ALTER TABLE "CommentPublishRun"
  ADD COLUMN IF NOT EXISTS "contentSignature" TEXT;

ALTER TABLE "CommentPublishRun"
  ADD COLUMN IF NOT EXISTS "qualityScore" INTEGER;

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

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_comment_robot_source_unique"
  ON "PostComment" ("postId", "userId", "source")
  WHERE "source" = 'comment_publish_robot' AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_quote_robot_source_unique"
  ON "Post" ("quotedPostId", "userId", "source")
  WHERE "source" = 'quote_publish_robot' AND "quotedPostId" IS NOT NULL AND "deletedAt" IS NULL;
