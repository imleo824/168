DO $$
BEGIN
  IF to_regclass('public."QuotePublishRun"') IS NOT NULL THEN
    UPDATE "QuotePublishRun"
    SET "trigger" = 'SCHEDULED'
    WHERE "trigger" NOT IN ('MANUAL', 'SCHEDULED');

    UPDATE "QuotePublishRun"
    SET "status" = 'FAILED'
    WHERE "status" NOT IN ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'QuotePublishRun_trigger_check'
        AND conrelid = to_regclass('public."QuotePublishRun"')
    ) THEN
      ALTER TABLE "QuotePublishRun"
        ADD CONSTRAINT "QuotePublishRun_trigger_check"
        CHECK ("trigger" IN ('MANUAL', 'SCHEDULED'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'QuotePublishRun_status_check'
        AND conrelid = to_regclass('public."QuotePublishRun"')
    ) THEN
      ALTER TABLE "QuotePublishRun"
        ADD CONSTRAINT "QuotePublishRun_status_check"
        CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED'));
    END IF;
  END IF;

  IF to_regclass('public."AutoPostContent"') IS NOT NULL THEN
    DELETE FROM "AutoPostContent"
    WHERE "topic" NOT IN ('QUOTE', 'FACT', 'RIDDLE', 'JOKE');

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'AutoPostContent_topic_check'
        AND conrelid = to_regclass('public."AutoPostContent"')
    ) THEN
      ALTER TABLE "AutoPostContent"
        ADD CONSTRAINT "AutoPostContent_topic_check"
        CHECK ("topic" IN ('QUOTE', 'FACT', 'RIDDLE', 'JOKE'));
    END IF;
  END IF;

  IF to_regclass('public."AutoPostRun"') IS NOT NULL THEN
    UPDATE "AutoPostRun"
    SET "trigger" = 'SCHEDULED'
    WHERE "trigger" NOT IN ('MANUAL', 'SCHEDULED');

    UPDATE "AutoPostRun"
    SET "status" = 'FAILED'
    WHERE "status" NOT IN ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED');

    UPDATE "AutoPostRun"
    SET "topic" = NULL
    WHERE "topic" IS NOT NULL
      AND "topic" NOT IN ('QUOTE', 'FACT', 'RIDDLE', 'JOKE');

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'AutoPostRun_trigger_check'
        AND conrelid = to_regclass('public."AutoPostRun"')
    ) THEN
      ALTER TABLE "AutoPostRun"
        ADD CONSTRAINT "AutoPostRun_trigger_check"
        CHECK ("trigger" IN ('MANUAL', 'SCHEDULED'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'AutoPostRun_status_check'
        AND conrelid = to_regclass('public."AutoPostRun"')
    ) THEN
      ALTER TABLE "AutoPostRun"
        ADD CONSTRAINT "AutoPostRun_status_check"
        CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED'));
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'AutoPostRun_topic_check'
        AND conrelid = to_regclass('public."AutoPostRun"')
    ) THEN
      ALTER TABLE "AutoPostRun"
        ADD CONSTRAINT "AutoPostRun_topic_check"
        CHECK ("topic" IS NULL OR "topic" IN ('QUOTE', 'FACT', 'RIDDLE', 'JOKE'));
    END IF;
  END IF;
END $$;
