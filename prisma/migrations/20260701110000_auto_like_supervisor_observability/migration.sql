-- Formalize auto-like run history and shared automation task locks.
-- The services keep defensive CREATE TABLE guards for resilient boot, but
-- production schema ownership lives in Prisma migrations.

CREATE TABLE IF NOT EXISTS "AutoLikeRun" (
  "id" TEXT PRIMARY KEY,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "postId" TEXT,
  "robotUserId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_auto_like_run_created"
  ON "AutoLikeRun" ("createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_like_run_status_created"
  ON "AutoLikeRun" ("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_like_run_post_created"
  ON "AutoLikeRun" ("postId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_like_run_robot_created"
  ON "AutoLikeRun" ("robotUserId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AutomationTaskLock" (
  "name" TEXT PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB
);

CREATE INDEX IF NOT EXISTS "idx_automation_task_lock_expires_at"
  ON "AutomationTaskLock" ("expiresAt");
