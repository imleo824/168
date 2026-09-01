-- ============================================================================
-- Authoritative trusted engagement + effective recommendation score sync
-- -----------------------------------------------------------------------------
-- Rules:
-- - Candidate pools do not remove ROBOT-authored posts.
-- - Ranking uses only NORMAL-user engagement.
-- - PostRankingScore.recommendationScore is the final effective score and already
--   includes the author userType multiplier: NORMAL 1.12, OFFICIAL 1.05, ROBOT 0.8.
-- - Post.source is never used for content quality or ranking.
-- ============================================================================

UPDATE "PostView" pv
SET "viewerUserId" = SUBSTRING(pv."viewerKey" FROM 3)
WHERE pv."viewerUserId" IS NULL
  AND pv."viewerKey" LIKE 'u:%'
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = SUBSTRING(pv."viewerKey" FROM 3));

WITH target_posts AS (
  SELECT p."id"
  FROM "Post" p
  WHERE p."deletedAt" IS NULL
),
normal_likes AS (
  SELECT l."postId", COUNT(*)::int AS "count"
  FROM "Like" l
  JOIN "User" u ON u."id" = l."userId" AND u."userType" = 'NORMAL'
  WHERE l."postId" IN (SELECT "id" FROM target_posts)
  GROUP BY l."postId"
),
normal_comments AS (
  SELECT c."postId", COUNT(*)::int AS "count"
  FROM "PostComment" c
  JOIN "User" u ON u."id" = c."userId" AND u."userType" = 'NORMAL'
  WHERE c."postId" IN (SELECT "id" FROM target_posts)
    AND c."status" = 'VISIBLE'
    AND c."deletedAt" IS NULL
  GROUP BY c."postId"
),
normal_views AS (
  SELECT
    v."postId",
    COUNT(*)::int AS "count",
    COALESCE(SUM(v."dwellMs"), 0)::int AS "dwellMs",
    COUNT(*) FILTER (WHERE v."quickSkip" = true)::int AS "quickSkipCount"
  FROM "PostView" v
  JOIN "User" u ON u."id" = v."viewerUserId" AND u."userType" = 'NORMAL'
  WHERE v."postId" IN (SELECT "id" FROM target_posts)
  GROUP BY v."postId"
),
normal_shares AS (
  SELECT s."postId", COUNT(*)::int AS "count"
  FROM "PostShare" s
  JOIN "User" u ON u."id" = s."userId" AND u."userType" = 'NORMAL'
  WHERE s."postId" IN (SELECT "id" FROM target_posts)
  GROUP BY s."postId"
),
normal_quotes AS (
  SELECT qp."quotedPostId" AS "postId", COUNT(*)::int AS "count"
  FROM "Post" qp
  JOIN "User" u ON u."id" = qp."userId" AND u."userType" = 'NORMAL'
  WHERE qp."quotedPostId" IN (SELECT "id" FROM target_posts)
    AND qp."isPublished" = true
    AND qp."deletedAt" IS NULL
  GROUP BY qp."quotedPostId"
)
INSERT INTO "PostEngagementAggregate" (
  "postId",
  "verifiedLikeCount",
  "verifiedViewCount",
  "verifiedShareCount",
  "dwellMs",
  "quickSkipCount",
  "normalLikeCount",
  "normalViewCount",
  "normalShareCount",
  "normalCommentCount",
  "normalQuoteCount",
  "normalDwellMs",
  "normalQuickSkipCount",
  "updatedAt"
)
SELECT
  tp."id",
  COALESCE(l."count", 0),
  COALESCE(v."count", 0),
  COALESCE(s."count", 0),
  COALESCE(v."dwellMs", 0),
  COALESCE(v."quickSkipCount", 0),
  COALESCE(l."count", 0),
  COALESCE(v."count", 0),
  COALESCE(s."count", 0),
  COALESCE(c."count", 0),
  COALESCE(q."count", 0),
  COALESCE(v."dwellMs", 0),
  COALESCE(v."quickSkipCount", 0),
  NOW()
FROM target_posts tp
LEFT JOIN normal_likes l ON l."postId" = tp."id"
LEFT JOIN normal_comments c ON c."postId" = tp."id"
LEFT JOIN normal_views v ON v."postId" = tp."id"
LEFT JOIN normal_shares s ON s."postId" = tp."id"
LEFT JOIN normal_quotes q ON q."postId" = tp."id"
ON CONFLICT ("postId") DO UPDATE SET
  "verifiedLikeCount" = EXCLUDED."verifiedLikeCount",
  "verifiedViewCount" = EXCLUDED."verifiedViewCount",
  "verifiedShareCount" = EXCLUDED."verifiedShareCount",
  "dwellMs" = EXCLUDED."dwellMs",
  "quickSkipCount" = EXCLUDED."quickSkipCount",
  "normalLikeCount" = EXCLUDED."normalLikeCount",
  "normalViewCount" = EXCLUDED."normalViewCount",
  "normalShareCount" = EXCLUDED."normalShareCount",
  "normalCommentCount" = EXCLUDED."normalCommentCount",
  "normalQuoteCount" = EXCLUDED."normalQuoteCount",
  "normalDwellMs" = EXCLUDED."normalDwellMs",
  "normalQuickSkipCount" = EXCLUDED."normalQuickSkipCount",
  "updatedAt" = NOW();

WITH score_source AS (
  SELECT
    p."id" AS "postId",
    p."userId",
    p."contact",
    p."showContact",
    p."isAnonymous",
    p."images",
    p."title",
    p."content",
    p."location",
    p."countryCode",
    p."countryName",
    p."createdAt",
    p."bumpedAt",
    u."userType",
    COALESCE(a."normalViewCount", 0)::double precision AS "trustedViews",
    COALESCE(a."normalLikeCount", 0)::double precision AS "trustedLikes",
    COALESCE(a."normalCommentCount", 0)::double precision AS "trustedComments",
    COALESCE(a."normalQuoteCount", 0)::double precision AS "trustedQuotes",
    COALESCE(a."normalShareCount", 0)::double precision AS "trustedShares",
    COALESCE(a."normalDwellMs", 0)::double precision AS "normalDwellMs",
    COALESCE(a."normalQuickSkipCount", 0)::double precision AS "normalQuickSkipCount"
  FROM "Post" p
  JOIN "User" u ON u."id" = p."userId"
  LEFT JOIN "PostEngagementAggregate" a ON a."postId" = p."id"
  WHERE p."deletedAt" IS NULL AND p."isPublished" = true
),
score_features AS (
  SELECT
    *,
    COALESCE(CARDINALITY("images"), 0) AS "imageCount",
    GREATEST(0, LENGTH(REPLACE(COALESCE("title", '') || COALESCE("content", ''), ' ', ''))) AS "textLength",
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE("bumpedAt", "createdAt"))) / 3600) AS "activityHours",
    GREATEST(0, EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600) AS "publishedHours",
    ("trustedLikes" + "trustedComments" * 1.35 + "trustedQuotes" * 2.15 + "trustedShares" * 3.05) AS "meaningfulActions",
    CASE WHEN "trustedViews" > 0 THEN LEAST(1, GREATEST(0, "normalQuickSkipCount" / GREATEST("trustedViews", 1))) ELSE 0 END AS "quickSkipRate",
    CASE WHEN "trustedViews" > 0 THEN GREATEST(0, "normalDwellMs") / GREATEST("trustedViews", 1) ELSE 0 END AS "avgDwellMs",
    CASE
      WHEN "userType" = 'NORMAL' THEN 1.12
      WHEN "userType" = 'OFFICIAL' THEN 1.05
      WHEN "userType" = 'ROBOT' THEN 0.8
      ELSE 1
    END AS "authorMultiplier"
  FROM score_source
),
score_values AS (
  SELECT
    *,
    LN(1 + (
      LN(1 + "trustedViews") * 0.45
      + "trustedLikes" * 1.05
      + "trustedComments" * 1.45
      + "trustedQuotes" * 2.55
      + "trustedShares" * 3.85
      + "imageCount" * 1.25
    )) AS "qualitySignal"
  FROM score_features
)
INSERT INTO "PostRankingScore" (
  "postId",
  "recommendationScore",
  "countryCode",
  "countryName",
  "updatedAt"
)
SELECT
  "postId",
  GREATEST(0, ROUND((
    (
      (
        "qualitySignal" * LEAST(1.70, 0.24 + "qualitySignal" * 0.62 + LEAST(0.42, LN(1 + "trustedViews" * 0.28 + "meaningfulActions" * 3.4) / 18))
        + LN(1 + "trustedLikes" * 0.85 + "trustedComments" * 1.10 + "trustedQuotes" * 2.2 + "trustedShares" * 3.5) * 0.78
        + CASE WHEN "meaningfulActions" = 0 AND "publishedHours" <= 6 THEN 0.38 ELSE 0 END
      )
      * (0.90 + LEAST(1.42, LN(1 + (("meaningfulActions" + 1.2) / ("trustedViews" + 22)) * 13) * 0.68))
      * CASE WHEN "publishedHours" <= 4 THEN 1.08 ELSE 1 END
      * (CASE WHEN LENGTH(COALESCE("location", '')) > 0 THEN 1.035 ELSE 0.985 END)
      * CASE WHEN "textLength" >= 120 THEN 1.16 WHEN "textLength" >= 45 THEN 1.07 WHEN "textLength" >= 18 THEN 0.99 WHEN "textLength" > 0 THEN 0.94 ELSE 0.90 END
      * CASE WHEN "imageCount" > 0 THEN 1 + LEAST(0.20, "imageCount" * 0.035) ELSE 0.92 END
      * CASE WHEN "showContact" = true AND LENGTH(COALESCE("contact", '')) > 0 THEN 1.06 ELSE 1 END
      * CASE WHEN "isAnonymous" = true THEN 1.03 ELSE 1 END
      * (0.92 + LEAST(0.30, LN(1 + "avgDwellMs" / 1600) * 0.095))
      * CASE WHEN "quickSkipRate" >= 0.42 THEN 0.66 WHEN "quickSkipRate" >= 0.24 THEN 0.80 WHEN "quickSkipRate" >= 0.12 THEN 0.91 ELSE 1 END
      / (1 + ("activityHours" / 18) * LN(2))
      / (1 + POWER(GREATEST(0, "publishedHours" - 168), 0.38) / 20)
    ) * "authorMultiplier"
  )::numeric, 6)::double precision) AS "recommendationScore",
  "countryCode",
  "countryName",
  NOW()
FROM score_values
ON CONFLICT ("postId") DO UPDATE SET
  "recommendationScore" = EXCLUDED."recommendationScore",
  "countryCode" = EXCLUDED."countryCode",
  "countryName" = EXCLUDED."countryName",
  "updatedAt" = EXCLUDED."updatedAt";
