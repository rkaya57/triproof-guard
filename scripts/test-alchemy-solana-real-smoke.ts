import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"

import { enrichSolanaWalletsAlchemyHybrid } from "@/lib/onchain/providers/alchemy-solana-bulk"

const addresses = [
  "21m6NtjiXGY52p6DooTKTmtXg8PCm6Cgyzo8HsWRhiR4",
  "2cu8QYZZa2RzJiq6nztLAdLdFqtKuxxt4MP8WCw1S2ws",
]

async function main() {
  assert.ok(
    process.env.ALCHEMY_API_KEY,
    "ALCHEMY_API_KEY is required for the production Solana history path"
  )

  const startedAt = performance.now()
  const output = await enrichSolanaWalletsAlchemyHybrid({
    addresses,
    options: { deepHistory: false },
  })
  const values = Array.from(output.results.values())
  const completed = values.filter((result) => result.status === "completed")
  const failed = values.filter((result) => result.status === "failed")

  assert.equal(output.results.size, addresses.length)
  assert.equal(failed.length, 0)
  assert.equal(completed.length, addresses.length)
  assert.ok(
    completed.every((result) => result.provider.startsWith("alchemy+")),
    "Every smoke-test wallet must use Alchemy as its primary history provider"
  )
  assert.ok(output.alchemyRequestCount >= addresses.length * 2)
  assert.ok(
    completed.every((result) => {
      const raw = result.data.rawData as Record<string, unknown> | undefined
      return raw?.historyProvider === "alchemy"
    }),
    "Persisted audit metadata must identify Alchemy as the history provider"
  )

  console.log(
    JSON.stringify({
      supplied: addresses.length,
      completed: completed.length,
      failed: failed.length,
      providers: Array.from(new Set(completed.map((result) => result.provider))),
      alchemyRequests: output.alchemyRequestCount,
      stateRequests: output.stateRequestCount,
      recoveredRateLimits: output.rateLimitCount,
      elapsedMs: Number((performance.now() - startedAt).toFixed(1)),
    })
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
