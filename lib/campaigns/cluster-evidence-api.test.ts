import assert from "node:assert/strict"
import test from "node:test"

import {
  buildClusterEvidenceResource,
  clusterMemberKeySet,
  decodeClusterEvidenceCursor,
  encodeClusterEvidenceCursor,
  fundingEvidenceTouchesCluster,
  graphEvidenceTouchesCluster,
  parseClusterEvidenceLane,
  parseClusterEvidencePageSize,
  serializeFundingEvidence,
  serializeGraphEvidence,
} from "@/lib/campaigns/cluster-evidence-api"

test("cluster evidence lane and page size validate independently", () => {
  assert.equal(parseClusterEvidenceLane(null), "funding")
  assert.equal(parseClusterEvidenceLane("GRAPH"), "graph")
  assert.equal(parseClusterEvidenceLane("timeline"), null)
  assert.equal(parseClusterEvidencePageSize(null), 100)
  assert.equal(parseClusterEvidencePageSize("500"), 200)
  assert.equal(parseClusterEvidencePageSize("0"), null)
})

test("evidence cursors are lane-scoped and cannot cross funding and graph lanes", () => {
  const cursor = encodeClusterEvidenceCursor("funding", "row_123")
  assert.deepEqual(decodeClusterEvidenceCursor(cursor, "funding"), { ok: true, id: "row_123" })
  assert.equal(decodeClusterEvidenceCursor(cursor, "graph").ok, false)
  assert.equal(decodeClusterEvidenceCursor("not-a-valid-cursor", "funding").ok, false)
})

test("cluster funding matching preserves EVM case folding and Solana Base58 case", () => {
  const members = clusterMemberKeySet([
    { walletAddress: "0xAbC123", chain: "Base" },
    { walletAddress: "SoLCaseSensitive111", chain: "Solana" },
  ])

  assert.equal(fundingEvidenceTouchesCluster({
    chain: "Base",
    sourceAddress: "0xabc123",
    targetAddress: "0xFunder",
  }, members), true)

  assert.equal(fundingEvidenceTouchesCluster({
    chain: "Solana",
    sourceAddress: "solcasesensitive111",
    targetAddress: "Other",
  }, members), false)

  assert.equal(fundingEvidenceTouchesCluster({
    chain: "Solana",
    sourceAddress: "SoLCaseSensitive111",
    targetAddress: "Other",
  }, members), true)
})

test("stored funding and graph evidence stay bounded without risk promotion", () => {
  const funding = serializeFundingEvidence({
    id: "row_1",
    relationshipKey: "rel_1",
    kind: "SAME_FUNDER",
    chain: "Base",
    sourceAddress: "0x1",
    targetAddress: "0x2",
    viaAddress: "0xbridge",
    hopCount: 1,
    cohortSize: 20,
    confidence: 95,
    riskBearing: false,
    suppressionReason: "neutral_infrastructure_fanout",
    evidenceEventKeys: Array.from({ length: 80 }, (_, index) => `event_${index}`),
    observedAt: "2026-08-22T10:00:00Z",
    metadata: Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`k${index}`, index])),
  })
  assert.equal(funding.riskBearing, false)
  assert.equal(funding.suppressionReason, "neutral_infrastructure_fanout")
  assert.equal(funding.evidenceEventKeys.length, 50)
  assert.equal(Object.keys(funding.metadata).length, 20)

  const graph = serializeGraphEvidence({
    id: "edge_row_1",
    edgeKey: "edge_1",
    sourceKey: "wallet:a",
    targetKey: "wallet:b",
    kind: "TRANSFERRED_TO",
    confidence: 77,
    isRiskBearing: false,
    componentId: "component_1",
    observedAt: null,
    transactionId: null,
    amount: null,
    evidence: Array.from({ length: 50 }, (_, index) => `evidence_${index}`),
    metadata: { context: "stored" },
  })
  assert.equal(graph.riskBearing, false)
  assert.equal(graph.evidence.length, 30)
})

test("graph scope and response pagination use stored context only", () => {
  assert.equal(graphEvidenceTouchesCluster({
    sourceKey: "external:a",
    targetKey: "external:b",
    componentId: "component_1",
  }, new Set(["component_1"]), new Set()), true)

  assert.equal(graphEvidenceTouchesCluster({
    sourceKey: "wallet:member",
    targetKey: "external:b",
    componentId: null,
  }, new Set(), new Set(["wallet:member"])), true)

  const resource = buildClusterEvidenceResource({
    campaignId: "campaign/id",
    analysisId: "analysis id",
    clusterLabel: "CL / 01",
    lane: "graph",
    pageSize: 1,
    items: [{
      id: "edge_row_1",
      edgeKey: "edge_1",
      sourceKey: "wallet:a",
      targetKey: "wallet:b",
      kind: "TRANSFERRED_TO",
      confidence: 80,
      isRiskBearing: true,
      componentId: "component_1",
      observedAt: null,
      transactionId: "0xtx",
      amount: 1,
      evidence: ["stored graph evidence"],
      metadata: {},
    }],
    hasMore: true,
    nextPositionId: "edge_row_1",
    scannedRows: 40,
    scanLimitReached: true,
  })

  assert.equal(resource.pagination.hasMore, true)
  assert.equal(resource.pagination.scanLimitReached, true)
  assert.equal(decodeClusterEvidenceCursor(resource.pagination.nextCursor, "graph").ok, true)
  assert.match(resource.links.members, /campaign%2Fid\/analyses\/analysis%20id\/clusters\/CL%20%2F%2001\/members$/)
  assert.match(resource.boundaries.join(" "), /does not recompute cluster membership/)
})
