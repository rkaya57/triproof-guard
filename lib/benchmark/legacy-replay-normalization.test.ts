import assert from "node:assert/strict"
import test from "node:test"

import { normalizeBenchmarkInputForReplay } from "./runner"
import type { BenchmarkWalletInput } from "./schema"

function legacyHeliusInput(
  overrides: Partial<BenchmarkWalletInput> = {}
): BenchmarkWalletInput {
  return {
    walletAddress: "GxjcMTWWDcKx5sxnHkNfPtuTSfV9cLgVkw3G7KvMnvBW",
    chain: "Solana",
    txCount: 1000,
    walletAgeDays: 0,
    fundingSource: null,
    firstSeen: "2026-08-07T18:00:00.000Z",
    lastSeen: "2026-08-07T18:30:00.000Z",
    totalVolume: 1,
    contractsCount: 5,
    campaignActionsCount: null,
    historyTruncated: null,
    enrichmentProvider: "helius",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

test("internal calibration marks legacy Helius 1000-signature snapshots as truncated", () => {
  const input = legacyHeliusInput()
  const normalized = normalizeBenchmarkInputForReplay(
    "internal-calibration-batch-legacy",
    input
  )

  assert.equal(normalized.historyTruncated, true)
  assert.equal(input.historyTruncated, null)
})

test("ordinary benchmark datasets are not rewritten", () => {
  const input = legacyHeliusInput()
  const normalized = normalizeBenchmarkInputForReplay(
    "public-reference-benchmark-v1",
    input
  )

  assert.equal(normalized, input)
  assert.equal(normalized.historyTruncated, null)
})

test("explicit historyTruncated values and non-cap samples are preserved", () => {
  const explicitComplete = legacyHeliusInput({ historyTruncated: false })
  const belowCap = legacyHeliusInput({ txCount: 999 })

  assert.equal(
    normalizeBenchmarkInputForReplay(
      "internal-calibration-batch-legacy",
      explicitComplete
    ).historyTruncated,
    false
  )
  assert.equal(
    normalizeBenchmarkInputForReplay(
      "internal-calibration-batch-legacy",
      belowCap
    ),
    belowCap
  )
})
