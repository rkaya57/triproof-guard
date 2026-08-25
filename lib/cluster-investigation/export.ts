import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"

export const CLUSTER_INVESTIGATION_EXPORT_SCHEMA_VERSION = "tri-proof-cluster-investigation-export-v1" as const

const exportBoundaries = [
  "This export describes stored cluster membership and does not recompute or change it.",
  "Wallet risk scores, wallet statuses, policy results, and suggested actions are stored decision state and are not changed by export generation.",
  "A cluster is an investigation unit; it is not proof that one actor controls every member wallet.",
  "Shared funding or graph context can reflect legitimate infrastructure and must not be treated as standalone proof of common control.",
]

function spreadsheetSafe(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "\"\""
  const text = spreadsheetSafe(String(value))
  return `"${text.replaceAll('"', '""')}"`
}

function join(values: readonly string[]) {
  return values.join(" | ")
}

export function buildClusterInvestigationJsonExport(
  report: ClusterInvestigationReport,
  latestReview: ClusterReviewRecord | null,
) {
  return JSON.stringify(
    {
      schemaVersion: CLUSTER_INVESTIGATION_EXPORT_SCHEMA_VERSION,
      analysisId: report.analysisId,
      clusterLabel: report.cluster.clusterLabel,
      exportBoundaries,
      latestClusterReview: latestReview,
      investigation: report,
    },
    null,
    2,
  )
}

export function buildClusterInvestigationCsvExport(
  report: ClusterInvestigationReport,
  latestReview: ClusterReviewRecord | null,
) {
  const headers = [
    "analysis_id",
    "cluster_label",
    "cluster_wallet_count",
    "cluster_average_risk",
    "cluster_behavior_similarity",
    "cluster_suggested_action",
    "grouping_qualifies_by_stored_rule",
    "grouping_families",
    "wallet_address",
    "chain",
    "wallet_risk_score",
    "wallet_risk_level",
    "stored_wallet_status",
    "stored_recommended_action",
    "decision_evidence_confidence",
    "decision_evidence_families",
    "decision_evidence_codes",
    "wallet_team_review_status",
    "wallet_team_review_feedback",
    "graph_component_id",
    "funding_source",
    "cluster_review_disposition",
    "cluster_review_reviewer",
    "cluster_review_notes",
    "funding_relationship_count",
    "funding_risk_bearing_count",
    "funding_neutralized_count",
    "graph_risk_bearing_edge_count",
    "timeline_exported_items",
    "timeline_total_candidates",
    "timeline_truncated",
    "interpretation_boundary",
  ]

  const groupingFamilies = join(report.grouping.families.map((family) => family.family))
  const boundary = exportBoundaries.join(" ")
  const rows = report.members.map((member) => [
    report.analysisId,
    report.cluster.clusterLabel,
    report.cluster.walletCount,
    report.cluster.averageRiskScore,
    report.cluster.behaviorSimilarityScore,
    report.cluster.suggestedAction,
    report.grouping.qualifiesByStoredRule,
    groupingFamilies,
    member.walletAddress,
    member.chain,
    member.riskScore,
    member.riskLevel,
    member.status,
    member.recommendedAction,
    member.evidenceConfidence ?? "",
    join(member.decisionEvidenceFamilies),
    join(member.decisionEvidenceCodes),
    member.teamReview?.finalStatus ?? "",
    member.teamReview?.feedbackLabel ?? "",
    member.graphComponentId ?? "",
    member.fundingSource ?? "",
    latestReview?.disposition ?? "",
    latestReview?.reviewerName ?? "",
    latestReview?.notes ?? "",
    report.provenance.funding.relationshipCount,
    report.provenance.funding.riskBearingCount,
    report.provenance.funding.neutralizedCount,
    report.provenance.graph.riskBearingEdgeCount,
    report.timeline.items.length,
    report.timeline.totalCandidates,
    report.timeline.truncated,
    boundary,
  ])

  return [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n")
}

export function safeClusterExportFileStem(projectName: string, clusterLabel: string) {
  const safe = `${projectName}-${clusterLabel}`
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
  return safe || "cluster-investigation"
}
