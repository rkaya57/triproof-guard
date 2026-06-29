CREATE TABLE IF NOT EXISTS "AnalysisBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "batchIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "walletData" JSONB NOT NULL,
  "enrichmentResults" JSONB,
  "enrichmentSummary" JSONB,
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AnalysisBatch_analysisId_idx" ON "AnalysisBatch"("analysisId");
CREATE INDEX IF NOT EXISTS "AnalysisBatch_status_idx" ON "AnalysisBatch"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "AnalysisBatch_analysisId_batchIndex_key" ON "AnalysisBatch"("analysisId", "batchIndex");
