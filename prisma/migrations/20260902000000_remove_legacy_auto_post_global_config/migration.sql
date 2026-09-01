DO $$
DECLARE
  raw_value TEXT;
  scalar_value TEXT;
  legacy_author_user_id TEXT := '';
  legacy_category_id TEXT := '';
  legacy_daily_limit INTEGER := 12;
  topic_configs JSONB := '{}'::jsonb;
  next_topic_configs JSONB := '{}'::jsonb;
  topics TEXT[] := ARRAY['QUOTE', 'FACT', 'RIDDLE', 'JOKE'];
  topic TEXT;
  current_topic JSONB;
  current_daily_limit INTEGER;
BEGIN
  IF to_regclass('public."SystemConfig"') IS NULL THEN
    RETURN;
  END IF;

  SELECT "value" INTO raw_value
  FROM "SystemConfig"
  WHERE "key" = 'auto_post_topicConfigs';

  IF raw_value IS NOT NULL THEN
    BEGIN
      topic_configs := raw_value::jsonb;
      IF jsonb_typeof(topic_configs) <> 'object' THEN
        topic_configs := '{}'::jsonb;
      END IF;
    EXCEPTION WHEN others THEN
      topic_configs := '{}'::jsonb;
    END;
  END IF;

  SELECT "value" INTO raw_value
  FROM "SystemConfig"
  WHERE "key" = 'auto_post_authorUserId';

  IF raw_value IS NOT NULL THEN
    BEGIN
      legacy_author_user_id := COALESCE(raw_value::jsonb #>> '{}', '');
    EXCEPTION WHEN others THEN
      legacy_author_user_id := raw_value;
    END;
    legacy_author_user_id := trim(both '"' from btrim(legacy_author_user_id));
  END IF;

  SELECT "value" INTO raw_value
  FROM "SystemConfig"
  WHERE "key" = 'auto_post_categoryId';

  IF raw_value IS NOT NULL THEN
    BEGIN
      legacy_category_id := COALESCE(raw_value::jsonb #>> '{}', '');
    EXCEPTION WHEN others THEN
      legacy_category_id := raw_value;
    END;
    legacy_category_id := trim(both '"' from btrim(legacy_category_id));
  END IF;

  SELECT "value" INTO raw_value
  FROM "SystemConfig"
  WHERE "key" = 'auto_post_dailyLimit';

  IF raw_value IS NOT NULL THEN
    BEGIN
      scalar_value := COALESCE(raw_value::jsonb #>> '{}', '');
    EXCEPTION WHEN others THEN
      scalar_value := raw_value;
    END;

    IF btrim(scalar_value) ~ '^[0-9]+$' THEN
      legacy_daily_limit := LEAST(100, GREATEST(0, btrim(scalar_value)::integer));
    END IF;
  END IF;

  IF legacy_daily_limit <= 0 THEN
    legacy_daily_limit := 12;
  END IF;

  FOREACH topic IN ARRAY topics LOOP
    current_topic := topic_configs -> topic;
    IF current_topic IS NULL OR jsonb_typeof(current_topic) <> 'object' THEN
      current_topic := '{}'::jsonb;
    END IF;

    IF NOT current_topic ? 'enabled' THEN
      current_topic := jsonb_set(current_topic, '{enabled}', 'false'::jsonb, true);
    END IF;

    IF COALESCE(btrim(current_topic ->> 'authorUserId'), '') = '' THEN
      current_topic := jsonb_set(current_topic, '{authorUserId}', to_jsonb(legacy_author_user_id), true);
    END IF;

    IF COALESCE(btrim(current_topic ->> 'categoryId'), '') = '' THEN
      current_topic := jsonb_set(current_topic, '{categoryId}', to_jsonb(legacy_category_id), true);
    END IF;

    IF COALESCE(current_topic ->> 'dailyLimit', '') ~ '^[0-9]+$' THEN
      current_daily_limit := LEAST(100, GREATEST(0, (current_topic ->> 'dailyLimit')::integer));
    ELSE
      current_daily_limit := 0;
    END IF;

    IF current_daily_limit <= 0 THEN
      current_daily_limit := legacy_daily_limit;
    END IF;

    current_topic := jsonb_set(current_topic, '{dailyLimit}', to_jsonb(current_daily_limit), true);
    next_topic_configs := jsonb_set(next_topic_configs, ARRAY[topic], current_topic, true);
  END LOOP;

  INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
  VALUES ('auto_post_topicConfigs', next_topic_configs::text, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO UPDATE
  SET "value" = EXCLUDED."value",
      "updatedAt" = CURRENT_TIMESTAMP;

  DELETE FROM "SystemConfig"
  WHERE "key" IN ('auto_post_authorUserId', 'auto_post_categoryId', 'auto_post_dailyLimit');
END $$;
