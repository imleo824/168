-- Posting is no longer a paid action. Remove legacy anonymous-publish price config if it exists.
DELETE FROM "SystemConfig" WHERE "key" = 'price_anonymous_publish';
