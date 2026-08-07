import { spawnSync } from "node:child_process"

const isolatedEnv = { ...process.env }

for (const key of [
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "SOLANA_RPC_URL",
  "HELIUS_API_KEY",
  "ALCHEMY_API_KEY",
  "EVM_RPC_URL",
  "ETH_RPC_URL",
  "ETHEREUM_RPC_URL",
  "ETHERSCAN_API_KEY",
  "BLOCKSCOUT_API_URL",
  "BASESCAN_API_KEY",
  "ARBISCAN_API_KEY",
  "OPTIMISTIC_ETHERSCAN_API_KEY",
  "POLYGONSCAN_API_KEY",
  "BSCSCAN_API_KEY",
  "SCAMGUARD_THREAT_FEED_URLS",
]) {
  delete isolatedEnv[key]
}

isolatedEnv.NODE_ENV = "test"
isolatedEnv.SCAMGUARD_DISABLE_THREAT_FEEDS = "1"
isolatedEnv.SCAMGUARD_TEST_ISOLATION = "1"

const testFiles = [
  "lib/scamguard/html-fingerprint.test.ts",
  "lib/scamguard/scam-dna.test.ts",
  "lib/scamguard/url-sandbox.test.ts",
  "lib/scamguard/engine.test.ts",
  "lib/telegram/bot.test.ts",
  "lib/telegram/safe-update.test.ts",
]

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  {
    cwd: process.cwd(),
    env: isolatedEnv,
    stdio: "inherit",
  }
)

if (result.error) {
  console.error("Failed to start isolated ScamGuard safety tests:", result.error)
  process.exit(1)
}

if (result.signal) {
  console.error(`Isolated ScamGuard safety tests terminated by signal ${result.signal}.`)
  process.exit(1)
}

process.exit(result.status ?? 1)
