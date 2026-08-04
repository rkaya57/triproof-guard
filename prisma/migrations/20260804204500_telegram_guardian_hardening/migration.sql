ALTER TABLE "TelegramGuardianGroup"
  ADD COLUMN IF NOT EXISTS "safeMode" TEXT NOT NULL DEFAULT 'SILENT',
  ADD COLUMN IF NOT EXISTS "highRiskAction" TEXT NOT NULL DEFAULT 'ADMIN_REVIEW',
  ADD COLUMN IF NOT EXISTS "criticalAction" TEXT NOT NULL DEFAULT 'ADMIN_REVIEW',
  ADD COLUMN IF NOT EXISTS "permissionSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "lastPermissionCheckAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TelegramGuardianGroup_safeMode_check'
  ) THEN
    ALTER TABLE "TelegramGuardianGroup"
      ADD CONSTRAINT "TelegramGuardianGroup_safeMode_check"
      CHECK ("safeMode" IN ('SILENT', 'COMPACT', 'FULL'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TelegramGuardianGroup_highRiskAction_check'
  ) THEN
    ALTER TABLE "TelegramGuardianGroup"
      ADD CONSTRAINT "TelegramGuardianGroup_highRiskAction_check"
      CHECK ("highRiskAction" IN ('WARN_ONLY', 'ADMIN_REVIEW', 'DELETE', 'DELETE_MUTE_1H', 'DELETE_MUTE_24H'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TelegramGuardianGroup_criticalAction_check'
  ) THEN
    ALTER TABLE "TelegramGuardianGroup"
      ADD CONSTRAINT "TelegramGuardianGroup_criticalAction_check"
      CHECK ("criticalAction" IN ('WARN_ONLY', 'ADMIN_REVIEW', 'DELETE', 'DELETE_MUTE_1H', 'DELETE_MUTE_24H'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TelegramWebhookUpdate" (
  "updateId" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramWebhookUpdate_status_check"
    CHECK ("status" IN ('PROCESSING', 'PROCESSED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "TelegramWebhookUpdate_status_leaseUntil_idx"
  ON "TelegramWebhookUpdate"("status", "leaseUntil");
CREATE INDEX IF NOT EXISTS "TelegramWebhookUpdate_createdAt_idx"
  ON "TelegramWebhookUpdate"("createdAt");

CREATE TABLE IF NOT EXISTS "TelegramRateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelegramRateLimitBucket_expiresAt_idx"
  ON "TelegramRateLimitBucket"("expiresAt");

CREATE TABLE IF NOT EXISTS "TelegramDeliveryEvent" (
  "updateId" TEXT NOT NULL,
  "actionIndex" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "chatId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramDeliveryEvent_pkey" PRIMARY KEY ("updateId", "actionIndex"),
  CONSTRAINT "TelegramDeliveryEvent_status_check"
    CHECK ("status" IN ('PENDING', 'DELIVERED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS "TelegramDeliveryEvent_status_updatedAt_idx"
  ON "TelegramDeliveryEvent"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "TelegramProjectRegistry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TelegramProjectRegistry_active_name_idx"
  ON "TelegramProjectRegistry"("active", "normalizedName");

CREATE TABLE IF NOT EXISTS "TelegramProjectAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "chain" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramProjectAsset_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "TelegramProjectRegistry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TelegramProjectAsset_kind_check"
    CHECK ("kind" IN ('DOMAIN', 'X_HANDLE', 'TELEGRAM_HANDLE', 'EVM_ADDRESS', 'SOLANA_ADDRESS', 'BRAND_ALIAS')),
  CONSTRAINT "TelegramProjectAsset_kind_normalized_chain_key"
    UNIQUE ("kind", "normalized", "chain")
);

CREATE INDEX IF NOT EXISTS "TelegramProjectAsset_projectId_active_idx"
  ON "TelegramProjectAsset"("projectId", "active");
CREATE INDEX IF NOT EXISTS "TelegramProjectAsset_kind_normalized_idx"
  ON "TelegramProjectAsset"("kind", "normalized");

INSERT INTO "TelegramProjectRegistry" (
  "id", "slug", "name", "normalizedName", "notes", "active", "createdAt", "updatedAt"
)
VALUES (
  'project-triproof-protocol',
  'tri-proof-protocol',
  'Tri-Proof Protocol',
  'triproofprotocol',
  'Official Tri-Proof Protocol registry entry.',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "normalizedName" = EXCLUDED."normalizedName",
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TelegramProjectAsset" (
  "id", "projectId", "kind", "value", "normalized", "chain", "active", "createdAt", "updatedAt"
)
VALUES
  ('asset-triproof-domain', 'project-triproof-protocol', 'DOMAIN', 'triproofprotocol.com', 'triproofprotocol.com', '', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asset-triproof-x', 'project-triproof-protocol', 'X_HANDLE', 'TriProof_', 'triproof_', '', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asset-triproof-alias-1', 'project-triproof-protocol', 'BRAND_ALIAS', 'Tri-Proof Protocol', 'triproofprotocol', '', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('asset-triproof-alias-2', 'project-triproof-protocol', 'BRAND_ALIAS', 'TriProof', 'triproof', '', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "normalized", "chain") DO UPDATE SET
  "projectId" = EXCLUDED."projectId",
  "value" = EXCLUDED."value",
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "TelegramWebhookUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramRateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramDeliveryEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramProjectRegistry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramProjectAsset" ENABLE ROW LEVEL SECURITY;
