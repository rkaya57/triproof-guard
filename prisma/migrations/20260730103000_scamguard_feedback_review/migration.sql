CREATE TABLE "ScamGuardFeedbackEvent" (
    "id" TEXT NOT NULL,
    "scanId" TEXT,
    "verdict" TEXT NOT NULL,
    "value" TEXT,
    "normalized" TEXT,
    "chain" TEXT,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'public_api',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScamGuardFeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScamGuardFeedbackEvent_status_createdAt_idx" ON "ScamGuardFeedbackEvent"("status", "createdAt");
CREATE INDEX "ScamGuardFeedbackEvent_normalized_createdAt_idx" ON "ScamGuardFeedbackEvent"("normalized", "createdAt");
CREATE INDEX "ScamGuardFeedbackEvent_reviewedById_idx" ON "ScamGuardFeedbackEvent"("reviewedById");

ALTER TABLE "ScamGuardFeedbackEvent" ADD CONSTRAINT "ScamGuardFeedbackEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScamGuardFeedbackEvent" ENABLE ROW LEVEL SECURITY;
