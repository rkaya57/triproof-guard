import assert from "node:assert/strict"
import test from "node:test"

import { buildClusterInvestigation } from "@/lib/cluster-investigation/builder"
import { assessClusterSupport } from "@/lib/cluster-investigation/intelligence"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"
import type { AnalysisDetail, WalletRiskResult } from "@/types"

function wallet(address: string): WalletRiskResult {
  return {
    walletAddress: address,
    chain: "Base",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 70,
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Stored review decision.",
    fundingSource: "0x9999999999999999999999999999999999999999",
    txCount: 20,
    walletAgeDays: 30,
    totalVolume: 10,
    contractsCount: 3,
    campaignActionsCount: 2,
    clusterId: "CL-001",
    reasons: [],
    decisionEvidence: {
      schemaVersion: "campaign-security-explanation-v1",
      decision: "manual_review",
      recommendedAction: "manual_review",
      evidenceConfidence: "high",
      evidenceFamilies: ["funding", "timing"],
      independentRiskFamilyCount: 2,
      evidence: [
        {
          code: "FUNDING_RISK",
          family: "funding",
          effect: "risk_signal",
          title: "Funding risk",
          description: "Stored funding risk evidence.",
          source: "risk_engine",
        },
        {
          code: "TIMING_CORROBORATION",
          family: "timing",
          effect: "corroborating_signal",
          title: "Timing corroboration",
          description: "Stored timing corroboration.",
          source: "risk_engine",
        },
      ],
      limitations: [],
      requiresHumanReview: true,
      humanReview: null,
    },
  }
}

function analysis(clusterReasons?: string[]): AnalysisDetail {
  const wallets = [
    wallet("0x1111111111111111111111111111111111111111"),
    wallet("0x2222222222222222222222222222222222222222"),
    wallet("0x3333333333333333333333333333333333333333"),
  ]
  return {
    id: "analysis-cluster-support",
    status: "completed",
    totalWallets: 3,
    approvedCount: 0,
    manualReviewCount: 3,
    rejectedCount: 0,
    averageRiskScore: 70,
    suspiciousClustersCount: 1,
    csvFileName: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    completedAt: "2026-08-20T00:01:00.000Z",
    project: {
      id: "project-cluster-support",
      name: "Cluster Support Test",
      campaignType: "Airdrop",
      chain: "Base",
      notes: null,
    },
    wallets,
    clusters: [{
      clusterLabel: "CL-001",
      walletCount: 3,
      averageRiskScore: 70,
      sharedFundingSource: "0x9999999999999999999999999999999999999999",
      behaviorSimilarityScore: 80,
      suggestedAction: "manual_review",
      reasons: clusterReasons ?? [
        "Funding evidence: shared first observed funding source",
        "Temporal evidence: tightly aligned first funding or first observed activity window",
      ],
      walletAddresses: wallets.map((item) => item.walletAddress),
    }],
  }
}

function fundingRelationship(overrides: Partial<FundingDecisionRelationshipInput> = {}): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "rel-1",
    kind: "SAME_FUNDER",
    chain: "Base",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x2222222222222222222222222222222222222222",
    viaAddress: "0x9999999999999999999999999999999999999999",
    hopCount: 1,
    cohortSize: 3,
    confidence: 90,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["evt-1"],
    observedAt: "2026-08-20T00:00:30.000Z",
    metadata: {},
    ...overrides,
  }
}

function assessment(inputAnalysis: AnalysisDetail, relationships: FundingDecisionRelationshipInput[] = []) {
  const report = buildClusterInvestigation({
    analysis: inputAnalysis,
    clusterLabel: "CL-001",
    fundingRelationships: relationships,
  })
  assert.ok(report)
  return assessClusterSupport(report, inputAnalysis)
}

test("corroborated stored cluster can reach high support confidence without changing decisions", () => {
  const base = analysis()
  const before = base.wallets.map((item) => ({ status: item.status, riskScore: item.riskScore, clusterId: item.clusterId }))
  const result = assessment(base, [fundingRelationship()])

  assert.equal(result.confidence, "high")
  assert.equal(result.score, 81)
  assert.equal(result.observedIndependentFamilies, 2)
  assert.equal(result.context.graphEdgesScoredIndependently, false)
  assert.deepEqual(
    base.wallets.map((item) => ({ status: item.status, riskScore: item.riskScore, clusterId: item.clusterId })),
    before,
  )
})

test("single stored family is capped below medium confidence even with canonical funding", () => {
  const result = assessment(
    analysis(["Funding evidence: shared first observed funding source"]),
    [fundingRelationship()],
  )
  assert.equal(result.qualifiesByStoredRule, false)
  assert.equal(result.confidence, "low")
  assert.ok(result.score < 50)
})

test("neutralized infrastructure funding contributes zero canonical support points", () => {
  const result = assessment(analysis(), [
    fundingRelationship({
      riskBearing: false,
      suppressionReason: "neutral_infrastructure_fanout",
    }),
  ])
  assert.equal(result.factors.some((factor) => factor.code === "CANONICAL_RISK_BEARING_FUNDING"), false)
  assert.equal(result.context.neutralizedFundingRelationships, 1)
  assert.ok(result.limitations.some((item) => /zero support points/i.test(item)))
})

test("supplemental funding cannot manufacture a missing independent stored family", () => {
  const base = analysis(["Temporal evidence: tightly aligned first funding or first observed activity window"])
  const result = assessment(base, [fundingRelationship()])
  assert.equal(result.observedIndependentFamilies, 1)
  assert.equal(result.factors.some((factor) => factor.code === "CANONICAL_RISK_BEARING_FUNDING"), false)
  assert.equal(result.confidence, "low")
})

test("missing wallet evidence coverage degrades transparently instead of inventing support", () => {
  const base = analysis()
  const report = buildClusterInvestigation({ analysis: base, clusterLabel: "CL-001" })
  assert.ok(report)
  const result = assessClusterSupport(report)
  assert.equal(result.score, 50)
  assert.equal(result.confidence, "medium")
  assert.ok(result.limitations.some((item) => /was not supplied/i.test(item)))
})
