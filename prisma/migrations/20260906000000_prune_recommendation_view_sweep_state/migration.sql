DO $$
BEGIN
  IF to_regclass('public."UserRecommendationFeedback"') IS NOT NULL THEN
    DELETE FROM "UserRecommendationFeedback"
    WHERE "action" <> 'REDUCE';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'UserRecommendationFeedback_action_check'
        AND conrelid = 'public."UserRecommendationFeedback"'::regclass
    ) THEN
      ALTER TABLE "UserRecommendationFeedback"
      ADD CONSTRAINT "UserRecommendationFeedback_action_check"
      CHECK ("action" = 'REDUCE');
    END IF;
  END IF;

  IF to_regclass('public."PostView"') IS NOT NULL THEN
    DELETE FROM "PostView"
    WHERE length(btrim("viewerKey")) = 0
       OR "dwellMs" < 0;

    UPDATE "PostView"
    SET "source" = 'view'
    WHERE "source" NOT IN ('view', 'feed', 'like', 'webhook_like')
       OR length(btrim("source")) = 0;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'PostView_source_check'
        AND conrelid = 'public."PostView"'::regclass
    ) THEN
      ALTER TABLE "PostView"
      ADD CONSTRAINT "PostView_source_check"
      CHECK ("source" IN ('view', 'feed', 'like', 'webhook_like'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'PostView_viewer_key_check'
        AND conrelid = 'public."PostView"'::regclass
    ) THEN
      ALTER TABLE "PostView"
      ADD CONSTRAINT "PostView_viewer_key_check"
      CHECK (length(btrim("viewerKey")) > 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'PostView_dwell_ms_check'
        AND conrelid = 'public."PostView"'::regclass
    ) THEN
      ALTER TABLE "PostView"
      ADD CONSTRAINT "PostView_dwell_ms_check"
      CHECK ("dwellMs" >= 0);
    END IF;
  END IF;

  IF to_regclass('public."SweepJob"') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'SweepJob'
         AND column_name = 'triggerType'
     ) THEN
    ALTER TABLE "SweepJob" DROP COLUMN "triggerType";
  END IF;
END $$;
