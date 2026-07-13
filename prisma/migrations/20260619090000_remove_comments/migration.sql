-- Remove the comments feature from the data model.
DROP TABLE IF EXISTS "CommentLike" CASCADE;
DROP TABLE IF EXISTS "Comment" CASCADE;

DROP INDEX IF EXISTS "idx_post_visible_like_comment_created_desc";
DROP INDEX IF EXISTS "idx_post_visible_comment_like_created";
DROP INDEX IF EXISTS "idx_post_visible_comment_like_bumped_desc";

ALTER TABLE "Post" DROP COLUMN IF EXISTS "commentCount";
ALTER TABLE "PostEngagementAggregate" DROP COLUMN IF EXISTS "verifiedCommentCount";
