export const CLUSTER_CATALOG_OBJECT = "cluster_list" as const
export const CLUSTER_CATALOG_API_VERSION = "v2" as const
export const DEFAULT_CLUSTER_CATALOG_PAGE_SIZE = 100
export const MAX_CLUSTER_CATALOG_PAGE_SIZE = 500

const CURSOR_VERSION = 1 as const
const CURSOR_SCOPE = "cluster_catalog" as const
const MAX_CURSOR_LENGTH = 512
const MAX_CURSOR_ID_LENGTH = 128

export type ClusterCatalogRowInput = {
  id: string
  clusterLabel: string
  walletCount: number
  averageRiskScore: number
  sharedFundingSource: string | null
  behaviorSimilarityScore: number
  suggestedAction: string
  reasons: unknown
  createdAt: Date | string
}

export function parseClusterCatalogPageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_CLUSTER_CATALOG_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_CLUSTER_CATALOG_PAGE_SIZE)
}

export function encodeClusterCatalogCursor(id: string) {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, scope: CURSOR_SCOPE, id }), "utf8").toString("base64url")
}

export function decodeClusterCatalogCursor(raw: string | null):
  | { ok: true; id: string | null }
  | { ok: false; error: string } {
  if (!raw) return { ok: true, id: null }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid cluster catalog cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      v?: unknown
      scope?: unknown
      id?: unknown
    }
    if (decoded.v !== CURSOR_VERSION || decoded.scope !== CURSOR_SCOPE || typeof decoded.id !== "string") {
      return { ok: false, error: "Invalid cluster catalog cursor" }
    }
    if (
      decoded.id.length < 1 ||
      decoded.id.length > MAX_CURSOR_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(decoded.id)
    ) {
      return { ok: false, error: "Invalid cluster catalog cursor" }
    }
    return { ok: true, id: decoded.id }
  } catch {
    return { ok: false, error: "Invalid cluster catalog cursor" }
  }
}

function iso(value: Date | string) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function boundedReasons(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean).slice(0, 12)
}

export function buildClusterCatalogResource(input: {
  campaignId: string
  analysisId: string
  storedClusterCount: number
  rows: readonly ClusterCatalogRowInput[]
  pageSize: number
}) {
  const hasMore = input.rows.length > input.pageSize
  const pageRows = input.rows.slice(0, input.pageSize)
  const nextCursor = hasMore && pageRows.length
    ? encodeClusterCatalogCursor(pageRows[pageRows.length - 1]!.id)
    : null

  const encodedCampaign = encodeURIComponent(input.campaignId)
  const encodedAnalysis = encodeURIComponent(input.analysisId)

  const clusters = pageRows.map((row) => {
    const encodedCluster = encodeURIComponent(row.clusterLabel)
    const base = `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}/clusters/${encodedCluster}`
    return {
      clusterLabel: row.clusterLabel,
      walletCount: row.walletCount,
      averageRiskScore: row.averageRiskScore,
      sharedFundingSource: row.sharedFundingSource,
      behaviorSimilarityScore: row.behaviorSimilarityScore,
      storedSuggestedAction: row.suggestedAction,
      storedReasons: boundedReasons(row.reasons),
      createdAt: iso(row.createdAt),
      links: {
        intelligence: base,
        members: `${base}/members`,
        dashboard: `/dashboard/analysis/${encodedAnalysis}/clusters/${encodedCluster}`,
      },
    }
  })

  return {
    object: CLUSTER_CATALOG_OBJECT,
    apiVersion: CLUSTER_CATALOG_API_VERSION,
    campaignId: input.campaignId,
    analysisId: input.analysisId,
    storedClusterCount: input.storedClusterCount,
    clusters,
    pagination: {
      limit: input.pageSize,
      returned: clusters.length,
      hasMore,
      nextCursor,
    },
    boundaries: [
      "This catalog lists persisted cluster records only; it does not recompute cluster membership, support confidence, wallet risk, or decisions.",
      "Support Confidence and inferred archetypes are intentionally loaded from the per-cluster intelligence resource instead of being batch-recomputed in this list endpoint.",
      "Pagination position cannot change campaign, analysis, or owner authorization scope.",
    ],
    links: {
      analysis: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}`,
      campaign: `/api/v2/campaigns/${encodedCampaign}`,
    },
  }
}

export type ClusterCatalogResource = ReturnType<typeof buildClusterCatalogResource>
