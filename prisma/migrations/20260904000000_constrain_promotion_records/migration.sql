DO $$
DECLARE
  valid_promotion_types TEXT[] := ARRAY['AD_HOME', 'PIN_HOME', 'PIN_CATEGORY', 'PIN_CHAT'];
  post_promotion_types TEXT[] := ARRAY['PIN_HOME', 'PIN_CATEGORY'];
  banner_promotion_types TEXT[] := ARRAY['AD_HOME', 'PIN_CHAT'];
BEGIN
  IF to_regclass('public."PromotionCampaign"') IS NOT NULL THEN
    DELETE FROM "PromotionCampaign"
    WHERE "type" <> ALL(valid_promotion_types)
      OR "startsAt" >= "endsAt"
      OR "totalPrice" < 0
      OR (
        "type" = 'PIN_CATEGORY'
        AND (
          "categoryId" IS NULL
          OR "scopeKey" <> ('CATEGORY:' || "categoryId")
        )
      )
      OR (
        "type" <> 'PIN_CATEGORY'
        AND (
          "categoryId" IS NOT NULL
          OR "scopeKey" <> 'GLOBAL'
        )
      )
      OR (
        "type" = ANY(post_promotion_types)
        AND "postId" IS NULL
      )
      OR (
        "type" = ANY(banner_promotion_types)
        AND "postId" IS NOT NULL
      );
  END IF;

  IF to_regclass('public."PromotionBooking"') IS NOT NULL THEN
    DELETE FROM "PromotionBooking"
    WHERE "type" <> ALL(valid_promotion_types)
      OR "startsAt" >= "endsAt"
      OR "pricePaid" < 0
      OR (
        "type" = ANY(banner_promotion_types)
        AND "slotIndex" NOT IN (0, 1, 2)
      )
      OR (
        "type" = ANY(post_promotion_types)
        AND "slotIndex" <> 0
      )
      OR (
        "type" = 'PIN_CATEGORY'
        AND (
          "categoryId" IS NULL
          OR "scopeKey" <> ('CATEGORY:' || "categoryId")
        )
      )
      OR (
        "type" <> 'PIN_CATEGORY'
        AND (
          "categoryId" IS NOT NULL
          OR "scopeKey" <> 'GLOBAL'
        )
      )
      OR (
        "type" = ANY(post_promotion_types)
        AND "postId" IS NULL
      )
      OR (
        "type" = ANY(banner_promotion_types)
        AND "postId" IS NOT NULL
      );
  END IF;

  IF to_regclass('public."PromotionCampaign"') IS NOT NULL
    AND to_regclass('public."PromotionBooking"') IS NOT NULL THEN
    DELETE FROM "PromotionCampaign" campaign
    WHERE NOT EXISTS (
      SELECT 1
      FROM "PromotionBooking" booking
      WHERE booking."campaignId" = campaign."id"
    );
  END IF;

  IF to_regclass('public."PromotionBooking"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_type_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_type_check"
        CHECK ("type" IN ('AD_HOME', 'PIN_HOME', 'PIN_CATEGORY', 'PIN_CHAT'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_time_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_time_check"
        CHECK ("startsAt" < "endsAt");
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_price_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_price_check"
        CHECK ("pricePaid" >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_slot_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_slot_check"
        CHECK (
          ("type" IN ('AD_HOME', 'PIN_CHAT') AND "slotIndex" IN (0, 1, 2))
          OR ("type" IN ('PIN_HOME', 'PIN_CATEGORY') AND "slotIndex" = 0)
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_scope_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_scope_check"
        CHECK (
          (
            "type" = 'PIN_CATEGORY'
            AND "categoryId" IS NOT NULL
            AND "scopeKey" = ('CATEGORY:' || "categoryId")
          )
          OR (
            "type" <> 'PIN_CATEGORY'
            AND "categoryId" IS NULL
            AND "scopeKey" = 'GLOBAL'
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionBooking_target_check'
        AND conrelid = to_regclass('public."PromotionBooking"')
    ) THEN
      ALTER TABLE "PromotionBooking"
        ADD CONSTRAINT "PromotionBooking_target_check"
        CHECK (
          ("type" IN ('PIN_HOME', 'PIN_CATEGORY') AND "postId" IS NOT NULL)
          OR ("type" IN ('AD_HOME', 'PIN_CHAT') AND "postId" IS NULL)
        );
    END IF;
  END IF;

  IF to_regclass('public."PromotionCampaign"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionCampaign_type_check'
        AND conrelid = to_regclass('public."PromotionCampaign"')
    ) THEN
      ALTER TABLE "PromotionCampaign"
        ADD CONSTRAINT "PromotionCampaign_type_check"
        CHECK ("type" IN ('AD_HOME', 'PIN_HOME', 'PIN_CATEGORY', 'PIN_CHAT'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionCampaign_time_check'
        AND conrelid = to_regclass('public."PromotionCampaign"')
    ) THEN
      ALTER TABLE "PromotionCampaign"
        ADD CONSTRAINT "PromotionCampaign_time_check"
        CHECK ("startsAt" < "endsAt");
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionCampaign_price_check'
        AND conrelid = to_regclass('public."PromotionCampaign"')
    ) THEN
      ALTER TABLE "PromotionCampaign"
        ADD CONSTRAINT "PromotionCampaign_price_check"
        CHECK ("totalPrice" >= 0);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionCampaign_scope_check'
        AND conrelid = to_regclass('public."PromotionCampaign"')
    ) THEN
      ALTER TABLE "PromotionCampaign"
        ADD CONSTRAINT "PromotionCampaign_scope_check"
        CHECK (
          (
            "type" = 'PIN_CATEGORY'
            AND "categoryId" IS NOT NULL
            AND "scopeKey" = ('CATEGORY:' || "categoryId")
          )
          OR (
            "type" <> 'PIN_CATEGORY'
            AND "categoryId" IS NULL
            AND "scopeKey" = 'GLOBAL'
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'PromotionCampaign_target_check'
        AND conrelid = to_regclass('public."PromotionCampaign"')
    ) THEN
      ALTER TABLE "PromotionCampaign"
        ADD CONSTRAINT "PromotionCampaign_target_check"
        CHECK (
          ("type" IN ('PIN_HOME', 'PIN_CATEGORY') AND "postId" IS NOT NULL)
          OR ("type" IN ('AD_HOME', 'PIN_CHAT') AND "postId" IS NULL)
        );
    END IF;
  END IF;
END $$;
