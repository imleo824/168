ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "clientNonce" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_post_user_client_nonce_unique"
  ON "Post" ("userId", "clientNonce")
  WHERE "clientNonce" IS NOT NULL;
