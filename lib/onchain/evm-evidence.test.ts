import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { summarizeEvmActivity } from "@/lib/onchain/evm-evidence"
import {
  buildWalletGraphIntelligence,
  graphSignalForWallet,
} from "@/lib/graph-intelligence"
import { detectKnownEntity } from "@/lib/risk-engine/known-entities"
import type { ParsedWallet } from "@/types"

const wallet = "0x1111111111111111111111111111111111111111"
const funder = "0x2222222222222222222222222222222222222222"
const campaign = "0x3333333333333333333333333333333333333333"
const token = "0x4444444444444444444444444444444444444444"

function graphWallet(index: number, fundingSource: string): ParsedWallet {
  return {
    walletAddress: `0x${index.toString(16).padStart(40, "0")}`,
    chain: "Ethereum",
    txCount: 80 + index,
    walletAgeDays: 300 + index,
    fundingSource,
    firstFundingAt: `2026-07-01T10:0${index}:00.000Z`,
    firstFundingAmount: 0.2,
    historyTruncated: false,
    firstSeen: "2025-01-01T00:00:00.000Z",
    lastSeen: "2026-08-01T00:00:00.000Z",
    totalVolume: 500,
    contractsCount: 10,
    campaignActionsCount: 2,
    enrichmentProvider: "etherscan",
    enrichmentStatus: "completed",
  }
}

describe("EVM evidence summarizer", () => {
  it("preserves first-funding, campaign, diversity, and method evidence", () => {
    const result = summarizeEvmActivity({
      address: wallet.toUpperCase(),
      now: Date.parse("2026-08-07T00:00:00.000Z"),
      campaignContracts: [campaign.toUpperCase()],
      activities: [
        {
          hash: "0x01",
          timestamp: "2026-01-01T00:00:00.000Z",
          from: funder,
          to: wallet,
          nativeValue: 0.25,
          category: "external",
        },
        {
          hash: "0x02",
          timestamp: "2026-01-02T00:00:00.000Z",
          from: wallet,
          to: campaign,
          nativeValue: 0.01,
          input: "0xabcdef1200000000",
          category: "external",
        },
        {
          hash: "0x03",
          timestamp: "2026-01-03T00:00:00.000Z",
          from: wallet,
          to: campaign,
          nativeValue: 0,
          tokenContract: token,
          input: "0xabcdef1200000000",
          category: "erc20",
        },
      ],
    })

    assert.equal(result.txCount, 3)
    assert.equal(result.fundingSource, funder)
    assert.equal(result.firstFundingAt, "2026-01-01T00:00:00.000Z")
    assert.equal(result.firstFundingAmount, 0.25)
    assert.equal(result.firstSeen, "2026-01-01T00:00:00.000Z")
    assert.equal(result.lastSeen, "2026-01-03T00:00:00.000Z")
    assert.equal(result.historyTruncated, false)
    assert.equal(result.totalVolume, 0.26)
    assert.equal(result.tokenCount, 1)
    assert.equal(result.contractsCount, 1)
    assert.equal(result.uniqueCounterparties, 2)
    assert.equal(result.campaignActionsCount, 2)
    assert.equal(result.campaignOnlyRatio, 2 / 3)
    assert.deepEqual(result.behaviorFingerprint, ["0xabcdef12"])
    assert.ok((result.walletAgeDays ?? 0) > 200)
  })

  it("does not treat a sampled history window as proof of wallet age", () => {
    const result = summarizeEvmActivity({
      address: wallet,
      now: Date.parse("2026-08-07T00:00:00.000Z"),
      historyTruncated: true,
      activities: [
        {
          hash: "0x11",
          timestamp: "2026-08-01T00:00:00.000Z",
          from: funder,
          to: wallet,
          nativeValue: 1,
          category: "external",
        },
      ],
    })

    assert.equal(result.historyTruncated, true)
    assert.equal(result.walletAgeDays, null)
    assert.equal(result.firstSeen, "2026-08-01T00:00:00.000Z")
    assert.equal(result.fundingSource, funder)
  })

  it("keeps ERC-20 values out of native-volume and funding-amount semantics", () => {
    const result = summarizeEvmActivity({
      address: wallet,
      activities: [
        {
          hash: "0x21",
          timestamp: "2026-07-01T00:00:00.000Z",
          from: funder,
          to: wallet,
          nativeValue: null,
          tokenContract: token,
          category: "erc20",
        },
        {
          hash: "0x22",
          timestamp: "2026-07-02T00:00:00.000Z",
          from: wallet,
          to: campaign,
          nativeValue: null,
          tokenContract: token,
          category: "erc20",
        },
      ],
    })

    assert.equal(result.totalVolume, 0)
    assert.equal(result.fundingSource, null)
    assert.equal(result.firstFundingAmount, null)
    assert.equal(result.tokenCount, 1)
    assert.equal(result.contractsCount, null)
    assert.deepEqual(result.behaviorFingerprint, [`token:${token}`])
  })

  it("deduplicates transfer rows that represent the same EVM transaction hash", () => {
    const result = summarizeEvmActivity({
      address: wallet,
      activities: [
        {
          hash: "0x31",
          timestamp: "2026-07-01T00:00:00.000Z",
          from: wallet,
          to: campaign,
          nativeValue: 0.1,
          category: "external",
        },
        {
          hash: "0x31",
          timestamp: "2026-07-01T00:00:00.000Z",
          from: wallet,
          to: campaign,
          nativeValue: null,
          tokenContract: token,
          category: "erc20",
        },
      ],
      campaignContracts: [campaign],
    })

    assert.equal(result.txCount, 1)
    assert.equal(result.campaignActionsCount, 1)
    assert.equal(result.campaignOnlyRatio, 1)
  })

  it("neutralizes canonical EVM bridge fan-out instead of calling it Sybil funding", () => {
    const optimismPortal = "0xbEb5Fc579115071764c7423A4f12eDde41f106Ed"
    const entity = detectKnownEntity(optimismPortal)
    assert.equal(entity?.type, "bridge")

    const graph = buildWalletGraphIntelligence(
      Array.from({ length: 5 }, (_, index) =>
        graphWallet(index + 1, optimismPortal)
      )
    )

    assert.equal(graph.graph.neutralServiceFunders, 1)
    assert.ok(
      graph.graph.findings.some(
        (finding) => finding.code === "SERVICE_FUNDER_NEUTRALIZED"
      )
    )
    assert.ok(
      !graph.graph.findings.some((finding) => finding.code === "BURST_FUNDING")
    )
    assert.equal(
      graphSignalForWallet(graph, graphWallet(1, optimismPortal).walletAddress, "Ethereum")
        .riskDelta,
      0
    )
    assert.ok(graph.graph.edges.every((edge) => !edge.isRiskBearing))
  })
})
