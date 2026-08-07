import assert from "node:assert/strict"
import test from "node:test"

import {
  AI_CLUSTER_EVIDENCE_SCHEMA_VERSION,
  buildAiClusterEvidencePacket,
  generateAiClusterAssessment,
  parseAiClusterModelResponse,
} from "./cluster-analyst"
import type { ClusterResult, WalletGraphSummary, WalletRiskResult } from "@/types"

const WALLET_A = "0x1111111111111111111111111111111111111111"
const WALLET_B = "0x2222222222222222222222222222222222222222"
const FUNDER = "0x3333333333333333333333333333333333333333"

function wallet(
  address: string,
  overrides: Partial<WalletRiskResult> = {}
): WalletRiskResult {
  return {
    walletAddress: address,
    chain: "Ethereum",
    entityLabel: null,
    entityType: "user",
    entityRiskReason: null,
    riskScore: 48,
    riskLevel: "medium",
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: "Requires review.",
    fundingSource: FUNDER,
    txCount: 420,
    walletAgeDays: 520,
    totalVolume: 310,
    contractsCount: 41,
    campaignActionsCount: 4,
    clusterId: "cluster-1",
    reasons: ["Shared funding pattern"],
    uniqueCounterparties: 92,
    enrichmentProvider: "alchemy",
    enrichmentStatus: "completed",
    ...overrides,
  }
}

const cluster: ClusterResult = {
  clusterLabel: "cluster-1",
  walletCount: 2,
  averageRiskScore: 48,
  sharedFundingSource: FUNDER,
  behaviorSimilarityScore: 71,
  suggestedAction: "manual_review",
  reasons: [
    `Wallets ${WALLET_A} and ${WALLET_B} share funding from ${FUNDER}.`,
    "Behavior similarity is elevated but member histories are mature.",
  ],
  walletAddresses: [WALLET_A, WALLET_B],
}

const graph: WalletGraphSummary = {
  totalNodes: 4,
  totalEdges: 3,
  connectedWallets: 2,
  externalFunders: 1,
  referralLinks: 0,
  highRiskComponents: 0,
  neutralServiceFunders: 0,
  largestComponent: 3,
  maxComponentRisk: 45,
  components: [
    {
      componentId: "component-1",
      nodeKeys: ["w1", "w2", "f1"],
      walletAddresses: [WALLET_A, WALLET_B],
      edgeCount: 2,
      riskScore: 45,
      severity: "caution",
      dominantFunder: FUNDER,
      dominantReferrer: null,
      reasons: ["Shared funding"],
    },
  ],
  findings: [
    {
      code: "GRAPH_SHARED_FUNDER",
      title: "Shared funding",
      description: `${WALLET_A} and ${WALLET_B} connect to ${FUNDER}.`,
      severity: "caution",
      evidenceCount: 2,
      walletAddresses: [WALLET_A, WALLET_B],
      nodeKey: null,
    },
  ],
}

test("cluster evidence packet is aggregate, privacy-reduced, and retains counter-evidence context", () => {
  const packet = buildAiClusterEvidencePacket({
    cluster,
    wallets: [
      wallet(WALLET_A),
      wallet(WALLET_B, {
        status: "approved",
        recommendedAction: "approve",
        riskScore: 22,
        riskLevel: "low",
        walletAgeDays: 800,
        txCount: 900,
        uniqueCounterparties: 180,
      }),
    ],
    graph,
  })
  const serialized = JSON.stringify(packet)

  assert.equal(packet.schemaVersion, AI_CLUSTER_EVIDENCE_SCHEMA_VERSION)
  assert.match(packet.clusterRef, /^ac-[a-f0-9]{16}$/)
  assert.equal(packet.deterministicCluster.hasSharedFundingSource, true)
  assert.equal(packet.members.representedWallets, 2)
  assert.equal(packet.members.decisions.approved, 1)
  assert.equal(packet.members.decisions.manual_review, 1)
  assert.equal(packet.members.activity.walletAgeMaxDays, 800)
  assert.equal(packet.graph?.maxRelatedComponentRisk, 45)
  assert.equal(serialized.includes(WALLET_A), false)
  assert.equal(serialized.includes(WALLET_B), false)
  assert.equal(serialized.includes(FUNDER), false)
  assert.match(serialized, /\[address\]/)
})

test("cluster model response cannot express confirmed Sybil or direct reject action", () => {
  const valid = parseAiClusterModelResponse(
    JSON.stringify({
      evidenceSufficiency: 0.84,
      coordinationEvidenceStrength: 0.7,
      automationEvidenceStrength: 0.2,
      neutralExplanationStrength: 0.55,
      heterogeneityEvidenceStrength: 0.62,
      counterEvidence: ["Members have mature heterogeneous histories."],
      unresolvedQuestions: ["Shared funder role is not independently identified."],
      interpretation: "Coordination indicators exist, but they do not establish common ownership or malicious intent.",
      recommendation: "manual_review",
      confidence: 0.87,
      reasonCodes: ["COORDINATION_REQUIRES_REVIEW"],
      limitations: ["Shared funding is not proof of Sybil identity."],
    })
  )
  assert.equal(valid.success, true)

  const forbidden = parseAiClusterModelResponse(
    JSON.stringify({
      evidenceSufficiency: 1,
      coordinationEvidenceStrength: 1,
      automationEvidenceStrength: 1,
      neutralExplanationStrength: 0,
      heterogeneityEvidenceStrength: 0,
      counterEvidence: [],
      unresolvedQuestions: [],
      interpretation: "Confirmed Sybil cluster.",
      recommendation: "reject",
      confidence: 1,
      reasonCodes: ["CONFIRMED_SYBIL"],
      limitations: [],
    })
  )
  assert.equal(forbidden.success, false)
})

test("disabled cluster analyst returns a neutral no-change fallback", async () => {
  const previous = process.env.AI_CLUSTER_ANALYST_ENABLED
  delete process.env.AI_CLUSTER_ANALYST_ENABLED
  try {
    const result = await generateAiClusterAssessment({
      cluster,
      wallets: [wallet(WALLET_A), wallet(WALLET_B)],
      graph,
    })
    assert.equal(result.source, "fallback")
    assert.equal(result.fallbackReason, "disabled")
    assert.equal(result.recommendation, "no_change")
    assert.equal(result.confidence, null)
    assert.match(result.interpretation, /deterministic cluster analysis remains authoritative/i)
  } finally {
    if (previous === undefined) delete process.env.AI_CLUSTER_ANALYST_ENABLED
    else process.env.AI_CLUSTER_ANALYST_ENABLED = previous
  }
})

test("empty or non-matching cluster membership fails safely", async () => {
  const result = await generateAiClusterAssessment({
    cluster,
    wallets: [wallet("0x4444444444444444444444444444444444444444")],
    graph,
  })
  assert.equal(result.source, "fallback")
  assert.equal(result.fallbackReason, "empty_cluster")
  assert.equal(result.recommendation, "no_change")
})
