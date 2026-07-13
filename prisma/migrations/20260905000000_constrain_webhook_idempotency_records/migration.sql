DO $$
DECLARE
  valid_webhook_endpoints TEXT[] := ARRAY['/api/webhooks/posts', '/api/webhooks/likes'];
  valid_webhook_error_codes TEXT[] := ARRAY[
    'WEBHOOK_MISCONFIGURED',
    'UNAUTHORIZED_WEBHOOK',
    'INVALID_WEBHOOK_PAYLOAD',
    'MISSING_IDEMPOTENCY_KEY',
    'IDEMPOTENCY_KEY_CONFLICT',
    'IDEMPOTENCY_IN_PROGRESS',
    'IDEMPOTENCY_IN_PROGRESS_EXPIRED',
    'WEBHOOK_USER_NOT_FOUND',
    'WEBHOOK_USER_DISABLED',
    'WEBHOOK_CATEGORY_NOT_FOUND',
    'WEBHOOK_POST_NOT_FOUND',
    'WEBHOOK_INTERNAL_ERROR'
  ];
BEGIN
  IF to_regclass('public."WebhookPostOperation"') IS NOT NULL THEN
    DELETE FROM "WebhookPostOperation"
    WHERE "endpoint" <> ALL(valid_webhook_endpoints)
      OR char_length("idempotencyKey") < 1
      OR char_length("idempotencyKey") > 128
      OR btrim("postId") = ''
      OR btrim("userId") = '';
  END IF;

  IF to_regclass('public."WebhookRequest"') IS NOT NULL THEN
    DELETE FROM "WebhookRequest"
    WHERE "endpoint" <> ALL(valid_webhook_endpoints)
      OR char_length("idempotencyKey") < 1
      OR char_length("idempotencyKey") > 128
      OR "requestHash" !~ '^[0-9a-f]{64}$'
      OR ("responseStatus" IS NOT NULL AND ("responseStatus" < 100 OR "responseStatus" > 599))
      OR ("errorCode" IS NOT NULL AND "errorCode" <> ALL(valid_webhook_error_codes));
  END IF;

  IF to_regclass('public."WebhookRequest"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookRequest_endpoint_check'
        AND conrelid = to_regclass('public."WebhookRequest"')
    ) THEN
      ALTER TABLE "WebhookRequest"
        ADD CONSTRAINT "WebhookRequest_endpoint_check"
        CHECK ("endpoint" IN ('/api/webhooks/posts', '/api/webhooks/likes'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookRequest_idempotency_key_check'
        AND conrelid = to_regclass('public."WebhookRequest"')
    ) THEN
      ALTER TABLE "WebhookRequest"
        ADD CONSTRAINT "WebhookRequest_idempotency_key_check"
        CHECK (char_length("idempotencyKey") BETWEEN 1 AND 128);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookRequest_request_hash_check'
        AND conrelid = to_regclass('public."WebhookRequest"')
    ) THEN
      ALTER TABLE "WebhookRequest"
        ADD CONSTRAINT "WebhookRequest_request_hash_check"
        CHECK ("requestHash" ~ '^[0-9a-f]{64}$');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookRequest_response_status_check'
        AND conrelid = to_regclass('public."WebhookRequest"')
    ) THEN
      ALTER TABLE "WebhookRequest"
        ADD CONSTRAINT "WebhookRequest_response_status_check"
        CHECK ("responseStatus" IS NULL OR "responseStatus" BETWEEN 100 AND 599);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookRequest_error_code_check'
        AND conrelid = to_regclass('public."WebhookRequest"')
    ) THEN
      ALTER TABLE "WebhookRequest"
        ADD CONSTRAINT "WebhookRequest_error_code_check"
        CHECK (
          "errorCode" IS NULL
          OR "errorCode" IN (
            'WEBHOOK_MISCONFIGURED',
            'UNAUTHORIZED_WEBHOOK',
            'INVALID_WEBHOOK_PAYLOAD',
            'MISSING_IDEMPOTENCY_KEY',
            'IDEMPOTENCY_KEY_CONFLICT',
            'IDEMPOTENCY_IN_PROGRESS',
            'IDEMPOTENCY_IN_PROGRESS_EXPIRED',
            'WEBHOOK_USER_NOT_FOUND',
            'WEBHOOK_USER_DISABLED',
            'WEBHOOK_CATEGORY_NOT_FOUND',
            'WEBHOOK_POST_NOT_FOUND',
            'WEBHOOK_INTERNAL_ERROR'
          )
        );
    END IF;
  END IF;

  IF to_regclass('public."WebhookPostOperation"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookPostOperation_endpoint_check'
        AND conrelid = to_regclass('public."WebhookPostOperation"')
    ) THEN
      ALTER TABLE "WebhookPostOperation"
        ADD CONSTRAINT "WebhookPostOperation_endpoint_check"
        CHECK ("endpoint" IN ('/api/webhooks/posts', '/api/webhooks/likes'));
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookPostOperation_idempotency_key_check'
        AND conrelid = to_regclass('public."WebhookPostOperation"')
    ) THEN
      ALTER TABLE "WebhookPostOperation"
        ADD CONSTRAINT "WebhookPostOperation_idempotency_key_check"
        CHECK (char_length("idempotencyKey") BETWEEN 1 AND 128);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'WebhookPostOperation_post_user_check'
        AND conrelid = to_regclass('public."WebhookPostOperation"')
    ) THEN
      ALTER TABLE "WebhookPostOperation"
        ADD CONSTRAINT "WebhookPostOperation_post_user_check"
        CHECK (btrim("postId") <> '' AND btrim("userId") <> '');
    END IF;
  END IF;
END $$;
