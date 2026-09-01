CREATE TABLE "UserRecommendationFeedback" (
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "categoryId" TEXT,
  "authorId" TEXT,
  "action" TEXT NOT NULL DEFAULT 'REDUCE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserRecommendationFeedback_pkey" PRIMARY KEY ("userId", "postId")
);

ALTER TABLE "UserRecommendationFeedback"
  ADD CONSTRAINT "UserRecommendationFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRecommendationFeedback"
  ADD CONSTRAINT "UserRecommendationFeedback_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_user_recommendation_feedback_user_action_updated"
  ON "UserRecommendationFeedback"("userId", "action", "updatedAt" DESC);

CREATE INDEX "idx_user_recommendation_feedback_category_updated"
  ON "UserRecommendationFeedback"("categoryId", "action", "updatedAt" DESC);

CREATE INDEX "idx_user_recommendation_feedback_author_updated"
  ON "UserRecommendationFeedback"("authorId", "action", "updatedAt" DESC);
