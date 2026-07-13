-- Runtime never falls back to categoryName. This block only upgrades legacy rows when the old column still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'AutoCrawlSource'
      AND column_name = 'categoryName'
  ) THEN
    EXECUTE $sql$
      UPDATE public."AutoCrawlSource" source
      SET "categoryId" = category."id"
      FROM public."Category" category
      WHERE (source."categoryId" IS NULL OR BTRIM(source."categoryId") = '')
        AND BTRIM(source."categoryName") = BTRIM(category."name")
    $sql$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."AutoCrawlSource"
    WHERE "categoryId" IS NULL OR BTRIM("categoryId") = ''
  ) THEN
    RAISE EXCEPTION 'auto_crawl_source_category_migration_unresolved';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_auto_crawl_source_normal_trust ON public."AutoCrawlSource";
DROP TRIGGER IF EXISTS trg_apply_auto_crawl_source_category_author ON public."AutoCrawlSource";
DROP FUNCTION IF EXISTS public.force_auto_crawl_source_normal_trust();
DROP FUNCTION IF EXISTS public.apply_auto_crawl_source_category_author();

DROP TRIGGER IF EXISTS trg_apply_auto_crawl_post_category_author ON public."Post";
DROP TRIGGER IF EXISTS trg_normalize_auto_crawl_post_source ON public."Post";
DROP FUNCTION IF EXISTS public.apply_auto_crawl_post_category_author();
DROP FUNCTION IF EXISTS public.normalize_auto_crawl_post_source();

ALTER TABLE public."AutoCrawlSource"
  ALTER COLUMN "categoryId" SET NOT NULL,
  ALTER COLUMN "authorUserId" SET NOT NULL,
  DROP COLUMN IF EXISTS "trustLevel",
  DROP COLUMN IF EXISTS "categoryName",
  DROP COLUMN IF EXISTS "syncToTelegram",
  DROP COLUMN IF EXISTS "lastGapDetectedAt",
  DROP COLUMN IF EXISTS "lastGapMissingCount";

ALTER TABLE public."AutoCrawlConfig"
  DROP COLUMN IF EXISTS "localOnlyMode",
  DROP COLUMN IF EXISTS "aiEnabled";

DROP TABLE IF EXISTS public."AutoCrawlLock";
DROP TABLE IF EXISTS public."AutoCrawlCategoryAuthor";

DELETE FROM public."SystemConfig"
WHERE "key" = 'auto_crawl_category_routing_rules';

DROP INDEX IF EXISTS public."idx_auto_crawl_source_category";
CREATE INDEX IF NOT EXISTS "idx_auto_crawl_source_category"
  ON public."AutoCrawlSource"("categoryId");

CREATE OR REPLACE FUNCTION public.enforce_auto_crawl_post_category_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_auto_crawl boolean := false;
BEGIN
  v_is_auto_crawl := COALESCE(current_setting('app.auto_crawl_write', true), '') = '1';

  IF NOT v_is_auto_crawl AND TG_OP = 'UPDATE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public."AutoCrawlItem" item
      WHERE item."postId" = NEW."id"
    )
    INTO v_is_auto_crawl;
  END IF;

  IF v_is_auto_crawl THEN
    NEW."categoryMeta" := public.strict_auto_crawl_category_meta(
      NEW."categoryId",
      NEW."categoryMeta"
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_auto_crawl_category_meta_insert ON public."Post";
CREATE TRIGGER trg_post_auto_crawl_category_meta_insert
BEFORE INSERT ON public."Post"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_auto_crawl_post_category_meta();

DROP TRIGGER IF EXISTS trg_post_auto_crawl_category_meta_update ON public."Post";
CREATE TRIGGER trg_post_auto_crawl_category_meta_update
BEFORE UPDATE OF "categoryMeta", "categoryId" ON public."Post"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_auto_crawl_post_category_meta();