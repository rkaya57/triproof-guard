-- CreateEnum
CREATE TYPE "PersistedFundingRelationshipKind" AS ENUM (
  'FUNDED_BY',
  'SAME_FUNDER',
  'SAME_FUNDING_LINEAGE'
);

-- CreateTable
CREATE TABLE "CampaignFundingRelationship" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "relationshipKey" TEXT NOT NULL,
    "kind" "PersistedFundingRelationshipKind" NOT NULL,
    "chain" TEXT NOT NULL,
    "sourceAddress" TEXT NOT NULL,
    "targetAddress" TEXT NOT NULL,
    "viaAddress" TEXT,
    "hopCount" INTEGER NOT NULL,
    "cohortSize" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "riskBearing" BOOLEAN NOT NULL DEFAULT false,
    "suppressionReason" TEXT,
    "evidenceEventKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignFundingRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignFundingRelationship_analysisRunId_relationshipKey_key"
ON "CampaignFundingRelationship"("analysisRunId", "relationshipKey");

CREATE INDEX "CampaignFundingRelationship_campaignId_analysisRunId_kind_idx"
ON "CampaignFundingRelationship"("campaignId", "analysisRunId", "kind");

CREATE INDEX "CampaignFundingRelationship_analysisRunId_riskBearing_kind_idx"
ON "CampaignFundingRelationship"("analysisRunId", "riskBearing", "kind");

CREATE INDEX "CampaignFundingRelationship_chain_sourceAddress_idx"
ON "CampaignFundingRelationship"("chain", "sourceAddress");

CREATE INDEX "CampaignFundingRelationship_chain_targetAddress_idx"
ON "CampaignFundingRelationship"("chain", "targetAddress");

CREATE INDEX "CampaignFundingRelationship_chain_viaAddress_idx"
ON "CampaignFundingRelationship"("chain", "viaAddress");

-- AddForeignKey
ALTER TABLE "CampaignFundingRelationship"
ADD CONSTRAINT "CampaignFundingRelationship_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignFundingRelationship"
ADD CONSTRAINT "CampaignFundingRelationship_analysisRunId_fkey"
FOREIGN KEY ("analysisRunId") REFERENCES "CampaignAnalysisRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only in v1; direct client access remains denied by RLS.
ALTER TABLE "CampaignFundingRelationship" ENABLE ROW LEVEL SECURITY;
