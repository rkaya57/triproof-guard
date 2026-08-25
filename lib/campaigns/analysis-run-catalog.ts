export const ANALYSIS_RUN_CATALOG_OBJECT = "analysis_run_list" as const
export const ANALYSIS_RUN_CATALOG_API_VERSION = "v2" as const
export const ANALYSIS_RUN_CATALOG_SCHEMA_VERSION = "tri-proof-analysis-run-catalog-v1" as const
export const DEFAULT_ANALYSIS_RUN_CATALOG_PAGE_SIZE = 100
export const MAX_ANALYSIS_RUN_CATALOG_PAGE_SIZE = 500

const CURSOR_VERSION = 1 as const
const CURSOR_SCOPE = "analysis_run_catalog" as const
const MAX_CURSOR_LENGTH = 768
const MAX_CURSOR_ID_LENGTH = 128

export type AnalysisRunCatalogCursor = {
  createdAt: string
  id: string
}

export type AnalysisRunCatalogRowInput = {
  id: string
  status: string
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
  createdAt: Date | string
  completedAt: Date | string | null
}

export function parseAnalysisRunCatalogPageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_ANALYSIS_RUN_CATALOG_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_ANALYSIS_RUN_CATALOG_PAGE_SIZE)
}

function iso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export function encodeAnalysisRunCatalogCursor(input: AnalysisRunCatalogCursor) {
  return Buffer.from(JSON.stringify({
    v: CURSOR_VERSION,
    scope: CURSOR_SCOPE,
    createdAt: input.createdAt,
    id: input.id,
  }), "utf8").toString("base64url")
}

export function decodeAnalysisRunCatalogCursor(raw: string | null):
  | { ok: true; cursor: AnalysisRunCatalogCursor | null }
  | { ok: false; error: string } {
  if (!raw) return { ok: true, cursor: null }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid analysis run catalog cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      v?: unknown
      scope?: unknown
      createdAt?: unknown
      id?: unknown
    }
    if (
      decoded.v !== CURSOR_VERSION ||
      decoded.scope !== CURSOR_SCOPE ||
      typeof decoded.createdAt !== "string" ||
      typeof decoded.id !== "string"
    ) {
      return { ok: false, error: "Invalid analysis run catalog cursor" }
    }

    const createdAt = iso(decoded.createdAt)
    if (
      !createdAt ||
      decoded.id.length < 1 ||
      decoded.id.length > MAX_CURSOR_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(decoded.id)
    ) {
      return { ok: false, error: "Invalid analysis run catalog cursor" }
    }

    return { ok: true, cursor: { createdAt, id: decoded.id } }
  } catch {
    return { ok: false, error: "Invalid analysis run catalog cursor" }
  }
}

export function buildAnalysisRunCatalogResource(input: {
  campaignId: string
  storedRunCount: number
  rows: readonly AnalysisRunCatalogRowInput[]
  pageSize: number
}) {
  const hasMore = input.rows.length > input.pageSize
  const pageRows = input.rows.slice(0, input.pageSize)
  const last = pageRows[pageRows.length - 1] ?? null
  const nextCursor = hasMore && last
    ? encodeAnalysisRunCatalogCursor({ createdAt: iso(last.createdAt)!, id: last.id })
    : null
  const encodedCampaign = encodeURIComponent(input.campaignId)

  const runs = pageRows.map((row) => {
    const encodedAnalysis = encodeURIComponent(row.id)
    const base = `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}`
    return {
      id: row.id,
      object: "analysis_run" as const,
      status: String(row.status),
      totalWallets: row.totalWallets,
      decisions: {
        allow: row.approvedCount,
        review: row.manualReviewCount,
        exclude: row.rejectedCount,
      },
      averageRiskScore: row.averageRiskScore,
      suspiciousClusters: row.suspiciousClustersCount,
      createdAt: iso(row.createdAt),
      completedAt: iso(row.completedAt),
      links: {
        self: base,
        decisions: `${base}/decisions`,
        clusters: `${base}/clusters`,
        diff: `${base}/decisions/diff`,
        dashboard: `/dashboard/analysis/${encodedAnalysis}`,
      },
    }
  })

  return {
    object: ANALYSIS_RUN_CATALOG_OBJECT,
    apiVersion: ANALYSIS_RUN_CATALOG_API_VERSION,
    schemaVersion: ANALYSIS_RUN_CATALOG_SCHEMA_VERSION,
    campaignId: input.campaignId,
    storedRunCount: input.storedRunCount,
    runs,
    pagination: {
      limit: input.pageSize,
      returned: runs.length,
      hasMore,
      nextCursor,
    },
    boundaries: [
      "This catalog lists persisted analysis-run summaries only; it does not rerun analysis, policy, risk scoring, clustering, or evidence generation.",
      "Decision counts and risk summaries are stored run metadata and are not recomputed by pagination.",
      "The cursor controls ordering position only and cannot replace campaign ownership scope.",
      "Use the exact-run Decisions resource for persisted wallet decisions and Run Decision Diff to compare two selected analysis IDs.",
    ],
    links: {
      campaign: `/api/v2/campaigns/${encodedCampaign}`,
      createRun: `/api/v2/campaigns/${encodedCampaign}/analyses`,
    },
  }
}

export type AnalysisRunCatalogResource = ReturnType<typeof buildAnalysisRunCatalogResource>
