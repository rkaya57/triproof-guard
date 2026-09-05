import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { buildCampaignPolicySimulation } from "@/lib/campaign-policy/simulator"
import type { CrossCampaignRiskMemory, RiskMemoryMatch } from "@/lib/risk-memory/types"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

function wallet(
  address: string,
  overrides: Partial<WalletRiskResult> = {},
): WalletRiskResult {
  const base: WalletRiskResult = {
    walletAddress: address,
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 65,
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Gray Zone based on current campaign evidence.",
    fundingSource: null,
    txCount: 10,
    walletAgeDays: 100,
    totalVolume: 10,
    contractsCount: 3,
    campaignActionsCount: 2,
    clusterId: "cluster-1",
    graphComponentId: "component-1",
    graphRiskScore: 70,
    reasons: [
      "Shared funding source detected across campaign wallets.",
      "Timing cohort matched the same completion time window.",
    ],
    enrichmentStatus: "completed",
    teamReview: null,
    ...overrides,
  }

  return {
    ...base,
    decisionEvidence: buildExplainableDecision(base),
  }
}

function memoryMatch(
  address: string,
  overrides: Partial<RiskMemoryMatch> = {},
): RiskMemoryMatch {
  return {
    key: `onchain_identity:solana:${address}`,
    identityKind: "onchain_identity",
    value: address,
    chain: "solana",
    campaignCount: 2,
    priorCampaignCount: 1,
    roles: ["participant"],
    crossRole: false,
    highestRiskScore: 80,
    priorRejectedCount: 1,
    priorManualReviewCount: 0,
    telegramEvidenceCount: 1,
    latestObservedAt: null,
    signals: [],
    occurrences: [],
    ...overrides,
  }
}

function memory(matches: RiskMemoryMatch[]): CrossCampaignRiskMemory {
  return {
    schemaVersion: "tri-proof-cross-campaign-risk-memory-v1",
    campaignId: "campaign-1",
    campaignName: "Campaign 1",
    generatedAt: new Date("2026-08-21T12:00:00.000Z").toISOString(),
    summary: {
      matchedEntities: matches.length,
      repeatedParticipants: matches.filter((item) => item.roles.includes("participant") && item.priorCampaignCount > 0).length,
      repeatedInfrastructure: matches.filter((item) => item.roles.some((role) => role !== "participant") && item.priorCampaignCount > 0).length,
      crossRoleEntities: matches.filter((item) => item.crossRole).length,
      entitiesWithPriorRejection: matches.filter((item) => item.priorRejectedCount > 0).length,
      telegramLinkedEntities: matches.filter((item) => item.telegramEvidenceCount > 0).length,
    },
    coverage: {
      campaignsConsidered: 2,
      analysesConsidered: 2,
      graphNodeLimit: 50_000,
      graphNodesRead: 0,
      walletAnalysisLimit: 50_000,
      walletAnalysesRead: matches.length,
      telegramEventLimit: 50_000,
      telegramEventsRead: matches.length,
      graphNodesTruncated: false,
      walletAnalysesTruncated: false,
      telegramEventsTruncated: false,
    },
    matches,
  }
}

function analysis(wallets: WalletRiskResult[], riskPolicy: "conservative" | "balanced" | "strict" = "balanced"): AnalysisDetail {
  return {
    id: "analysis-1",
    status: "completed",
    totalWallets: wallets.length,
    approvedCount: wallets.filter((item) => item.status === "approved").length,
    manualReviewCount: wallets.filter((item) => item.status === "manual_review").length,
    rejectedCount: wallets.filter((item) => item.status === "rejected").length,
    averageRiskScore: wallets.length
      ? wallets.reduce((sum, item) => sum + item.riskScore, 0) / wallets.length
      : 0,
    suspiciousClustersCount: 1,
    csvFileName: "campaign.csv",
    createdAt: new Date("2026-08-21T10:00:00.000Z").toISOString(),
    completedAt: new Date("2026-08-21T10:05:00.000Z").toISOString(),
    analysisMode: "hybrid",
    riskPolicy,
    enrichment: null,
    feedbackSummary: null,
    teamReviewSummary: null,
    project: {
      id: "campaign-1",
      name: "Genesis Airdrop",
      campaignType: "Airdrop",
      chain: "Solana + EVM",
      notes: null,
    },
    wallets,
    clusters: [],
    graph: null,
    aiBrief: null,
  }
}

describe("campaign policy simulator", () => {
  it("returns no transitions when scenario equals the baseline", () => {
    const address = "So11111111111111111111111111111111111111112"
    const simulation = buildCampaignPolicySimulation({
      analysis: analysis([wallet(address)]),
      memory: memory([memoryMatch(address)]),
      scenario: { preset: "balanced" },
    })

    assert.equal(simulation.impact.changedWallets, 0)
    assert.equal(simulation.transitions.length, 0)
    assert.deepEqual(simulation.baseline.thresholds, { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 })
    assert.deepEqual(simulation.scenario.thresholds, simulation.baseline.thresholds)
    assert.equal(simulation.scenario.customized, false)
  })

  it("a higher corroborated reject score can de-escalate a baseline policy recommendation", () => {
    const address = "So22222222222222222222222222222222222222222"
    const simulation = buildCampaignPolicySimulation({
      analysis: analysis([wallet(address)]),
      memory: memory([memoryMatch(address)]),
      scenario: {
        preset: "balanced",
        corroboratedRejectScore: 80,
        corroboratedFamilyCount: 2,
      },
    })

    assert.equal(simulation.baseline.rejectRecommendations, 1)
    assert.equal(simulation.scenario.reviewRecommendations, 1)
    assert.equal(simulation.impact.changedWallets, 1)
    assert.equal(simulation.impact.deescalatedWallets, 1)
    assert.equal(simulation.impact.noLongerRejected, 1)
    assert.equal(simulation.transitions[0]?.baselineAction, "reject")
    assert.equal(simulation.transitions[0]?.scenarioAction, "manual_review")
  })

  it("a lower reject score can escalate a previously reviewed wallet", () => {
    const address = "So33333333333333333333333333333333333333333"
    const lowerRiskWallet = wallet(address, { riskScore: 55 })
    const simulation = buildCampaignPolicySimulation({
      analysis: analysis([lowerRiskWallet]),
      memory: memory([memoryMatch(address)]),
      scenario: {
        preset: "balanced",
        corroboratedRejectScore: 50,
        corroboratedFamilyCount: 2,
      },
    })

    assert.equal(simulation.baseline.reviewRecommendations, 1)
    assert.equal(simulation.scenario.rejectRecommendations, 1)
    assert.equal(simulation.impact.escalatedWallets, 1)
    assert.equal(simulation.impact.newlyRejected, 1)
  })

  it("preserves stored human decisions across every simulation scenario", () => {
    const address = "So44444444444444444444444444444444444444444"
    const reviewed = wallet(address, {
      status: "approved",
      recommendedAction: "approve",
      riskScore: 92,
      teamReview: {
        finalStatus: "approved",
        feedbackLabel: "trusted_user",
        notes: "Verified campaign partner wallet.",
        reviewerName: "Reviewer",
        updatedAt: new Date("2026-08-21T11:00:00.000Z").toISOString(),
      },
    })
    reviewed.decisionEvidence = buildExplainableDecision(reviewed)

    const simulation = buildCampaignPolicySimulation({
      analysis: analysis([reviewed]),
      memory: memory([memoryMatch(address, { priorRejectedCount: 3, telegramEvidenceCount: 3 })]),
      scenario: {
        preset: "strict",
        corroboratedRejectScore: 0,
        corroboratedFamilyCount: 1,
      },
    })

    assert.equal(simulation.impact.changedWallets, 0)
    assert.equal(simulation.impact.humanDecisionsPreserved, 1)
    assert.equal(simulation.scenario.approveRecommendations, 1)
  })

  it("clamps unsafe threshold inputs before running the scenario", () => {
    const address = "So55555555555555555555555555555555555555555"
    const simulation = buildCampaignPolicySimulation({
      analysis: analysis([wallet(address)]),
      memory: memory([memoryMatch(address)]),
      scenario: {
        preset: "strict",
        corroboratedRejectScore: 999,
        corroboratedFamilyCount: 99,
      },
    })

    assert.deepEqual(simulation.scenario.thresholds, {
      corroboratedRejectScore: 100,
      corroboratedFamilyCount: 8,
    })
    assert.equal(simulation.scenario.customized, true)
  })

  it("estimates reward exposure only under an explicit equal-allocation assumption", () => {
    const addressA = "So66666666666666666666666666666666666666666"
    const addressB = "So77777777777777777777777777777777777777777"
    const wallets = [
      wallet(addressA),
      wallet(addressB, {
        status: "approved",
        recommendedAction: "approve",
        riskScore: 5,
        riskLevel: "low",
        reasons: [],
        clusterId: null,
        graphComponentId: null,
        graphRiskScore: null,
      }),
    ]
    wallets[1].decisionEvidence = buildExplainableDecision(wallets[1])

    const simulation = buildCampaignPolicySimulation({
      analysis: analysis(wallets),
      memory: memory([memoryMatch(addressA)]),
      rewardPoolUsd: 1_000,
      scenario: {
        preset: "balanced",
        corroboratedRejectScore: 80,
      },
    })

    assert.ok(simulation.rewardImpact)
    assert.equal(simulation.rewardImpact?.assumption, "equal_allocation_per_wallet")
    assert.equal(simulation.rewardImpact?.equalAllocationPerWalletUsd, 500)
    assert.equal(simulation.rewardImpact?.baselineEstimatedRejectedAllocationUsd, 500)
    assert.equal(simulation.rewardImpact?.scenarioEstimatedRejectedAllocationUsd, 0)
    assert.equal(simulation.rewardImpact?.deltaEstimatedRejectedAllocationUsd, -500)
  })
})
