import assert from "node:assert/strict"
import test from "node:test"
import { enrichWallets } from "@/lib/onchain/enrich-wallet"

test("a fully checkpointed batch needs neither providers nor network calls", async () => {
  for (const addresses of [[], [" ", ""]]) {
    const { results, summary } = await enrichWallets({ addresses, chain: "unconfigured-fixture-chain", mode: "onchain" })
    assert.equal(results.size, 0)
    assert.equal(summary.enrichedCount, 0)
    assert.equal(summary.failedCount, 0)
    assert.equal(summary.usedMockFallback, false)
  }
})
