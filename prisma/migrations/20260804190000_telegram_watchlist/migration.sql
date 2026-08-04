CREATE TABLE "TelegramWatchlist" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "domain" TEXT,
    "chain" TEXT NOT NULL DEFAULT 'unknown',
    "scanType" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRiskLevel" TEXT,
    "lastScore" INTEGER,
    "lastAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramWatchlist_telegramUserId_targetHash_key" ON "TelegramWatchlist"("telegramUserId", "targetHash");
CREATE INDEX "TelegramWatchlist_telegramUserId_active_idx" ON "TelegramWatchlist"("telegramUserId", "active");
CREATE INDEX "TelegramWatchlist_targetHash_active_idx" ON "TelegramWatchlist"("targetHash", "active");
