CREATE TABLE IF NOT EXISTS "HoldoutValidationArtifact" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "artifactHash" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HoldoutValidationArtifact_run_fk"
    FOREIGN KEY ("runId") REFERENCES "HoldoutValidationRun"("id") ON DELETE CASCADE,
  CONSTRAINT "HoldoutValidationArtifact_kind_check" CHECK (
    "kind" IN (
      'review_bundle',
      'private_seal',
      'reviewer_a',
      'reviewer_b',
      'adjudicator',
      'ground_truth',
      'evaluation'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "HoldoutValidationArtifact_run_kind_idx"
  ON "HoldoutValidationArtifact" ("runId", "kind");

CREATE INDEX IF NOT EXISTS "HoldoutValidationArtifact_run_created_idx"
  ON "HoldoutValidationArtifact" ("runId", "createdAt" DESC);

ALTER TABLE "HoldoutValidationArtifact" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "HoldoutValidationArtifact" FROM anon;
REVOKE ALL ON TABLE "HoldoutValidationArtifact" FROM authenticated;
