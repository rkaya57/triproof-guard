-- Browser extension device pairing and revocable subscription access.
CREATE TABLE IF NOT EXISTS "ExtensionConnectRequest" (
  "id" TEXT NOT NULL,
  "verificationCodeHash" TEXT NOT NULL,
  "pollTokenHash" TEXT NOT NULL,
  "deviceName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "userId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "extensionTokenId" TEXT,
  "extensionTokenExpiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtensionConnectRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnectRequest_pollTokenHash_key" ON "ExtensionConnectRequest"("pollTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "ExtensionConnectRequest_extensionTokenId_key" ON "ExtensionConnectRequest"("extensionTokenId");
CREATE INDEX IF NOT EXISTS "ExtensionConnectRequest_status_expiresAt_idx" ON "ExtensionConnectRequest"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "ExtensionConnectRequest_userId_createdAt_idx" ON "ExtensionConnectRequest"("userId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExtensionConnectRequest_userId_fkey') THEN
    ALTER TABLE "ExtensionConnectRequest"
      ADD CONSTRAINT "ExtensionConnectRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
