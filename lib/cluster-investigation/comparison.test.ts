import assert from "node:assert/strict"
import test from "node:test"

// Keep the full investigation audit surface inside the existing decision-safety gate.
import "@/lib/cluster-investigation/export.test"
import "@/lib/cluster-investigation/review.test"
import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"
import { buildCrossClusterComparison, MAX_COMPARED_CLUSTERS } from "@/lib/cluster-investigation/comparison"
import type { AnalysisDetail, ClusterResult, WalletRiskResult } from "@/types"

function wallet(address: string, clusterId: string, overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  const base: WalletRiskResult = {
    walletAddress: address,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 65,
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Gray Zone",
    fundingSource: null,
    txCount: 10,
    walletAgeDays: 50,
    totalVolume: 100,
    contractsCount: 2,
    campaignActionsCount: 2,
    clusterId,
    graphComponentId: null,
    graphRiskScore: null,
    reasons: ["Shared funding source detected across campaign wallets."],
    enrichmentStatus: "completed",
    teamReview: null,
    ...overrides,
  }
  return { ...base, decisionEvidence: buildExplainableDecision(base) }
}

function cluster(label: string, reasons: string[], overrides: Partial<ClusterResult> = {}): ClusterResult {
  return {
    clusterLabel: label,
    walletCount: 3,
    averageRiskScore: 65,
    sharedFundingSource: null,
    behaviorSimilarityScore: 80,
    suggestedAction: "manual_review",
    reasons,
    walletAddresses: [],
    ...overrides,
  }
}

const fundingReason = "Funding evidence: shared first observed funding source"
const temporalReason = "Temporal evidence: tightly aligned first funding or first observed activity window"
const behaviorReason = "Behavior evidence: similar activity shape and sampled program/instruction fingerprint"

function analysis(): AnalysisDetail {
  const wallets = [
    wallet("0x1111111111111111111111111111111111111111", "CL-001", { fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", graphComponentId: "GC-A" }),
    wallet("0x2222222222222222222222222222222222222222", "CL-001", { graphComponentId: "GC-A" }),
    wallet("0x3333333333333333333333333333333333333333", "CL-001", { status: "rejected", recommendedAction: "reject", riskScore: 82, riskLevel: "high", graphComponentId: "GC-COMMON" }),
    wallet("0x4444444444444444444444444444444444444444", "CL-002", { fundingSource: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", graphComponentId: "GC-B" }),
    wallet("0x5555555555555555555555555555555555555555", "CL-002", { graphComponentId: "GC-B" }),
    wallet("0x6666666666666666666666666666666666666666", "CL-002", { status: "approved", recommendedAction: "approve", riskScore: 25, riskLevel: "low", graphComponentId: "GC-COMMON", teamReview: { finalStatus: "approved", feedbackLabel: "trusted_user", notes: "Verified", reviewerName: "Reviewer", updatedAt: "2026-08-20T00:00:00.000Z" } }),
    wallet("0x7777777777777777777777777777777777777777", "CL-003"),
    wallet("0x8888888888888888888888888888888888888888", "CL-003"),
    wallet("0x9999999999999999999999999999999999999999", "CL-003"),
    wallet("0x1010101010101010101010101010101010101010", "CL-004"),
    wallet("0x2020202020202020202020202020202020202020", "CL-004"),
    wallet("0x3030303030303030303030303030303030303030", "CL-004"),
    wallet("0x4040404040404040404040404040404040404040", "CL-005"),
    wallet("0x5050505050505050505050505050505050505050", "CL-005"),
    wallet("0x6060606060606060606060606060606060606060", "CL-005"),
  ]
  return {
    id: "analysis-compare",
    status: "completed",
    totalWallets: wallets.length,
    approvedCount: 1,
    manualReviewCount: wallets.length - 2,
    rejectedCount: 1,
    averageRiskScore: 60,
    suspiciousClustersCount: 5,
    csvFileName: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    completedAt: "2026-08-20T00:01:00.000Z",
    analysisMode: "onchain",
    riskPolicy: "balanced",
    project: { id: "project", name: "Comparison", campaignType: "Airdrop", chain: "Ethereum", notes: null },
    wallets,
    clusters: [
      cluster("CL-001", [fundingReason, temporalReason], { averageRiskScore: 72, behaviorSimilarityScore: 86 }),
      cluster("CL-002", [fundingReason, behaviorReason], { averageRiskScore: 51, behaviorSimilarityScore: 77 }),
      cluster("CL-003", [temporalReason, behaviorReason]),
      cluster("CL-004", [fundingReason, temporalReason]),
      cluster("CL-005", [fundingReason, behaviorReason]),
    ],
    graph: null,
    aiBrief: null,
  }
}

function relationship(overrides: Partial<FundingDecisionRelationshipInput> = {}): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "rel-1",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x2222222222222222222222222222222222222222",
    viaAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    hopCount: 1,
    cohortSize: 3,
    confidence: 90,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["evt-1"],
    observedAt: "2026-08-20T00:00:00.000Z",
    metadata: {},
    ...overrides,
  }
}

test("compares stored cluster summaries without changing membership", () => {
  const source = analysis()
  const before = source.wallets.map((item) => item.clusterId)
  const report = buildCrossClusterComparison({ analysis: source, clusterLabels: ["CL-001", "CL-002"] })
  assert.deepEqual(source.wallets.map((item) => item.clusterId), before)
  assert.deepEqual(report.selectedClusterLabels, ["CL-001", "CL-002"])
  assert.equal(report.clusters[0]?.walletCount, 3)
  assert.equal(report.clusters[1]?.teamReviewedCount, 1)
})

test("shared grouping family is descriptive and distinct from shared underlying provenance", () => {
  const report = buildCrossClusterComparison({ analysis: analysis(), clusterLabels: ["CL-001", "CL-002"] })
  assert.deepEqual(report.common.groupingFamilies, ["funding"])
  assert.deepEqual(report.pairwise[0]?.sharedGroupingFamilies, ["funding"])
  assert.ok(report.caveats.some((item) => item.includes("does not mean the same underlying event")))
})

test("shared funding and graph context are surfaced without common-control claims", () => {
  const report = buildCrossClusterComparison({
    analysis: analysis(),
    clusterLabels: ["CL-001", "CL-002"],
    fundingRelationships: [
      relationship(),
      relationship({
        relationshipKey: "rel-2",
        sourceAddress: "0x4444444444444444444444444444444444444444",
        targetAddress: "0x5555555555555555555555555555555555555555",
      }),
    ],
  })
  assert.deepEqual(report.common.fundingSources, ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"])
  assert.deepEqual(report.common.graphComponentIds, ["GC-COMMON"])
  assert.ok(report.caveats.some((item) => item.includes("not standalone proof of common control")))
})

test("status and risk-level distributions are computed from stored member decisions", () => {
  const report = buildCrossClusterComparison({ analysis: analysis(), clusterLabels: ["CL-001", "CL-002"] })
  const left = report.clusters.find((item) => item.clusterLabel === "CL-001")
  const right = report.clusters.find((item) => item.clusterLabel === "CL-002")
  assert.deepEqual(left?.statusCounts, { approved: 0, manual_review: 2, rejected: 1 })
  assert.deepEqual(right?.statusCounts, { approved: 1, manual_review: 2, rejected: 0 })
  assert.equal(right?.riskLevelCounts.low, 1)
})

test("invalid and duplicate cluster labels are ignored before the valid comparison cap", () => {
  const report = buildCrossClusterComparison({
    analysis: analysis(),
    clusterLabels: ["CL-001", "CL-001", "missing", "CL-002", "CL-003", "CL-004", "CL-005"],
  })
  assert.equal(report.selectedClusterLabels.length, MAX_COMPARED_CLUSTERS)
  assert.deepEqual(report.selectedClusterLabels, ["CL-001", "CL-002", "CL-003", "CL-004"])
})

test("pairwise comparison reports metric deltas and no synthetic member overlap", () => {
  const report = buildCrossClusterComparison({ analysis: analysis(), clusterLabels: ["CL-001", "CL-002"] })
  const pair = report.pairwise[0]
  assert.equal(pair?.averageRiskScoreDelta, 21)
  assert.equal(pair?.behaviorSimilarityDelta, 9)
  assert.deepEqual(pair?.sharedMemberWallets, [])
})
