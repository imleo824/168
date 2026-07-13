ALTER TABLE "UserMutedCategory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRecommendationFeedback" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_muted_category_select_own"
  ON "UserMutedCategory"
  FOR SELECT
  TO authenticated
  USING ("userId" = auth.uid()::text);

CREATE POLICY "user_muted_category_insert_own"
  ON "UserMutedCategory"
  FOR INSERT
  TO authenticated
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "user_muted_category_update_own"
  ON "UserMutedCategory"
  FOR UPDATE
  TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "user_muted_category_delete_own"
  ON "UserMutedCategory"
  FOR DELETE
  TO authenticated
  USING ("userId" = auth.uid()::text);

CREATE POLICY "user_recommendation_feedback_select_own"
  ON "UserRecommendationFeedback"
  FOR SELECT
  TO authenticated
  USING ("userId" = auth.uid()::text);

CREATE POLICY "user_recommendation_feedback_insert_own"
  ON "UserRecommendationFeedback"
  FOR INSERT
  TO authenticated
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "user_recommendation_feedback_update_own"
  ON "UserRecommendationFeedback"
  FOR UPDATE
  TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

CREATE POLICY "user_recommendation_feedback_delete_own"
  ON "UserRecommendationFeedback"
  FOR DELETE
  TO authenticated
  USING ("userId" = auth.uid()::text);
