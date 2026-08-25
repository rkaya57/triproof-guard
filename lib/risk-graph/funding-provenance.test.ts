import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { sharedRiskGraphNodeKey, SharedRiskGraphBuilder } from "@/lib/risk-graph/builder"
import {
  addFundingProvenanceSource,
  type FundingProvenanceGraphRelationship,
} from "@/lib/risk-graph/funding-provenance"

const campaign = {
  id: "campaign-1",
  name: "Rewards Season",
  chain: "Ethereum",
  campaignType: "Airdrop",
  analysisId: "analysis-1",
}

const walletA = "0x1111111111111111111111111111111111111111"
const walletB = "0x2222222222222222222222222222222222222222"
const funder = "0x3333333333333333333333333333333333333333"

function relationship(
  overrides: Partial<FundingProvenanceGraphRelationship> = {},
): FundingProvenanceGraphRelationship {
  return {
    relationshipKey: "rel-1",
    kind: "FUNDED_BY",
    chain: "ethereum",
    sourceAddress: walletA,
    targetAddress: funder,
    viaAddress: null,
    hopCount: 1,
    cohortSize: 1,
    confidence: 95,
    riskBearing: false,
    suppressionReason: "direct_funding_requires_corroboration",
    evidenceEventKeys: ["event-1"],
    observedAt: "2026-08-01T00:00:00.000Z",
    metadata: {},
    ...overrides,
  }
}

describe("funding provenance shared risk graph adapter", () => {
  it("projects canonical first-funding evidence into wallet-to-funder graph nodes", () => {
    const builder = new SharedRiskGraphBuilder(campaign)
    addFundingProvenanceSource(builder, [relationship()])
    const graph = builder.finalize()

    assert.equal(graph.coverage.fundingProvenance, true)
    const walletKey = sharedRiskGraphNodeKey("wallet", walletA, "ethereum")
    const funderKey = sharedRiskGraphNodeKey("funder", funder, "ethereum")
    assert.ok(graph.nodes.some((node) => node.key === walletKey))
    assert.ok(graph.nodes.some((node) => node.key === funderKey))
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.kind === "FUNDED_BY" &&
          edge.source === walletKey &&
          edge.target === funderKey &&
          edge.sources.includes("funding_provenance") &&
          !edge.riskBearing,
      ),
    )
  })

  it("projects same-funder risk exactly as persisted without re-scoring it", () => {
    const builder = new SharedRiskGraphBuilder(campaign)
    addFundingProvenanceSource(builder, [
      relationship({
        relationshipKey: "same-1",
        kind: "SAME_FUNDER",
        sourceAddress: walletB,
        targetAddress: walletA,
        viaAddress: funder,
        cohortSize: 4,
        riskBearing: true,
        suppressionReason: null,
        evidenceEventKeys: ["event-1", "event-2"],
        metadata: { burstFunding: true, fundingSpreadHours: 6 },
      }),
    ])
    const graph = builder.finalize()
    const edge = graph.edges.find((item) => item.kind === "SAME_FUNDER")

    assert.ok(edge)
    assert.equal(edge.riskBearing, true)
    assert.equal(edge.metadata.viaAddress, funder)
    assert.equal(edge.metadata.cohortSize, 4)
    assert.equal(edge.metadata.burstFunding, true)
  })

  it("keeps a trusted funding source as a service node and non-risk-bearing", () => {
    const builder = new SharedRiskGraphBuilder(campaign)
    addFundingProvenanceSource(builder, [
      relationship({
        suppressionReason: "trusted_funding_source",
        metadata: { trustedFundingSource: true },
      }),
    ])
    const graph = builder.finalize()
    const serviceKey = sharedRiskGraphNodeKey("service", funder, "ethereum")

    assert.ok(graph.nodes.some((node) => node.key === serviceKey))
    assert.ok(graph.edges.some((edge) => edge.target === serviceKey && !edge.riskBearing))
  })

  it("merges duplicate canonical FUNDED_BY evidence into an existing wallet-graph edge key", () => {
    const builder = new SharedRiskGraphBuilder(campaign)
    const walletKey = sharedRiskGraphNodeKey("wallet", walletA, "ethereum")
    const funderKey = sharedRiskGraphNodeKey("funder", funder, "ethereum")
    builder.addNode({
      key: walletKey,
      kind: "wallet",
      label: "Wallet",
      value: walletA,
      chain: "ethereum",
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["wallet_graph"],
      metadata: {},
    })
    builder.addNode({
      key: funderKey,
      kind: "funder",
      label: "Funder",
      value: funder,
      chain: "ethereum",
      riskLevel: "unknown",
      riskScore: null,
      verdict: "unknown",
      sources: ["wallet_graph"],
      metadata: {},
    })
    builder.addEdge({
      key: `funded_by:${walletKey}:${funderKey}`,
      source: walletKey,
      target: funderKey,
      kind: "FUNDED_BY",
      confidence: 88,
      riskBearing: false,
      observedAt: null,
      sources: ["wallet_graph"],
      evidence: ["Legacy funding evidence"],
      metadata: {},
    })

    addFundingProvenanceSource(builder, [relationship()])
    const graph = builder.finalize()
    const fundingEdges = graph.edges.filter((edge) => edge.kind === "FUNDED_BY")

    assert.equal(fundingEdges.length, 1)
    assert.deepEqual(
      new Set(fundingEdges[0]?.sources),
      new Set(["wallet_graph", "funding_provenance"]),
    )
  })
})
