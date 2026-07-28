-- Persisted, server-only AI decision briefs. The generated text is always derived
-- from aggregate risk evidence and is never exposed directly through Supabase.
CREATE TABLE "AnalysisAiBrief" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "executiveSummary" TEXT NOT NULL,
    "decisionRationale" TEXT NOT NULL,
    "riskDrivers" JSONB NOT NULL,
    "recommendedActions" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisAiBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalysisAiBrief_analysisId_key" ON "AnalysisAiBrief"("analysisId");
CREATE INDEX "AnalysisAiBrief_analysisId_idx" ON "AnalysisAiBrief"("analysisId");
CREATE INDEX "AnalysisAiBrief_updatedAt_idx" ON "AnalysisAiBrief"("updatedAt");

ALTER TABLE "AnalysisAiBrief"
ADD CONSTRAINT "AnalysisAiBrief_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisAiBrief" ENABLE ROW LEVEL SECURITY;
