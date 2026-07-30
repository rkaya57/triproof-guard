CREATE TABLE "CommunityThreatReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "normalizedTarget" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL,
    "chain" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "evidenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewerNote" TEXT,
    "promotedIntelEntryId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityThreatReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityThreatReport_status_publishedAt_idx" ON "CommunityThreatReport"("status", "publishedAt");
CREATE INDEX "CommunityThreatReport_reporterId_createdAt_idx" ON "CommunityThreatReport"("reporterId", "createdAt");
CREATE INDEX "CommunityThreatReport_normalizedTarget_status_idx" ON "CommunityThreatReport"("normalizedTarget", "status");
CREATE INDEX "CommunityThreatReport_reviewerId_idx" ON "CommunityThreatReport"("reviewerId");

ALTER TABLE "CommunityThreatReport" ADD CONSTRAINT "CommunityThreatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityThreatReport" ADD CONSTRAINT "CommunityThreatReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunityThreatReport" ENABLE ROW LEVEL SECURITY;
