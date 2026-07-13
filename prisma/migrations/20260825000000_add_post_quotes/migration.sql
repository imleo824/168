ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "quoteCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quotedPostId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Post_quotedPostId_fkey'
  ) THEN
    ALTER TABLE "Post"
      ADD CONSTRAINT "Post_quotedPostId_fkey"
      FOREIGN KEY ("quotedPostId")
      REFERENCES "Post"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_post_quote_visible_created"
  ON "Post" ("quotedPostId", "isPublished", "deletedAt", "createdAt" DESC, "id" DESC);

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
WHERE "quoteCount" < 0;
