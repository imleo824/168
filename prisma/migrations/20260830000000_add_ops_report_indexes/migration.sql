CREATE INDEX IF NOT EXISTS "idx_follow_created_desc"
  ON "Follow" ("createdAt" DESC, "followerId" DESC, "followingId" DESC);

CREATE INDEX IF NOT EXISTS "idx_block_created_desc"
  ON "Block" ("createdAt" DESC, "blockerId" DESC, "blockedId" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_created_id_desc"
  ON "Post" ("createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_like_created_post_desc"
  ON "Like" ("createdAt" DESC, "postId" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_view_source_created_desc"
  ON "PostView" ("source", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_share_created_post_desc"
  ON "PostShare" ("createdAt" DESC, "postId" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_recommendation_feedback_action_updated"
  ON "UserRecommendationFeedback" ("action", "updatedAt" DESC, "postId" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_recommendation_feedback_post_updated"
  ON "UserRecommendationFeedback" ("postId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_order_status_credited_id"
  ON "Order" ("status", "creditedAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_sweep_transaction_job_status_created"
  ON "SweepTransaction" ("jobId", "status", "createdAt");

DROP INDEX IF EXISTS "SweepTransaction_jobId_status_idx";

DROP INDEX IF EXISTS "Block_blockerId_idx";
DROP INDEX IF EXISTS "Post_isPublished_deletedAt_idx";
DROP INDEX IF EXISTS "Like_postId_idx";
DROP INDEX IF EXISTS "idx_promotion_active_scope";
DROP INDEX IF EXISTS "DepositAddress_userId_idx";
