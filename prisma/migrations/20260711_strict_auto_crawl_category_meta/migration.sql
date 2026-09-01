CREATE OR REPLACE FUNCTION public.strict_auto_crawl_category_meta(
  p_category_id text,
  p_category_meta jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_category_slug text;
  v_schema_document jsonb;
  v_category_schema jsonb;
  v_allowed_keys text[];
  v_result jsonb;
BEGIN
  SELECT c."slug"
  INTO v_category_slug
  FROM public."Category" c
  WHERE c."id" = p_category_id;

  IF NULLIF(BTRIM(v_category_slug), '') IS NULL THEN
    RAISE EXCEPTION 'auto_crawl_database_category_not_found';
  END IF;

  SELECT sc."value"::jsonb
  INTO v_schema_document
  FROM public."SystemConfig" sc
  WHERE sc."key" = 'publish_category_schema';

  IF v_schema_document IS NULL THEN
    RAISE EXCEPTION 'auto_crawl_database_meta_schema_not_configured';
  END IF;

  IF jsonb_typeof(v_schema_document) <> 'array' THEN
    RAISE EXCEPTION 'auto_crawl_database_meta_schema_not_array';
  END IF;

  SELECT schema_entry
  INTO v_category_schema
  FROM jsonb_array_elements(v_schema_document) AS schema_entry
  WHERE LOWER(BTRIM(COALESCE(schema_entry->>'categorySlug', ''))) = LOWER(BTRIM(v_category_slug))
  LIMIT 1;

  IF v_category_schema IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF jsonb_typeof(COALESCE(v_category_schema->'fields', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'auto_crawl_database_meta_fields_not_array:%', v_category_slug;
  END IF;

  SELECT ARRAY_AGG(BTRIM(field_entry->>'key'))
  INTO v_allowed_keys
  FROM jsonb_array_elements(COALESCE(v_category_schema->'fields', '[]'::jsonb)) AS field_entry
  WHERE NULLIF(BTRIM(field_entry->>'key'), '') IS NOT NULL;

  IF COALESCE(array_length(v_allowed_keys, 1), 0) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_object_agg(meta_entry.key, meta_entry.value), '{}'::jsonb)
  INTO v_result
  FROM jsonb_each(COALESCE(p_category_meta, '{}'::jsonb)) AS meta_entry
  WHERE meta_entry.key = ANY(v_allowed_keys);

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_auto_crawl_post_category_meta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_auto_crawl boolean := false;
BEGIN
  IF jsonb_typeof(COALESCE(NEW."categoryMeta", '{}'::jsonb)) = 'object'
     AND COALESCE(NEW."categoryMeta", '{}'::jsonb) ? 'autoCrawl' THEN
    v_is_auto_crawl := true;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public."AutoCrawlItem" item
      WHERE item."postId" = NEW."id"
    )
    INTO v_is_auto_crawl;
  END IF;

  IF NOT v_is_auto_crawl THEN
    RETURN NEW;
  END IF;

  NEW."categoryMeta" := public.strict_auto_crawl_category_meta(
    NEW."categoryId",
    NEW."categoryMeta"
  );
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

UPDATE public."Post" post
SET "categoryMeta" = public.strict_auto_crawl_category_meta(
  post."categoryId",
  post."categoryMeta"
)
WHERE jsonb_typeof(COALESCE(post."categoryMeta", '{}'::jsonb)) = 'object'
  AND COALESCE(post."categoryMeta", '{}'::jsonb) ? 'autoCrawl';
