-- A previous production schema admitted the legacy value `cancelled`, while the
-- current Prisma AnalysisStatus contract does not. Prisma therefore failed to
-- deserialize any result set containing that value, including dashboard and
-- report queries. Rebuild the enum and map unfinished legacy cancellations to
-- the supported terminal `failed` state so the database and Prisma stay aligned.

BEGIN;

ALTER TYPE "AnalysisStatus" RENAME TO "AnalysisStatus_legacy";

CREATE TYPE "AnalysisStatus" AS ENUM (
  'pending',
  'processing',
  'enriching',
  'analyzing',
  'completed',
  'failed'
);

ALTER TABLE "Analysis"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Analysis"
  ALTER COLUMN "status" TYPE "AnalysisStatus"
  USING (
    CASE
      WHEN "status"::text = 'cancelled' THEN 'failed'
      ELSE "status"::text
    END
  )::"AnalysisStatus";

ALTER TABLE "Analysis"
  ALTER COLUMN "status" SET DEFAULT 'pending'::"AnalysisStatus";

DROP TYPE "AnalysisStatus_legacy";

COMMIT;
