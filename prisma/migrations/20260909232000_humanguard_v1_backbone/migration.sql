-- HumanGuard V1: customer sites, interactive challenge sessions and one-time proofs.

CREATE TABLE "HumanGuardSite" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "allowedOrigins" JSONB NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'ADAPTIVE',
    "walletRequired" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanGuardSite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanGuardChallengeSession" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "walletAddress" TEXT,
    "walletChain" TEXT,
    "challengeType" TEXT NOT NULL,
    "challengeSeed" TEXT NOT NULL,
    "publicConfig" JSONB NOT NULL,
    "expectedAnswer" JSONB NOT NULL,
    "telemetry" JSONB,
    "resultEvidence" JSONB,
    "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "humanScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanGuardChallengeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HumanGuardProof" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "walletAddress" TEXT,
    "walletChain" TEXT,
    "challengeType" TEXT NOT NULL,
    "humanScore" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanGuardProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HumanGuardSite_siteKey_key" ON "HumanGuardSite"("siteKey");
CREATE INDEX "HumanGuardSite_ownerUserId_enabled_idx" ON "HumanGuardSite"("ownerUserId", "enabled");
CREATE INDEX "HumanGuardSite_createdAt_idx" ON "HumanGuardSite"("createdAt");

CREATE UNIQUE INDEX "HumanGuardChallengeSession_nonce_key" ON "HumanGuardChallengeSession"("nonce");
CREATE INDEX "HumanGuardChallengeSession_siteId_status_expiresAt_idx" ON "HumanGuardChallengeSession"("siteId", "status", "expiresAt");
CREATE INDEX "HumanGuardChallengeSession_siteId_walletAddress_createdAt_idx" ON "HumanGuardChallengeSession"("siteId", "walletAddress", "createdAt");
CREATE INDEX "HumanGuardChallengeSession_createdAt_idx" ON "HumanGuardChallengeSession"("createdAt");

CREATE UNIQUE INDEX "HumanGuardProof_sessionId_key" ON "HumanGuardProof"("sessionId");
CREATE UNIQUE INDEX "HumanGuardProof_tokenId_key" ON "HumanGuardProof"("tokenId");
CREATE INDEX "HumanGuardProof_siteId_createdAt_idx" ON "HumanGuardProof"("siteId", "createdAt");
CREATE INDEX "HumanGuardProof_siteId_consumedAt_expiresAt_idx" ON "HumanGuardProof"("siteId", "consumedAt", "expiresAt");
CREATE INDEX "HumanGuardProof_walletAddress_createdAt_idx" ON "HumanGuardProof"("walletAddress", "createdAt");

ALTER TABLE "HumanGuardSite"
ADD CONSTRAINT "HumanGuardSite_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HumanGuardChallengeSession"
ADD CONSTRAINT "HumanGuardChallengeSession_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "HumanGuardSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HumanGuardProof"
ADD CONSTRAINT "HumanGuardProof_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "HumanGuardSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HumanGuardProof"
ADD CONSTRAINT "HumanGuardProof_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "HumanGuardChallengeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
