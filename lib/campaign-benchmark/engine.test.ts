import assert from "node:assert/strict"
import test from "node:test"

import { buildCampaignBenchmarkReport } from "@/lib/campaign-benchmark/engine"
import type { CampaignBenchmarkWorkspaceSnapshot } from "@/lib/campaign-benchmark/types"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import type { CrossCampaignRiskMemory } from "@/lib/risk-memory/types"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

function wallet(
  address: string,
  status: WalletRiskResult["status"],
  options: Partial<WalletRiskResult> = {}
): WalletRiskResult {
  return {
    walletAddress: address,
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: status === "approved" ? 10 : status === "manual_review" ? 45 : 80,
    riskLevel: status === "approved" ? "low" : status === "manual_review" ? "medium" : "high",
    status,
    recommendedAction:
      status === "approved" ? "approve" : status === "manual_review" ? "manual_review" : "reject",
    statusExplanation: "Test decision",
    fundingSource: null,
    txCount: 10,
    walletAgeDays: 100,
    totalVolume: 1,
    contractsCount: 2,
    campaignActionsCount: 1,
    clusterId: null,
    reasons: [],
    ...options,
  }
}

function analysis(): AnalysisDetail {
  const wallets = [
    wallet("Approved111111111111111111111111111111", "approved", {
      decisionEvidence: {
        schemaVersion: "campaign-security-explanation-v1",
        decision: "approved",
        recommendedAction: "approve",
        evidenceConfidence: "high",
        evidenceFamilies: ["policy"],
        independentRiskFamilyCount: 0,
        evidence: [],
        limitations: [],
        requiresHumanReview: false,
        humanReview: null,
      },
    }),
    wallet("Review11111111111111111111111111111111", "manual_review", {
      clusterId: "cluster-1",
      decisionEvidence: {
        schemaVersion: "campaign-security-explanation-v1",
        decision: "manual_review",
        recommendedAction: "manual_review",
        evidenceConfidence: "medium",
        evidenceFamilies: ["funding", "timing"],
        independentRiskFamilyCount: 2,
        evidence: [],
        limitations: ["History sampled"],
        requiresHumanReview: true,
        humanReview: null,
      },
    }),
    wallet("Reject11111111111111111111111111111111", "rejected", {
      teamReview: {
        finalStatus: "approved",
        feedbackLabel: "false_positive",
        notes: "Confirmed legitimate",
        reviewerName: "Reviewer",
        updatedAt: "2026-08-06T11:10:00.000Z",
      },
      decisionEvidence: {
        schemaVersion: "campaign-security-explanation-v1",
        decision: "rejected",
        recommendedAction: "reject",
        evidenceConfidence: "high",
        evidenceFamilies: ["funding", "graph"],
        independentRiskFamilyCount: 2,
        evidence: [],
        limitations: [],
        requiresHumanReview: false,
        humanReview: null,
      },
    }),
    wallet("Approved222222222222222222222222222222", "approved"),
  ]

  return {
    id: "analysis-current",
    status: "completed",
    totalWallets: 4,
    approvedCount: 2,
    manualReviewCount: 1,
    rejectedCount: 1,
    averageRiskScore: 36.25,
    suspiciousClustersCount: 1,
    csvFileName: "wallets.csv",
    createdAt: "2026-08-06T11:00:00.000Z",
    completedAt: "2026-08-06T11:02:00.000Z",
    riskPolicy: "balanced",
    feedbackSummary: {
      totalFeedback: 2,
      correctDecision: 0,
      falsePositive: 1,
      falseNegative: 1,
      confirmedRisk: 0,
      trustedUser: 0,
      needsMoreData: 0,
    },
    teamReviewSummary: {
      reviewedWallets: 1,
      pendingReview: 1,
      approvedByTeam: 1,
      grayZoneByTeam: 0,
      rejectedByTeam: 0,
    },
    project: {
      id: "campaign-current",
      name: "Current campaign",
      campaignType: "Airdrop",
      chain: "Solana",
      notes: null,
    },
    wallets,
    clusters: [],
  }
}

const workspace: CampaignBenchmarkWorkspaceSnapshot[] = [
  {
    campaignId: "campaign-current",
    campaignName: "Current campaign",
    analysisId: "analysis-current",
    createdAt: "2026-08-06T11:00:00.000Z",
    completedAt: "2026-08-06T11:02:00.000Z",
    totalWallets: 4,
    approvedCount: 2,
    manualReviewCount: 1,
    rejectedCount: 1,
    averageRiskScore: 36.25,
    suspiciousClustersCount: 1,
  },
  {
    campaignId: "campaign-b",
    campaignName: "Campaign B",
    analysisId: "analysis-b",
    createdAt: "2026-08-05T10:00:00.000Z",
    completedAt: "2026-08-05T10:01:00.000Z",
    totalWallets: 100,
    approvedCount: 70,
    manualReviewCount: 20,
    rejectedCount: 10,
    averageRiskScore: 25,
    suspiciousClustersCount: 2,
  },
  {
    campaignId: "campaign-c",
    campaignName: "Campaign C",
    analysisId: "analysis-c",
    createdAt: "2026-08-04T10:00:00.000Z",
    completedAt: "2026-08-04T10:03:00.000Z",
    totalWallets: 100,
    approvedCount: 50,
    manualReviewCount: 30,
    rejectedCount: 20,
    averageRiskScore: 40,
    suspiciousClustersCount: 4,
  },
]

function policy(): CampaignPolicyReport {
  return {
    schemaVersion: "tri-proof-campaign-policy-v1",
    campaignId: "campaign-current",
    campaignName: "Current campaign",
    analysisId: "analysis-current",
    preset: "balanced",
    generatedAt: "2026-08-06T11:03:00.000Z",
    summary: {
      approveRecommendations: 1,
      reviewRecommendations: 2,
      rejectRecommendations: 1,
      escalatedFromApproved: 1,
      escalatedFromReview: 0,
      humanDecisionsPreserved: 1,
      crossCampaignCorroborated: 1,
      telegramCorroborated: 1,
      dataCoverageReviews: 1,
    },
    coverage: {
      walletsEvaluated: 4,
      riskMemoryAvailable: true,
      riskMemoryPartial: false,
      campaignsConsidered: 3,
      analysesConsidered: 3,
    },
    recommendations: [
      {
        walletAddress: "Approved111111111111111111111111111111",
        chain: "Solana",
        currentDecision: "approved",
        finalHumanDecision: null,
        recommendedAction: "manual_review",
        changesAutomatedDecision: true,
        requiresHumanReview: true,
        confidence: "medium",
        matchedRules: [],
        safeguards: [],
        explanation: "Escalated",
        riskMemory: null,
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        walletAddress: `wallet-${index}`,
        chain: "Solana",
        currentDecision: "approved" as const,
        finalHumanDecision: null,
        recommendedAction: "approve" as const,
        changesAutomatedDecision: false,
        requiresHumanReview: false,
        confidence: "medium" as const,
        matchedRules: [],
        safeguards: [],
        explanation: "No change",
        riskMemory: null,
      })),
    ],
  }
}

function memory(): CrossCampaignRiskMemory {
  return {
    schemaVersion: "tri-proof-cross-campaign-risk-memory-v1",
    campaignId: "campaign-current",
    campaignName: "Current campaign",
    generatedAt: "2026-08-06T11:03:00.000Z",
    summary: {
      matchedEntities: 2,
      repeatedParticipants: 1,
      repeatedInfrastructure: 1,
      crossRoleEntities: 0,
      entitiesWithPriorRejection: 0,
      telegramLinkedEntities: 1,
    },
    coverage: {
      campaignsConsidered: 3,
      analysesConsidered: 3,
      graphNodeLimit: 50_000,
      graphNodesRead: 10,
      graphNodesTruncated: false,
      walletAnalysisLimit: 50_000,
      walletAnalysesRead: 10,
      walletAnalysesTruncated: false,
      telegramEventLimit: 1_000,
      telegramEventsRead: 2,
      telegramEventsTruncated: false,
    },
    matches: [],
  }
}

test("builds transparent outcome metrics without inventing reward or ground truth data", () => {
  const report = buildCampaignBenchmarkReport({
    analysis: analysis(),
    policy: policy(),
    memory: memory(),
    workspaceSnapshots: workspace,
    campaignHistory: workspace.slice(0, 1),
    workspaceCampaignLimit: 50,
    workspaceCampaignsTruncated: false,
  })

  assert.equal(report.summary.approvalRate, 50)
  assert.equal(report.summary.reviewCompletionRate, 50)
  assert.equal(report.summary.humanDecisionChangeRate, 100)
  assert.equal(report.summary.explainableDecisionCoverageRate, 75)
  assert.equal(report.summary.multiFamilyEvidenceRate, 50)
  assert.equal(report.summary.policyEscalationRate, 25)
  assert.equal(report.summary.repeatedParticipantRate, 25)
  assert.equal(report.summary.telegramCorroborationRate, 25)
  assert.equal(report.coverage.groundTruthAvailable, false)
  assert.equal(report.coverage.rewardExposureConfigured, false)
  assert.ok(report.measurementGaps.some((gap) => gap.includes("Reward exposure")))
  assert.ok(report.measurementGaps.some((gap) => gap.includes("complete ground truth")))
})

test("uses workspace medians as context rather than accuracy claims", () => {
  const report = buildCampaignBenchmarkReport({
    analysis: analysis(),
    policy: policy(),
    memory: memory(),
    workspaceSnapshots: workspace,
    campaignHistory: workspace,
    workspaceCampaignLimit: 50,
    workspaceCampaignsTruncated: false,
  })

  const approval = report.comparisons.find((item) => item.key === "approval_rate")
  const duration = report.comparisons.find(
    (item) => item.key === "analysis_duration_seconds"
  )
  assert.equal(approval?.workspaceMedian, 50)
  assert.equal(approval?.sampleSize, 3)
  assert.equal(duration?.workspaceMedian, 120)
  assert.ok(
    report.measurementGaps.some((gap) =>
      gap.includes("not fraud-detection accuracy")
    )
  )
})

test("marks partial risk memory and preliminary workspace samples", () => {
  const partialMemory = memory()
  partialMemory.coverage.telegramEventsTruncated = true
  const report = buildCampaignBenchmarkReport({
    analysis: analysis(),
    policy: null,
    memory: partialMemory,
    workspaceSnapshots: workspace.slice(0, 1),
    campaignHistory: workspace.slice(0, 1),
    workspaceCampaignLimit: 50,
    workspaceCampaignsTruncated: true,
  })

  assert.equal(report.coverage.riskMemoryPartial, true)
  assert.equal(report.coverage.workspaceCampaignsTruncated, true)
  assert.equal(report.summary.policyEscalationRate, null)
  assert.ok(report.measurementGaps.some((gap) => gap.includes("preliminary")))
  assert.ok(report.measurementGaps.some((gap) => gap.includes("Risk Memory reached")))
})
