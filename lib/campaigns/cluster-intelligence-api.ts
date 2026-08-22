import { assessClusterArchetypes } from "@/lib/cluster-investigation/archetypes"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import type { ClusterSupportIntelligence } from "@/lib/cluster-investigation/intelligence"

export const CAMPAIGN_CLUSTER_INTELLIGENCE_OBJECT = "cluster_intelligence" as const
export const CAMPAIGN_CLUSTER_INTELLIGENCE_API_VERSION = "v2" as const
export const MAX_CLUSTER_MEMBER_PREVIEW = 100
export const MAX_CLUSTER_FUNDING_PREVIEW = 50
export const MAX_CLUSTER_GRAPH_EDGE_PREVIEW = 50
export const MAX_CLUSTER_TIMELINE_PREVIEW = 100

function encode(value: string) {
  return encodeURIComponent(value)
}

export function buildCampaignClusterIntelligenceResource(input: {
  campaignId: string
  analysisId: string
  report: ClusterInvestigationReport
  intelligence: ClusterSupportIntelligence
}) {
  const { campaignId, analysisId, report, intelligence } = input
  const clusterLabel = report.cluster.clusterLabel
  const archetype = assessClusterArchetypes(report)
  const memberPreview = report.members.slice(0, MAX_CLUSTER_MEMBER_PREVIEW).map((member) => ({
    walletAddress: member.walletAddress,
    chain: member.chain,
    riskScore: member.riskScore,
    riskLevel: member.riskLevel,
    storedStatus: member.status,
    storedRecommendedAction: member.recommendedAction,
    graphComponentId: member.graphComponentId,
    fundingSource: member.fundingSource,
    evidenceConfidence: member.evidenceConfidence,
    decisionEvidenceFamilies: [...member.decisionEvidenceFamilies],
    teamReview: member.teamReview,
  }))

  const fundingPreview = report.provenance.funding.relationships
    .slice(0, MAX_CLUSTER_FUNDING_PREVIEW)
    .map((relationship) => ({ ...relationship, evidenceEventKeys: [...relationship.evidenceEventKeys] }))
  const graphEdgePreview = report.provenance.graph.edges
    .slice(0, MAX_CLUSTER_GRAPH_EDGE_PREVIEW)
    .map((edge) => ({ ...edge, evidence: [...edge.evidence] }))
  const timelinePreview = report.timeline.items
    .slice(0, MAX_CLUSTER_TIMELINE_PREVIEW)
    .map((item) => ({ ...item, walletAddresses: [...item.walletAddresses] }))

  return {
    id: `${analysisId}:${clusterLabel}`,
    object: CAMPAIGN_CLUSTER_INTELLIGENCE_OBJECT,
    apiVersion: CAMPAIGN_CLUSTER_INTELLIGENCE_API_VERSION,
    campaignId,
    analysisId,
    clusterLabel,
    cluster: {
      walletCount: report.cluster.walletCount,
      averageRiskScore: report.cluster.averageRiskScore,
      behaviorSimilarityScore: report.cluster.behaviorSimilarityScore,
      storedSuggestedAction: report.cluster.suggestedAction,
      sharedFundingSource: report.cluster.sharedFundingSource,
      storedReasons: [...report.cluster.storedReasons],
    },
    grouping: {
      minimumWallets: report.grouping.minimumWallets,
      minimumIndependentFamilies: report.grouping.minimumIndependentFamilies,
      observedWallets: report.grouping.observedWallets,
      observedIndependentFamilies: report.grouping.observedIndependentFamilies,
      qualifiesByStoredRule: report.grouping.qualifiesByStoredRule,
      headline: report.grouping.headline,
      explanation: report.grouping.explanation,
      families: report.grouping.families.map((family) => ({ ...family })),
      caveats: [...report.grouping.caveats],
    },
    support: intelligence,
    archetype,
    memberPreview,
    memberPreviewMeta: {
      returned: memberPreview.length,
      total: report.members.length,
      truncated: report.members.length > memberPreview.length,
      limit: MAX_CLUSTER_MEMBER_PREVIEW,
    },
    provenance: {
      funding: {
        relationshipCount: report.provenance.funding.relationshipCount,
        riskBearingCount: report.provenance.funding.riskBearingCount,
        neutralizedCount: report.provenance.funding.neutralizedCount,
        relationshipKinds: [...report.provenance.funding.relationshipKinds],
        relationshipPreview: fundingPreview,
        previewTruncated: report.provenance.funding.relationshipCount > fundingPreview.length,
      },
      graph: {
        componentIds: [...report.provenance.graph.componentIds],
        nodeCount: report.provenance.graph.nodeCount,
        edgeCount: report.provenance.graph.edgeCount,
        riskBearingEdgeCount: report.provenance.graph.riskBearingEdgeCount,
        neutralEdgeCount: report.provenance.graph.neutralEdgeCount,
        edgePreview: graphEdgePreview,
        previewTruncated: report.provenance.graph.edgeCount > graphEdgePreview.length,
      },
    },
    timeline: {
      totalCandidates: report.timeline.totalCandidates,
      preview: timelinePreview,
      previewReturned: timelinePreview.length,
      truncated: report.timeline.truncated || report.timeline.totalCandidates > timelinePreview.length,
      limit: MAX_CLUSTER_TIMELINE_PREVIEW,
    },
    boundaries: [
      "This resource is read-only and does not recompute cluster membership, wallet risk, stored wallet decisions, reviewer decisions, or campaign policy.",
      "Cluster Support Confidence describes evidence support for an already-stored grouping; it is not a Sybil probability or common-control finding.",
      "Inferred archetypes are forensic hypotheses only and cannot promote neutral infrastructure context into malicious evidence.",
      "Member, relationship, graph-edge, and timeline arrays are bounded previews; counts describe the stored investigation context independently of preview size.",
    ],
    links: {
      campaign: `/api/v2/campaigns/${encode(campaignId)}`,
      analysis: `/api/v2/campaigns/${encode(campaignId)}/analyses/${encode(analysisId)}`,
      members: `/api/v2/campaigns/${encode(campaignId)}/analyses/${encode(analysisId)}/clusters/${encode(clusterLabel)}/members`,
      decisions: `/api/v2/campaigns/${encode(campaignId)}/decisions`,
      dashboard: `/dashboard/analysis/${encode(analysisId)}/clusters/${encode(clusterLabel)}`,
    },
  }
}

export type CampaignClusterIntelligenceResource = ReturnType<typeof buildCampaignClusterIntelligenceResource>
