ALTER TABLE "PromotionBooking" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "PromotionCampaign" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL';

ALTER TABLE "PromotionBooking" ALTER COLUMN "scopeKey" SET DEFAULT 'GLOBAL';
ALTER TABLE "PromotionBooking" ALTER COLUMN "scopeKey" SET NOT NULL;
ALTER TABLE "PromotionCampaign" ALTER COLUMN "scopeKey" SET DEFAULT 'GLOBAL';
ALTER TABLE "PromotionCampaign" ALTER COLUMN "scopeKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PromotionBooking_type_targetDate_slotIndex_scopeKey_key"
  ON "PromotionBooking" ("type", "targetDate", "slotIndex", "scopeKey");

CREATE INDEX IF NOT EXISTS "idx_promotion_campaign_active"
  ON "PromotionCampaign" ("type", "scopeKey", "startsAt", "endsAt");
