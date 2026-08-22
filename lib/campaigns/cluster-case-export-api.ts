import { buildInvestigationCaseBriefMarkdown, type InvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief"
import {
  buildClusterInvestigationCsvExport,
  buildClusterInvestigationJsonExport,
  safeClusterExportFileStem,
} from "@/lib/cluster-investigation/export"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"

export const CAMPAIGN_CLUSTER_CASE_EXPORT_OBJECT = "cluster_case_export" as const
export const CAMPAIGN_CLUSTER_CASE_EXPORT_API_VERSION = "v2" as const

export type CampaignClusterCaseExportFormat = "json" | "csv" | "markdown"

export function parseCampaignClusterCaseExportFormat(raw: string | null): CampaignClusterCaseExportFormat | null {
  const normalized = raw?.trim().toLowerCase() || "json"
  if (normalized === "json" || normalized === "csv") return normalized
  if (normalized === "md" || normalized === "markdown") return "markdown"
  return null
}

export function buildCampaignClusterCaseExport(input: {
  format: CampaignClusterCaseExportFormat
  report: ClusterInvestigationReport
  latestReview: ClusterReviewRecord | null
  caseBrief: InvestigationCaseBrief | null
}) {
  const stem = safeClusterExportFileStem(input.report.project.name, input.report.cluster.clusterLabel)

  if (input.format === "csv") {
    return {
      format: input.format,
      body: buildClusterInvestigationCsvExport(input.report, input.latestReview),
      contentType: "text/csv; charset=utf-8",
      fileName: `${stem}-investigation.csv`,
    }
  }

  if (input.format === "markdown") {
    if (!input.caseBrief) return null
    return {
      format: input.format,
      body: buildInvestigationCaseBriefMarkdown(input.caseBrief),
      contentType: "text/markdown; charset=utf-8",
      fileName: `${stem}-case-brief.md`,
    }
  }

  return {
    format: input.format,
    body: buildClusterInvestigationJsonExport(input.report, input.latestReview),
    contentType: "application/json; charset=utf-8",
    fileName: `${stem}-investigation.json`,
  }
}

export function campaignClusterCaseExportHeaders(input: {
  contentType: string
  fileName: string
}) {
  return {
    "Content-Type": input.contentType,
    "Content-Disposition": `attachment; filename="${input.fileName}"`,
    "Cache-Control": "private, no-store",
    "X-Tri-Proof-Export-Object": CAMPAIGN_CLUSTER_CASE_EXPORT_OBJECT,
    "X-Tri-Proof-API-Version": CAMPAIGN_CLUSTER_CASE_EXPORT_API_VERSION,
    "X-Tri-Proof-Decision-Boundary": "read-only-no-recompute",
  }
}
