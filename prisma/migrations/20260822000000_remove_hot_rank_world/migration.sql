DROP INDEX IF EXISTS "idx_post_ranking_score_hot";
DROP INDEX IF EXISTS "idx_post_ranking_country_hot";

ALTER TABLE "PostRankingScore" DROP COLUMN IF EXISTS "hotScore";

DELETE FROM "SystemConfig"
WHERE "key" = 'hot_country_tabs';
