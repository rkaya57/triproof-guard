import assert from "node:assert/strict"
import test from "node:test"

import { normalizeAnalysisSemantics } from "@/lib/risk-engine/semantic-safety"
import type { AnalysisResult, WalletRiskResult } from "@/types"

function wallet(overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  return {
    walletAddress: "Wallet111111111111111111111111111111111",
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 45,
    riskLevel: "medium",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Gray Zone: insufficient reliable on-chain evidence.",
    fundingSource: null,
    txCount: null,
    walletAgeDays: null,
    totalVolume: null,
    contractsCount: null,
    campaignActionsCount: null,
    clusterId: null,
    reasons: ["Decision category: insufficient_data"],
    enrichmentStatus: "completed",
    ...overrides,
  }
}

function result(wallets: WalletRiskResult[]): AnalysisResult {
  return {
    wallets,
    clusters: [],
    graph: {
      totalNodes: 0,
      totalEdges: 0,
      connectedWallets: 0,
      externalFunders: 0,
      referralLinks: 0,
      highRiskComponents: 0,
      neutralServiceFunders: 0,
      largestComponent: 0,
      maxComponentRisk: 0,
      components: [],
      findings: [],
      nodes: [],
      edges: [],
    },
    totalWallets: wallets.length,
    approvedCount: wallets.filter((item) => item.status === "approved").length,
    manualReviewCount: wallets.filter((item) => item.status === "manual_review").length,
    rejectedCount: wallets.filter((item) => item.status === "rejected").length,
    averageRiskScore: wallets.length
      ? wallets.reduce((sum, item) => sum + item.riskScore, 0) / wallets.length
      : 0,
    riskDistribution: {
      low: 0,
      medium: wallets.length,
      high: 0,
      critical: 0,
    },
    enrichment: null,
  }
}

test("removes malicious-risk scoring from insufficient-data decisions", () => {
  const normalized = normalizeAnalysisSemantics(result([wallet()]))
  const normalizedWallet = normalized.wallets[0]

  assert.equal(normalizedWallet?.status, "manual_review")
  assert.equal(normalizedWallet?.riskScore, 0)
  assert.equal(normalizedWallet?.riskLevel, "low")
  assert.equal(normalized.averageRiskScore, 0)
  assert.equal(normalized.riskDistribution.low, 1)
  assert.ok(
    normalizedWallet?.reasons.some((reason) =>
      reason.includes("decision is based on data coverage")
    )
  )
})

test("does not auto-approve a completed provider lookup with no substantive wallet history", () => {
  const normalized = normalizeAnalysisSemantics(
    result([
      wallet({
        riskScore: 0,
        riskLevel: "low",
        status: "approved",
        recommendedAction: "approve",
        statusExplanation: "Approved under Balanced policy.",
        reasons: [
          "On-chain verified via helius",
          "Decision category: approved",
        ],
        enrichmentProvider: "helius",
        enrichmentStatus: "completed",
      }),
    ])
  )

  const normalizedWallet = normalized.wallets[0]
  assert.equal(normalizedWallet?.status, "manual_review")
  assert.equal(normalizedWallet?.recommendedAction, "manual_review")
  assert.equal(normalizedWallet?.riskScore, 0)
  assert.equal(normalized.manualReviewCount, 1)
  assert.equal(normalized.approvedCount, 0)
  assert.ok(
    normalizedWallet?.reasons.some((reason) =>
      reason.includes("Provider completion alone cannot support automatic approval")
    )
  )
  assert.equal(
    normalizedWallet?.reasons.filter((reason) =>
      reason.startsWith("Decision category:")
    ).at(-1),
    "Decision category: insufficient_data"
  )
})

test("treats explicit zero-activity provider results as insufficient for auto-approval", () => {
  const normalized = normalizeAnalysisSemantics(
    result([
      wallet({
        walletAddress: "0x3d2e397f94e415d7773e72ff41b42f80db2fca66",
        chain: "Ethereum",
        riskScore: 35,
        riskLevel: "medium",
        status: "approved",
        recommendedAction: "approve",
        statusExplanation: "Approved under Balanced policy.",
        reasons: [
          "On-chain verified via etherscan",
          "Decision category: approved",
        ],
        txCount: 0,
        totalVolume: 0,
        contractsCount: 0,
        nativeBalance: 0,
        tokenCount: 0,
        uniqueCounterparties: 0,
        isContract: false,
        enrichmentProvider: "etherscan",
        enrichmentStatus: "completed",
      }),
    ])
  )

  const normalizedWallet = normalized.wallets[0]
  assert.equal(normalizedWallet?.status, "manual_review")
  assert.equal(normalizedWallet?.recommendedAction, "manual_review")
  assert.equal(normalizedWallet?.riskScore, 0)
  assert.equal(normalizedWallet?.riskLevel, "low")
})

test("preserves an approved provider result when substantive wallet history exists", () => {
  const normalized = normalizeAnalysisSemantics(
    result([
      wallet({
        riskScore: 12,
        riskLevel: "low",
        status: "approved",
        recommendedAction: "approve",
        statusExplanation: "Approved under Balanced policy.",
        reasons: [
          "On-chain verified via helius",
          "Decision category: approved",
        ],
        txCount: 48,
        walletAgeDays: 420,
        totalVolume: 1250,
        contractsCount: 9,
        uniqueCounterparties: 23,
        enrichmentProvider: "helius",
        enrichmentStatus: "completed",
      }),
    ])
  )

  const normalizedWallet = normalized.wallets[0]
  assert.equal(normalizedWallet?.status, "approved")
  assert.equal(normalizedWallet?.recommendedAction, "approve")
  assert.equal(normalizedWallet?.riskScore, 12)
  assert.equal(normalized.approvedCount, 1)
  assert.equal(normalized.manualReviewCount, 0)
})

test("removes malicious-risk scoring from pure non-user eligibility exclusions", () => {
  const normalized = normalizeAnalysisSemantics(
    result([
      wallet({
        entityLabel: "Program-owned Solana Account",
        entityType: "protocol",
        accountType: "program_owned_account",
        riskScore: 83,
        riskLevel: "high",
        status: "rejected",
        recommendedAction: "reject",
        statusExplanation:
          "Not eligible: the address is a program or other non-user account.",
        reasons: [
          "Solana account intelligence: program_owned_account",
          "Decision category: ineligible_non_user_account",
        ],
      }),
    ])
  )

  const normalizedWallet = normalized.wallets[0]
  assert.equal(normalizedWallet?.status, "rejected")
  assert.equal(normalizedWallet?.riskScore, 0)
  assert.equal(normalizedWallet?.riskLevel, "low")
  assert.ok(
    normalizedWallet?.reasons.some((reason) =>
      reason.includes("eligibility exclusion for a non-user account")
    )
  )
})

test("preserves a score when independent hard malicious evidence exists", () => {
  const normalized = normalizeAnalysisSemantics(
    result([
      wallet({
        entityType: "protocol",
        accountType: "program_owned_account",
        riskScore: 92,
        riskLevel: "critical",
        status: "rejected",
        recommendedAction: "reject",
        statusExplanation: "Not eligible: non-user account.",
        reasons: [
          "Graph evidence: known-bad funding source",
          "Decision category: ineligible_non_user_account",
        ],
      }),
    ])
  )

  assert.equal(normalized.wallets[0]?.riskScore, 92)
  assert.equal(normalized.wallets[0]?.riskLevel, "critical")
})

test("recomputes campaign and cluster aggregates after semantic normalization", () => {
  const first = wallet({
    walletAddress: "WalletA11111111111111111111111111111111",
    clusterId: "CL-001",
  })
  const second = wallet({
    walletAddress: "WalletB11111111111111111111111111111111",
    clusterId: "CL-001",
    riskScore: 20,
    riskLevel: "low",
    status: "approved",
    recommendedAction: "approve",
    statusExplanation: "Approved.",
    reasons: ["Decision category: approved"],
    txCount: 30,
    walletAgeDays: 300,
  })
  const input = result([first, second])
  input.clusters = [
    {
      clusterLabel: "CL-001",
      walletCount: 2,
      averageRiskScore: 32.5,
      sharedFundingSource: null,
      behaviorSimilarityScore: 60,
      suggestedAction: "manual_review",
      reasons: [],
      walletAddresses: [first.walletAddress, second.walletAddress],
    },
  ]

  const normalized = normalizeAnalysisSemantics(input)

  assert.equal(normalized.averageRiskScore, 10)
  assert.equal(normalized.clusters[0]?.averageRiskScore, 10)
  assert.equal(normalized.approvedCount, 1)
  assert.equal(normalized.manualReviewCount, 1)
})
