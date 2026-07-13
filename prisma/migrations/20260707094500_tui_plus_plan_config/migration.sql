-- Tui Plus plan configuration defaults.
-- These defaults are intentionally stored in SystemConfig so pricing, duration and limits are data-driven.

INSERT INTO "SystemConfig" ("key", "value", "updatedAt")
VALUES
  ('tui_plus_trial_days', '7', now()),
  ('tui_plus_monthly_duration_days', '30', now()),
  ('tui_plus_yearly_duration_days', '365', now()),
  ('tui_plus_monthly_price_points', '1900', now()),
  ('tui_plus_yearly_price_points', '19900', now()),
  ('tui_plus_trial_channel_limit', '1', now()),
  ('tui_plus_monthly_channel_limit', '3', now()),
  ('tui_plus_yearly_channel_limit', '5', now()),
  ('tui_plus_trial_website_limit', '1', now()),
  ('tui_plus_monthly_website_limit', '3', now()),
  ('tui_plus_yearly_website_limit', '5', now()),
  ('tui_plus_trial_contact_limit', '1', now()),
  ('tui_plus_monthly_contact_limit', '3', now()),
  ('tui_plus_yearly_contact_limit', '5', now()),
  ('tui_plus_ranking_boost_percent', '20', now())
ON CONFLICT ("key") DO NOTHING;
