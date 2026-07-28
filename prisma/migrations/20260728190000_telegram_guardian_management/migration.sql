CREATE TYPE "TelegramGuardianAlertLevel" AS ENUM ('CAUTION', 'HIGH_RISK', 'CRITICAL');
CREATE TYPE "TelegramScanSource" AS ENUM ('PRIVATE_COMMAND', 'GROUP_GUARDIAN');

CREATE TABLE "TelegramGuardianGroup" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "title" TEXT,
    "username" TEXT,
    "guardianEnabled" BOOLEAN NOT NULL DEFAULT true,
    "allowlisted" BOOLEAN NOT NULL DEFAULT false,
    "alertLevel" "TelegramGuardianAlertLevel" NOT NULL DEFAULT 'HIGH_RISK',
    "dailySummary" BOOLEAN NOT NULL DEFAULT true,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSummaryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramGuardianGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramScanEvent" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "telegramUpdateId" TEXT,
    "telegramChatId" TEXT NOT NULL,
    "telegramMessageId" INTEGER NOT NULL,
    "telegramUserId" TEXT,
    "target" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "domain" TEXT,
    "scanType" TEXT NOT NULL,
    "source" "TelegramScanSource" NOT NULL,
    "chain" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramScanEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramThreatCampaign" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "domain" TEXT,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "highestRisk" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramThreatCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramGuardianGroup_telegramChatId_key" ON "TelegramGuardianGroup"("telegramChatId");
CREATE INDEX "TelegramGuardianGroup_guardianEnabled_allowlisted_idx" ON "TelegramGuardianGroup"("guardianEnabled", "allowlisted");
CREATE INDEX "TelegramGuardianGroup_lastSeenAt_idx" ON "TelegramGuardianGroup"("lastSeenAt");
CREATE UNIQUE INDEX "TelegramScanEvent_telegramChatId_telegramMessageId_targetHash_key" ON "TelegramScanEvent"("telegramChatId", "telegramMessageId", "targetHash");
CREATE INDEX "TelegramScanEvent_groupId_createdAt_idx" ON "TelegramScanEvent"("groupId", "createdAt");
CREATE INDEX "TelegramScanEvent_telegramChatId_createdAt_idx" ON "TelegramScanEvent"("telegramChatId", "createdAt");
CREATE INDEX "TelegramScanEvent_targetHash_createdAt_idx" ON "TelegramScanEvent"("targetHash", "createdAt");
CREATE INDEX "TelegramScanEvent_riskLevel_alerted_createdAt_idx" ON "TelegramScanEvent"("riskLevel", "alerted", "createdAt");
CREATE UNIQUE INDEX "TelegramThreatCampaign_groupId_fingerprint_key" ON "TelegramThreatCampaign"("groupId", "fingerprint");
CREATE INDEX "TelegramThreatCampaign_groupId_lastSeenAt_idx" ON "TelegramThreatCampaign"("groupId", "lastSeenAt");
CREATE INDEX "TelegramThreatCampaign_highestRisk_lastSeenAt_idx" ON "TelegramThreatCampaign"("highestRisk", "lastSeenAt");

ALTER TABLE "TelegramScanEvent" ADD CONSTRAINT "TelegramScanEvent_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TelegramGuardianGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramThreatCampaign" ADD CONSTRAINT "TelegramThreatCampaign_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TelegramGuardianGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramGuardianGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramScanEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramThreatCampaign" ENABLE ROW LEVEL SECURITY;
