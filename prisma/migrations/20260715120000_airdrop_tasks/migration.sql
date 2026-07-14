CREATE TYPE "AirdropTaskType" AS ENUM ('X_FOLLOW', 'X_QUOTE', 'HUMANITY_GATE_FEEDBACK');

CREATE TYPE "AirdropSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AirdropProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "xHandle" TEXT,
  "rewardWallet" TEXT,
  "totalPoints" INTEGER NOT NULL DEFAULT 0,
  "eligibilityStatus" TEXT NOT NULL DEFAULT 'registered',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AirdropProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AirdropTask" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "type" "AirdropTaskType" NOT NULL,
  "points" INTEGER NOT NULL,
  "proofRequired" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AirdropTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AirdropSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "status" "AirdropSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceUrl" TEXT,
  "evidenceImageData" TEXT,
  "feedbackText" TEXT,
  "humanityTestResult" JSONB,
  "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
  "adminNotes" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AirdropSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AirdropProfile_userId_key" ON "AirdropProfile"("userId");
CREATE INDEX "AirdropProfile_totalPoints_idx" ON "AirdropProfile"("totalPoints");
CREATE INDEX "AirdropProfile_eligibilityStatus_idx" ON "AirdropProfile"("eligibilityStatus");

CREATE UNIQUE INDEX "AirdropTask_slug_key" ON "AirdropTask"("slug");
CREATE INDEX "AirdropTask_active_sortOrder_idx" ON "AirdropTask"("active", "sortOrder");

CREATE UNIQUE INDEX "AirdropSubmission_userId_taskId_key" ON "AirdropSubmission"("userId", "taskId");
CREATE INDEX "AirdropSubmission_status_createdAt_idx" ON "AirdropSubmission"("status", "createdAt");
CREATE INDEX "AirdropSubmission_profileId_idx" ON "AirdropSubmission"("profileId");
CREATE INDEX "AirdropSubmission_reviewedById_idx" ON "AirdropSubmission"("reviewedById");

ALTER TABLE "AirdropProfile"
ADD CONSTRAINT "AirdropProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSubmission"
ADD CONSTRAINT "AirdropSubmission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSubmission"
ADD CONSTRAINT "AirdropSubmission_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "AirdropProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSubmission"
ADD CONSTRAINT "AirdropSubmission_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "AirdropTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropSubmission"
ADD CONSTRAINT "AirdropSubmission_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AirdropTask" (
  "id", "slug", "title", "description", "type", "points", "proofRequired", "active", "sortOrder", "createdAt", "updatedAt"
) VALUES
  (
    'airdrop-task-x-follow',
    'x-follow-triproof',
    'Follow Tri-Proof on X',
    'Follow the official Tri-Proof Protocol X account at https://x.com/TriProof_ and submit a screenshot as proof.',
    'X_FOLLOW',
    100,
    true,
    true,
    10,
    NOW(),
    NOW()
  ),
  (
    'airdrop-task-x-quote',
    'x-quote-triproof-post',
    'Quote a Tri-Proof post',
    'Quote-share any post from the official Tri-Proof Protocol X account and submit the quote URL plus screenshot evidence.',
    'X_QUOTE',
    180,
    true,
    true,
    20,
    NOW(),
    NOW()
  ),
  (
    'airdrop-task-humanity-feedback',
    'humanity-gate-feedback',
    'Test Humanity Gate and leave feedback',
    'Run the one-time Humanity Gate readiness test, then submit feedback and optional screenshot evidence for admin review.',
    'HUMANITY_GATE_FEEDBACK',
    250,
    false,
    true,
    30,
    NOW(),
    NOW()
  )
ON CONFLICT ("slug") DO NOTHING;
