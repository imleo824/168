DO $$
DECLARE
  had_bumped_at BOOLEAN := false;
  has_sync_to_telegram BOOLEAN := false;
BEGIN
  IF to_regclass('public."Post"') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'bumpedAt'
  ) INTO had_bumped_at;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'syncToTelegram'
  ) INTO has_sync_to_telegram;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelegramSyncStatus') THEN
    CREATE TYPE "TelegramSyncStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');
  END IF;

  ALTER TABLE "Post"
    ADD COLUMN IF NOT EXISTS "contact" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
    ADD COLUMN IF NOT EXISTS "showContact" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "categoryMeta" JSONB,
    ADD COLUMN IF NOT EXISTS "countryCode" TEXT,
    ADD COLUMN IF NOT EXISTS "countryName" TEXT,
    ADD COLUMN IF NOT EXISTS "source" TEXT,
    ADD COLUMN IF NOT EXISTS "bumpedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "telegramSyncStatus" "TelegramSyncStatus" NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS "telegramSyncedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "telegramSyncRequestedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "telegramSyncLastError" TEXT,
    ADD COLUMN IF NOT EXISTS "quoteCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "quotedPostId" TEXT;

  ALTER TABLE "Post" ALTER COLUMN "categoryId" DROP NOT NULL;

  UPDATE "Post"
  SET "contact" = ''
  WHERE "contact" IS NULL;

  ALTER TABLE "Post" ALTER COLUMN "contact" SET DEFAULT '';
  ALTER TABLE "Post" ALTER COLUMN "contact" SET NOT NULL;

  UPDATE "Post"
  SET "showContact" = CASE
    WHEN COALESCE("contact", '') = '' THEN false
    ELSE true
  END
  WHERE "showContact" IS NULL
     OR COALESCE("contact", '') = '';

  ALTER TABLE "Post" ALTER COLUMN "showContact" SET DEFAULT true;
  ALTER TABLE "Post" ALTER COLUMN "showContact" SET NOT NULL;

  IF NOT had_bumped_at THEN
    UPDATE "Post"
    SET "bumpedAt" = COALESCE("createdAt", "updatedAt", CURRENT_TIMESTAMP);
  END IF;

  UPDATE "Post"
  SET "bumpedAt" = COALESCE("createdAt", "updatedAt", CURRENT_TIMESTAMP)
  WHERE "bumpedAt" IS NULL;

  ALTER TABLE "Post" ALTER COLUMN "bumpedAt" SET DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE "Post" ALTER COLUMN "bumpedAt" SET NOT NULL;

  UPDATE "Post"
  SET "telegramSyncStatus" = 'NONE'
  WHERE "telegramSyncStatus" IS NULL;

  IF has_sync_to_telegram THEN
    UPDATE "Post"
    SET
      "telegramSyncStatus" = 'SENT',
      "telegramSyncedAt" = COALESCE("telegramSyncedAt", "updatedAt"),
      "telegramSyncRequestedAt" = COALESCE("telegramSyncRequestedAt", "updatedAt"),
      "telegramSyncLastError" = NULL
    WHERE "syncToTelegram" = true
      AND "telegramSyncStatus" <> 'SENT';
  END IF;

  ALTER TABLE "Post" ALTER COLUMN "telegramSyncStatus" SET DEFAULT 'NONE';
  ALTER TABLE "Post" ALTER COLUMN "telegramSyncStatus" SET NOT NULL;

  UPDATE "Post"
  SET "categoryId" = NULL
  WHERE "categoryId" IS NOT NULL
    AND to_regclass('public."Category"') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "Category"
      WHERE "Category"."id" = "Post"."categoryId"
    );

  IF to_regclass('public."Category"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'Post_categoryId_fkey'
         AND conrelid = 'public."Post"'::regclass
     ) THEN
    ALTER TABLE "Post"
      ADD CONSTRAINT "Post_categoryId_fkey"
      FOREIGN KEY ("categoryId")
      REFERENCES "Category"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  UPDATE "Post" AS quoted
  SET "quotedPostId" = NULL
  WHERE quoted."quotedPostId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "Post" AS target
      WHERE target."id" = quoted."quotedPostId"
    );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Post_quotedPostId_fkey'
      AND conrelid = 'public."Post"'::regclass
  ) THEN
    ALTER TABLE "Post"
      ADD CONSTRAINT "Post_quotedPostId_fkey"
      FOREIGN KEY ("quotedPostId")
      REFERENCES "Post"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  UPDATE "Post" AS target
  SET "quoteCount" = counted."quoteCount"
  FROM (
    SELECT "quotedPostId", COUNT(*)::int AS "quoteCount"
    FROM "Post"
    WHERE "quotedPostId" IS NOT NULL
      AND "isPublished" = true
      AND "deletedAt" IS NULL
    GROUP BY "quotedPostId"
  ) AS counted
  WHERE target."id" = counted."quotedPostId";

  UPDATE "Post"
  SET "quoteCount" = 0
  WHERE "quoteCount" IS NULL
     OR "quoteCount" < 0;

  ALTER TABLE "Post" ALTER COLUMN "quoteCount" SET DEFAULT 0;
  ALTER TABLE "Post" ALTER COLUMN "quoteCount" SET NOT NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_post_visible_created"
  ON "Post" ("isPublished", "deletedAt", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "idx_post_visible_bumped_desc"
  ON "Post" ("isPublished", "deletedAt", "bumpedAt" DESC, "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_category_visible_bumped_desc"
  ON "Post" ("categoryId", "isPublished", "deletedAt", "bumpedAt" DESC, "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_country_visible_bumped_desc"
  ON "Post" ("countryCode", "isPublished", "deletedAt", "bumpedAt" DESC, "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_location_visible_bumped"
  ON "Post" ("location", "isPublished", "deletedAt", "bumpedAt", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "idx_post_visible_share_created"
  ON "Post" ("isPublished", "deletedAt", "shareCount", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "idx_post_visible_share_bumped_desc"
  ON "Post" ("isPublished", "deletedAt", "shareCount" DESC, "bumpedAt" DESC, "id" DESC);
