import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"

export const CLUSTER_REVIEW_SNAPSHOT_SCHEMA_VERSION = "tri-proof-cluster-review-snapshot-v1" as const

export const clusterReviewDispositions = [
  "grouping_supported",
  "grouping_not_supported",
  "needs_more_data",
  "escalate",
] as const

export type ClusterReviewDisposition = (typeof clusterReviewDispositions)[number]

export type ClusterReviewRecord = {
  id: string
  analysisId: string
  clusterLabel: string
  reviewerId: string
  reviewerName: string
  disposition: ClusterReviewDisposition
  notes: string | null
  source: string
  createdAt: string
}

export function normalizeClusterReviewDisposition(value: unknown): ClusterReviewDisposition | null {
  return clusterReviewDispositions.includes(value as ClusterReviewDisposition)
    ? (value as ClusterReviewDisposition)
    : null
}

export function clusterReviewDispositionLabel(value: ClusterReviewDisposition) {
  if (value === "grouping_supported") return "Grouping supported"
  if (value === "grouping_not_supported") return "Grouping not supported"
  if (value === "needs_more_data") return "Needs more data"
  return "Escalate"
}

export function buildClusterReviewEvidenceSnapshot(report: ClusterInvestigationReport) {
  return {
    schemaVersion: CLUSTER_REVIEW_SNAPSHOT_SCHEMA_VERSION,
    analysisId: report.analysisId,
    project: {
      id: report.project.id,
      name: report.project.name,
      campaignType: report.project.campaignType,
      chain: report.project.chain,
    },
    cluster: {
      clusterLabel: report.cluster.clusterLabel,
      walletCount: report.cluster.walletCount,
      averageRiskScore: report.cluster.averageRiskScore,
      behaviorSimilarityScore: report.cluster.behaviorSimilarityScore,
      suggestedAction: report.cluster.suggestedAction,
      sharedFundingSource: report.cluster.sharedFundingSource,
      storedReasons: [...report.cluster.storedReasons],
    },
    grouping: {
      qualifiesByStoredRule: report.grouping.qualifiesByStoredRule,
      observedWallets: report.grouping.observedWallets,
      minimumWallets: report.grouping.minimumWallets,
      observedIndependentFamilies: report.grouping.observedIndependentFamilies,
      minimumIndependentFamilies: report.grouping.minimumIndependentFamilies,
      families: report.grouping.families.map((family) => ({ ...family })),
      caveats: [...report.grouping.caveats],
    },
    members: report.members.map((member) => ({
      walletAddress: member.walletAddress,
      chain: member.chain,
      riskScore: member.riskScore,
      riskLevel: member.riskLevel,
      status: member.status,
      recommendedAction: member.recommendedAction,
      graphComponentId: member.graphComponentId,
      fundingSource: member.fundingSource,
      evidenceConfidence: member.evidenceConfidence,
      decisionEvidenceFamilies: [...member.decisionEvidenceFamilies],
      decisionEvidenceCodes: [...member.decisionEvidenceCodes],
      teamReview: member.teamReview
        ? {
            finalStatus: member.teamReview.finalStatus,
            feedbackLabel: member.teamReview.feedbackLabel,
            reviewerName: member.teamReview.reviewerName,
            updatedAt: member.teamReview.updatedAt,
          }
        : null,
    })),
    provenance: {
      funding: {
        relationshipCount: report.provenance.funding.relationshipCount,
        riskBearingCount: report.provenance.funding.riskBearingCount,
        neutralizedCount: report.provenance.funding.neutralizedCount,
        relationshipKeys: report.provenance.funding.relationships.map((relationship) => relationship.relationshipKey),
      },
      graph: {
        componentIds: [...report.provenance.graph.componentIds],
        nodeCount: report.provenance.graph.nodeCount,
        edgeCount: report.provenance.graph.edgeCount,
        riskBearingEdgeCount: report.provenance.graph.riskBearingEdgeCount,
        neutralEdgeCount: report.provenance.graph.neutralEdgeCount,
        edgeKeys: report.provenance.graph.edges.map((edge) => edge.edgeKey),
      },
    },
    timeline: {
      totalCandidates: report.timeline.totalCandidates,
      exportedItems: report.timeline.items.length,
      truncated: report.timeline.truncated,
      itemIds: report.timeline.items.map((item) => item.id),
    },
    boundaries: [
      "This reviewer disposition does not change cluster membership.",
      "This reviewer disposition does not recompute wallet risk scores, wallet status, policy results, or suggested actions.",
      "Grouping support means the stored grouping is supported by the reviewed evidence; it is not proof that one actor controls every wallet.",
      "Neutralized infrastructure funding remains neutral context and is not converted into Sybil risk by review.",
    ],
  }
}
