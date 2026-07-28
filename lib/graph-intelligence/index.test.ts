import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildWalletGraphIntelligence,
  graphSignalForWallet,
} from "@/lib/graph-intelligence"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function wallet(index: number, overrides: Partial<ParsedWallet> = {}): ParsedWallet {
  return {
    walletAddress: address(index),
    chain: "Ethereum",
    txCount: 30,
    walletAgeDays: 400,
    fundingSource: null,
    firstSeen: "2026-07-01T10:00:00.000Z",
    lastSeen: "2026-07-20T10:00:00.000Z",
    totalVolume: 500,
    contractsCount: 12,
    campaignActionsCount: 1,
    ...overrides,
  }
}

describe("wallet referral and funding graph intelligence", () => {
  it("detects an unknown burst funder and assigns explainable wallet signals", () => {
    const funder = address(900)
    const result = buildWalletGraphIntelligence(
      Array.from({ length: 5 }, (_, index) =>
        wallet(index + 1, {
          fundingSource: funder,
          firstSeen: `2026-07-01T1${index}:00:00.000Z`,
          enrichmentStatus: "completed",
          enrichmentProvider: "alchemy",
        })
      )
    )

    assert.equal(result.graph.externalFunders, 1)
    assert.ok(result.graph.findings.some((finding) => finding.code === "BURST_FUNDING"))
    const signal = graphSignalForWallet(result, address(1), "Ethereum")
    assert.equal(signal.riskDelta, 8)
    assert.match(signal.reasons[0] ?? "", /funded by one unknown source/i)
  })

  it("neutralizes a recognized exchange funding source", () => {
    const binance = "0x28c6c06298d514db089934071355e5743bf21d60"
    const result = buildWalletGraphIntelligence(
      Array.from({ length: 8 }, (_, index) =>
        wallet(index + 1, { fundingSource: binance })
      )
    )

    assert.equal(result.graph.neutralServiceFunders, 1)
    assert.ok(
      result.graph.findings.some(
        (finding) => finding.code === "SERVICE_FUNDER_NEUTRALIZED"
      )
    )
    assert.equal(graphSignalForWallet(result, address(1), "Ethereum").riskDelta, 0)
    assert.ok(result.graph.edges.every((edge) => !edge.isRiskBearing))
  })

  it("raises a strong signal when funding and referral cohorts overlap", () => {
    const operator = address(700)
    const result = buildWalletGraphIntelligence(
      Array.from({ length: 4 }, (_, index) =>
        wallet(index + 1, {
          fundingSource: operator,
          referrerAddress: operator,
        })
      )
    )

    assert.ok(
      result.graph.findings.some(
        (finding) => finding.code === "COORDINATED_REFERRAL_FUNDING"
      )
    )
    assert.ok(graphSignalForWallet(result, address(1), "Ethereum").riskDelta >= 36)
  })

  it("detects circular wallet paths and marks them as hard signals", () => {
    const first = wallet(1, { fundingSource: address(2) })
    const second = wallet(2, { fundingSource: address(1) })
    const result = buildWalletGraphIntelligence([first, second])

    assert.ok(
      result.graph.findings.some(
        (finding) => finding.code === "CIRCULAR_WALLET_PATH"
      )
    )
    assert.equal(graphSignalForWallet(result, address(1), "Ethereum").hardSignal, true)
    assert.equal(graphSignalForWallet(result, address(2), "Ethereum").riskDelta, 30)
  })

  it("keeps ordinary referral fan-out informational when wallets are active", () => {
    const result = buildWalletGraphIntelligence(
      Array.from({ length: 4 }, (_, index) =>
        wallet(index + 1, { referralCode: "COMMUNITY-2026", txCount: 80 })
      )
    )

    const finding = result.graph.findings.find(
      (item) => item.code === "REFERRAL_FANOUT"
    )
    assert.equal(finding?.severity, "info")
    assert.equal(graphSignalForWallet(result, address(1), "Ethereum").riskDelta, 0)
  })

  it("applies admin-managed trusted and known-bad funding intelligence", () => {
    const trustedFunder = address(801)
    const badFunder = address(802)
    const result = buildWalletGraphIntelligence(
      [
        wallet(1, { fundingSource: trustedFunder }),
        wallet(2, { fundingSource: trustedFunder }),
        wallet(3, { fundingSource: badFunder }),
      ],
      {
        trustedFundingSources: {
          [`ethereum:${trustedFunder}`]: "Partner exchange hot wallet",
        },
        knownBadFundingSources: {
          [`ethereum:${badFunder}`]: "Confirmed farm operator",
        },
      }
    )

    assert.equal(result.graph.neutralServiceFunders, 1)
    assert.equal(graphSignalForWallet(result, address(1), "Ethereum").riskDelta, 0)
    assert.equal(graphSignalForWallet(result, address(3), "Ethereum").hardSignal, true)
    assert.ok(result.graph.findings.some((finding) => finding.code === "KNOWN_BAD_FUNDER"))
  })
})
