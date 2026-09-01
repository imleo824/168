-- Chat automation hardening
-- Keep the human chat room open by default, while robot automation stays opt-in.
-- Operators must explicitly enable chat_aiEnabled from the admin panel after platform AI is ready.

INSERT INTO "SystemConfig" ("key", "value") VALUES
  ('chat_enabled', 'true'),
  ('chat_aiEnabled', 'false')
ON CONFLICT ("key") DO UPDATE SET
  "value" = EXCLUDED."value";

-- Clamp dangerous historical values that may have been saved before server-side normalization existed.
-- Values are JSON-encoded strings in normal operation, but these guards avoid failing deployment if a malformed value exists.
UPDATE "SystemConfig" SET "value" = '0'
WHERE "key" = 'chat_botMaxPerMinute'
  AND TRIM(BOTH '"' FROM "value") ~ '^-?\d+$'
  AND TRIM(BOTH '"' FROM "value")::int < 0;

UPDATE "SystemConfig" SET "value" = '5'
WHERE "key" = 'chat_botMaxPerMinute'
  AND TRIM(BOTH '"' FROM "value") ~ '^-?\d+$'
  AND TRIM(BOTH '"' FROM "value")::int > 5;

UPDATE "SystemConfig" SET "value" = '1'
WHERE "key" = 'chat_botConcurrency'
  AND TRIM(BOTH '"' FROM "value") ~ '^-?\d+$'
  AND TRIM(BOTH '"' FROM "value")::int < 1;

UPDATE "SystemConfig" SET "value" = '3'
WHERE "key" = 'chat_botConcurrency'
  AND TRIM(BOTH '"' FROM "value") ~ '^-?\d+$'
  AND TRIM(BOTH '"' FROM "value")::int > 3;

UPDATE "SystemConfig" SET "value" = '3600'
WHERE "key" = 'chat_botCooldownSeconds'
  AND TRIM(BOTH '"' FROM "value") ~ '^-?\d+$'
  AND TRIM(BOTH '"' FROM "value")::int > 3600;
