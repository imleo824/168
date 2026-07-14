-- Keep auto-crawl categoryMeta authoritative by schema key/type, but do not
-- drop extracted numbers solely because an admin UI min/max range is narrower.
-- The service layer already normalizes auto-crawl values; this database guard is
-- the final schema/type fence, not an extraction confidence gate.
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
      v_result := v_result || jsonb_build_object(v_key, v_raw);

    ELSIF v_type = 'boolean' AND jsonb_typeof(v_raw) = 'boolean' THEN
      v_result := v_result || jsonb_build_object(v_key, v_raw);

    ELSIF v_type = 'location' AND jsonb_typeof(v_raw) = 'string' AND v_location_document IS NOT NULL THEN
      SELECT location_value
      INTO v_text
      FROM (
        SELECT country_entry->>'country' AS location_value
        FROM jsonb_array_elements(v_location_document) country_entry
        WHERE NULLIF(BTRIM(country_entry->>'country'), '') IS NOT NULL
        UNION ALL
        SELECT country_entry->>'country' || ' · ' || (city_entry #>> '{}') AS location_value
        FROM jsonb_array_elements(v_location_document) country_entry
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(country_entry->'cities', '[]'::jsonb)) city_entry
      ) preset_location
      WHERE LOWER(BTRIM(location_value)) = LOWER(BTRIM(v_raw #>> '{}'))
      LIMIT 1;
      IF v_text IS NOT NULL THEN
        v_result := v_result || jsonb_build_object(v_key, v_text);
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;
