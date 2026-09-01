CREATE TABLE IF NOT EXISTS "AutomationBatchRun" (
  "id" TEXT NOT NULL,
  "activeKey" TEXT,
  "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "modules" JSONB NOT NULL,
  "results" JSONB,
  "currentModule" TEXT,
  "requestedById" TEXT,
  "totalModules" INTEGER NOT NULL DEFAULT 0,
  "completedModules" INTEGER NOT NULL DEFAULT 0,
  "succeededModules" INTEGER NOT NULL DEFAULT 0,
  "skippedModules" INTEGER NOT NULL DEFAULT 0,
  "failedModules" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationBatchRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutomationBatchRun_activeKey_key"
  ON "AutomationBatchRun" ("activeKey");

CREATE INDEX IF NOT EXISTS "idx_automation_batch_status_created"
  ON "AutomationBatchRun" ("status", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_automation_batch_created"
  ON "AutomationBatchRun" ("createdAt" DESC, "id" DESC);

-- Batch orchestration state is internal admin data and follows the same
-- migration-owned RLS contract as the other automation tables.
ALTER TABLE "AutomationBatchRun" ENABLE ROW LEVEL SECURITY;
