CREATE INDEX IF NOT EXISTS "idx_post_author_visible_bumped_desc"
  ON "Post" ("userId", "isPublished", "deletedAt", "bumpedAt" DESC, "createdAt" DESC, "id" DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Post'
      AND column_name = 'commentCount'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "idx_post_visible_like_comment_created_desc"
      ON "Post" ("isPublished", "deletedAt", "likeCount" DESC, "commentCount" DESC, "createdAt" DESC, "id" DESC)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_post_visible_view_created"
  ON "Post" ("isPublished", "deletedAt", "viewCount", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_post_visible_view_bumped_desc"
  ON "Post" ("isPublished", "deletedAt", "viewCount" DESC, "bumpedAt" DESC, "id" DESC);
