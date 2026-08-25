-- CreateEnum
CREATE TYPE "CampaignLifecycle" AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "CampaignDecisionState" AS ENUM ('allow', 'review', 'exclude', 'insufficient_data');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "legacyProjectId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "legacyChain" TEXT,
    "networks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lifecycle" "CampaignLifecycle" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "rewardPoolUsd" DECIMAL(18,6),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPolicy" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "preset" TEXT,
    "policyHash" TEXT,
    "definition" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAnalysisRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "legacyAnalysisId" TEXT,
    "policyId" TEXT,
    "status" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT,
    "inputHash" TEXT,
    "campaignSnapshot" JSONB NOT NULL,
    "totalWallets" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "manualReviewCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "averageRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suspiciousClustersCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDecision" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "policyId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "state" "CampaignDecisionState" NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "confidence" INTEGER,
    "clusterId" TEXT,
    "evidence" JSONB NOT NULL,
    "matchedRules" JSONB NOT NULL,
    "explanation" TEXT,
    "modelVersion" TEXT NOT NULL,
    "policyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_legacyProjectId_key" ON "Campaign"("legacyProjectId");
CREATE INDEX "Campaign_ownerUserId_lifecycle_updatedAt_idx" ON "Campaign"("ownerUserId", "lifecycle", "updatedAt");
CREATE INDEX "Campaign_campaignType_updatedAt_idx" ON "Campaign"("campaignType", "updatedAt");
CREATE UNIQUE INDEX "CampaignPolicy_campaignId_version_key" ON "CampaignPolicy"("campaignId", "version");
CREATE INDEX "CampaignPolicy_campaignId_isActive_updatedAt_idx" ON "CampaignPolicy"("campaignId", "isActive", "updatedAt");
CREATE UNIQUE INDEX "CampaignAnalysisRun_legacyAnalysisId_key" ON "CampaignAnalysisRun"("legacyAnalysisId");
CREATE INDEX "CampaignAnalysisRun_campaignId_createdAt_idx" ON "CampaignAnalysisRun"("campaignId", "createdAt");
CREATE INDEX "CampaignAnalysisRun_status_createdAt_idx" ON "CampaignAnalysisRun"("status", "createdAt");
CREATE INDEX "CampaignAnalysisRun_policyId_idx" ON "CampaignAnalysisRun"("policyId");
CREATE UNIQUE INDEX "CampaignDecision_analysisRunId_chain_walletAddress_key" ON "CampaignDecision"("analysisRunId", "chain", "walletAddress");
CREATE INDEX "CampaignDecision_campaignId_state_createdAt_idx" ON "CampaignDecision"("campaignId", "state", "createdAt");
CREATE INDEX "CampaignDecision_walletAddress_chain_idx" ON "CampaignDecision"("walletAddress", "chain");
CREATE INDEX "CampaignDecision_clusterId_idx" ON "CampaignDecision"("clusterId");
CREATE INDEX "CampaignDecision_policyId_idx" ON "CampaignDecision"("policyId");

-- AddForeignKey
ALTER TABLE "CampaignPolicy"
ADD CONSTRAINT "CampaignPolicy_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignAnalysisRun"
ADD CONSTRAINT "CampaignAnalysisRun_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignAnalysisRun"
ADD CONSTRAINT "CampaignAnalysisRun_policyId_fkey"
FOREIGN KEY ("policyId") REFERENCES "CampaignPolicy"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignDecision"
ADD CONSTRAINT "CampaignDecision_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignDecision"
ADD CONSTRAINT "CampaignDecision_analysisRunId_fkey"
FOREIGN KEY ("analysisRunId") REFERENCES "CampaignAnalysisRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignDecision"
ADD CONSTRAINT "CampaignDecision_policyId_fkey"
FOREIGN KEY ("policyId") REFERENCES "CampaignPolicy"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill canonical campaigns from the legacy Project model.
INSERT INTO "Campaign" (
    "id",
    "legacyProjectId",
    "ownerUserId",
    "name",
    "campaignType",
    "legacyChain",
    "networks",
    "lifecycle",
    "notes",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    p."id",
    p."id",
    p."userId",
    p."name",
    p."campaignType",
    p."chain",
    CASE
      WHEN lower(p."chain") LIKE '%solana%' AND lower(p."chain") LIKE '%evm%' THEN ARRAY['solana', 'evm']::TEXT[]
      WHEN lower(p."chain") LIKE '%solana%' THEN ARRAY['solana']::TEXT[]
      WHEN lower(p."chain") IN ('ethereum', 'eth') THEN ARRAY['ethereum']::TEXT[]
      WHEN lower(p."chain") LIKE '%base%' THEN ARRAY['base']::TEXT[]
      WHEN lower(p."chain") LIKE '%arbitrum%' THEN ARRAY['arbitrum']::TEXT[]
      WHEN lower(p."chain") LIKE '%optimism%' THEN ARRAY['optimism']::TEXT[]
      WHEN lower(p."chain") LIKE '%polygon%' OR lower(p."chain") = 'matic' THEN ARRAY['polygon']::TEXT[]
      WHEN lower(p."chain") IN ('bnb', 'bsc', 'bnb chain', 'bnb-chain') THEN ARRAY['bnb-chain']::TEXT[]
      WHEN lower(p."chain") = 'evm' THEN ARRAY['evm']::TEXT[]
      ELSE ARRAY[lower(trim(p."chain"))]::TEXT[]
    END,
    'active'::"CampaignLifecycle",
    p."notes",
    jsonb_build_object('migration', 'campaign-core-v1', 'legacyProjectId', p."id"),
    p."createdAt",
    p."updatedAt"
FROM "Project" p
ON CONFLICT ("id") DO NOTHING;

-- Backfill immutable analysis-run snapshots from legacy analyses.
INSERT INTO "CampaignAnalysisRun" (
    "id",
    "campaignId",
    "legacyAnalysisId",
    "policyId",
    "status",
    "modelVersion",
    "policyVersion",
    "inputHash",
    "campaignSnapshot",
    "totalWallets",
    "approvedCount",
    "manualReviewCount",
    "rejectedCount",
    "averageRiskScore",
    "suspiciousClustersCount",
    "startedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    a."id",
    c."id",
    a."id",
    NULL,
    a."status"::text,
    'legacy-unversioned',
    NULL,
    NULL,
    jsonb_build_object(
      'campaignId', c."id",
      'name', c."name",
      'campaignType', c."campaignType",
      'networks', to_jsonb(c."networks"),
      'legacyChain', c."legacyChain"
    ),
    a."totalWallets",
    a."approvedCount",
    a."manualReviewCount",
    a."rejectedCount",
    a."averageRiskScore",
    a."suspiciousClustersCount",
    a."createdAt",
    a."completedAt",
    a."createdAt",
    COALESCE(a."completedAt", a."createdAt")
FROM "Analysis" a
JOIN "Campaign" c ON c."legacyProjectId" = a."projectId"
ON CONFLICT ("id") DO NOTHING;

-- Preserve legacy wallet outcomes as auditable campaign decisions.
INSERT INTO "CampaignDecision" (
    "id",
    "campaignId",
    "analysisRunId",
    "policyId",
    "walletAddress",
    "chain",
    "state",
    "riskScore",
    "confidence",
    "clusterId",
    "evidence",
    "matchedRules",
    "explanation",
    "modelVersion",
    "policyVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    wa."analysisId" || ':decision:' || substr(md5(wa."chain" || ':' || wa."walletAddress"), 1, 16),
    car."campaignId",
    car."id",
    NULL,
    wa."walletAddress",
    wa."chain",
    CASE wa."status"::text
      WHEN 'approved' THEN 'allow'::"CampaignDecisionState"
      WHEN 'manual_review' THEN 'review'::"CampaignDecisionState"
      WHEN 'rejected' THEN 'exclude'::"CampaignDecisionState"
      ELSE 'insufficient_data'::"CampaignDecisionState"
    END,
    wa."riskScore",
    NULL,
    wa."clusterId",
    COALESCE(wa."reasons", '[]'::jsonb),
    '[]'::jsonb,
    wa."statusExplanation",
    'legacy-unversioned',
    NULL,
    wa."createdAt",
    wa."createdAt"
FROM "WalletAnalysis" wa
JOIN "CampaignAnalysisRun" car ON car."legacyAnalysisId" = wa."analysisId"
ON CONFLICT ("analysisRunId", "chain", "walletAddress") DO NOTHING;

-- Canonical campaign intelligence is server-only in v1.
ALTER TABLE "Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignAnalysisRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CampaignDecision" ENABLE ROW LEVEL SECURITY;
