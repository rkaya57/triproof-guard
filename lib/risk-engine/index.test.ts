import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { analyzeWallets } from "./index"
import type { ParsedWallet, PolicyAction } from "@/types"

function wallet(overrides: Partial<ParsedWallet> = {}): ParsedWallet {
  return {
    walletAddress: "0x0000000000000000000000000000000000000001",
    chain: "Base",
    txCount: 120,
    walletAgeDays: 540,
    fundingSource: "0x9999999999999999999999999999999999999999",
    firstSeen: "2024-01-01T00:00:00.000Z",
    lastSeen: "2026-01-01T00:00:00.000Z",
    totalVolume: 2500,
    contractsCount: 18,
    campaignActionsCount: 2,
    nativeBalance: 1.25,
    tokenCount: 12,
    uniqueCounterparties: 75,
    lastActiveDaysAgo: 3,
    isContract: false,
    accountType: "system_user_wallet",
    behaviorFingerprint: ["swap", "lp", "bridge", "stake"],
    campaignQualityScore: 92,
    campaignOnlyRatio: 0.05,
    behaviorDiversityScore: 88,
    botScriptScore: 5,
    policyAction: null,
    reputationLabel: null,
    policyReason: null,
    customerLabel: null,
    enrichmentProvider: "test-fixture",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

function byAddress(result: ReturnType<typeof analyzeWallets>, address: string) {
  const found = result.wallets.find((item) => item.walletAddress === address)
  assert.ok(found, `Expected wallet ${address} to be present`)
  return found
}

describe("risk engine fixture coverage", () => {
  it("approves a clean old user wallet with strong organic history", () => {
    const clean = wallet({
      walletAddress: "0x1000000000000000000000000000000000000001",
    })

    const result = analyzeWallets([clean])
    const analyzed = byAddress(result, clean.walletAddress)

    assert.equal(analyzed.status, "approved")
    assert.equal(analyzed.recommendedAction, "approve")
    assert.equal(analyzed.riskLevel, "low")
    assert.equal(analyzed.clusterId, null)
    assert.ok(analyzed.reasons.some((reason) => reason.includes("On-chain verified")))
    assert.ok(analyzed.reasons.some((reason) => reason.includes("strong organic wallet profile")))
    assert.equal(result.approvedCount, 1)
  })

  it("rejects a new low-activity wallet under the balanced policy", () => {
    const fresh = wallet({
      walletAddress: "0x1000000000000000000000000000000000000002",
      txCount: 1,
      walletAgeDays: 3,
      totalVolume: 0.05,
      contractsCount: 1,
      campaignActionsCount: 0,
      uniqueCounterparties: 1,
      behaviorDiversityScore: 18,
      botScriptScore: 42,
    })

    const analyzed = analyzeWallets([fresh]).wallets[0]

    assert.equal(analyzed.status, "rejected")
    assert.equal(analyzed.recommendedAction, "reject")
    assert.ok(analyzed.riskScore >= 55)
    assert.ok(analyzed.reasons.some((reason) => reason.includes("wallet is younger than 7 days")))
    assert.ok(analyzed.reasons.some((reason) => reason.includes("low transaction count")))
  })

  it("rejects a no-data wallet instead of treating it as clean", () => {
    const noData = wallet({
      walletAddress: "0x1000000000000000000000000000000000000003",
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
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

    const analyzed = analyzeWallets([noData]).wallets[0]

    assert.equal(analyzed.status, "rejected")
    assert.equal(analyzed.recommendedAction, "reject")
    assert.ok(analyzed.statusExplanation.includes("no reliable on-chain history"))
    assert.ok(analyzed.reasons.some((reason) => reason.includes("No On-chain Data")))
  })

  it("detects shared funding clusters and marks members with cluster context", () => {
    const sharedFunding = "0xfeed000000000000000000000000000000000000"
    const wallets = Array.from({ length: 4 }, (_, index) =>
      wallet({
        walletAddress: `0x200000000000000000000000000000000000000${index}`,
        fundingSource: sharedFunding,
        txCount: 80 + index,
        walletAgeDays: 320 + index,
      })
    )

    const result = analyzeWallets(wallets)

    assert.equal(result.clusters.length, 1)
    assert.equal(result.clusters[0].walletCount, 4)
    assert.equal(result.clusters[0].sharedFundingSource, sharedFunding.toLowerCase())
    assert.equal(result.clusters[0].suggestedAction, "manual_review")
    assert.ok(result.wallets.every((item) => item.clusterId === "CL-001"))
    assert.ok(
      result.wallets.every((item) =>
        item.reasons.some((reason) => reason.includes("Shared funding source evidence"))
      )
    )
  })

  it("does not create a suspicious cluster from a known exchange funding source", () => {
    const exchangeFunding = "0x28c6c06298d514db089934071355e5743bf21d60"
    const wallets = Array.from({ length: 8 }, (_, index) =>
      wallet({
        walletAddress: `0x${(index + 300).toString(16).padStart(40, "0")}`,
        fundingSource: exchangeFunding,
        txCount: 40 + index * 7,
        walletAgeDays: 200 + index * 40,
        contractsCount: 5 + index * 4,
      })
    )
    const result = analyzeWallets(wallets)

    assert.equal(result.clusters.length, 0)
    assert.ok(result.wallets.every((item) => item.clusterId === null))
    assert.equal(result.graph.neutralServiceFunders, 1)
  })

  it("rejects campaign-only farming behavior", () => {
    const campaignOnly = wallet({
      walletAddress: "0x1000000000000000000000000000000000000004",
      txCount: 7,
      walletAgeDays: 18,
      totalVolume: 1.4,
      contractsCount: 1,
      campaignActionsCount: 6,
      uniqueCounterparties: 2,
      campaignQualityScore: 22,
      campaignOnlyRatio: 0.9,
      behaviorDiversityScore: 16,
      botScriptScore: 86,
      behaviorFingerprint: ["claim", "claim", "claim"],
    })

    const analyzed = analyzeWallets([campaignOnly]).wallets[0]

    assert.equal(analyzed.status, "rejected")
    assert.equal(analyzed.riskLevel, "critical")
    assert.ok(analyzed.reasons.some((reason) => reason.includes("campaign-only behavior pattern")))
    assert.ok(analyzed.reasons.some((reason) => reason.includes("bot-script probability")))
  })

  it("rejects known public entity wallets as non-participant accounts", () => {
    const knownEntity = wallet({
      walletAddress: "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8",
      fundingSource: "0x8888888888888888888888888888888888888888",
    })

    const analyzed = analyzeWallets([knownEntity]).wallets[0]

    assert.equal(analyzed.entityLabel, "Binance 7")
    assert.equal(analyzed.entityType, "exchange")
    assert.equal(analyzed.status, "rejected")
    assert.equal(analyzed.recommendedAction, "reject")
    assert.ok(analyzed.entityRiskReason?.includes("Known public exchange"))
  })

  it("rejects contract or program-owned accounts", () => {
    const contract = wallet({
      walletAddress: "0x1000000000000000000000000000000000000005",
      isContract: true,
      accountType: "program_account",
      ownerProgram: "fixture-program",
    })

    const analyzed = analyzeWallets([contract]).wallets[0]

    assert.equal(analyzed.entityType, "contract")
    assert.equal(analyzed.status, "rejected")
    assert.equal(analyzed.recommendedAction, "reject")
    assert.ok(analyzed.statusExplanation.includes("non-user"))
    assert.ok(analyzed.reasons.some((reason) => reason.includes("not a normal end-user wallet")))
  })

  it("applies reject, manual-review, trusted approve, and unsafe approve policy overrides", () => {
    const override = (
      suffix: string,
      policyAction: Exclude<PolicyAction, null>,
      extra: Partial<ParsedWallet> = {}
    ) =>
      wallet({
        walletAddress: `0x300000000000000000000000000000000000000${suffix}`,
        policyAction,
        reputationLabel: `policy-${policyAction}`,
        policyReason: "fixture override",
        ...extra,
      })

    const rejected = override("1", "reject")
    const manual = override("2", "manual_review")
    const trusted = override("3", "approve")
    const unsafeApprove = override("4", "approve", {
      txCount: null,
      walletAgeDays: null,
      fundingSource: null,
      totalVolume: null,
      contractsCount: null,
      campaignActionsCount: null,
      isContract: null,
      accountType: "missing_or_closed_account",
      enrichmentStatus: null,
    })

    const result = analyzeWallets([rejected, manual, trusted, unsafeApprove])

    assert.equal(byAddress(result, rejected.walletAddress).status, "rejected")
    assert.equal(byAddress(result, rejected.walletAddress).riskScore, 95)
    assert.equal(byAddress(result, manual.walletAddress).status, "manual_review")
    assert.equal(byAddress(result, trusted.walletAddress).status, "approved")
    assert.equal(byAddress(result, unsafeApprove.walletAddress).status, "manual_review")
    assert.ok(
      byAddress(result, unsafeApprove.walletAddress).statusExplanation.includes(
        "failed basic eligibility"
      )
    )
  })
})
