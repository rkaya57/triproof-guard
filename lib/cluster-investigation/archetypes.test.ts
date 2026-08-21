import assert from "node:assert/strict"
import test from "node:test"

import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import { assessClusterArchetypes } from "@/lib/cluster-investigation/archetypes"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-archetype",
    project: {
      id: "campaign-archetype",
      name: "Archetype Campaign",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    cluster: {
      clusterLabel: "CL-ARCH",
      walletCount: 4,
      averageRiskScore: 67,
      behaviorSimilarityScore: 60,
      suggestedAction: "manual_review",
      sharedFundingSource: null,
      storedReasons: [],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: 4,
      observedIndependentFamilies: 0,
      qualifiesByStoredRule: true,
      headline: "Stored cluster assignment",
      explanation: "Stored deterministic grouping.",
      families: [],
      caveats: ["Not proof of common control."],
    },
    members: [
      {
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "Ethereum",
        riskScore: 68,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: [],
        decisionEvidenceCodes: [],
        teamReview: null,
        reasons: [],
      },
      {
        walletAddress: "0x2222222222222222222222222222222222222222",
        chain: "Ethereum",
        riskScore: 66,
        riskLevel: "high",
        status: "manual_review",
        recommendedAction: "manual_review",
        graphComponentId: "GC-1",
        fundingSource: null,
        evidenceConfidence: "medium",
        decisionEvidenceFamilies: [],
        decisionEvidenceCodes: [],
        teamReview: null,
        reasons: [],
      },
    ],
    provenance: {
      funding: {
        relationshipCount: 0,
        riskBearingCount: 0,
        neutralizedCount: 0,
        relationshipKinds: [],
        relationships: [],
      },
      graph: {
        componentIds: ["GC-1"],
        nodeCount: 2,
        edgeCount: 0,
        riskBearingEdgeCount: 0,
        neutralEdgeCount: 0,
        edges: [],
      },
    },
    timeline: { items: [], totalCandidates: 0, truncated: false },
  }
}

function family(
  family: ClusterInvestigationReport["grouping"]["families"][number]["family"],
  storedReason: string,
) {
  const labels: Record<typeof family, string> = {
    funding: "Funding",
    temporal: "Temporal coordination",
    behavior: "Behavior similarity",
    referral: "Referral relationship",
    campaign_event: "Campaign-event coordination",
    participant: "Participant fingerprint",
  }
  return { family, label: labels[family], storedReason }
}

function setFamilies(
  source: ClusterInvestigationReport,
  families: ClusterInvestigationReport["grouping"]["families"],
) {
  source.grouping.families = families
  source.grouping.observedIndependentFamilies = families.length
  source.cluster.storedReasons = families.map((item) => item.storedReason)
}

function addRiskFunding(source: ClusterInvestigationReport, kind: "FUNDED_BY" | "SAME_FUNDER" = "FUNDED_BY") {
  source.provenance.funding.relationshipCount = 1
  source.provenance.funding.riskBearingCount = 1
  source.provenance.funding.relationshipKinds = [kind]
  source.provenance.funding.relationships = [{
    relationshipKey: "funding-risk-1",
    kind,
    chain: "Ethereum",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x9999999999999999999999999999999999999999",
    viaAddress: null,
    hopCount: 1,
    cohortSize: 4,
    confidence: 92,
    riskBearing: true,
    suppressionReason: null,
    observedAt: "2026-08-21T10:00:00.000Z",
    evidenceEventKeys: ["event-1"],
  }]
}

test("infers Funding Farm only when stored funding is independently corroborated", () => {
  const source = report()
  setFamilies(source, [
    family("funding", "Funding evidence: shared first observed funding source"),
    family("temporal", "Temporal evidence: tightly aligned first funding window"),
  ])
  addRiskFunding(source, "SAME_FUNDER")

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "funding_farm")
  assert.equal(assessment.primary.confidence, "high")
  assert.ok(assessment.primary.caveats.some((item) => item.includes("Funding reuse alone")))
})

test("infers Behavioral Clone Group from behavior plus independent temporal corroboration", () => {
  const source = report()
  source.cluster.behaviorSimilarityScore = 88
  setFamilies(source, [
    family("behavior", "Behavior evidence: similar activity shape"),
    family("temporal", "Temporal evidence: synchronized activity window"),
  ])

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "behavioral_clone_group")
  assert.ok(assessment.primary.reasons.some((item) => item.includes("behavior similarity")))
})

test("infers Coordinated Claim Group only with campaign-event evidence and corroboration", () => {
  const source = report()
  setFamilies(source, [
    family("campaign_event", "Campaign evidence: coordinated claim-window actions"),
    family("temporal", "Temporal evidence: aligned campaign actions"),
    family("referral", "Referral evidence: shared referral relationships"),
  ])

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "coordinated_claim_group")
  assert.ok(assessment.primary.caveats.some((item) => item.includes("does not prove")))
})

test("requires deterministic circular-path evidence before Transfer Ring becomes primary", () => {
  const source = report()
  source.cluster.behaviorSimilarityScore = 85
  setFamilies(source, [
    family("behavior", "Behavior evidence: similar activity shape"),
    family("temporal", "Temporal evidence: synchronized activity"),
  ])
  source.members[0]!.decisionEvidenceCodes = ["CIRCULAR_PATH"]
  source.members[0]!.reasons = ["Circular transfer path detected in stored Decision Evidence."]

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "transfer_ring")
  assert.ok(assessment.primary.reasons.some((item) => item.includes("CIRCULAR_PATH")))
})

test("bridge context needs independent non-bridge grouping evidence", () => {
  const source = report()
  setFamilies(source, [
    family("behavior", "Behavior evidence: similar bridge-following campaign behavior"),
    family("campaign_event", "Campaign evidence: coordinated actions after bridge activity"),
  ])
  source.provenance.graph.edges = [{
    edgeKey: "bridge-context",
    sourceKey: "wallet:1",
    targetKey: "service:bridge",
    kind: "INTERACTED_WITH",
    confidence: 95,
    riskBearing: false,
    componentId: "GC-1",
    observedAt: "2026-08-21T10:00:00.000Z",
    transactionId: null,
    evidence: ["Known bridge interaction retained as neutral infrastructure context."],
  }]
  source.provenance.graph.edgeCount = 1
  source.provenance.graph.neutralEdgeCount = 1

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "bridge_coordinated_group")
  assert.ok(assessment.primary.caveats.some((item) => item.includes("Bridge usage itself is not a risk signal")))

  const bridgeOnly = report()
  bridgeOnly.members[0]!.reasons = ["Known bridge interaction retained as neutral context."]
  const bridgeOnlyAssessment = assessClusterArchetypes(bridgeOnly)
  assert.equal(bridgeOnlyAssessment.primary.id, "unclassified")
})

test("Possible Shared Operator is secondary to a more concrete supported archetype", () => {
  const source = report()
  setFamilies(source, [
    family("funding", "Funding evidence: shared first observed funding source"),
    family("temporal", "Temporal evidence: aligned funding activity"),
    family("behavior", "Behavior evidence: similar activity shape"),
  ])
  addRiskFunding(source, "FUNDED_BY")
  source.provenance.graph.riskBearingEdgeCount = 1
  source.provenance.graph.edgeCount = 1
  source.provenance.graph.edges = [{
    edgeKey: "risk-graph-1",
    sourceKey: "wallet:1",
    targetKey: "wallet:2",
    kind: "INTERACTED_WITH",
    confidence: 90,
    riskBearing: true,
    componentId: "GC-1",
    observedAt: "2026-08-21T11:00:00.000Z",
    transactionId: null,
    evidence: ["Independent risk-bearing graph context."],
  }]

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "funding_farm")
  const operator = assessment.candidates.find((item) => item.id === "possible_shared_operator")
  assert.ok(operator)
  assert.ok(operator.caveats.some((item) => item.includes("never a common-control finding")))
})

test("shared funding or one relationship family alone never creates a control archetype", () => {
  const source = report()
  setFamilies(source, [family("funding", "Funding evidence: shared first observed funding source")])
  source.provenance.funding.relationshipCount = 1
  source.provenance.funding.relationshipKinds = ["SAME_FUNDER"]
  source.provenance.funding.relationships = [{
    relationshipKey: "shared-context",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x2222222222222222222222222222222222222222",
    viaAddress: "0x9999999999999999999999999999999999999999",
    hopCount: 1,
    cohortSize: 2,
    confidence: 70,
    riskBearing: false,
    suppressionReason: null,
    observedAt: null,
    evidenceEventKeys: [],
  }]

  const assessment = assessClusterArchetypes(source)
  assert.equal(assessment.primary.id, "unclassified")
  assert.ok(!assessment.candidates.some((item) => item.id === "possible_shared_operator"))
})

test("archetype assessment is read-only and preserves explicit attribution boundaries", () => {
  const source = report()
  setFamilies(source, [
    family("behavior", "Behavior evidence: similar activity shape"),
    family("temporal", "Temporal evidence: synchronized activity"),
  ])
  const before = JSON.stringify(source)
  const assessment = assessClusterArchetypes(source)

  assert.equal(JSON.stringify(source), before)
  assert.ok(assessment.boundaries.some((item) => item.includes("do not change risk scores")))
  assert.ok(assessment.boundaries.some((item) => item.includes("No archetype is proof that one person or entity controls")))
  assert.equal(source.members[0]!.status, "manual_review")
})
