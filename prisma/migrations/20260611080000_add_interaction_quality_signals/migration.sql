ALTER TABLE "PostView" ADD COLUMN IF NOT EXISTS "dwellMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostView" ADD COLUMN IF NOT EXISTS "quickSkip" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PostShare" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "actorKey" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostShare_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PostShare_postId_fkey'
  ) THEN
    ALTER TABLE "PostShare"
    ADD CONSTRAINT "PostShare_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PostShare_postId_actorKey_key" ON "PostShare"("postId", "actorKey");
CREATE INDEX IF NOT EXISTS "PostShare_postId_createdAt_idx" ON "PostShare"("postId", "createdAt");
CREATE INDEX IF NOT EXISTS "PostShare_actorKey_createdAt_idx" ON "PostShare"("actorKey", "createdAt");
CREATE INDEX IF NOT EXISTS "PostShare_userId_createdAt_idx" ON "PostShare"("userId", "createdAt");
