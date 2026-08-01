import { spawnSync } from "node:child_process"

const isProductionDeployment =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production"

if (!isProductionDeployment) {
  console.log("Skipping real Helius provider smoke outside Vercel production.")
  process.exit(0)
}

if (!process.env.HELIUS_API_KEY && !process.env.SOLANA_RPC_URL) {
  console.error(
    "Production deployment blocked: HELIUS_API_KEY or SOLANA_RPC_URL is required for high-volume Solana analysis."
  )
  process.exit(1)
}

console.log("Running production real-data Helius provider smoke...")
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "scripts/test-helius-real-smoke.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      HELIUS_BULK_RPC_RPS: process.env.HELIUS_BULK_RPC_RPS ?? "20",
      HELIUS_BULK_CONCURRENCY:
        process.env.HELIUS_BULK_CONCURRENCY ?? "8",
    },
  }
)

if (result.status !== 0) {
  console.error(
    "Production deployment blocked because the real-data Helius smoke test failed."
  )
  process.exit(result.status ?? 1)
}

console.log("Production real-data Helius provider smoke passed.")
