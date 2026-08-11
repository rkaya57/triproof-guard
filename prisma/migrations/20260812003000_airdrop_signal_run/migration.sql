CREATE TABLE "AirdropSignalRunSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "challengeDate" TEXT NOT NULL,
    "challengeSet" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "bestCorrectAnswers" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirdropSignalRunSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AirdropSignalRunSession_userId_challengeDate_key" ON "AirdropSignalRunSession"("userId", "challengeDate");
CREATE INDEX "AirdropSignalRunSession_profileId_challengeDate_idx" ON "AirdropSignalRunSession"("profileId", "challengeDate");
CREATE INDEX "AirdropSignalRunSession_challengeDate_status_idx" ON "AirdropSignalRunSession"("challengeDate", "status");

ALTER TABLE "AirdropSignalRunSession"
  ADD CONSTRAINT "AirdropSignalRunSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSignalRunSession"
  ADD CONSTRAINT "AirdropSignalRunSession_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "AirdropProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSignalRunSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AirdropSignalRunSession" FROM anon;
REVOKE ALL ON TABLE "AirdropSignalRunSession" FROM authenticated;
