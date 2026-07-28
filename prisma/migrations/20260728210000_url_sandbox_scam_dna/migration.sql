-- CreateEnum
CREATE TYPE "ScamDnaVerdict" AS ENUM ('UNKNOWN', 'SUSPICIOUS', 'KNOWN_BAD');

-- CreateTable
CREATE TABLE "ScamDnaCampaign" (
    "id" TEXT NOT NULL,
    "clusterKey" TEXT NOT NULL,
    "verdict" "ScamDnaVerdict" NOT NULL DEFAULT 'UNKNOWN',
    "label" TEXT,
    "notes" TEXT,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "domainCount" INTEGER NOT NULL DEFAULT 0,
    "strongestRisk" TEXT NOT NULL DEFAULT 'SAFE',
    "domains" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScamDnaCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScamDnaFingerprint" (
    "id" TEXT NOT NULL,
    "fingerprintKey" TEXT NOT NULL,
    "campaignId" TEXT,
    "domain" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "finalUrl" TEXT,
    "contentHash" TEXT NOT NULL,
    "domHash" TEXT NOT NULL,
    "scriptHash" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "styleHash" TEXT NOT NULL,
    "faviconUrlHash" TEXT NOT NULL,
    "redirectHash" TEXT NOT NULL,
    "behaviorHash" TEXT NOT NULL,
    "behaviorFlags" JSONB NOT NULL,
    "walletTargets" JSONB NOT NULL,
    "programTargets" JSONB NOT NULL,
    "sandboxSignals" JSONB NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "observationCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScamDnaFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScamDnaCampaign_clusterKey_key" ON "ScamDnaCampaign"("clusterKey");
CREATE INDEX "ScamDnaCampaign_verdict_lastSeenAt_idx" ON "ScamDnaCampaign"("verdict", "lastSeenAt");
CREATE INDEX "ScamDnaCampaign_strongestRisk_lastSeenAt_idx" ON "ScamDnaCampaign"("strongestRisk", "lastSeenAt");
CREATE UNIQUE INDEX "ScamDnaFingerprint_fingerprintKey_key" ON "ScamDnaFingerprint"("fingerprintKey");
CREATE INDEX "ScamDnaFingerprint_campaignId_lastSeenAt_idx" ON "ScamDnaFingerprint"("campaignId", "lastSeenAt");
CREATE INDEX "ScamDnaFingerprint_domain_lastSeenAt_idx" ON "ScamDnaFingerprint"("domain", "lastSeenAt");
CREATE INDEX "ScamDnaFingerprint_domHash_idx" ON "ScamDnaFingerprint"("domHash");
CREATE INDEX "ScamDnaFingerprint_scriptHash_idx" ON "ScamDnaFingerprint"("scriptHash");
CREATE INDEX "ScamDnaFingerprint_behaviorHash_idx" ON "ScamDnaFingerprint"("behaviorHash");
CREATE INDEX "ScamDnaFingerprint_riskLevel_lastSeenAt_idx" ON "ScamDnaFingerprint"("riskLevel", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "ScamDnaFingerprint"
ADD CONSTRAINT "ScamDnaFingerprint_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "ScamDnaCampaign"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Server-only evidence storage. Prisma uses the service database connection;
-- browser clients receive no policies and therefore no direct access.
ALTER TABLE "ScamDnaCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScamDnaFingerprint" ENABLE ROW LEVEL SECURITY;
