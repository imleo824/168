-- Treat one source message as one auto-crawl item regardless of later content edits.
-- PostgreSQL UNIQUE permits multiple NULL sourcePostId values while enforcing real source identities.

CREATE TEMP TABLE auto_crawl_duplicate_resolution ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    item."id" AS item_id,
    item."sourceId",
    item."sourcePostId",
    item."postId",
    ROW_NUMBER() OVER (
      PARTITION BY item."sourceId", item."sourcePostId"
      ORDER BY (item."postId" IS NOT NULL) DESC, item."updatedAt" DESC, item."createdAt" DESC, item."id" DESC
    ) AS keep_rank,
    FIRST_VALUE(item."id") OVER (
      PARTITION BY item."sourceId", item."sourcePostId"
      ORDER BY (item."postId" IS NOT NULL) DESC, item."updatedAt" DESC, item."createdAt" DESC, item."id" DESC
    ) AS keep_item_id,
    FIRST_VALUE(item."postId") OVER (
      PARTITION BY item."sourceId", item."sourcePostId"
      ORDER BY (item."postId" IS NOT NULL) DESC, item."updatedAt" DESC, item."createdAt" DESC, item."id" DESC
    ) AS keep_post_id
  FROM public."AutoCrawlItem" item
  WHERE item."sourcePostId" IS NOT NULL AND BTRIM(item."sourcePostId") <> ''
)
SELECT * FROM ranked WHERE keep_rank > 1;

-- User-created engagement must never be silently discarded by an identity cleanup.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."Like" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."Comment" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."PostComment" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."PostShare" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."UserNotification" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM auto_crawl_duplicate_resolution duplicate
    JOIN public."UserRecommendationFeedback" interaction ON interaction."postId" = duplicate."postId"
    WHERE duplicate."postId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'auto_crawl_duplicate_posts_have_user_engagement';
  END IF;
END;
$$;

-- Preserve genuine view history on the retained, latest published post.
UPDATE public."PostView" view_record
SET "postId" = duplicate.keep_post_id
FROM auto_crawl_duplicate_resolution duplicate
WHERE duplicate."postId" IS NOT NULL
  AND duplicate.keep_post_id IS NOT NULL
  AND duplicate."postId" <> duplicate.keep_post_id
  AND view_record."postId" = duplicate."postId";

-- Delete old duplicate posts. System-derived score/aggregate rows cascade and are recalculated normally.
DELETE FROM public."Post" post
USING auto_crawl_duplicate_resolution duplicate
WHERE duplicate."postId" IS NOT NULL
  AND duplicate.keep_post_id IS NOT NULL
  AND duplicate."postId" <> duplicate.keep_post_id
  AND post."id" = duplicate."postId";

DELETE FROM public."AutoCrawlItem" item
USING auto_crawl_duplicate_resolution duplicate
WHERE item."id" = duplicate.item_id;

-- Existing retained rows receive the same stable identity used by the application.
UPDATE public."AutoCrawlItem"
SET "fingerprint" = md5("sourceId" || '|' || COALESCE("sourcePostId", '') || '|' || COALESCE("sourceUrl", '')),
    "updatedAt" = "updatedAt"
WHERE "sourcePostId" IS NOT NULL AND BTRIM("sourcePostId") <> '';

ALTER TABLE public."AutoCrawlItem"
  DROP CONSTRAINT IF EXISTS "AutoCrawlItem_sourceId_sourcePostId_key";
ALTER TABLE public."AutoCrawlItem"
  ADD CONSTRAINT "AutoCrawlItem_sourceId_sourcePostId_key"
  UNIQUE ("sourceId", "sourcePostId");
