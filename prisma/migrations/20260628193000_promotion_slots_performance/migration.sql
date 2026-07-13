CREATE INDEX IF NOT EXISTS "idx_promotion_booking_slot_lookup"
  ON "PromotionBooking" ("type", "scopeKey", "targetDate", "slotIndex");

CREATE INDEX IF NOT EXISTS "idx_promotion_booking_user_slot_lookup"
  ON "PromotionBooking" ("type", "scopeKey", "targetDate", "userId", "slotIndex");

CREATE INDEX IF NOT EXISTS "idx_promotion_booking_campaign_lookup"
  ON "PromotionBooking" ("campaignId", "targetDate" DESC, "createdAt" DESC);
