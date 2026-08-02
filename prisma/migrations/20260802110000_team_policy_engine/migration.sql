CREATE TYPE "TeamPolicyAction" AS ENUM ('ALLOW', 'REVIEW', 'BLOCK');
CREATE TYPE "TeamPolicyRuleType" AS ENUM ('DOMAIN_ALLOWLIST', 'DOMAIN_BLOCK', 'EVM_SPENDER_BLOCK', 'UNLIMITED_APPROVAL_BLOCK', 'SOLANA_AUTHORITY_CHANGE_BLOCK');

CREATE TABLE "TeamSecurityPolicy" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamSecurityPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamSecurityPolicyRule" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "type" "TeamPolicyRuleType" NOT NULL,
  "value" TEXT,
  "action" "TeamPolicyAction" NOT NULL DEFAULT 'BLOCK',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamSecurityPolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamPolicyViolation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "policyId" TEXT,
  "ruleId" TEXT,
  "target" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "chain" TEXT,
  "action" "TeamPolicyAction" NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamPolicyViolation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TeamSecurityPolicy_userId_active_idx" ON "TeamSecurityPolicy"("userId", "active");
CREATE INDEX "TeamSecurityPolicyRule_policyId_active_idx" ON "TeamSecurityPolicyRule"("policyId", "active");
CREATE INDEX "TeamSecurityPolicyRule_type_active_idx" ON "TeamSecurityPolicyRule"("type", "active");
CREATE INDEX "TeamPolicyViolation_userId_createdAt_idx" ON "TeamPolicyViolation"("userId", "createdAt");
CREATE INDEX "TeamPolicyViolation_policyId_createdAt_idx" ON "TeamPolicyViolation"("policyId", "createdAt");

ALTER TABLE "TeamSecurityPolicy" ADD CONSTRAINT "TeamSecurityPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamSecurityPolicyRule" ADD CONSTRAINT "TeamSecurityPolicyRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TeamSecurityPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamPolicyViolation" ADD CONSTRAINT "TeamPolicyViolation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamPolicyViolation" ADD CONSTRAINT "TeamPolicyViolation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "TeamSecurityPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
