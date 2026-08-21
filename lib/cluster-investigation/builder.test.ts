import assert from "node:assert/strict"
import test from "node:test"

import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { buildClusterInvestigation, storedGroupingFamilies } from "@/lib/cluster-investigation/builder"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"
import type { AnalysisDetail, WalletGraphEdge, WalletGraphNode, WalletRiskResult } from "@/types"

const solA = "So11111111111111111111111111111111111111112"
const solB = "7YttLkHDoVJQYcz8oQkwqL6J5bFhW8yGJyk6i8dW9Aaa"
const solC = "9xQeWvG816bUx9EPfEZ4q6QF3oMZQh9mQXWmYpCkBbbb"

function wallet(address: string, overrides: Partial<WalletRiskResult> = {}): WalletRiskResult {
  const base: WalletRiskResult = {
    walletAddress: address,
    chain: "Solana",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 68,
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Gray Zone: corroborated cluster evidence requires review.",
    fundingSource: "Fund111111111111111111111111111111111111111",
    txCount: 12,
    walletAgeDays: 35,
    totalVolume: 42,
    contractsCount: 3,
    campaignActionsCount: 2,
    clusterId: "CL-001",
    graphComponentId: "GC-001",
    graphRiskScore: 62,
    reasons: [
      "Shared funding source detected across campaign wallets.",
      "Timing cohort matched the same completion time window.",
    ],
    firstSeen: "2026-08-01T10:00:00.000Z",
    lastSeen: "2026-08-10T10:00:00.000Z",
    enrichmentStatus: "completed",
    teamReview: null,
    ...overrides,
  }
  return { ...base, decisionEvidence: buildExplainableDecision(base) }
}

function analysis(overrides: Partial<AnalysisDetail> = {}): AnalysisDetail {
  const wallets = [wallet(solA), wallet(solB, { riskScore: 72 }), wallet(solC, { riskScore: 64 })]
  return {
    id: "analysis-1",
    status: "completed",
    totalWallets: wallets.length,
    approvedCount: 0,
    manualReviewCount: wallets.length,
    rejectedCount: 0,
    averageRiskScore: 68,
    suspiciousClustersCount: 1,
    csvFileName: null,
    createdAt: "2026-08-11T00:00:00.000Z",
    completedAt: "2026-08-11T00:01:00.000Z",
    analysisMode: "onchain",
    riskPolicy: "balanced",
    project: {
      id: "project-1",
      name: "Cluster Test",
      campaignType: "Airdrop",
      chain: "Solana",
      notes: null,
    },
    wallets,
    clusters: [
      {
        clusterLabel: "CL-001",
        walletCount: 3,
        averageRiskScore: 68,
        sharedFundingSource: "Fund111111111111111111111111111111111111111",
        behaviorSimilarityScore: 83,
        suggestedAction: "manual_review",
        reasons: [
          "V1.8 corroborated Sybil cohort: at least two independent relationship signals overlap",
          "Funding evidence: shared first observed funding source",
          "Temporal evidence: tightly aligned first funding or first observed activity window",
          "Funding, timing, behavior, referral, campaign event, or participant evidence is never treated as conclusive in isolation.",
        ],
        walletAddresses: wallets.map((item) => item.walletAddress),
      },
    ],
    graph: null,
    aiBrief: null,
    ...overrides,
  }
}

function relationship(overrides: Partial<FundingDecisionRelationshipInput> = {}): FundingDecisionRelationshipInput {
  return {
    relationshipKey: "fund-rel-1",
    kind: "SAME_FUNDER",
    chain: "Solana",
    sourceAddress: solA,
    targetAddress: solB,
    viaAddress: "Fund111111111111111111111111111111111111111",
    hopCount: 1,
    cohortSize: 3,
    confidence: 91,
    riskBearing: true,
    suppressionReason: null,
    evidenceEventKeys: ["evt-1"],
    observedAt: "2026-08-02T10:00:00.000Z",
    metadata: {},
    ...overrides,
  }
}

const nodes: WalletGraphNode[] = [
  {
    nodeKey: "wallet:a",
    address: solA,
    chain: "Solana",
    kind: "wallet",
    label: null,
    walletAddress: solA,
    componentId: "GC-001",
    metadata: {},
  },
  {
    nodeKey: "wallet:b",
    address: solB,
    chain: "Solana",
    kind: "wallet",
    label: null,
    walletAddress: solB,
    componentId: "GC-001",
    metadata: {},
  },
]

const edges: WalletGraphEdge[] = [
  {
    edgeKey: "edge-1",
    sourceKey: "wallet:a",
    targetKey: "wallet:b",
    kind: "funded",
    confidence: 88,
    isRiskBearing: true,
    componentId: "GC-001",
    observedAt: "2026-08-03T10:00:00.000Z",
    transactionId: "tx-graph-1",
    amount: 1,
    evidence: ["shared funding"],
    metadata: {},
  },
]

test("stored grouping basis explains the original deterministic cluster rule", () => {
  const report = buildClusterInvestigation({ analysis: analysis(), clusterLabel: "CL-001" })
  assert.ok(report)
  assert.equal(report.grouping.observedIndependentFamilies, 2)
  assert.equal(report.grouping.qualifiesByStoredRule, true)
  assert.deepEqual(report.grouping.families.map((item) => item.family), ["funding", "temporal"])
  assert.match(report.grouping.explanation, /does not recompute cluster membership/)
})

test("a single stored relationship family is never described as sufficient corroboration", () => {
  const base = analysis()
  base.clusters[0] = {
    ...base.clusters[0],
    reasons: ["Funding evidence: shared first observed funding source"],
  }
  const report = buildClusterInvestigation({ analysis: base, clusterLabel: "CL-001" })
  assert.ok(report)
  assert.equal(report.grouping.observedIndependentFamilies, 1)
  assert.equal(report.grouping.qualifiesByStoredRule, false)
})

test("neutralized funding stays neutralized in provenance and timeline", () => {
  const report = buildClusterInvestigation({
    analysis: analysis(),
    clusterLabel: "CL-001",
    fundingRelationships: [
      relationship({
        riskBearing: false,
        suppressionReason: "neutral_infrastructure_fanout",
      }),
    ],
  })
  assert.ok(report)
  assert.equal(report.provenance.funding.riskBearingCount, 0)
  assert.equal(report.provenance.funding.neutralizedCount, 1)
  const item = report.timeline.items.find((candidate) => candidate.id === "funding:fund-rel-1")
  assert.ok(item)
  assert.equal(item.riskBearing, false)
  assert.match(item.description, /neutralized canonical funding context/)
})

test("stored human review is displayed as member context without changing grouping", () => {
  const base = analysis()
  base.wallets[0] = wallet(solA, {
    teamReview: {
      finalStatus: "approved",
      feedbackLabel: "trusted_user",
      notes: "Verified campaign partner.",
      reviewerName: "Reviewer",
      updatedAt: "2026-08-12T00:00:00.000Z",
    },
  })
  const report = buildClusterInvestigation({ analysis: base, clusterLabel: "CL-001" })
  assert.ok(report)
  assert.equal(report.members.find((member) => member.walletAddress === solA)?.teamReview?.finalStatus, "approved")
  assert.equal(report.grouping.qualifiesByStoredRule, true)
})

test("timeline merges wallet, event, funding, and graph context chronologically", () => {
  const report = buildClusterInvestigation({
    analysis: analysis(),
    clusterLabel: "CL-001",
    fundingRelationships: [relationship()],
    graphNodes: nodes,
    graphEdges: edges,
    events: [
      {
        eventKey: "evt-onchain",
        chain: "Solana",
        txHash: "tx-onchain",
        walletAddress: solA,
        counterpartyAddress: solB,
        kind: "native_transfer",
        direction: "outbound",
        assetSymbol: "SOL",
        amount: "0.5",
        observedAt: "2026-08-04T10:00:00.000Z",
        confidence: 95,
      },
    ],
  })
  assert.ok(report)
  const dated = report.timeline.items.filter((item) => item.observedAt)
  const timestamps = dated.map((item) => Date.parse(item.observedAt as string))
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => a - b))
  assert.ok(report.timeline.items.some((item) => item.source === "onchain_event"))
  assert.ok(report.timeline.items.some((item) => item.source === "funding_provenance"))
  assert.ok(report.timeline.items.some((item) => item.source === "graph"))
})

test("EVM matching is case-insensitive while Solana membership keeps Base58 case", () => {
  const evm = analysis({
    project: { id: "p", name: "EVM", campaignType: "Airdrop", chain: "Ethereum", notes: null },
    wallets: [
      wallet("0x1111111111111111111111111111111111111111", { chain: "Ethereum" }),
      wallet("0x2222222222222222222222222222222222222222", { chain: "Ethereum" }),
      wallet("0x3333333333333333333333333333333333333333", { chain: "Ethereum" }),
    ],
  })
  evm.clusters[0] = {
    ...evm.clusters[0],
    walletAddresses: evm.wallets.map((item) => item.walletAddress),
  }
  const evmReport = buildClusterInvestigation({
    analysis: evm,
    clusterLabel: "CL-001",
    fundingRelationships: [
      relationship({
        chain: "Ethereum",
        sourceAddress: "0X1111111111111111111111111111111111111111",
        targetAddress: "0x2222222222222222222222222222222222222222",
      }),
    ],
  })
  assert.equal(evmReport?.provenance.funding.relationshipCount, 1)

  const solReport = buildClusterInvestigation({
    analysis: analysis(),
    clusterLabel: "CL-001",
    fundingRelationships: [relationship({ sourceAddress: solA.toLowerCase(), targetAddress: "not-a-member" })],
  })
  assert.equal(solReport?.provenance.funding.relationshipCount, 0)
})

test("stored grouping family parser does not invent unsupported families", () => {
  const families = storedGroupingFamilies([
    "V1.8 corroborated Sybil cohort: at least two independent relationship signals overlap",
    "Unrecognized historical note",
  ])
  assert.deepEqual(families, [])
})
