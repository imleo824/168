-- Robot chat identities are regular User rows. Remove the obsolete profile namespace
-- only after dropping its BOT-only check constraint.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_message_bot_identity_required') THEN
    ALTER TABLE "ChatMessage" DROP CONSTRAINT "chat_message_bot_identity_required";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_botProfileId_fkey') THEN
    ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_botProfileId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatBotInvocation_botProfileId_fkey') THEN
    ALTER TABLE "ChatBotInvocation" DROP CONSTRAINT "ChatBotInvocation_botProfileId_fkey";
  END IF;
END $$;

UPDATE "ChatMessage"
SET "authorUserId" = NULL
WHERE "authorUserId" LIKE 'chat-bot-profile-%';

UPDATE "ChatMessage"
SET "botProfileId" = NULL
WHERE "botProfileId" LIKE 'chat-bot-profile-%';

UPDATE "ChatBotInvocation"
SET "botProfileId" = NULL
WHERE "botProfileId" LIKE 'chat-bot-profile-%';

DELETE FROM "User" WHERE "id" LIKE 'chat-bot-profile-%';
DROP INDEX IF EXISTS "idx_chat_msg_bot_created_desc";
DROP INDEX IF EXISTS "idx_chat_bot_enabled_updated";
DROP INDEX IF EXISTS "idx_chat_bot_last_message_at";
DROP INDEX IF EXISTS "idx_chat_bot_invocation_bot_created";
ALTER TABLE "ChatMessage" DROP COLUMN IF EXISTS "botProfileId";
ALTER TABLE "ChatBotInvocation" DROP COLUMN IF EXISTS "botProfileId";
DROP TABLE IF EXISTS "ChatBotProfile";
