DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TelegramSyncStatus') THEN
    CREATE TYPE "TelegramSyncStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');
  END IF;
END $$;

ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "telegramSyncStatus" "TelegramSyncStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "telegramSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "telegramSyncRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "telegramSyncLastError" TEXT;

UPDATE "Post"
SET
  "telegramSyncStatus" = 'SENT',
  "telegramSyncedAt" = COALESCE("telegramSyncedAt", "updatedAt"),
  "telegramSyncRequestedAt" = COALESCE("telegramSyncRequestedAt", "updatedAt"),
  "telegramSyncLastError" = NULL
WHERE "syncToTelegram" = true
  AND "telegramSyncStatus" <> 'SENT';

CREATE INDEX IF NOT EXISTS "Post_userId_telegramSyncStatus_idx"
  ON "Post"("userId", "telegramSyncStatus");
