import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { fundingContextKey, normalizeGraphAddress } from "@/lib/graph-intelligence"
import { analyzeWallets } from "@/lib/risk-engine"
import type { ParsedWallet } from "@/types"

function address(index: number) {
  return `0x${index.toString(16).padStart(40, "0")}`
}

function wallet(index: number, overrides: Partial<ParsedWallet> = {}): ParsedWallet {
  return {
    walletAddress: address(index),
    chain: "Base",
    txCount: 120 + index,
    walletAgeDays: 420 + index,
    fundingSource: address(9000 + index),
    firstFundingAt: `2025-01-${String((index % 20) + 1).padStart(2, "0")}T08:00:00.000Z`,
    firstFundingAmount: 0.25,
    historyTruncated: false,
    firstSeen: "2025-01-01T00:00:00.000Z",
    lastSeen: "2026-07-31T00:00:00.000Z",
    totalVolume: 2500 + index,
    contractsCount: 12 + index,
    campaignActionsCount: 2,
    nativeBalance: 1,
    tokenCount: 8,
    uniqueCounterparties: 40 + index,
    lastActiveDaysAgo: 2,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: [`organic-${index}`, `program-${index}`],
    campaignQualityScore: 90,
    campaignOnlyRatio: 0.05,
    behaviorDiversityScore: 90,
    botScriptScore: 5,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    enrichmentProvider: "fixture",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

describe("Sybil engine safety boundary", () => {
  it("keeps a large referral plus campaign-event cohort in manual review", () => {
    const wallets = Array.from({ length: 12 }, (_, index) =>
      wallet(index + 1, {
        referrerAddress: address(8000),
        referralTimestamp: `2026-07-31T10:${String(index).padStart(2, "0")}:00.000Z`,
        campaignEventAt: `2026-07-31T11:${String(index).padStart(2, "0")}:00.000Z`,
        campaignEventType: "social-task",
        campaignPoints: 20,
      })
    )

    const result = analyzeWallets(wallets)

    assert.equal(result.clusters.length, 1)
    assert.equal(result.clusters[0]?.walletCount, 12)
    assert.equal(result.clusters[0]?.suggestedAction, "manual_review")
    assert.equal(result.rejectedCount, 0)
    assert.equal(result.manualReviewCount, 12)
    assert.ok(
      result.wallets.every((item) =>
        item.reasons.some((reason) => reason.includes("weak_cluster_evidence"))
      )
    )
  })

  it("keeps a four-wallet corroborated cluster in manual review below the severe-cluster threshold", () => {
    const sharedFunder = address(7000)
    const wallets = Array.from({ length: 4 }, (_, index) =>
      wallet(100 + index, {
        fundingSource: sharedFunder,
        firstFundingAt: `2026-07-31T08:0${index}:00.000Z`,
        txCount: 20,
        walletAgeDays: 80,
        contractsCount: 5,
        tokenCount: 3,
        behaviorFingerprint: ["swap", "claim", "stake"],
      })
    )

    const result = analyzeWallets(wallets)

    assert.equal(result.clusters.length, 1)
    assert.equal(result.clusters[0]?.walletCount, 4)
    assert.equal(result.clusters[0]?.suggestedAction, "manual_review")
    assert.equal(result.rejectedCount, 0)
    assert.equal(result.manualReviewCount, 4)
  })

  it("treats imported policy labels as context instead of engine overrides", () => {
    const cleanButCustomerRejected = wallet(300, {
      policyAction: "reject",
      reputationLabel: "legacy_reject",
      policyReason: "Imported from a previous campaign",
    })
    const riskyButCustomerApproved = wallet(301, {
      policyAction: "approve",
      reputationLabel: "legacy_allowlist",
      referrerAddress: address(301),
    })

    const result = analyzeWallets([cleanButCustomerRejected, riskyButCustomerApproved])
    const clean = result.wallets.find(
      (item) => item.walletAddress === cleanButCustomerRejected.walletAddress
    )
    const risky = result.wallets.find(
      (item) => item.walletAddress === riskyButCustomerApproved.walletAddress
    )

    assert.equal(clean?.status, "approved")
    assert.notEqual(risky?.status, "approved")
    assert.ok(
      clean?.reasons.some((reason) => reason.includes("context retained without overriding"))
    )
    assert.ok(
      risky?.reasons.some((reason) => reason.includes("context retained without overriding"))
    )
  })

  it("separates insufficient data from a Sybil rejection", () => {
    const noData = wallet(400, {
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      firstFundingAt: null,
      firstFundingAmount: null,
      firstSeen: null,
      lastSeen: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      nativeBalance: null,
      tokenCount: null,
      uniqueCounterparties: null,
      lastActiveDaysAgo: null,
      isContract: null,
      accountType: null,
      behaviorFingerprint: null,
      campaignQualityScore: null,
      campaignOnlyRatio: null,
      behaviorDiversityScore: null,
      botScriptScore: null,
      enrichmentProvider: null,
      enrichmentStatus: null,
    })

    const result = analyzeWallets([noData])
    const analyzed = result.wallets[0]

    assert.equal(analyzed?.status, "manual_review")
    assert.equal(analyzed?.recommendedAction, "manual_review")
    assert.equal(result.rejectedCount, 0)
    assert.ok(
      analyzed?.reasons.some((reason) => reason.includes("insufficient_data"))
    )
    assert.match(analyzed?.statusExplanation ?? "", /not classified as Sybil/i)
  })

  it("preserves Solana base58 case in normalized addresses and context keys", () => {
    const solanaAddress = "AbCdEfGhijkLMNopQRstuVWxyz123456789ABCDEFG"

    assert.equal(normalizeGraphAddress(solanaAddress, "Solana"), solanaAddress)
    assert.equal(
      fundingContextKey(solanaAddress, "Solana"),
      `solana:${solanaAddress}`
    )
    assert.notEqual(
      fundingContextKey(solanaAddress, "Solana"),
      `solana:${solanaAddress.toLowerCase()}`
    )
  })
})
