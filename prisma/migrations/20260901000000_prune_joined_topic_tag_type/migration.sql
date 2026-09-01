DO $$
BEGIN
  IF to_regclass('public."UserJoinedTopic"') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "UserJoinedTopic"
    ADD COLUMN IF NOT EXISTS "topicType" TEXT NOT NULL DEFAULT 'topic';

  DELETE FROM "UserJoinedTopic"
  WHERE "topicType" = 'tag';

  UPDATE "UserJoinedTopic"
  SET "topicType" = 'topic'
  WHERE "topicType" IS NULL
    OR btrim("topicType") = ''
    OR "topicType" NOT IN ('category', 'topic');

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserJoinedTopic_topicType_check'
      AND conrelid = to_regclass('public."UserJoinedTopic"')
  ) THEN
    ALTER TABLE "UserJoinedTopic"
      ADD CONSTRAINT "UserJoinedTopic_topicType_check"
      CHECK ("topicType" IN ('category', 'topic'));
  END IF;
END $$;
