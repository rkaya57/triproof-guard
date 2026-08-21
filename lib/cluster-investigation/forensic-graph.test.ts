import assert from "node:assert/strict"
import test from "node:test"

import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  buildForensicGraphProjection,
  forensicGraphFilters,
} from "@/lib/cluster-investigation/forensic-graph"

function report(): ClusterInvestigationReport {
  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis-forensic",
    project: {
      id: "campaign-forensic",
      name: "Forensic Campaign",
      campaignType: "Airdrop",
      chain: "Ethereum",
      notes: null,
    },
    cluster: {
      clusterLabel: "CL-FG",
      walletCount: 2,
      averageRiskScore: 62,
      behaviorSimilarityScore: 76,
      suggestedAction: "manual_review",
      sharedFundingSource: null,
      storedReasons: [],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: 2,
      observedIndependentFamilies: 0,
      qualifiesByStoredRule: false,
      headline: "Stored grouping",
      explanation: "Stored grouping context.",
      families: [],
      caveats: ["No attribution claim."],
    },
    members: [{
      walletAddress: "0x1111111111111111111111111111111111111111",
      chain: "Ethereum",
      riskScore: 62,
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
    }],
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

function lane(source: ReturnType<typeof buildForensicGraphProjection>, filter: (typeof forensicGraphFilters)[number]) {
  const result = source.lanes.find((item) => item.filter === filter)
  assert.ok(result)
  return result
}

test("always exposes the six roadmap forensic lanes in stable order", () => {
  const projection = buildForensicGraphProjection(report())
  assert.deepEqual(projection.lanes.map((item) => item.filter), forensicGraphFilters)
})

test("neutral bridge funding stays neutral in both Funding and Bridge views", () => {
  const source = report()
  source.provenance.funding.relationshipCount = 1
  source.provenance.funding.neutralizedCount = 1
  source.provenance.funding.relationshipKinds = ["FUNDED_BY"]
  source.provenance.funding.relationships = [{
    relationshipKey: "bridge-funding",
    kind: "FUNDED_BY",
    chain: "Ethereum",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x2222222222222222222222222222222222222222",
    viaAddress: "bridge-router",
    hopCount: 1,
    cohortSize: 4,
    confidence: 96,
    riskBearing: false,
    suppressionReason: "Known bridge infrastructure fan-out",
    observedAt: "2026-08-21T10:00:00.000Z",
    evidenceEventKeys: ["tx-bridge"],
  }]

  const projection = buildForensicGraphProjection(source)
  assert.equal(lane(projection, "funding").items[0]?.effect, "neutralized")
  assert.equal(lane(projection, "bridge").items[0]?.effect, "neutralized")
  assert.equal(lane(projection, "bridge").riskBearingCount, 0)
})

test("risk-bearing funding provenance is preserved without being re-scored", () => {
  const source = report()
  source.provenance.funding.relationshipCount = 1
  source.provenance.funding.riskBearingCount = 1
  source.provenance.funding.relationshipKinds = ["SAME_FUNDER"]
  source.provenance.funding.relationships = [{
    relationshipKey: "risk-funding",
    kind: "SAME_FUNDER",
    chain: "Ethereum",
    sourceAddress: "0x1111111111111111111111111111111111111111",
    targetAddress: "0x2222222222222222222222222222222222222222",
    viaAddress: null,
    hopCount: 1,
    cohortSize: 5,
    confidence: 91,
    riskBearing: true,
    suppressionReason: null,
    observedAt: null,
    evidenceEventKeys: [],
  }]

  const funding = lane(buildForensicGraphProjection(source), "funding")
  assert.equal(funding.riskBearingCount, 1)
  assert.equal(funding.items[0]?.confidence, 91)
})

test("CIRCULAR_PATH appears in Transfers as context instead of gaining a new risk effect", () => {
  const source = report()
  source.members[0]!.decisionEvidenceCodes = ["CIRCULAR_PATH"]
  const transfers = lane(buildForensicGraphProjection(source), "transfers")

  assert.equal(transfers.itemCount, 1)
  assert.equal(transfers.items[0]?.kind, "CIRCULAR_PATH")
  assert.equal(transfers.items[0]?.effect, "context")
  assert.equal(transfers.riskBearingCount, 0)
})

test("contract provenance edges are isolated in the Contracts lane without risk promotion", () => {
  const source = report()
  source.provenance.graph.edgeCount = 1
  source.provenance.graph.edges = [{
    edgeKey: "deployer-edge",
    sourceKey: "contract:1",
    targetKey: "deployer:1",
    kind: "DEPLOYED_BY",
    confidence: 88,
    riskBearing: false,
    componentId: "GC-1",
    observedAt: null,
    transactionId: null,
    evidence: ["Contract deployer provenance."],
  }]

  const contracts = lane(buildForensicGraphProjection(source), "contracts")
  assert.equal(contracts.itemCount, 1)
  assert.equal(contracts.items[0]?.effect, "context")
  assert.equal(contracts.riskBearingCount, 0)
})

test("stored Behavior and Timing grouping families remain stored context", () => {
  const source = report()
  source.grouping.families = [
    { family: "behavior", label: "Behavior similarity", storedReason: "Behavior evidence: similar activity shape" },
    { family: "temporal", label: "Temporal coordination", storedReason: "Temporal evidence: synchronized activity window" },
  ]

  const projection = buildForensicGraphProjection(source)
  assert.equal(lane(projection, "behavior").items[0]?.effect, "stored_context")
  assert.equal(lane(projection, "timing").items[0]?.effect, "stored_context")
})

test("a transfer timeline item preserves its existing risk-bearing state", () => {
  const source = report()
  source.timeline.items = [{
    id: "transfer-event",
    observedAt: "2026-08-21T11:00:00.000Z",
    source: "onchain_event",
    kind: "token_transfer",
    title: "Token transfer",
    description: "Stored transfer relationship from the normalized event layer.",
    walletAddresses: [source.members[0]!.walletAddress],
    transactionId: "0xtx",
    riskBearing: true,
    confidence: 83,
  }]
  source.timeline.totalCandidates = 1

  const transfers = lane(buildForensicGraphProjection(source), "transfers")
  assert.equal(transfers.items[0]?.effect, "risk_bearing")
  assert.equal(transfers.items[0]?.transactionId, "0xtx")
})

test("forensic filters are read-only and preserve explicit graph decision boundaries", () => {
  const source = report()
  source.members[0]!.decisionEvidenceCodes = ["BOT_PATTERN"]
  const before = JSON.stringify(source)
  const projection = buildForensicGraphProjection(source)

  assert.equal(JSON.stringify(source), before)
  assert.ok(projection.boundaries.some((item) => item.includes("never create, upgrade, or suppress")))
  assert.ok(projection.boundaries.some((item) => item.includes("does not change cluster membership")))
  assert.equal(source.members[0]!.status, "manual_review")
})
