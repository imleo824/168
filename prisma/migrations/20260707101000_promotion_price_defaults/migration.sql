-- Promotion price defaults.
-- ConfigService reads these from SystemConfig using price_* keys and keeps code defaults only as offline fallback.

INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
VALUES
  ('price_ad_home_slot_1', '1000', now()),
  ('price_ad_home_slot_2', '800', now()),
  ('price_ad_home_slot_3', '600', now()),
  ('price_pin_home', '200', now()),
  ('price_pin_chat', '600', now()),
  ('price_pin_chat_slot_1', '600', now()),
  ('price_pin_chat_slot_2', '500', now()),
  ('price_pin_chat_slot_3', '400', now())
ON CONFLICT ("key") DO NOTHING;
