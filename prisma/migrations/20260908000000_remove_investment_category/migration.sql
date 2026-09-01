WITH investment_categories AS (
  SELECT id
  FROM "Category"
  WHERE slug IN ('investment', 'invest')
     OR name IN ('招商', '推广招商', '商务合作')
)
UPDATE "Post"
SET "categoryId" = NULL
WHERE "categoryId" IN (SELECT id FROM investment_categories);

WITH investment_categories AS (
  SELECT id
  FROM "Category"
  WHERE slug IN ('investment', 'invest')
     OR name IN ('招商', '推广招商', '商务合作')
)
UPDATE "UserRecommendationFeedback"
SET "categoryId" = NULL
WHERE "categoryId" IN (SELECT id FROM investment_categories);

WITH investment_categories AS (
  SELECT id
  FROM "Category"
  WHERE slug IN ('investment', 'invest')
     OR name IN ('招商', '推广招商', '商务合作')
)
UPDATE "PromotionBooking"
SET "categoryId" = NULL
WHERE "categoryId" IN (SELECT id FROM investment_categories);

WITH investment_categories AS (
  SELECT id
  FROM "Category"
  WHERE slug IN ('investment', 'invest')
     OR name IN ('招商', '推广招商', '商务合作')
)
UPDATE "PromotionCampaign"
SET "categoryId" = NULL
WHERE "categoryId" IN (SELECT id FROM investment_categories);

DELETE FROM "UserMutedCategory"
WHERE "categoryId" IN (
  SELECT id
  FROM "Category"
  WHERE slug IN ('investment', 'invest')
     OR name IN ('招商', '推广招商', '商务合作')
);

DELETE FROM "Category"
WHERE slug IN ('investment', 'invest')
   OR name IN ('招商', '推广招商', '商务合作');

UPDATE "SystemConfig"
SET value = COALESCE((
  SELECT jsonb_agg(item)
  FROM jsonb_array_elements(value::jsonb) AS item
  WHERE COALESCE(item->>'slug', '') NOT IN ('investment', 'invest')
    AND COALESCE(item->>'name', '') NOT IN ('招商', '推广招商', '商务合作')
), '[]'::jsonb)::text
WHERE key = 'publish_category_schema'
  AND value IS NOT NULL
  AND jsonb_typeof(value::jsonb) = 'array';

DELETE FROM "SystemConfig"
WHERE key IN ('price_pin_category_map_investment', 'price_pin_category_map_invest');
