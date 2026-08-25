import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { normalizedFundingEventFromEnrichment } from "@/lib/onchain/events/from-enrichment"
import type { EnrichedWalletData } from "@/lib/onchain/enrichment-types"

function baseData(overrides: Partial<EnrichedWalletData> = {}): EnrichedWalletData {
  return {
    walletAddress: "0x1111111111111111111111111111111111111111",
    chain: "Ethereum",
    provider: "etherscan",
    txCount: 10,
    walletAgeDays: 200,
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 2,
    nativeBalance: 1,
    tokenCount: 0,
    contractsCount: 2,
    campaignActionsCount: 1,
    uniqueCounterparties: 4,
    fundingSource: "0x2222222222222222222222222222222222222222",
    firstFundingAt: "2026-01-01T00:00:00.000Z",
    firstFundingAmount: 0.25,
    historyTruncated: false,
    isContract: false,
    knownEntityLabel: null,
    knownEntityType: null,
    rawData: { firstFundingTxHash: "0xabc" },
    ...overrides,
  }
}

describe("normalized funding events from enrichment", () => {
  it("builds an auditable EVM first-funding event", () => {
    const event = normalizedFundingEventFromEnrichment(baseData())
    assert.ok(event)
    assert.equal(event.chain, "ethereum")
    assert.equal(event.chainFamily, "evm")
    assert.equal(event.txHash, "0xabc")
    assert.equal(event.direction, "inbound")
    assert.equal(event.kind, "native_transfer")
    assert.equal(event.assetSymbol, "ETH")
    assert.equal(event.amount, "0.25")
    assert.equal(event.counterpartyAddress, "0x2222222222222222222222222222222222222222")
  })

  it("uses the oldest Solana signature as first-funding transaction identity", () => {
    const event = normalizedFundingEventFromEnrichment(baseData({
      walletAddress: "9xQeWvG816bUx9EPfY4gA3MPrU8LxEw8YgQkV6P8Q3kX",
      chain: "Solana",
      provider: "helius",
      fundingSource: "7YttLkHDoB9hPjDVHj7A9QqPmg4rS7P2SmQ6fD7YbUpN",
      firstFundingAmount: 1.5,
      rawData: { oldestSignature: "5SolanaSignature" },
    }))

    assert.ok(event)
    assert.equal(event.chain, "solana")
    assert.equal(event.chainFamily, "solana")
    assert.equal(event.txHash, "5SolanaSignature")
    assert.equal(event.assetSymbol, "SOL")
    assert.equal(event.fromAddress, "7YttLkHDoB9hPjDVHj7A9QqPmg4rS7P2SmQ6fD7YbUpN")
  })

  it("refuses definitive provenance for truncated history", () => {
    assert.equal(
      normalizedFundingEventFromEnrichment(baseData({ historyTruncated: true })),
      null,
    )
  })

  it("refuses provenance without a real transaction identity", () => {
    assert.equal(
      normalizedFundingEventFromEnrichment(baseData({ rawData: {} })),
      null,
    )
  })
})
