import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCampaignClusterIntelligenceResource,
  MAX_CLUSTER_FUNDING_PREVIEW,
  MAX_CLUSTER_GRAPH_EDGE_PREVIEW,
  MAX_CLUSTER_MEMBER_PREVIEW,
  MAX_CLUSTER_TIMELINE_PREVIEW,
} from "@/lib/campaigns/cluster-intelligence-api"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import type { ClusterSupportIntelligence } from "@/lib/cluster-investigation/intelligence"

function member(index: number): ClusterInvestigationReport["members"][number] {
  return {
    walletAddress: `0x${String(index).padStart(40, "0")}`,
    chain: "Base",
    riskScore: 60 + (index % 20),
    riskLevel: "high",
    status: "manual_review",
    recommendedAction: "manual_review",
    graphComponentId: "GC-1",
    fundingSource: "0x9999999999999999999999999999999999999999",
    evidenceConfidence: "high",
    decisionEvidenceFamilies: ["funding", "timing"],
    decisionEvidenceCodes: ["SHARED_FUNDER", "TIGHT_TIMING"],
    teamReview: null,
    reasons: ["Stored corroborated grouping evidence."],
  }
}

function report(): ClusterInvestigationReport {
  const members = Array.from({ length: 105 }, (_, index) => member(index + 1))
  const fundingRelationships = Array.from({ length: 60 }, (_, index) => ({
    relationshipKey: `fund-${index}`,
    kind: "SAME_FUNDER" as const,
    chain: "Base",
    sourceAddress: members[index % members.length]!.walletAddress,
    targetAddress: members[(index + 1) % members.length]!.walletAddress,
    viaAddress: "0x9999999999999999999999999999999999999999",
    hopCount: 1,
    cohortSize: 105,
    confidence: 90,
    riskBearing: index < 10,
    suppressionReason: index >= 10 ? "neutral_infrastructure_fanout" : null,
    observedAt: "2026-08-01T00:00:00.000Z",
    evidenceEventKeys: [`evt-${index}`],
  }))
  const edges = Array.from({ length: 60 }, (_, index) => ({
    edgeKey: `edge-${index}`,
    sourceKey: `wallet-${index}`,
    targetKey: `wallet-${index + 1}`,
    kind: "funded",
    confidence: 90,
    riskBearing: index < 10,
    componentId: "GC-1",
    observedAt: "2026-08-01T00:00:00.000Z",
    transactionId: `tx-${index}`,
    evidence: [`evidence-${index}`],
  }))
  const timeline = Array.from({ length: 120 }, (_, index) => ({
    id: `timeline-${index}`,
    observedAt: "2026-08-01T00:00:00.000Z",
    source: "graph" as const,
    kind: "funded",
    title: "Graph relationship",
    description: "Stored graph context.",
    walletAddresses: [members[index % members.length]!.walletAddress],
    transactionId: `tx-${index}`,
    riskBearing: index < 10,
    confidence: 90,
  }))

  return {
    schemaVersion: "tri-proof-cluster-investigation-v1",
    analysisId: "analysis/1",
    project: {
      id: "campaign/1",
      name: "Campaign",
      campaignType: "Airdrop",
      chain: "Base",
      notes: null,
    },
    cluster: {
      clusterLabel: "CL / 001",
      walletCount: members.length,
      averageRiskScore: 68,
      behaviorSimilarityScore: 84,
      suggestedAction: "manual_review",
      sharedFundingSource: "0x9999999999999999999999999999999999999999",
      storedReasons: [
        "Funding evidence: shared first observed funding source",
        "Temporal evidence: tightly aligned first funding or first observed activity window",
      ],
    },
    grouping: {
      minimumWallets: 3,
      minimumIndependentFamilies: 2,
      observedWallets: members.length,
      observedIndependentFamilies: 2,
      qualifiesByStoredRule: true,
      headline: "2 independent relationship families overlap",
      explanation: "Stored grouping only; membership is not recomputed.",
      families: [
        { family: "funding", label: "Funding", storedReason: "Funding evidence: shared first observed funding source" },
        { family: "temporal", label: "Temporal coordination", storedReason: "Temporal evidence: tightly aligned first funding or first observed activity window" },
      ],
      caveats: ["Grouping is not proof of common control."],
    },
    members,
    provenance: {
      funding: {
        relationshipCount: fundingRelationships.length,
        riskBearingCount: 10,
        neutralizedCount: 50,
        relationshipKinds: ["SAME_FUNDER"],
        relationships: fundingRelationships,
      },
      graph: {
        componentIds: ["GC-1"],
        nodeCount: 106,
        edgeCount: edges.length,
        riskBearingEdgeCount: 10,
        neutralEdgeCount: 50,
        edges,
      },
    },
    timeline: {
      items: timeline,
      totalCandidates: timeline.length,
      truncated: false,
    },
  }
}

function intelligence(): ClusterSupportIntelligence {
  return {
    schemaVersion: "tri-proof-cluster-support-intelligence-v1",
    clusterLabel: "CL / 001",
    score: 82,
    confidence: "high",
    qualifiesByStoredRule: true,
    observedIndependentFamilies: 2,
    familySupport: [],
    factors: [],
    context: {
      riskBearingFundingRelationships: 10,
      neutralizedFundingRelationships: 50,
      riskBearingGraphEdges: 10,
      graphEdgesScoredIndependently: false,
    },
    limitations: ["Neutralized infrastructure contributes zero points."],
    boundaries: ["Not a Sybil probability."],
  }
}

test("campaign cluster intelligence is read-only and keeps support separate from stored decisions", () => {
  const source = report()
  const sourceBefore = structuredClone(source)
  const resource = buildCampaignClusterIntelligenceResource({
    campaignId: "campaign/1",
    analysisId: "analysis/1",
    report: source,
    intelligence: intelligence(),
  })

  assert.equal(resource.object, "cluster_intelligence")
  assert.equal(resource.support.score, 82)
  assert.equal(resource.support.confidence, "high")
  assert.equal(resource.cluster.storedSuggestedAction, "manual_review")
  assert.equal("decision" in resource, false)
  assert.match(resource.boundaries[0] ?? "", /does not recompute cluster membership/)
  assert.deepEqual(source, sourceBefore)
})

test("campaign cluster intelligence keeps large investigation arrays bounded while preserving totals", () => {
  const resource = buildCampaignClusterIntelligenceResource({
    campaignId: "campaign-1",
    analysisId: "analysis-1",
    report: report(),
    intelligence: intelligence(),
  })

  assert.equal(resource.memberPreview.length, MAX_CLUSTER_MEMBER_PREVIEW)
  assert.equal(resource.memberPreviewMeta.total, 105)
  assert.equal(resource.memberPreviewMeta.truncated, true)
  assert.equal(resource.provenance.funding.relationshipPreview.length, MAX_CLUSTER_FUNDING_PREVIEW)
  assert.equal(resource.provenance.funding.relationshipCount, 60)
  assert.equal(resource.provenance.graph.edgePreview.length, MAX_CLUSTER_GRAPH_EDGE_PREVIEW)
  assert.equal(resource.provenance.graph.edgeCount, 60)
  assert.equal(resource.timeline.preview.length, MAX_CLUSTER_TIMELINE_PREVIEW)
  assert.equal(resource.timeline.totalCandidates, 120)
  assert.equal(resource.timeline.truncated, true)
})

test("neutralized funding remains explicitly neutralized in the API preview", () => {
  const resource = buildCampaignClusterIntelligenceResource({
    campaignId: "campaign-1",
    analysisId: "analysis-1",
    report: report(),
    intelligence: intelligence(),
  })

  assert.equal(resource.support.context.neutralizedFundingRelationships, 50)
  assert.equal(resource.provenance.funding.neutralizedCount, 50)
  assert.ok(resource.provenance.funding.relationshipPreview.some(
    (relationship) => relationship.riskBearing === false && relationship.suppressionReason === "neutral_infrastructure_fanout",
  ))
  assert.match(resource.boundaries[2] ?? "", /cannot promote neutral infrastructure context/)
})

test("canonical API links encode campaign, analysis, and cluster identifiers", () => {
  const resource = buildCampaignClusterIntelligenceResource({
    campaignId: "campaign/id",
    analysisId: "analysis id",
    report: report(),
    intelligence: intelligence(),
  })

  assert.equal(resource.links.campaign, "/api/v2/campaigns/campaign%2Fid")
  assert.equal(resource.links.analysis, "/api/v2/campaigns/campaign%2Fid/analyses/analysis%20id")
  assert.equal(resource.links.dashboard, "/dashboard/analysis/analysis%20id/clusters/CL%20%2F%20001")
})
