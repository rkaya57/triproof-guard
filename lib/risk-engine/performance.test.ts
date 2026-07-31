import assert from "node:assert/strict"
import { performance } from "node:perf_hooks"
import { describe, it } from "node:test"

import { analyzeWallets } from "@/lib/risk-engine"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function wallet(index: number): ParsedWallet {
  return {
    walletAddress: address(index + 1),
    chain: "Base",
    txCount: 100 + (index % 20),
    walletAgeDays: 300 + (index % 100),
    fundingSource: address(100_000 + index),
    firstFundingAt: new Date(Date.UTC(2025, 0, 1 + (index % 200))).toISOString(),
    firstFundingAmount: 0.1,
    historyTruncated: false,
    firstSeen: new Date(Date.UTC(2025, 0, 1 + (index % 200))).toISOString(),
    lastSeen: "2026-07-31T00:00:00.000Z",
    totalVolume: 1000 + index,
    contractsCount: 10 + (index % 15),
    campaignActionsCount: 1,
    nativeBalance: 1,
    tokenCount: 6,
    uniqueCounterparties: 30 + (index % 20),
    lastActiveDaysAgo: 1,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: [`program-${index}`, `action-${index}`],
    campaignQualityScore: 90,
    campaignOnlyRatio: 0.03,
    behaviorDiversityScore: 90,
    botScriptScore: 4,
    enrichmentProvider: "performance-fixture",
    enrichmentStatus: "completed",
  }
}

describe("Sybil engine performance smoke test", () => {
  it("analyzes 1,000 independent wallets within a bounded CI budget", () => {
    const wallets = Array.from({ length: 1000 }, (_, index) => wallet(index))
    const heapBefore = process.memoryUsage().heapUsed
    const startedAt = performance.now()
    const result = analyzeWallets(wallets)
    const durationMs = performance.now() - startedAt
    const heapDelta = process.memoryUsage().heapUsed - heapBefore

    assert.equal(result.totalWallets, 1000)
    assert.equal(result.rejectedCount, 0)
    assert.ok(durationMs < 30_000, `Expected <30s, received ${durationMs.toFixed(1)}ms`)
    assert.ok(
      heapDelta < 512 * 1024 * 1024,
      `Expected <512MB heap growth, received ${(heapDelta / 1024 / 1024).toFixed(1)}MB`
    )
  })
})
