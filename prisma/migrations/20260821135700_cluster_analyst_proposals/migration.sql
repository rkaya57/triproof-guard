CREATE TABLE "ClusterAnalystProposal" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "clusterLabel" TEXT NOT NULL,
    "analystId" TEXT NOT NULL,
    "analystName" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "evidenceSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cluster_workspace',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterAnalystProposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClusterAnalystProposal_type_check" CHECK (
      "proposalType" IN (
        'mark_likely_legitimate',
        'mark_suspicious',
        'needs_review',
        'merge_clusters',
        'split_cluster',
        'analyst_note'
      )
    )
);

CREATE INDEX "ClusterAnalystProposal_analysisId_clusterLabel_createdAt_idx"
ON "ClusterAnalystProposal"("analysisId", "clusterLabel", "createdAt");

CREATE INDEX "ClusterAnalystProposal_analystId_createdAt_idx"
ON "ClusterAnalystProposal"("analystId", "createdAt");

CREATE INDEX "ClusterAnalystProposal_proposalType_createdAt_idx"
ON "ClusterAnalystProposal"("proposalType", "createdAt");

-- Analyst proposals are server-side append-only audit records in v1.
-- No apply/update/delete workflow is introduced by this migration.
-- Historical proposals intentionally have no cascade foreign keys so audit
-- context cannot disappear when mutable analysis records change later.
ALTER TABLE "ClusterAnalystProposal" ENABLE ROW LEVEL SECURITY;
