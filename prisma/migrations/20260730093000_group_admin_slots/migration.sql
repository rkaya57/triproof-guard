CREATE TABLE "TelegramGuardianAdmin" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramGuardianAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramGuardianAdmin_groupId_telegramUserId_key" ON "TelegramGuardianAdmin"("groupId", "telegramUserId");
CREATE INDEX "TelegramGuardianAdmin_groupId_idx" ON "TelegramGuardianAdmin"("groupId");
ALTER TABLE "TelegramGuardianAdmin" ADD CONSTRAINT "TelegramGuardianAdmin_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TelegramGuardianGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
