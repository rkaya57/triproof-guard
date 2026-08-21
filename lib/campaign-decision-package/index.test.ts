import assert from "node:assert/strict"
import test from "node:test"

import { buildCampaignDecisionPackage } from "@/lib/campaign-decision-package"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"
import type { AnalysisDetail, ClusterResult, WalletRiskResult } from "@/types"

function wallet(
  address: string,
  status: WalletRiskResult["status"],
  clusterId: string | null,
): WalletRiskResult {
  const action = status === "approved" ? "approve" : status === "rejected" ? "reject" : "manual_review"
  return {
    walletAddress: address,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: status === "rejected" ? 82 : status === "manual_review" ? 58 : 22,
    riskLevel: status === "rejected" ? "high" : status === "manual_review" ? "medium" : "low",
    status,
    recommendedAction: action,
    statusExplanation: "Stored decision",
    fundingSource: null,
    txCount: 20,
    walletAgeDays: 100,
    totalVolume: 100,
    contractsCount: 2,
    campaignActionsCount: 3,
    clusterId,
    graphComponentId: null,
    graphRiskScore: null,
    reasons: [],
    teamReview: null,
  }
}

const addresses = [
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
  "0x4444444444444444444444444444444444444444",
] as const

function cluster(label: string, members: string[]): ClusterResult {
  return {
    clusterLabel: label,
    walletCount: members.length,
    averageRiskScore: 65,
    sharedFundingSource: null,
    behaviorSimilarityScore: 80,
    suggestedAction: "manual_review",
    reasons: [
      "Funding evidence: shared first observed funding source",
      "Temporal evidence: tightly aligned first funding or first observed activity window",
    ],
    walletAddresses: members,
  }
}

function analysis(): AnalysisDetail {
  const wallets = [
    wallet(addresses[0], "approved", "CL-001"),
    wallet(addresses[1], "manual_review", "CL-001"),
    wallet(addresses[2], "rejected", "CL-002"),
    wallet(addresses[3], "approved", "CL-002"),
  ]
  return {
    id: "analysis-package",
    status: "completed",
    totalWallets: wallets.length,
    approvedCount: 2,
    manualReviewCount: 1,
    rejectedCount: 1,
    averageRiskScore: 46,
    suspiciousClustersCount: 2,
    csvFileName: null,
    createdAt: "2026-08-21T12:00:00.000Z",
    completedAt: "2026-08-21T12:05:00.000Z",
    analysisMode: "onchain",
    riskPolicy: "balanced",
    project: {
      id: "campaign-package",
      name: "Package Campaign",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    wallets,
    clusters: [
      cluster("CL-001", [addresses[0], addresses[1]]),
      cluster("CL-002", [addresses[2], addresses[3]]),
    ],
    graph: null,
    aiBrief: null,
  }
}

function recommendation(input: {
  walletAddress: string
  currentDecision: WalletRiskResult["status"]
  recommendedAction: "approve" | "manual_review" | "reject"
  finalHumanDecision?: WalletRiskResult["status"] | null
  changes?: boolean
}) {
  return {
    walletAddress: input.walletAddress,
    chain: "Ethereum",
    currentDecision: input.currentDecision,
    finalHumanDecision: input.finalHumanDecision ?? null,
    recommendedAction: input.recommendedAction,
    changesAutomatedDecision: input.changes ?? false,
    requiresHumanReview: input.recommendedAction === "manual_review",
    confidence: input.recommendedAction === "manual_review" ? "medium" as const : "high" as const,
    matchedRules: [{
      code: input.finalHumanDecision ? "HUMAN_DECISION_PRECEDENCE" as const : "CURRENT_DECISION_BASELINE" as const,
      title: "Rule",
      action: input.recommendedAction,
      severity: "info" as const,
      rationale: "fixture",
      evidenceCodes: [],
      evidenceFamilies: [],
    }],
    safeguards: [],
    explanation: "Fixture policy recommendation.",
    riskMemory: null,
  }
}

function policy(overrides: Partial<CampaignPolicyReport> = {}): CampaignPolicyReport {
  const recommendations: CampaignPolicyReport["recommendations"] = [
    recommendation({ walletAddress: addresses[0].toUpperCase(), currentDecision: "approved", recommendedAction: "approve" }),
    recommendation({ walletAddress: addresses[1], currentDecision: "manual_review", recommendedAction: "approve", finalHumanDecision: "approved", changes: true }),
    recommendation({ walletAddress: addresses[2], currentDecision: "rejected", recommendedAction: "reject" }),
    recommendation({ walletAddress: addresses[3], currentDecision: "approved", recommendedAction: "manual_review", changes: true }),
  ]
  return {
    schemaVersion: "tri-proof-campaign-policy-v1",
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    analysisId: "analysis-package",
    preset: "balanced",
    thresholds: { corroboratedRejectScore: 60, corroboratedFamilyCount: 2 },
    generatedAt: "2026-08-21T12:10:00.000Z",
    summary: {
      approveRecommendations: 2,
      reviewRecommendations: 1,
      rejectRecommendations: 1,
      escalatedFromApproved: 1,
      escalatedFromReview: 0,
      humanDecisionsPreserved: 1,
      crossCampaignCorroborated: 0,
      telegramCorroborated: 0,
      dataCoverageReviews: 0,
    },
    coverage: {
      walletsEvaluated: 4,
      riskMemoryAvailable: true,
      riskMemoryPartial: false,
      campaignsConsidered: 2,
      analysesConsidered: 2,
    },
    recommendations,
    ...overrides,
  }
}

function review(clusterLabel: string, disposition: ClusterReviewRecord["disposition"], createdAt = "2026-08-21T12:20:00.000Z"): ClusterReviewRecord {
  return {
    id: `${clusterLabel}-${disposition}`,
    analysisId: "analysis-package",
    clusterLabel,
    reviewerId: "reviewer",
    reviewerName: "Reviewer",
    disposition,
    notes: null,
    source: "cluster_workspace",
    createdAt,
  }
}

test("maps matching policy recommendations into Allow Review Exclude without mutating stored state", () => {
  const source = analysis()
  const before = JSON.stringify(source)
  const pkg = buildCampaignDecisionPackage({
    analysis: source,
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: policy(),
  })
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(
    { allow: pkg.summary.allowCount, review: pkg.summary.reviewCount, exclude: pkg.summary.excludeCount },
    { allow: 2, review: 1, exclude: 1 },
  )
  assert.equal(pkg.summary.humanDecisionsPreserved, 1)
  assert.equal(pkg.summary.policyChangesStoredDecision, 2)
  assert.equal(pkg.wallets[0]?.walletAddress, addresses[0])
  assert.equal(pkg.wallets[1]?.finalHumanDecision, "approved")
})

test("grouping-not-supported is a warning and never rewrites wallet execution actions", () => {
  const pkg = buildCampaignDecisionPackage({
    analysis: analysis(),
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: policy(),
    clusterReviews: [review("CL-001", "grouping_not_supported")],
  })
  assert.ok(pkg.readiness.warnings.some((item) => item.code === "CLUSTER_GROUPING_NOT_SUPPORTED"))
  assert.equal(pkg.wallets.find((item) => item.walletAddress === addresses[0])?.executionAction, "allow")
  assert.equal(pkg.wallets.find((item) => item.walletAddress === addresses[1])?.executionAction, "allow")
})

test("escalated and needs-more-data cluster reviews block readiness without changing wallet actions", () => {
  const pkg = buildCampaignDecisionPackage({
    analysis: analysis(),
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: policy({
      recommendations: policy().recommendations.map((item) =>
        item.walletAddress.toLowerCase() === addresses[3]
          ? { ...item, recommendedAction: "approve", requiresHumanReview: false, changesAutomatedDecision: false }
          : item,
      ),
      summary: { ...policy().summary, reviewRecommendations: 0 },
    }),
    clusterReviews: [
      review("CL-001", "needs_more_data"),
      review("CL-002", "escalate"),
    ],
  })
  assert.equal(pkg.readiness.status, "review_required")
  assert.ok(pkg.readiness.blockers.some((item) => item.code === "CLUSTER_NEEDS_MORE_DATA"))
  assert.ok(pkg.readiness.blockers.some((item) => item.code === "CLUSTER_INVESTIGATION_ESCALATED"))
  assert.equal(pkg.wallets.find((item) => item.walletAddress === addresses[2])?.executionAction, "exclude")
})

test("wallet review and partial coverage keep the campaign package in review-required state", () => {
  const sourcePolicy = policy()
  const pkg = buildCampaignDecisionPackage({
    analysis: analysis(),
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: {
      ...sourcePolicy,
      coverage: { ...sourcePolicy.coverage, riskMemoryPartial: true },
      summary: { ...sourcePolicy.summary, dataCoverageReviews: 1 },
    },
  })
  assert.equal(pkg.readiness.status, "review_required")
  assert.ok(pkg.readiness.blockers.some((item) => item.code === "WALLET_REVIEW_REQUIRED"))
  assert.ok(pkg.readiness.blockers.some((item) => item.code === "RISK_MEMORY_PARTIAL"))
  assert.ok(pkg.readiness.blockers.some((item) => item.code === "DATA_COVERAGE_REVIEW"))
})

test("analysis mismatch withholds the execution list instead of mixing policy runs", () => {
  const pkg = buildCampaignDecisionPackage({
    analysis: analysis(),
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: policy({ analysisId: "analysis-newer" }),
  })
  assert.equal(pkg.readiness.status, "analysis_mismatch")
  assert.equal(pkg.policy.status, "analysis_mismatch")
  assert.deepEqual(pkg.wallets, [])
  assert.deepEqual(
    { allow: pkg.summary.allowCount, review: pkg.summary.reviewCount, exclude: pkg.summary.excludeCount },
    { allow: 0, review: 0, exclude: 0 },
  )
})

test("missing policy withholds the execution list", () => {
  const pkg = buildCampaignDecisionPackage({
    analysis: analysis(),
    campaignId: "campaign-package",
    campaignName: "Package Campaign",
    policyReport: null,
  })
  assert.equal(pkg.readiness.status, "policy_unavailable")
  assert.equal(pkg.policy.status, "unavailable")
  assert.equal(pkg.wallets.length, 0)
})
