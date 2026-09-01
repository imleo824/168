-- Formalize schema gaps discovered after baselining the existing production database.
-- These definitions match prisma/schema.prisma and keep schema changes inside migrations.

ALTER TYPE "PointAction" ADD VALUE IF NOT EXISTS 'PIN_CHAT';

CREATE TABLE IF NOT EXISTS "UserJoinedTopic" (
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "topicType" TEXT NOT NULL DEFAULT 'topic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserJoinedTopic_pkey" PRIMARY KEY ("userId", "topicId")
);

ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "topicId" TEXT;
ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "topicName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "topicType" TEXT NOT NULL DEFAULT 'topic';
ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "UserJoinedTopic" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserJoinedTopic_userId_fkey'
  ) THEN
    ALTER TABLE "UserJoinedTopic"
      ADD CONSTRAINT "UserJoinedTopic_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_user_joined_topic_user_created_desc"
    ON "UserJoinedTopic"("userId", "createdAt" DESC, "topicId" DESC);

CREATE INDEX IF NOT EXISTS "idx_user_joined_topic_topic_created_desc"
    ON "UserJoinedTopic"("topicId", "createdAt" DESC, "userId" DESC);

ALTER TABLE "DepositAddress" ADD COLUMN IF NOT EXISTS "chain" TEXT NOT NULL DEFAULT 'TRON';
ALTER TABLE "DepositAddress" ADD COLUMN IF NOT EXISTS "token" TEXT NOT NULL DEFAULT 'USDT';
ALTER TABLE "DepositAddress" ADD COLUMN IF NOT EXISTS "network" TEXT NOT NULL DEFAULT 'TRC20';

CREATE INDEX IF NOT EXISTS "idx_deposit_address_asset_status"
    ON "DepositAddress"("chain", "token", "network", "status");

ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "referenceType" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "referenceId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "idx_point_tx_reference_action"
    ON "PointTransaction"("referenceId", "action");
