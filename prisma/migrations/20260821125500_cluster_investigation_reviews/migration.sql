CREATE TABLE "ClusterInvestigationReview" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "clusterLabel" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cluster_workspace',
    "evidenceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterInvestigationReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClusterInvestigationReview_disposition_check" CHECK (
      "disposition" IN ('grouping_supported', 'grouping_not_supported', 'needs_more_data', 'escalate')
    )
);

CREATE INDEX "ClusterInvestigationReview_analysisId_clusterLabel_createdAt_idx"
ON "ClusterInvestigationReview"("analysisId", "clusterLabel", "createdAt");

CREATE INDEX "ClusterInvestigationReview_reviewerId_createdAt_idx"
ON "ClusterInvestigationReview"("reviewerId", "createdAt");

-- Cluster review events are server-side append-only audit records in v1.
-- They intentionally do not carry foreign-key cascades so historical reviewer
-- context cannot rewrite or disappear with wallet/cluster decision mutations.
ALTER TABLE "ClusterInvestigationReview" ENABLE ROW LEVEL SECURITY;
