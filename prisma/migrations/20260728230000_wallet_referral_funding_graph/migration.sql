-- AlterTable
ALTER TABLE "WalletAnalysis"
ADD COLUMN "graphComponentId" TEXT,
ADD COLUMN "graphRiskScore" INTEGER;

-- CreateTable
CREATE TABLE "WalletGraphSummary" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "totalNodes" INTEGER NOT NULL,
    "totalEdges" INTEGER NOT NULL,
    "connectedWallets" INTEGER NOT NULL,
    "externalFunders" INTEGER NOT NULL,
    "referralLinks" INTEGER NOT NULL,
    "highRiskComponents" INTEGER NOT NULL,
    "neutralServiceFunders" INTEGER NOT NULL,
    "largestComponent" INTEGER NOT NULL,
    "maxComponentRisk" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletGraphSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletGraphNode" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "address" TEXT,
    "chain" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "walletAddress" TEXT,
    "componentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletGraphEdge" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "edgeKey" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "isRiskBearing" BOOLEAN NOT NULL DEFAULT false,
    "componentId" TEXT,
    "observedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "amount" DOUBLE PRECISION,
    "evidence" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletAnalysis_graphComponentId_idx" ON "WalletAnalysis"("graphComponentId");
CREATE UNIQUE INDEX "WalletGraphSummary_analysisId_key" ON "WalletGraphSummary"("analysisId");
CREATE INDEX "WalletGraphSummary_analysisId_idx" ON "WalletGraphSummary"("analysisId");
CREATE UNIQUE INDEX "WalletGraphNode_analysisId_nodeKey_key" ON "WalletGraphNode"("analysisId", "nodeKey");
CREATE INDEX "WalletGraphNode_analysisId_idx" ON "WalletGraphNode"("analysisId");
CREATE INDEX "WalletGraphNode_analysisId_componentId_idx" ON "WalletGraphNode"("analysisId", "componentId");
CREATE INDEX "WalletGraphNode_analysisId_walletAddress_idx" ON "WalletGraphNode"("analysisId", "walletAddress");
CREATE UNIQUE INDEX "WalletGraphEdge_analysisId_edgeKey_key" ON "WalletGraphEdge"("analysisId", "edgeKey");
CREATE INDEX "WalletGraphEdge_analysisId_idx" ON "WalletGraphEdge"("analysisId");
CREATE INDEX "WalletGraphEdge_analysisId_componentId_idx" ON "WalletGraphEdge"("analysisId", "componentId");
CREATE INDEX "WalletGraphEdge_analysisId_sourceKey_idx" ON "WalletGraphEdge"("analysisId", "sourceKey");
CREATE INDEX "WalletGraphEdge_analysisId_targetKey_idx" ON "WalletGraphEdge"("analysisId", "targetKey");
CREATE INDEX "WalletGraphEdge_analysisId_isRiskBearing_idx" ON "WalletGraphEdge"("analysisId", "isRiskBearing");

-- AddForeignKey
ALTER TABLE "WalletGraphSummary"
ADD CONSTRAINT "WalletGraphSummary_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletGraphNode"
ADD CONSTRAINT "WalletGraphNode_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletGraphEdge"
ADD CONSTRAINT "WalletGraphEdge_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Graph evidence is server-only. Browser clients receive no direct policies.
ALTER TABLE "WalletGraphSummary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletGraphNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WalletGraphEdge" ENABLE ROW LEVEL SECURITY;
