-- V2.0 Feedback Learning Loop + V2.1 Team Review

CREATE TYPE "FeedbackLabel" AS ENUM (
  'correct_decision',
  'false_positive',
  'false_negative',
  'confirmed_risk',
  'trusted_user',
  'needs_more_data'
);

CREATE TABLE "TeamReview" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "walletAnalysisId" TEXT,
  "walletAddress" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "previousStatus" "WalletStatus" NOT NULL,
  "finalStatus" "WalletStatus" NOT NULL,
  "feedbackLabel" "FeedbackLabel",
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'dashboard',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TeamReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedbackEvent" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "walletAnalysisId" TEXT,
  "walletAddress" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" "FeedbackLabel" NOT NULL,
  "originalStatus" "WalletStatus" NOT NULL,
  "finalStatus" "WalletStatus",
  "riskScore" INTEGER NOT NULL,
  "riskLevel" "RiskLevel" NOT NULL,
  "reasonsSnapshot" JSONB,
  "notes" TEXT,
  "source" TEXT NOT NULL DEFAULT 'dashboard',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamReview_analysisId_walletAddress_key" ON "TeamReview"("analysisId", "walletAddress");
CREATE INDEX "TeamReview_analysisId_idx" ON "TeamReview"("analysisId");
CREATE INDEX "TeamReview_walletAddress_idx" ON "TeamReview"("walletAddress");
CREATE INDEX "TeamReview_reviewerId_idx" ON "TeamReview"("reviewerId");
CREATE INDEX "FeedbackEvent_analysisId_idx" ON "FeedbackEvent"("analysisId");
CREATE INDEX "FeedbackEvent_walletAddress_idx" ON "FeedbackEvent"("walletAddress");
CREATE INDEX "FeedbackEvent_userId_idx" ON "FeedbackEvent"("userId");
CREATE INDEX "FeedbackEvent_label_idx" ON "FeedbackEvent"("label");

ALTER TABLE "TeamReview" ADD CONSTRAINT "TeamReview_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamReview" ADD CONSTRAINT "TeamReview_walletAnalysisId_fkey" FOREIGN KEY ("walletAnalysisId") REFERENCES "WalletAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamReview" ADD CONSTRAINT "TeamReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_walletAnalysisId_fkey" FOREIGN KEY ("walletAnalysisId") REFERENCES "WalletAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedbackEvent" ADD CONSTRAINT "FeedbackEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
