-- CreateEnum
CREATE TYPE "OnchainEventChainFamily" AS ENUM ('solana', 'evm');

-- CreateEnum
CREATE TYPE "PersistedOnchainEventKind" AS ENUM (
  'native_transfer',
  'token_transfer',
  'contract_interaction',
  'bridge_transfer',
  'account_creation',
  'unknown'
);

-- CreateEnum
CREATE TYPE "PersistedOnchainEventDirection" AS ENUM (
  'inbound',
  'outbound',
  'self',
  'unknown'
);

-- CreateTable
CREATE TABLE "NormalizedOnchainEvent" (
    "id" TEXT NOT NULL,
    "analysisRunId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "chainFamily" "OnchainEventChainFamily" NOT NULL,
    "txHash" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "counterpartyAddress" TEXT,
    "kind" "PersistedOnchainEventKind" NOT NULL,
    "direction" "PersistedOnchainEventDirection" NOT NULL,
    "assetSymbol" TEXT,
    "assetAddress" TEXT,
    "amount" DECIMAL(38,18),
    "observedAt" TIMESTAMP(3),
    "blockRef" TEXT,
    "provider" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizedOnchainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NormalizedOnchainEvent_analysisRunId_eventKey_key"
ON "NormalizedOnchainEvent"("analysisRunId", "eventKey");

CREATE INDEX "NormalizedOnchainEvent_analysisRunId_walletAddress_observedAt_idx"
ON "NormalizedOnchainEvent"("analysisRunId", "walletAddress", "observedAt");

CREATE INDEX "NormalizedOnchainEvent_analysisRunId_counterpartyAddress_observedAt_idx"
ON "NormalizedOnchainEvent"("analysisRunId", "counterpartyAddress", "observedAt");

CREATE INDEX "NormalizedOnchainEvent_analysisRunId_kind_direction_idx"
ON "NormalizedOnchainEvent"("analysisRunId", "kind", "direction");

CREATE INDEX "NormalizedOnchainEvent_chain_walletAddress_observedAt_idx"
ON "NormalizedOnchainEvent"("chain", "walletAddress", "observedAt");

CREATE INDEX "NormalizedOnchainEvent_chain_counterpartyAddress_observedAt_idx"
ON "NormalizedOnchainEvent"("chain", "counterpartyAddress", "observedAt");

CREATE INDEX "NormalizedOnchainEvent_txHash_idx"
ON "NormalizedOnchainEvent"("txHash");

-- AddForeignKey
ALTER TABLE "NormalizedOnchainEvent"
ADD CONSTRAINT "NormalizedOnchainEvent_analysisRunId_fkey"
FOREIGN KEY ("analysisRunId") REFERENCES "CampaignAnalysisRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only in v1; direct client access remains denied by RLS.
ALTER TABLE "NormalizedOnchainEvent" ENABLE ROW LEVEL SECURITY;
