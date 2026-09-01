ALTER TABLE "PostEngagementAggregate"
  ADD COLUMN IF NOT EXISTS "verifiedCommentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "verifiedQuoteCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "idx_post_engagement_human_counts"
  ON "PostEngagementAggregate" (
    "verifiedLikeCount" DESC,
    "verifiedCommentCount" DESC,
    "verifiedQuoteCount" DESC,
    "verifiedShareCount" DESC,
    "verifiedViewCount" DESC
  );

CREATE INDEX IF NOT EXISTS "idx_post_comment_human_rank"
  ON "PostComment" ("postId", "userId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL AND "status" = 'VISIBLE';

CREATE INDEX IF NOT EXISTS "idx_post_quote_human_rank"
  ON "Post" ("quotedPostId", "userId", "createdAt" DESC)
  WHERE "quotedPostId" IS NOT NULL AND "deletedAt" IS NULL AND "isPublished" = true;
