CREATE TABLE IF NOT EXISTS "ProviderUsageLog" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "chain" TEXT,
  "method" TEXT NOT NULL,
  "analysisId" TEXT,
  "userId" TEXT,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 1,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'success',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProviderUsageLog_provider_createdAt_idx"
  ON "ProviderUsageLog" ("provider", "createdAt");

CREATE INDEX IF NOT EXISTS "ProviderUsageLog_analysisId_idx"
  ON "ProviderUsageLog" ("analysisId");

CREATE INDEX IF NOT EXISTS "ProviderUsageLog_userId_createdAt_idx"
  ON "ProviderUsageLog" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "ProviderUsageLog_status_createdAt_idx"
  ON "ProviderUsageLog" ("status", "createdAt");
