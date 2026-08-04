ALTER TYPE "AirdropTaskType" ADD VALUE IF NOT EXISTS 'THREAT_REPORT';

CREATE TABLE "AirdropThreatReportReward" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "rewardDate" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "creditedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AirdropThreatReportReward_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AirdropThreatReportReward_reportId_key" ON "AirdropThreatReportReward"("reportId");
CREATE UNIQUE INDEX "AirdropThreatReportReward_reporterId_rewardDate_key" ON "AirdropThreatReportReward"("reporterId", "rewardDate");
CREATE INDEX "AirdropThreatReportReward_reporterId_creditedAt_idx" ON "AirdropThreatReportReward"("reporterId", "creditedAt");

ALTER TABLE "AirdropThreatReportReward"
ADD CONSTRAINT "AirdropThreatReportReward_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "CommunityThreatReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AirdropThreatReportReward"
ADD CONSTRAINT "AirdropThreatReportReward_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
