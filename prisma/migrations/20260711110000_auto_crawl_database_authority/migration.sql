-- Auto-crawl classification and Meta are authoritative only when backed by database Category and SystemConfig.

-- Remove Meta schemas whose category no longer exists.
UPDATE public."SystemConfig" config
SET "value" = COALESCE((
  SELECT jsonb_agg(entry ORDER BY ordinal_position)
  FROM jsonb_array_elements(config."value"::jsonb) WITH ORDINALITY AS schema_entry(entry, ordinal_position)
  JOIN public."Category" category
    ON category."slug" = schema_entry.entry->>'categorySlug'
), '[]'::jsonb)::text,
"updatedAt" = CURRENT_TIMESTAMP
WHERE config."key" = 'publish_category_schema';

-- One-time exact repair for two sources whose names explicitly identify the existing housing category.
UPDATE public."AutoCrawlSource" source
SET "categoryId" = category."id",
    "sourceHealth" = 'PENDING',
    "lastError" = NULL,
    "nextRunAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
FROM public."Category" category
WHERE category."slug" = 'housing'
  AND source."sourceName" IN ('斯里兰卡租房', '金边租房')
  AND NOT EXISTS (
    SELECT 1 FROM public."Category" current_category WHERE current_category."id" = source."categoryId"
  );

-- A source without any corresponding database category cannot remain in the active pipeline.
DELETE FROM public."AutoCrawlSource" source
WHERE source."sourceName" = '斯里兰卡/兰卡美食/生活出行指南'
  AND NOT EXISTS (
    SELECT 1 FROM public."Category" category WHERE category."id" = source."categoryId"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."AutoCrawlSource" source
    LEFT JOIN public."Category" category ON category."id" = source."categoryId"
    WHERE category."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'auto_crawl_source_category_unresolved';
  END IF;
END;
$$;

ALTER TABLE public."AutoCrawlSource"
  DROP CONSTRAINT IF EXISTS "AutoCrawlSource_categoryId_fkey";
ALTER TABLE public."AutoCrawlSource"
  ADD CONSTRAINT "AutoCrawlSource_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES public."Category"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
ALTER TABLE public."AutoCrawlSource"
  VALIDATE CONSTRAINT "AutoCrawlSource_categoryId_fkey";

CREATE OR REPLACE FUNCTION public.validate_publish_category_schema_document(p_value text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_document jsonb;
  v_entry jsonb;
  v_field jsonb;
  v_slug text;
  v_key text;
  v_type text;
BEGIN
  BEGIN
    v_document := p_value::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'publish_category_schema_invalid_json';
  END;

  IF jsonb_typeof(v_document) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'publish_category_schema_not_array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_document) entry
    GROUP BY BTRIM(entry->>'categorySlug')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'publish_category_schema_duplicate_category';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_document)
  LOOP
    IF jsonb_typeof(v_entry) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'publish_category_schema_entry_invalid';
    END IF;

    v_slug := BTRIM(COALESCE(v_entry->>'categorySlug', ''));
    IF v_slug = '' OR NOT EXISTS (
      SELECT 1 FROM public."Category" category WHERE category."slug" = v_slug
    ) THEN
      RAISE EXCEPTION 'publish_category_schema_category_not_found:%', v_slug;
    END IF;

    IF jsonb_typeof(v_entry->'schemaVersion') IS DISTINCT FROM 'number'
       OR (v_entry->>'schemaVersion')::numeric < 1
       OR (v_entry->>'schemaVersion')::numeric <> TRUNC((v_entry->>'schemaVersion')::numeric) THEN
      RAISE EXCEPTION 'publish_category_schema_version_invalid:%', v_slug;
    END IF;

    IF jsonb_typeof(v_entry->'fields') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'publish_category_schema_fields_not_array:%', v_slug;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_entry->'fields') field
      GROUP BY BTRIM(field->>'key')
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'publish_category_schema_duplicate_field:%', v_slug;
    END IF;

    FOR v_field IN SELECT value FROM jsonb_array_elements(v_entry->'fields')
    LOOP
      IF jsonb_typeof(v_field) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'publish_category_schema_field_invalid:%', v_slug;
      END IF;
      v_key := BTRIM(COALESCE(v_field->>'key', ''));
      v_type := LOWER(BTRIM(COALESCE(v_field->>'type', '')));
      IF v_key = '' OR BTRIM(COALESCE(v_field->>'label', '')) = ''
         OR v_type NOT IN ('text', 'select', 'number', 'boolean', 'location') THEN
        RAISE EXCEPTION 'publish_category_schema_field_invalid:%:%', v_slug, v_key;
      END IF;
      IF v_type = 'select' AND (
        jsonb_typeof(v_field->'options') IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_field->'options') = 0
      ) THEN
        RAISE EXCEPTION 'publish_category_schema_options_invalid:%:%', v_slug, v_key;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_publish_category_schema_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."key" = 'publish_category_schema' THEN
    PERFORM public.validate_publish_category_schema_document(NEW."value");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_publish_category_schema_config ON public."SystemConfig";
CREATE TRIGGER trg_validate_publish_category_schema_config
BEFORE INSERT OR UPDATE OF "value" ON public."SystemConfig"
FOR EACH ROW
WHEN (NEW."key" = 'publish_category_schema')
EXECUTE FUNCTION public.enforce_publish_category_schema_config();

CREATE OR REPLACE FUNCTION public.protect_category_schema_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema_document jsonb;
BEGIN
  SELECT config."value"::jsonb
  INTO v_schema_document
  FROM public."SystemConfig" config
  WHERE config."key" = 'publish_category_schema';

  IF v_schema_document IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_schema_document) entry
    WHERE entry->>'categorySlug' = OLD."slug"
  ) THEN
    RAISE EXCEPTION 'category_schema_binding_exists:%', OLD."slug";
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_category_schema_binding_delete ON public."Category";
CREATE TRIGGER trg_protect_category_schema_binding_delete
BEFORE DELETE ON public."Category"
FOR EACH ROW
EXECUTE FUNCTION public.protect_category_schema_binding();

DROP TRIGGER IF EXISTS trg_protect_category_schema_binding_update ON public."Category";
CREATE TRIGGER trg_protect_category_schema_binding_update
BEFORE UPDATE OF "slug" ON public."Category"
FOR EACH ROW
WHEN (NEW."slug" IS DISTINCT FROM OLD."slug")
EXECUTE FUNCTION public.protect_category_schema_binding();

CREATE OR REPLACE FUNCTION public.strict_auto_crawl_category_meta(p_category_id text, p_category_meta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_category_slug text;
  v_schema_document jsonb;
  v_category_schema jsonb;
  v_location_document jsonb;
  v_field jsonb;
  v_key text;
  v_type text;
  v_raw jsonb;
  v_text text;
  v_option text;
  v_number numeric;
  v_min numeric;
  v_max numeric;
  v_max_length integer;
  v_result jsonb := '{}'::jsonb;
BEGIN
  SELECT category."slug"
  INTO v_category_slug
  FROM public."Category" category
  WHERE category."id" = p_category_id;

  IF NULLIF(BTRIM(v_category_slug), '') IS NULL THEN
    RAISE EXCEPTION 'auto_crawl_database_category_not_found';
  END IF;

  SELECT config."value"::jsonb
  INTO v_schema_document
  FROM public."SystemConfig" config
  WHERE config."key" = 'publish_category_schema';

  IF v_schema_document IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  PERFORM public.validate_publish_category_schema_document(v_schema_document::text);

  SELECT entry
  INTO v_category_schema
  FROM jsonb_array_elements(v_schema_document) entry
  WHERE entry->>'categorySlug' = v_category_slug;

  IF v_category_schema IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT config."value"::jsonb
  INTO v_location_document
  FROM public."SystemConfig" config
  WHERE config."key" = 'location_presets';

  FOR v_field IN SELECT value FROM jsonb_array_elements(v_category_schema->'fields')
  LOOP
    v_key := BTRIM(v_field->>'key');
    v_type := LOWER(BTRIM(v_field->>'type'));
    IF NOT COALESCE(p_category_meta, '{}'::jsonb) ? v_key THEN
      CONTINUE;
    END IF;
    v_raw := p_category_meta->v_key;

    IF v_type = 'text' AND jsonb_typeof(v_raw) = 'string' THEN
      v_text := BTRIM(v_raw #>> '{}');
      v_max_length := COALESCE((v_field->>'maxLength')::integer, 300);
      IF v_text <> '' THEN
        v_result := v_result || jsonb_build_object(v_key, LEFT(v_text, v_max_length));
      END IF;

    ELSIF v_type = 'select' AND jsonb_typeof(v_raw) = 'string' THEN
      SELECT option_value #>> '{}'
      INTO v_option
      FROM jsonb_array_elements(v_field->'options') option_value
      WHERE LOWER(BTRIM(option_value #>> '{}')) = LOWER(BTRIM(v_raw #>> '{}'))
      LIMIT 1;
      IF v_option IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(v_key, v_option);
      END IF;

    ELSIF v_type = 'number' AND jsonb_typeof(v_raw) = 'number' THEN
      v_number := (v_raw #>> '{}')::numeric;
      v_min := CASE WHEN v_field ? 'min' THEN (v_field->>'min')::numeric ELSE NULL END;
      v_max := CASE WHEN v_field ? 'max' THEN (v_field->>'max')::numeric ELSE NULL END;
      IF (v_min IS NULL OR v_number >= v_min) AND (v_max IS NULL OR v_number <= v_max) THEN
        v_result := v_result || jsonb_build_object(v_key, v_raw);
      END IF;

    ELSIF v_type = 'boolean' AND jsonb_typeof(v_raw) = 'boolean' THEN
      v_result := v_result || jsonb_build_object(v_key, v_raw);

    ELSIF v_type = 'location' AND jsonb_typeof(v_raw) = 'string' AND v_location_document IS NOT NULL THEN
      SELECT country_entry->>'country' || ' · ' || (city_entry #>> '{}')
      INTO v_text
      FROM jsonb_array_elements(v_location_document) country_entry
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(country_entry->'cities', '[]'::jsonb)) city_entry
      WHERE LOWER(BTRIM(country_entry->>'country' || ' · ' || (city_entry #>> '{}'))) = LOWER(BTRIM(v_raw #>> '{}'))
      LIMIT 1;
      IF v_text IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(v_key, v_text);
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Re-normalize every existing auto-crawl post against its current database category and Schema.
UPDATE public."Post" post
SET "categoryMeta" = public.strict_auto_crawl_category_meta(post."categoryId", post."categoryMeta")
WHERE EXISTS (
  SELECT 1 FROM public."AutoCrawlItem" item WHERE item."postId" = post."id"
);

-- Validate the canonical configuration after all cleanup.
DO $$
DECLARE
  v_value text;
BEGIN
  SELECT "value" INTO v_value
  FROM public."SystemConfig"
  WHERE "key" = 'publish_category_schema';
  IF v_value IS NOT NULL THEN
    PERFORM public.validate_publish_category_schema_document(v_value);
  END IF;
END;
$$;
