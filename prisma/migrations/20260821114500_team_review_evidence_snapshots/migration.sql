CREATE TABLE "TeamReviewEvidenceSnapshot" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "teamReviewId" TEXT,
    "walletAddress" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "previousStatus" "WalletStatus" NOT NULL,
    "finalStatus" "WalletStatus" NOT NULL,
    "feedbackLabel" "FeedbackLabel",
    "source" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamReviewEvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamReviewEvidenceSnapshot_analysisId_createdAt_idx"
ON "TeamReviewEvidenceSnapshot"("analysisId", "createdAt");

CREATE INDEX "TeamReviewEvidenceSnapshot_analysisId_walletAddress_createdAt_idx"
ON "TeamReviewEvidenceSnapshot"("analysisId", "walletAddress", "createdAt");

CREATE INDEX "TeamReviewEvidenceSnapshot_teamReviewId_createdAt_idx"
ON "TeamReviewEvidenceSnapshot"("teamReviewId", "createdAt");

CREATE INDEX "TeamReviewEvidenceSnapshot_reviewerId_createdAt_idx"
ON "TeamReviewEvidenceSnapshot"("reviewerId", "createdAt");

-- Review evidence snapshots are server-side immutable audit records in v1.
ALTER TABLE "TeamReviewEvidenceSnapshot" ENABLE ROW LEVEL SECURITY;
