CREATE TABLE IF NOT EXISTS "HoldoutValidationRun" (
  "id" TEXT PRIMARY KEY,
  "protocolVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'frozen',
  "freezeHash" TEXT NOT NULL UNIQUE,
  "stackHash" TEXT NOT NULL,
  "stackCommitSha" TEXT NOT NULL,
  "stackJson" JSONB NOT NULL,
  "freezeJson" JSONB NOT NULL,
  "frozenAt" TIMESTAMP(3) NOT NULL,
  "candidateNotBefore" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HoldoutValidationRun_status_check" CHECK (
    "status" IN (
      'frozen',
      'collecting',
      'reviewing',
      'adjudicating',
      'ready_to_evaluate',
      'evaluated',
      'invalidated'
    )
  ),
  CONSTRAINT "HoldoutValidationRun_cutoff_check" CHECK (
    "candidateNotBefore" >= "frozenAt"
  )
);

CREATE INDEX IF NOT EXISTS "HoldoutValidationRun_status_frozenAt_idx"
  ON "HoldoutValidationRun" ("status", "frozenAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "HoldoutValidationRun_one_active_idx"
  ON "HoldoutValidationRun" ((1))
  WHERE "status" IN (
    'frozen',
    'collecting',
    'reviewing',
    'adjudicating',
    'ready_to_evaluate'
  );

ALTER TABLE "HoldoutValidationRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "HoldoutValidationRun" FROM anon;
REVOKE ALL ON TABLE "HoldoutValidationRun" FROM authenticated;
