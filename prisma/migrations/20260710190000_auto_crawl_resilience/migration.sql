-- Auto-crawl retry and source-failure resilience.

CREATE INDEX IF NOT EXISTS "idx_auto_crawl_item_retry_due"
  ON public."AutoCrawlItem"("status", "retryCount", "updatedAt")
  WHERE "postId" IS NULL;

CREATE OR REPLACE FUNCTION public.apply_auto_crawl_item_retry_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'FAILED' AND NEW."postId" IS NULL THEN
    NEW."retryCount" := LEAST(COALESCE(OLD."retryCount", 0) + 1, 10);
    IF NEW."retryCount" < 3 THEN
      NEW."status" := 'RETRYABLE';
    END IF;
  ELSIF NEW."status" IN ('PUBLISHED', 'REJECTED', 'DUPLICATE') THEN
    NEW."retryCount" := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_crawl_item_retry_state ON public."AutoCrawlItem";
CREATE TRIGGER trg_auto_crawl_item_retry_state
BEFORE UPDATE OF "status" ON public."AutoCrawlItem"
FOR EACH ROW
EXECUTE FUNCTION public.apply_auto_crawl_item_retry_state();

CREATE OR REPLACE FUNCTION public.apply_auto_crawl_source_failure_backoff()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delay_minutes integer;
BEGIN
  IF NEW."sourceHealth" = 'ERROR'
     AND COALESCE(NEW."failCount", 0) > COALESCE(OLD."failCount", 0) THEN
    v_delay_minutes := CASE
      WHEN NEW."failCount" <= 1 THEN 10
      WHEN NEW."failCount" = 2 THEN 30
      WHEN NEW."failCount" = 3 THEN 120
      WHEN NEW."failCount" = 4 THEN 360
      ELSE 1440
    END;
    NEW."nextRunAt" := CURRENT_TIMESTAMP + make_interval(mins => v_delay_minutes);
    IF NEW."failCount" >= 5 THEN
      NEW."sourceHealth" := 'CIRCUIT_OPEN';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_crawl_source_failure_backoff ON public."AutoCrawlSource";
CREATE TRIGGER trg_auto_crawl_source_failure_backoff
BEFORE UPDATE OF "failCount", "sourceHealth" ON public."AutoCrawlSource"
FOR EACH ROW
EXECUTE FUNCTION public.apply_auto_crawl_source_failure_backoff();

UPDATE public."AutoCrawlRun"
SET "status" = 'FAILED',
    "finishedAt" = CURRENT_TIMESTAMP,
    "error" = GREATEST("error", 1),
    "errorMessage" = COALESCE(NULLIF("errorMessage", ''), 'process_interrupted')
WHERE "status" = 'RUNNING'
  AND "startedAt" < CURRENT_TIMESTAMP - INTERVAL '30 minutes';

UPDATE public."AutoCrawlItem"
SET "status" = 'RETRYABLE',
    "retryCount" = GREATEST("retryCount", 1),
    "errorMessage" = COALESCE(NULLIF("errorMessage", ''), 'processing_interrupted'),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'RAW'
  AND "postId" IS NULL
  AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '30 minutes';

UPDATE public."AutoCrawlItem"
SET "status" = 'RETRYABLE',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'FAILED'
  AND "postId" IS NULL
  AND "retryCount" < 3;
