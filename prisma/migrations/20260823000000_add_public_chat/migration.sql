CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatMessageAuthorType') THEN
    CREATE TYPE "ChatMessageAuthorType" AS ENUM ('USER', 'BOT', 'SYSTEM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatMessageStatus') THEN
    CREATE TYPE "ChatMessageStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatBotInvocationStatus') THEN
    CREATE TYPE "ChatBotInvocationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatBotTrigger') THEN
    CREATE TYPE "ChatBotTrigger" AS ENUM ('HUMAN_MESSAGE', 'IDLE_WARMUP');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ChatRoom" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatBotProfile" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "displayName" TEXT NOT NULL,
  "photoUrl" TEXT,
  "persona" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "cooldownSeconds" INTEGER NOT NULL DEFAULT 90,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatBotProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "roomId" TEXT NOT NULL,
  "authorType" "ChatMessageAuthorType" NOT NULL,
  "authorUserId" TEXT,
  "botProfileId" TEXT,
  "authorName" TEXT NOT NULL,
  "authorPhotoUrl" TEXT,
  "body" TEXT NOT NULL,
  "status" "ChatMessageStatus" NOT NULL DEFAULT 'VISIBLE',
  "clientNonce" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatMute" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "mutedByUserId" TEXT,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChatBotInvocation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "roomId" TEXT NOT NULL,
  "botProfileId" TEXT,
  "trigger" "ChatBotTrigger" NOT NULL,
  "status" "ChatBotInvocationStatus" NOT NULL DEFAULT 'PENDING',
  "inputMessageId" TEXT,
  "outputMessageId" TEXT,
  "model" TEXT NOT NULL,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatBotInvocation_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatRoom_key_key') THEN
    ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_key_key" UNIQUE ("key");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_roomId_fkey') THEN
    ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatMessage_botProfileId_fkey') THEN
    ALTER TABLE "ChatMessage"
    ADD CONSTRAINT "ChatMessage_botProfileId_fkey"
    FOREIGN KEY ("botProfileId") REFERENCES "ChatBotProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatBotInvocation_roomId_fkey') THEN
    ALTER TABLE "ChatBotInvocation"
    ADD CONSTRAINT "ChatBotInvocation_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatBotInvocation_botProfileId_fkey') THEN
    ALTER TABLE "ChatBotInvocation"
    ADD CONSTRAINT "ChatBotInvocation_botProfileId_fkey"
    FOREIGN KEY ("botProfileId") REFERENCES "ChatBotProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_user_nonce_key" ON "ChatMessage"("authorUserId", "clientNonce");
CREATE INDEX IF NOT EXISTS "idx_chat_msg_room_created_desc" ON "ChatMessage"("roomId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_msg_room_status_created_desc" ON "ChatMessage"("roomId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_msg_author_created_desc" ON "ChatMessage"("authorUserId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_msg_bot_created_desc" ON "ChatMessage"("botProfileId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_msg_deleted_at" ON "ChatMessage"("deletedAt");
CREATE INDEX IF NOT EXISTS "idx_chat_msg_visible_recent" ON "ChatMessage"("roomId", "createdAt" DESC, "id" DESC) WHERE "status" = 'VISIBLE';
CREATE INDEX IF NOT EXISTS "idx_chat_bot_enabled_updated" ON "ChatBotProfile"("isEnabled", "updatedAt");
CREATE INDEX IF NOT EXISTS "idx_chat_bot_last_message_at" ON "ChatBotProfile"("lastMessageAt");
CREATE INDEX IF NOT EXISTS "idx_chat_mute_user_expires" ON "ChatMute"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "idx_chat_mute_created_desc" ON "ChatMute"("createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_bot_invocation_status_created" ON "ChatBotInvocation"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_chat_bot_invocation_room_created" ON "ChatBotInvocation"("roomId", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "idx_chat_bot_invocation_bot_created" ON "ChatBotInvocation"("botProfileId", "createdAt" DESC, "id" DESC);

INSERT INTO "ChatRoom" ("key", "title", "updatedAt")
VALUES ('public', '公共聊天室', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "ChatRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatBotProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatBotInvocation" ENABLE ROW LEVEL SECURITY;
