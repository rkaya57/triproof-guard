import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  analysisWalletBatchSize,
  highVolumeCapacityReport,
} from "@/lib/analysis/high-volume"

const originalAlchemyKey = process.env.ALCHEMY_API_KEY
const originalScreeningBatchSize = process.env.SOLANA_SCREENING_BATCH_SIZE
const originalDeepBatchSize = process.env.SOLANA_DEEP_HISTORY_BATCH_SIZE
const originalLargeBatchSize = process.env.ANALYSIS_WALLET_BATCH_SIZE
const originalAlchemyRps = process.env.ALCHEMY_SOLANA_HISTORY_RPS

afterEach(() => {
  if (originalAlchemyKey === undefined) delete process.env.ALCHEMY_API_KEY
  else process.env.ALCHEMY_API_KEY = originalAlchemyKey
  if (originalScreeningBatchSize === undefined) delete process.env.SOLANA_SCREENING_BATCH_SIZE
  else process.env.SOLANA_SCREENING_BATCH_SIZE = originalScreeningBatchSize
  if (originalDeepBatchSize === undefined) delete process.env.SOLANA_DEEP_HISTORY_BATCH_SIZE
  else process.env.SOLANA_DEEP_HISTORY_BATCH_SIZE = originalDeepBatchSize
  if (originalLargeBatchSize === undefined) delete process.env.ANALYSIS_WALLET_BATCH_SIZE
  else process.env.ANALYSIS_WALLET_BATCH_SIZE = originalLargeBatchSize
  if (originalAlchemyRps === undefined) delete process.env.ALCHEMY_SOLANA_HISTORY_RPS
  else process.env.ALCHEMY_SOLANA_HISTORY_RPS = originalAlchemyRps
})

describe("Solana analysis capacity planning", () => {
  it("uses a resumable screening batch for normal dashboard-sized campaigns", () => {
    process.env.SOLANA_SCREENING_BATCH_SIZE = "100"

    assert.equal(
      analysisWalletBatchSize({
        chain: "Solana",
        walletCount: 227,
        fallback: 4,
        deepHistory: false,
      }),
      100
    )
  })

  it("keeps deep-history batches intentionally small", () => {
    process.env.SOLANA_DEEP_HISTORY_BATCH_SIZE = "10"

    assert.equal(
      analysisWalletBatchSize({
        chain: "Solana",
        walletCount: 1_000,
        fallback: 4,
        deepHistory: true,
      }),
      10
    )
  })

  it("uses the high-volume batch size for 1,000-wallet screening", () => {
    process.env.ANALYSIS_WALLET_BATCH_SIZE = "250"

    assert.equal(
      analysisWalletBatchSize({
        chain: "Solana",
        walletCount: 1_000,
        fallback: 4,
        deepHistory: false,
      }),
      250
    )
  })

  it("reports the Alchemy-first screening plan instead of legacy Helius bulk", () => {
    process.env.ALCHEMY_API_KEY = "alchemy-test-key"
    process.env.ALCHEMY_SOLANA_HISTORY_RPS = "5"

    const capacity = highVolumeCapacityReport({
      chain: "Solana",
      walletCount: 100,
      deepHistory: false,
    })

    assert.equal(capacity.profile, "alchemy_campaign_screening")
    assert.equal(capacity.provider, "alchemy-history + helius-state")
    assert.equal(capacity.estimatedRequests, 201)
    assert.equal(capacity.estimatedProviderSeconds, 40)
    assert.equal(capacity.deepReviewDeferred, true)
  })
})
