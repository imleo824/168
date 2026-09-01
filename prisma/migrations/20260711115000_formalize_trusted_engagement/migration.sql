-- ============================================================================
-- Trusted engagement migration
-- -----------------------------------------------------------------------------
-- Purpose:
-- - Add stable user linkage for PostView.
-- - Add NORMAL-user-only engagement aggregate columns.
-- - Backfill historical authenticated views from viewerKey = 'u:<userId>'.
-- - Keep a DB trigger as compatibility until every PostView writer passes
--   viewerUserId directly.
--
-- This migration does not remove ROBOT-authored posts. It only prevents ROBOT
-- user behavior from affecting ranking scores.
-- ============================================================================

BEGIN;

ALTER TABLE "PostView" ADD COLUMN IF NOT EXISTS "viewerUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'post_view_viewer_user_id_fkey'
  ) THEN
    ALTER TABLE "PostView"
      ADD CONSTRAINT post_view_viewer_user_id_fkey
      FOREIGN KEY ("viewerUserId") REFERENCES "User"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_post_view_viewer_user_created"
  ON "PostView" ("viewerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_view_post_viewer_user_created"
  ON "PostView" ("postId", "viewerUserId", "createdAt" DESC);

ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalLikeCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalViewCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalShareCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalCommentCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalQuoteCount" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalDwellMs" INT NOT NULL DEFAULT 0;
ALTER TABLE "PostEngagementAggregate" ADD COLUMN IF NOT EXISTS "normalQuickSkipCount" INT NOT NULL DEFAULT 0;

UPDATE "PostView" pv
SET "viewerUserId" = SUBSTRING(pv."viewerKey" FROM 3)
WHERE pv."viewerUserId" IS NULL
  AND pv."viewerKey" LIKE 'u:%'
  AND EXISTS (
    SELECT 1
    FROM "User" u
    WHERE u."id" = SUBSTRING(pv."viewerKey" FROM 3)
  );

CREATE OR REPLACE FUNCTION set_post_view_viewer_user_id_from_key()
RETURNS trigger AS $$
DECLARE
  candidate_user_id TEXT;
BEGIN
  IF NEW."viewerUserId" IS NULL AND NEW."viewerKey" LIKE 'u:%' THEN
    candidate_user_id := SUBSTRING(NEW."viewerKey" FROM 3);
    IF EXISTS (SELECT 1 FROM "User" u WHERE u."id" = candidate_user_id) THEN
      NEW."viewerUserId" := candidate_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_view_set_viewer_user_id ON "PostView";
CREATE TRIGGER trg_post_view_set_viewer_user_id
BEFORE INSERT OR UPDATE OF "viewerKey", "viewerUserId" ON "PostView"
FOR EACH ROW
EXECUTE FUNCTION set_post_view_viewer_user_id_from_key();

COMMIT;
