-- Automation heartbeat table for quote/comment/chat supervisors.
-- This table is internal observability only: every scheduler tick and protected manual debug run writes here.

CREATE TABLE IF NOT EXISTS "AutomationHeartbeat" (
  "id" TEXT PRIMARY KEY,
  "module" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "enabled" BOOLEAN,
  "reason" TEXT,
  "runId" TEXT,
  "details" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_automation_heartbeat_module_created"
  ON "AutomationHeartbeat" ("module", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_automation_heartbeat_status_created"
  ON "AutomationHeartbeat" ("status", "createdAt" DESC, "id" DESC);

ALTER TABLE "AutomationHeartbeat" ENABLE ROW LEVEL SECURITY;
