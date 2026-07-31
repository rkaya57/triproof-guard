import { performance } from "node:perf_hooks"

import { analyzeWallets } from "@/lib/risk-engine"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function wallet(index: number): ParsedWallet {
  return {
    walletAddress: address(index + 1),
    chain: "Base",
    txCount: 80 + (index % 40),
    walletAgeDays: 180 + (index % 500),
    fundingSource: address(1_000_000 + index),
    firstFundingAt: new Date(Date.UTC(2024, 0, 1 + (index % 300))).toISOString(),
    firstFundingAmount: 0.05 + (index % 10) / 100,
    historyTruncated: false,
    firstSeen: new Date(Date.UTC(2024, 0, 1 + (index % 300))).toISOString(),
    lastSeen: "2026-07-31T00:00:00.000Z",
    totalVolume: 100 + index,
    contractsCount: 8 + (index % 20),
    campaignActionsCount: index % 3,
    nativeBalance: 0.5,
    tokenCount: 4 + (index % 8),
    uniqueCounterparties: 20 + (index % 60),
    lastActiveDaysAgo: index % 30,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: [`program-${index % 97}`, `action-${index % 41}`],
    campaignQualityScore: 88,
    campaignOnlyRatio: 0.05,
    behaviorDiversityScore: 82,
    botScriptScore: 8,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    enrichmentProvider: "benchmark",
    enrichmentStatus: "completed",
  }
}

function parseSizes() {
  const values = (process.env.BENCHMARK_SIZES ?? "1000,10000,50000")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
  return values.length ? values : [1000]
}

for (const size of parseSizes()) {
  const wallets = Array.from({ length: size }, (_, index) => wallet(index))
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  const result = analyzeWallets(wallets)
  const durationMs = performance.now() - startedAt
  const heapAfter = process.memoryUsage().heapUsed

  console.log(
    JSON.stringify({
      wallets: size,
      durationMs: Number(durationMs.toFixed(1)),
      heapDeltaMb: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(1)),
      approved: result.approvedCount,
      manualReview: result.manualReviewCount,
      rejected: result.rejectedCount,
      clusters: result.clusters.length,
      graphNodes: result.graph.totalNodes,
      graphEdges: result.graph.totalEdges,
    })
  )
}
