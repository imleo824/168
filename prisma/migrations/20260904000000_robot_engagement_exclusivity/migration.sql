-- Robot automation engagement constraints
-- Runtime and production schemas both need PostComment.source so automated comments can be isolated from manual comments.
ALTER TABLE "PostComment"
  ADD COLUMN IF NOT EXISTS "source" TEXT;

-- One robot can only comment once on the same source post.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_comment_robot_source_unique"
  ON "PostComment" ("postId", "userId", "source")
  WHERE "source" = 'comment_publish_robot' AND "deletedAt" IS NULL;

-- One robot can only quote the same source post once.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_quote_robot_source_unique"
  ON "Post" ("quotedPostId", "userId", "source")
  WHERE "source" = 'quote_publish_robot' AND "quotedPostId" IS NOT NULL AND "deletedAt" IS NULL;
