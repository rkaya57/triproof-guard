CREATE TYPE "ScamGuardIntelKind" AS ENUM ('DOMAIN', 'WALLET', 'EVM_ADDRESS', 'SOLANA_ADDRESS', 'TOKEN', 'CONTRACT');
CREATE TYPE "ScamGuardIntelVerdict" AS ENUM ('TRUSTED', 'SUSPICIOUS', 'KNOWN_BAD');

CREATE TABLE "ScamGuardIntelEntry" (
    "id" TEXT NOT NULL,
    "kind" "ScamGuardIntelKind" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT '',
    "verdict" "ScamGuardIntelVerdict" NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScamGuardIntelEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScamGuardIntelEntry_kind_normalized_chain_key" ON "ScamGuardIntelEntry"("kind", "normalized", "chain");
CREATE INDEX "ScamGuardIntelEntry_kind_normalized_idx" ON "ScamGuardIntelEntry"("kind", "normalized");
CREATE INDEX "ScamGuardIntelEntry_verdict_active_idx" ON "ScamGuardIntelEntry"("verdict", "active");
CREATE INDEX "ScamGuardIntelEntry_createdById_idx" ON "ScamGuardIntelEntry"("createdById");

ALTER TABLE "ScamGuardIntelEntry" ADD CONSTRAINT "ScamGuardIntelEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
