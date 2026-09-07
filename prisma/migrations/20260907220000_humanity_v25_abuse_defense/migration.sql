CREATE TABLE IF NOT EXISTS "HumanityAbuseBucket" (
  "bucketKey" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanityAbuseBucket_pkey" PRIMARY KEY ("bucketKey", "windowStart")
);

CREATE INDEX IF NOT EXISTS "HumanityAbuseBucket_expiresAt_idx"
  ON "HumanityAbuseBucket"("expiresAt");

CREATE TABLE IF NOT EXISTS "HumanitySessionLifecycleEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanitySessionLifecycleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HumanitySessionLifecycleEvent_sessionId_createdAt_idx"
  ON "HumanitySessionLifecycleEvent"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "HumanityChallengeSession_status_expiresAt_idx"
  ON "HumanityChallengeSession"("status", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HumanitySessionLifecycleEvent_sessionId_fkey'
  ) THEN
    ALTER TABLE "HumanitySessionLifecycleEvent"
      ADD CONSTRAINT "HumanitySessionLifecycleEvent_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "HumanityChallengeSession"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
