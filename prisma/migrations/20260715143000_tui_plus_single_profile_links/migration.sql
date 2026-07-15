UPDATE "SystemConfig"
SET "value" = '1', "updatedAt" = now()
WHERE "key" IN (
  'tui_plus_trial_channel_limit',
  'tui_plus_monthly_channel_limit',
  'tui_plus_yearly_channel_limit',
  'tui_plus_trial_website_limit',
  'tui_plus_monthly_website_limit',
  'tui_plus_yearly_website_limit'
);
