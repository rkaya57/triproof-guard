import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { analyzeWallets } from "@/lib/risk-engine"
import type { ParsedWallet } from "@/types"

function wallet(): ParsedWallet {
  return {
    walletAddress: "0x00000000000000000000000000000000000000c1",
    chain: "Base",
    txCount: 150,
    walletAgeDays: 700,
    fundingSource: "0x00000000000000000000000000000000000000f1",
    firstFundingAt: "2024-01-01T00:00:00.000Z",
    firstFundingAmount: 1,
    historyTruncated: false,
    firstSeen: "2024-01-01T00:00:00.000Z",
    lastSeen: "2026-07-31T00:00:00.000Z",
    totalVolume: 5000,
    contractsCount: 24,
    campaignActionsCount: 1,
    nativeBalance: 2,
    tokenCount: 12,
    uniqueCounterparties: 80,
    lastActiveDaysAgo: 1,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: ["swap", "bridge", "stake"],
    campaignQualityScore: 95,
    campaignOnlyRatio: 0.02,
    behaviorDiversityScore: 92,
    botScriptScore: 2,
    enrichmentProvider: "fixture",
    enrichmentStatus: "completed",
  }
}

describe("cross-campaign evidence safety", () => {
  it("requires manual review when trusted and confirmed-risk history conflict", () => {
    const target = wallet()
    const result = analyzeWallets(
      [target],
      null,
      "balanced",
      null,
      {
        walletSignals: {
          [target.walletAddress.toLowerCase()]: {
            priorAnalyses: 3,
            confirmedRiskCount: 1,
            reviewedRejectionCount: 1,
            trustedUserCount: 2,
          },
        },
      }
    )

    const analyzed = result.wallets[0]
    assert.equal(analyzed?.status, "manual_review")
    assert.equal(analyzed?.recommendedAction, "manual_review")
    assert.ok(
      analyzed?.reasons.some((reason) => reason.includes("Cross-campaign conflict"))
    )
    assert.ok(
      analyzed?.reasons.some((reason) => reason.includes("cross_campaign_conflict"))
    )
  })

  it("does not let trusted-only history lower current scrutiny", () => {
    const target = wallet()
    const baseline = analyzeWallets([target]).wallets[0]
    const trustedOnly = analyzeWallets(
      [target],
      null,
      "balanced",
      null,
      {
        walletSignals: {
          [target.walletAddress.toLowerCase()]: {
            priorAnalyses: 2,
            confirmedRiskCount: 0,
            reviewedRejectionCount: 0,
            trustedUserCount: 2,
          },
        },
      }
    ).wallets[0]

    assert.equal(trustedOnly?.status, baseline?.status)
    assert.equal(trustedOnly?.riskScore, baseline?.riskScore)
  })
})
