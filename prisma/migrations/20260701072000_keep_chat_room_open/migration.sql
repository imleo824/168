-- Keep the human chat room open.
-- A previous automation-hardening migration may already have persisted chat_enabled=false.
-- chat_enabled controls human chat availability; chat_aiEnabled controls robot automation.

INSERT INTO "SystemConfig" ("key", "value") VALUES
  ('chat_enabled', 'true'),
  ('chat_aiEnabled', 'false')
ON CONFLICT ("key") DO UPDATE SET
  "value" = CASE
    WHEN EXCLUDED."key" = 'chat_enabled' THEN 'true'
    WHEN EXCLUDED."key" = 'chat_aiEnabled' THEN "SystemConfig"."value"
    ELSE EXCLUDED."value"
  END;
