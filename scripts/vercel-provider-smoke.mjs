import { spawnSync } from "node:child_process"

const isProductionDeployment =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production"

if (!isProductionDeployment) {
  console.log(
    "Skipping real Helius, Alchemy Solana, Alchemy EVM, and Etherscan provenance smokes outside Vercel production."
  )
  process.exit(0)
}

if (!process.env.HELIUS_API_KEY && !process.env.SOLANA_RPC_URL) {
  console.error(
    "Production deployment blocked: HELIUS_API_KEY or SOLANA_RPC_URL is required for batched Solana account-state enrichment."
  )
  process.exit(1)
}

if (!process.env.ALCHEMY_API_KEY) {
  console.error(
    "Production deployment blocked: ALCHEMY_API_KEY is required for Solana history and live EVM provider validation."
  )
  process.exit(1)
}

if (!process.env.ETHERSCAN_API_KEY) {
  console.error(
    "Production deployment blocked: ETHERSCAN_API_KEY is required for live EVM deployer/factory/proxy provenance validation."
  )
  process.exit(1)
}

function runSmoke(label, script, extraEnv = {}) {
  console.log(`Running production ${label}...`)
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", script],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv,
      },
    }
  )

  if (result.status !== 0) {
    console.error(`Production deployment blocked because ${label} failed.`)
    process.exit(result.status ?? 1)
  }
  console.log(`Production ${label} passed.`)
}

runSmoke("real-data Helius state smoke", "scripts/test-helius-real-smoke.ts", {
  HELIUS_BULK_RPC_RPS: process.env.HELIUS_BULK_RPC_RPS ?? "8",
  HELIUS_BULK_CONCURRENCY:
    process.env.HELIUS_BULK_CONCURRENCY ?? "4",
})

runSmoke(
  "real-data Alchemy Solana history smoke",
  "scripts/test-alchemy-solana-real-smoke.ts",
  {
    ALCHEMY_SOLANA_HISTORY_RPS:
      process.env.ALCHEMY_SOLANA_HISTORY_RPS ?? "5",
    ALCHEMY_SOLANA_WALLET_CONCURRENCY:
      process.env.ALCHEMY_SOLANA_WALLET_CONCURRENCY ?? "2",
    HELIUS_STATE_RPS: process.env.HELIUS_STATE_RPS ?? "8",
  }
)

runSmoke(
  "real-data Alchemy Ethereum evidence smoke",
  "scripts/test-alchemy-evm-real-smoke.ts",
  {
    ALCHEMY_EVM_MAX_TRANSFER_PAGES: "1",
  }
)

runSmoke(
  "real-data Etherscan Ethereum provenance smoke",
  "scripts/test-etherscan-evm-provenance-smoke.ts"
)
