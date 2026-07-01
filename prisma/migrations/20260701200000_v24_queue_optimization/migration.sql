-- V2.4 Large-scale queue optimization indexes

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'AnalysisBatch'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AnalysisBatch_status_createdAt_idx" ON "AnalysisBatch" ("status", "createdAt")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AnalysisBatch_analysisId_status_idx" ON "AnalysisBatch" ("analysisId", "status")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AnalysisBatch_processing_startedAt_idx" ON "AnalysisBatch" ("startedAt") WHERE "status" = ''processing''';
    EXECUTE 'CREATE INDEX IF NOT EXISTS "AnalysisBatch_pending_order_idx" ON "AnalysisBatch" ("createdAt", "batchIndex") WHERE "status" = ''pending''';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WebhookDelivery_status_attempt_createdAt_idx"
ON "WebhookDelivery" ("status", "attemptCount", "createdAt");
