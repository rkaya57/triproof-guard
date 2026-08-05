-- Professional authentication hardening: verified email, revocable sessions,
-- one-time tokens, persistent rate limits, OAuth identities, linked wallets,
-- onboarding, referrals, and security audit events.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accountRole" TEXT,
  ADD COLUMN IF NOT EXISTS "primaryUseCase" TEXT,
  ADD COLUMN IF NOT EXISTS "profileProjectName" TEXT,
  ADD COLUMN IF NOT EXISTS "profileProjectWebsite" TEXT,
  ADD COLUMN IF NOT EXISTS "profileXHandle" TEXT,
  ADD COLUMN IF NOT EXISTS "profileTelegramHandle" TEXT,
  ADD COLUMN IF NOT EXISTS "referralCode" TEXT,
  ADD COLUMN IF NOT EXISTS "referredByUserId" TEXT;

-- Existing accounts predate email verification, legal-consent recording, and
-- onboarding. Preserve their current access while enforcing the new lifecycle for
-- accounts created after this migration. Give every existing account a stable,
-- non-identifying referral code.
UPDATE "User"
SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
    "termsAcceptedAt" = COALESCE("termsAcceptedAt", "createdAt"),
    "privacyAcceptedAt" = COALESCE("privacyAcceptedAt", "createdAt"),
    "onboardingCompletedAt" = COALESCE("onboardingCompletedAt", "createdAt"),
    "referralCode" = COALESCE(
      "referralCode",
      UPPER(SUBSTRING(MD5("id" || ':triproof-referral-v1') FROM 1 FOR 16))
    )
WHERE "emailVerifiedAt" IS NULL
   OR "termsAcceptedAt" IS NULL
   OR "privacyAcceptedAt" IS NULL
   OR "onboardingCompletedAt" IS NULL
   OR "referralCode" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX IF NOT EXISTS "User_referredByUserId_idx" ON "User"("referredByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_referredByUserId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_referredByUserId_fkey"
      FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AuthSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

CREATE TABLE IF NOT EXISTS "AuthToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "metadata" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthToken_userId_type_expiresAt_idx" ON "AuthToken"("userId", "type", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuthToken_type_expiresAt_idx" ON "AuthToken"("type", "expiresAt");

CREATE TABLE IF NOT EXISTS "AuthRateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "AuthRateLimitBucket_expiresAt_idx" ON "AuthRateLimitBucket"("expiresAt");

CREATE TABLE IF NOT EXISTS "AuthSecurityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT FALSE,
  "ipHash" TEXT,
  "identifierHash" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthSecurityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuthSecurityEvent_userId_createdAt_idx" ON "AuthSecurityEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthSecurityEvent_type_createdAt_idx" ON "AuthSecurityEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "AuthSecurityEvent_ipHash_createdAt_idx" ON "AuthSecurityEvent"("ipHash", "createdAt");

CREATE TABLE IF NOT EXISTS "AuthExternalAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthExternalAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthExternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthExternalAccount_provider_providerAccountId_key" ON "AuthExternalAccount"("provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "AuthExternalAccount_userId_idx" ON "AuthExternalAccount"("userId");

CREATE TABLE IF NOT EXISTS "AuthWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chain" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "AuthWallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuthWallet_chain_address_key" ON "AuthWallet"("chain", "address");
CREATE INDEX IF NOT EXISTS "AuthWallet_userId_idx" ON "AuthWallet"("userId");

-- These tables contain authentication secrets and security telemetry. Direct
-- anon/authenticated Supabase API access is intentionally denied; the server-side
-- database role used by the application remains responsible for access control.
ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthRateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthSecurityEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthExternalAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthWallet" ENABLE ROW LEVEL SECURITY;
