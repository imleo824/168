CREATE TABLE IF NOT EXISTS "AutoPostContent" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "answer" TEXT,
  "author" TEXT,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "license" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "usedAt" TIMESTAMP(3),
  "postId" TEXT,
  "qualityScore" INTEGER NOT NULL DEFAULT 80,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutoPostContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutoPostRun" (
  "id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "contentId" TEXT,
  "topic" TEXT,
  "postId" TEXT,
  "authorUserId" TEXT,
  "categoryId" TEXT,
  "publishedContent" TEXT,
  "skipReason" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutoPostRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AutoPostContent_contentHash_key"
  ON "AutoPostContent" ("contentHash");

CREATE INDEX IF NOT EXISTS "idx_auto_post_content_pick"
  ON "AutoPostContent" ("topic", "isActive", "usedAt", "qualityScore", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_content_used"
  ON "AutoPostContent" ("usedAt", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_content_list"
  ON "AutoPostContent" ("isActive", "topic", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_content_post"
  ON "AutoPostContent" ("postId");

CREATE INDEX IF NOT EXISTS "idx_auto_post_run_status_created"
  ON "AutoPostRun" ("status", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_run_content_created"
  ON "AutoPostRun" ("contentId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_run_post"
  ON "AutoPostRun" ("postId");

CREATE INDEX IF NOT EXISTS "idx_auto_post_run_author_created"
  ON "AutoPostRun" ("authorUserId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_auto_post_run_created"
  ON "AutoPostRun" ("createdAt" DESC, "id" DESC);
