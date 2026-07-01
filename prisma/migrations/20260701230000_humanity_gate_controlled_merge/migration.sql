DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HumanityChallengeLevel') THEN
    CREATE TYPE "HumanityChallengeLevel" AS ENUM ('BASIC', 'STANDARD', 'STRICT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HumanitySessionStatus') THEN
    CREATE TYPE "HumanitySessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HumanityDecision') THEN
    CREATE TYPE "HumanityDecision" AS ENUM ('APPROVED', 'MANUAL_REVIEW', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HumanityCampaign" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "humanityGateEnabled" BOOLEAN NOT NULL DEFAULT true,
  "challengeLevel" "HumanityChallengeLevel" NOT NULL DEFAULT 'STANDARD',
  "proofExpiresInDays" INTEGER NOT NULL DEFAULT 30,
  "maxAttemptsPerWallet" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanityCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HumanityChallengeSession" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "walletChain" TEXT,
  "nonce" TEXT NOT NULL,
  "challengeSequence" JSONB NOT NULL,
  "status" "HumanitySessionStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanityChallengeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HumanityVerification" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "walletChain" TEXT,
  "nullifierHash" TEXT NOT NULL,
  "humanSessionScore" DOUBLE PRECISION NOT NULL,
  "facePresenceScore" DOUBLE PRECISION,
  "headPoseScore" DOUBLE PRECISION,
  "eyeBlinkScore" DOUBLE PRECISION,
  "handGestureScore" DOUBLE PRECISION,
  "motionTimingScore" DOUBLE PRECISION,
  "frameConsistencyScore" DOUBLE PRECISION,
  "replayRiskScore" DOUBLE PRECISION,
  "injectionRiskScore" DOUBLE PRECISION,
  "decision" "HumanityDecision" NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "signedMessage" TEXT,
  "signature" TEXT,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "proofExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HumanityVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HumanityCampaign_slug_key" ON "HumanityCampaign"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "HumanityChallengeSession_nonce_key" ON "HumanityChallengeSession"("nonce");
CREATE UNIQUE INDEX IF NOT EXISTS "HumanityVerification_sessionId_key" ON "HumanityVerification"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "HumanityVerification_nullifierHash_key" ON "HumanityVerification"("nullifierHash");
CREATE INDEX IF NOT EXISTS "HumanityCampaign_projectId_idx" ON "HumanityCampaign"("projectId");
CREATE INDEX IF NOT EXISTS "HumanityChallengeSession_campaignId_walletAddress_idx" ON "HumanityChallengeSession"("campaignId", "walletAddress");
CREATE INDEX IF NOT EXISTS "HumanityChallengeSession_status_idx" ON "HumanityChallengeSession"("status");
CREATE INDEX IF NOT EXISTS "HumanityVerification_campaignId_walletAddress_idx" ON "HumanityVerification"("campaignId", "walletAddress");
CREATE INDEX IF NOT EXISTS "HumanityVerification_decision_idx" ON "HumanityVerification"("decision");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'HumanityChallengeSession_campaignId_fkey'
  ) THEN
    ALTER TABLE "HumanityChallengeSession"
    ADD CONSTRAINT "HumanityChallengeSession_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "HumanityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'HumanityVerification_campaignId_fkey'
  ) THEN
    ALTER TABLE "HumanityVerification"
    ADD CONSTRAINT "HumanityVerification_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "HumanityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'HumanityVerification_sessionId_fkey'
  ) THEN
    ALTER TABLE "HumanityVerification"
    ADD CONSTRAINT "HumanityVerification_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "HumanityChallengeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
