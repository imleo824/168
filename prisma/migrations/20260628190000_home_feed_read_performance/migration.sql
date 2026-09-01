CREATE INDEX IF NOT EXISTS "idx_post_ranking_score_feed_order"
  ON "PostRankingScore" ("recommendationScore" DESC, "postId" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_feed_visible_recent"
  ON "Post" ("createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "isPublished" = true;

CREATE INDEX IF NOT EXISTS "idx_post_feed_category_recent"
  ON "Post" ("categoryId", "createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "isPublished" = true;

CREATE INDEX IF NOT EXISTS "idx_post_feed_author_recent"
  ON "Post" ("userId", "createdAt" DESC, "id" DESC)
  WHERE "deletedAt" IS NULL AND "isPublished" = true;

CREATE INDEX IF NOT EXISTS "idx_follow_follower_following"
  ON "Follow" ("followerId", "followingId");

CREATE INDEX IF NOT EXISTS "idx_like_user_post_lookup"
  ON "Like" ("userId", "postId");

CREATE INDEX IF NOT EXISTS "idx_category_slug_lookup"
  ON "Category" ("slug");
