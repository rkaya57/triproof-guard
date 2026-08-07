-- Server-only, privacy-reduced provenance ledger for AI evidence analysis.
-- No anon/authenticated grants are provided; RLS is enabled as defense in depth.
CREATE TABLE "AiEvidenceAudit" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT,
    "eventHash" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "source" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evidenceSchemaVersion" TEXT NOT NULL,
    "assessmentSchemaVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "recommendation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvidenceAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvidenceAudit_context_check" CHECK ("context" IN ('production_analysis', 'internal_benchmark', 'holdout_validation')),
    CONSTRAINT "AiEvidenceAudit_subjectKind_check" CHECK ("subjectKind" IN ('wallet', 'cluster', 'system')),
    CONSTRAINT "AiEvidenceAudit_stage_check" CHECK ("stage" IN ('wallet_evidence', 'cluster_evidence', 'disagreement_gate', 'benchmark')),
    CONSTRAINT "AiEvidenceAudit_source_check" CHECK ("source" IN ('gemini', 'fallback', 'deterministic')),
    CONSTRAINT "AiEvidenceAudit_recommendation_check" CHECK ("recommendation" IN ('no_change', 'manual_review', 'collect_more_evidence', 'not_applicable')),
    CONSTRAINT "AiEvidenceAudit_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
    CONSTRAINT "AiEvidenceAudit_latency_check" CHECK ("latencyMs" IS NULL OR "latencyMs" >= 0)
);

CREATE UNIQUE INDEX "AiEvidenceAudit_eventHash_key" ON "AiEvidenceAudit"("eventHash");
CREATE INDEX "AiEvidenceAudit_analysisId_createdAt_idx" ON "AiEvidenceAudit"("analysisId", "createdAt");
CREATE INDEX "AiEvidenceAudit_context_stage_createdAt_idx" ON "AiEvidenceAudit"("context", "stage", "createdAt");
CREATE INDEX "AiEvidenceAudit_subjectRef_createdAt_idx" ON "AiEvidenceAudit"("subjectRef", "createdAt");

ALTER TABLE "AiEvidenceAudit"
ADD CONSTRAINT "AiEvidenceAudit_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiEvidenceAudit" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AiEvidenceAudit" FROM anon, authenticated;
