CREATE TYPE "StakingPositionStatus" AS ENUM ('ACTIVE', 'UNSTAKE_PENDING', 'WITHDRAWN');
CREATE TYPE "StakingPayoutKind" AS ENUM ('FAUCET', 'REWARD', 'UNSTAKE');
CREATE TYPE "StakingPayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "StakingPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "tokenAccount" TEXT NOT NULL,
    "stakeTxSignature" TEXT NOT NULL,
    "principalUnits" BIGINT NOT NULL,
    "accruedRewardUnits" BIGINT NOT NULL DEFAULT 0,
    "rewardCheckpointAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StakingPositionStatus" NOT NULL DEFAULT 'ACTIVE',
    "unstakeRequestedAt" TIMESTAMP(3),
    "unstakeAvailableAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StakingPosition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StakingPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT,
    "kind" "StakingPayoutKind" NOT NULL,
    "status" "StakingPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "recipientWallet" TEXT NOT NULL,
    "recipientTokenAccount" TEXT NOT NULL,
    "amountUnits" BIGINT NOT NULL,
    "txSignature" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StakingPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StakingPosition_stakeTxSignature_key" ON "StakingPosition"("stakeTxSignature");
CREATE UNIQUE INDEX "StakingPayout_txSignature_key" ON "StakingPayout"("txSignature");
CREATE INDEX "StakingPosition_userId_status_createdAt_idx" ON "StakingPosition"("userId", "status", "createdAt");
CREATE INDEX "StakingPosition_walletAddress_status_idx" ON "StakingPosition"("walletAddress", "status");
CREATE INDEX "StakingPayout_userId_kind_createdAt_idx" ON "StakingPayout"("userId", "kind", "createdAt");
CREATE INDEX "StakingPayout_positionId_kind_status_idx" ON "StakingPayout"("positionId", "kind", "status");

ALTER TABLE "StakingPosition" ADD CONSTRAINT "StakingPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakingPayout" ADD CONSTRAINT "StakingPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakingPayout" ADD CONSTRAINT "StakingPayout_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "StakingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
