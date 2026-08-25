export const CLUSTER_MEMBER_LIST_OBJECT = "cluster_member_list" as const
export const CLUSTER_MEMBER_LIST_API_VERSION = "v2" as const
export const DEFAULT_CLUSTER_MEMBER_PAGE_SIZE = 100
export const MAX_CLUSTER_MEMBER_PAGE_SIZE = 500

const CURSOR_VERSION = 1 as const
const MAX_CURSOR_LENGTH = 512
const MAX_CURSOR_ID_LENGTH = 128

export type ClusterMemberCursorResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string }

export type ClusterMemberRowInput = {
  id: string
  walletAddress: string
  chain: string
  entityLabel: string | null
  entityType: string
  entityRiskReason: string | null
  riskScore: number
  riskLevel: string
  status: string
  recommendedAction: string
  statusExplanation: string | null
  fundingSource: string | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  graphComponentId: string | null
  graphRiskScore: number | null
  reasons: unknown
  firstSeen: Date | string | null
  lastSeen: Date | string | null
  teamReviews?: Array<{
    finalStatus: string
    feedbackLabel: string | null
    notes: string | null
    source: string
    updatedAt: Date | string
    reviewer?: { name: string | null } | null
  }>
}

function iso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function reasons(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean).slice(0, 20)
}

export function parseClusterMemberPageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_CLUSTER_MEMBER_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_CLUSTER_MEMBER_PAGE_SIZE)
}

export function encodeClusterMemberCursor(id: string) {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, id }), "utf8").toString("base64url")
}

export function decodeClusterMemberCursor(raw: string | null): ClusterMemberCursorResult {
  if (!raw) return { ok: true, id: null }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid cluster member cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { v?: unknown; id?: unknown }
    if (decoded.v !== CURSOR_VERSION || typeof decoded.id !== "string") {
      return { ok: false, error: "Invalid cluster member cursor" }
    }
    if (
      decoded.id.length < 1 ||
      decoded.id.length > MAX_CURSOR_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(decoded.id)
    ) {
      return { ok: false, error: "Invalid cluster member cursor" }
    }
    return { ok: true, id: decoded.id }
  } catch {
    return { ok: false, error: "Invalid cluster member cursor" }
  }
}

export function buildClusterMemberListResource(input: {
  campaignId: string
  analysisId: string
  clusterLabel: string
  storedTotalMembers: number
  rows: readonly ClusterMemberRowInput[]
  pageSize: number
}) {
  const hasMore = input.rows.length > input.pageSize
  const pageRows = input.rows.slice(0, input.pageSize)
  const nextCursor = hasMore && pageRows.length
    ? encodeClusterMemberCursor(pageRows[pageRows.length - 1]!.id)
    : null

  const members = pageRows.map((row) => {
    const review = row.teamReviews?.[0] ?? null
    return {
      walletAddress: row.walletAddress,
      chain: row.chain,
      entity: {
        label: row.entityLabel,
        type: row.entityType,
        riskReason: row.entityRiskReason,
      },
      riskScore: row.riskScore,
      riskLevel: row.riskLevel,
      storedStatus: row.status,
      storedRecommendedAction: row.recommendedAction,
      statusExplanation: row.statusExplanation,
      fundingSource: row.fundingSource,
      graphComponentId: row.graphComponentId,
      graphRiskScore: row.graphRiskScore,
      activity: {
        txCount: row.txCount,
        walletAgeDays: row.walletAgeDays,
        totalVolume: row.totalVolume,
        contractsCount: row.contractsCount,
        campaignActionsCount: row.campaignActionsCount,
        firstSeen: iso(row.firstSeen),
        lastSeen: iso(row.lastSeen),
      },
      reasons: reasons(row.reasons),
      teamReview: review ? {
        finalStatus: review.finalStatus,
        feedbackLabel: review.feedbackLabel,
        notes: review.notes,
        source: review.source,
        reviewerName: review.reviewer?.name ?? null,
        updatedAt: iso(review.updatedAt),
      } : null,
    }
  })

  const encodedCampaign = encodeURIComponent(input.campaignId)
  const encodedAnalysis = encodeURIComponent(input.analysisId)
  const encodedCluster = encodeURIComponent(input.clusterLabel)

  return {
    object: CLUSTER_MEMBER_LIST_OBJECT,
    apiVersion: CLUSTER_MEMBER_LIST_API_VERSION,
    campaignId: input.campaignId,
    analysisId: input.analysisId,
    clusterLabel: input.clusterLabel,
    storedTotalMembers: input.storedTotalMembers,
    members,
    pagination: {
      limit: input.pageSize,
      returned: members.length,
      hasMore,
      nextCursor,
    },
    boundaries: [
      "This endpoint pages stored cluster membership only; it does not recompute membership or create a new cluster decision.",
      "storedStatus and storedRecommendedAction are persisted wallet state. teamReview is human review context and is not silently merged into stored state by this endpoint.",
      "Pagination cursors control position only and cannot change the campaign, analysis, or cluster authorization scope.",
    ],
    links: {
      clusterIntelligence: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}/clusters/${encodedCluster}`,
      analysis: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}`,
      campaign: `/api/v2/campaigns/${encodedCampaign}`,
    },
  }
}

export type ClusterMemberListResource = ReturnType<typeof buildClusterMemberListResource>
