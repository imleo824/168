-- Keep one room per key before enforcing the public chat room uniqueness contract.
WITH canonical AS (
  SELECT "key", MIN("id") AS "keepId"
  FROM "ChatRoom"
  GROUP BY "key"
)
UPDATE "ChatMessage" message
SET "roomId" = canonical."keepId"
FROM canonical
JOIN "ChatRoom" duplicate ON duplicate."key" = canonical."key"
WHERE message."roomId" = duplicate."id"
  AND duplicate."id" <> canonical."keepId";

WITH canonical AS (
  SELECT "key", MIN("id") AS "keepId"
  FROM "ChatRoom"
  GROUP BY "key"
)
UPDATE "ChatBotInvocation" invocation
SET "roomId" = canonical."keepId"
FROM canonical
JOIN "ChatRoom" duplicate ON duplicate."key" = canonical."key"
WHERE invocation."roomId" = duplicate."id"
  AND duplicate."id" <> canonical."keepId";

DELETE FROM "ChatRoom" duplicate
USING "ChatRoom" canonical
WHERE duplicate."key" = canonical."key"
  AND duplicate."id" > canonical."id";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatRoom_key_key') THEN
    ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_key_key" UNIQUE ("key");
  END IF;
END $$;
