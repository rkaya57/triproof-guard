import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { enrichmentDataFromSerializedBatchResults } from "@/lib/onchain/events/sync-analysis-events"

const walletData = {
  walletAddress: "0x1111111111111111111111111111111111111111",
  chain: "Ethereum",
  provider: "etherscan",
  txCount: 1,
  walletAgeDays: 10,
  firstSeen: "2026-01-01T00:00:00.000Z",
  lastSeen: "2026-01-01T00:00:00.000Z",
  totalVolume: 1,
  nativeBalance: 1,
  tokenCount: 0,
  contractsCount: 0,
  campaignActionsCount: 0,
  uniqueCounterparties: 1,
  fundingSource: "0x2222222222222222222222222222222222222222",
  firstFundingAt: "2026-01-01T00:00:00.000Z",
  firstFundingAmount: 1,
  historyTruncated: false,
  isContract: false,
  knownEntityLabel: null,
  knownEntityType: null,
}

describe("analysis normalized-event sync parsing", () => {
  it("extracts only completed enrichment data", () => {
    const serialized = JSON.stringify([
      {
        address: walletData.walletAddress,
        result: {
          data: walletData,
          status: "completed",
          provider: "etherscan",
          fromCache: false,
          errorMessage: null,
        },
      },
      {
        address: "0x3333333333333333333333333333333333333333",
        result: {
          data: { ...walletData, walletAddress: "0x3333333333333333333333333333333333333333" },
          status: "failed",
          provider: "etherscan",
          fromCache: false,
          errorMessage: "provider unavailable",
        },
      },
    ])

    const results = enrichmentDataFromSerializedBatchResults(serialized)
    assert.equal(results.length, 1)
    assert.equal(results[0]?.walletAddress, walletData.walletAddress)
  })

  it("fails closed on malformed batch payloads", () => {
    assert.deepEqual(enrichmentDataFromSerializedBatchResults("not-json"), [])
    assert.deepEqual(enrichmentDataFromSerializedBatchResults({}), [])
  })
})
