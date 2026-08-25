import { chainAddressKey } from "@/lib/address-normalization"

export const CLUSTER_EVIDENCE_LIST_OBJECT = "cluster_evidence_list" as const
export const CLUSTER_EVIDENCE_LIST_API_VERSION = "v2" as const
export const DEFAULT_CLUSTER_EVIDENCE_PAGE_SIZE = 100
export const MAX_CLUSTER_EVIDENCE_PAGE_SIZE = 200
export const MAX_CLUSTER_EVIDENCE_SCAN_ROWS = 10_000

const CURSOR_VERSION = 1 as const
const MAX_CURSOR_LENGTH = 512
const MAX_CURSOR_ID_LENGTH = 128
const MAX_EVIDENCE_EVENT_KEYS = 50
const MAX_GRAPH_EVIDENCE_ITEMS = 30
const MAX_METADATA_KEYS = 20

export type ClusterEvidenceLane = "funding" | "graph"

export type ClusterEvidenceCursorResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string }

export type FundingEvidenceRowInput = {
  id: string
  relationshipKey: string
  kind: string
  chain: string
  sourceAddress: string
  targetAddress: string
  viaAddress: string | null
  hopCount: number
  cohortSize: number
  confidence: number
  riskBearing: boolean
  suppressionReason: string | null
  evidenceEventKeys: readonly string[]
  observedAt: Date | string | null
  metadata: unknown
}

export type GraphEvidenceRowInput = {
  id: string
  edgeKey: string
  sourceKey: string
  targetKey: string
  kind: string
  confidence: number
  isRiskBearing: boolean
  componentId: string | null
  observedAt: Date | string | null
  transactionId: string | null
  amount: number | null
  evidence: unknown
  metadata: unknown
}

function iso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function boundedMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, MAX_METADATA_KEYS)) {
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      result[key] = item
      continue
    }
    if (Array.isArray(item)) {
      result[key] = item.filter((entry) =>
        entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
      ).slice(0, 20)
    }
  }
  return result
}

function boundedStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean).slice(0, limit)
}

export function parseClusterEvidenceLane(raw: string | null): ClusterEvidenceLane | null {
  const normalized = raw?.trim().toLowerCase() ?? "funding"
  return normalized === "funding" || normalized === "graph" ? normalized : null
}

export function parseClusterEvidencePageSize(raw: string | null) {
  if (raw === null || raw.trim() === "") return DEFAULT_CLUSTER_EVIDENCE_PAGE_SIZE
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return Math.min(parsed, MAX_CLUSTER_EVIDENCE_PAGE_SIZE)
}

export function encodeClusterEvidenceCursor(lane: ClusterEvidenceLane, id: string) {
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, lane, id }), "utf8").toString("base64url")
}

export function decodeClusterEvidenceCursor(
  raw: string | null,
  lane: ClusterEvidenceLane,
): ClusterEvidenceCursorResult {
  if (!raw) return { ok: true, id: null }
  if (raw.length > MAX_CURSOR_LENGTH) return { ok: false, error: "Invalid cluster evidence cursor" }

  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      v?: unknown
      lane?: unknown
      id?: unknown
    }
    if (decoded.v !== CURSOR_VERSION || decoded.lane !== lane || typeof decoded.id !== "string") {
      return { ok: false, error: "Invalid cluster evidence cursor" }
    }
    if (
      decoded.id.length < 1 ||
      decoded.id.length > MAX_CURSOR_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(decoded.id)
    ) {
      return { ok: false, error: "Invalid cluster evidence cursor" }
    }
    return { ok: true, id: decoded.id }
  } catch {
    return { ok: false, error: "Invalid cluster evidence cursor" }
  }
}

export function clusterMemberKeySet(
  members: readonly { walletAddress: string; chain: string }[],
) {
  return new Set(members.map((member) => chainAddressKey(member.walletAddress, member.chain)))
}

export function fundingEvidenceTouchesCluster(
  row: Pick<FundingEvidenceRowInput, "chain" | "sourceAddress" | "targetAddress">,
  memberKeys: ReadonlySet<string>,
) {
  return memberKeys.has(chainAddressKey(row.sourceAddress, row.chain)) ||
    memberKeys.has(chainAddressKey(row.targetAddress, row.chain))
}

export function graphEvidenceTouchesCluster(
  row: Pick<GraphEvidenceRowInput, "sourceKey" | "targetKey" | "componentId">,
  componentIds: ReadonlySet<string>,
  memberNodeKeys: ReadonlySet<string>,
) {
  return Boolean(row.componentId && componentIds.has(row.componentId)) ||
    memberNodeKeys.has(row.sourceKey) ||
    memberNodeKeys.has(row.targetKey)
}

export function serializeFundingEvidence(row: FundingEvidenceRowInput) {
  return {
    relationshipKey: row.relationshipKey,
    kind: row.kind,
    chain: row.chain,
    sourceAddress: row.sourceAddress,
    targetAddress: row.targetAddress,
    viaAddress: row.viaAddress,
    hopCount: row.hopCount,
    cohortSize: row.cohortSize,
    confidence: row.confidence,
    riskBearing: row.riskBearing,
    suppressionReason: row.suppressionReason,
    evidenceEventKeys: row.evidenceEventKeys.slice(0, MAX_EVIDENCE_EVENT_KEYS),
    observedAt: iso(row.observedAt),
    metadata: boundedMetadata(row.metadata),
  }
}

export function serializeGraphEvidence(row: GraphEvidenceRowInput) {
  return {
    edgeKey: row.edgeKey,
    sourceKey: row.sourceKey,
    targetKey: row.targetKey,
    kind: row.kind,
    confidence: row.confidence,
    riskBearing: row.isRiskBearing,
    componentId: row.componentId,
    observedAt: iso(row.observedAt),
    transactionId: row.transactionId,
    amount: row.amount,
    evidence: boundedStringArray(row.evidence, MAX_GRAPH_EVIDENCE_ITEMS),
    metadata: boundedMetadata(row.metadata),
  }
}

export function buildClusterEvidenceResource(input: {
  campaignId: string
  analysisId: string
  clusterLabel: string
  lane: ClusterEvidenceLane
  pageSize: number
  items: readonly FundingEvidenceRowInput[] | readonly GraphEvidenceRowInput[]
  hasMore: boolean
  nextPositionId: string | null
  scannedRows: number
  scanLimitReached: boolean
}) {
  const encodedCampaign = encodeURIComponent(input.campaignId)
  const encodedAnalysis = encodeURIComponent(input.analysisId)
  const encodedCluster = encodeURIComponent(input.clusterLabel)
  const items = input.lane === "funding"
    ? (input.items as readonly FundingEvidenceRowInput[]).map(serializeFundingEvidence)
    : (input.items as readonly GraphEvidenceRowInput[]).map(serializeGraphEvidence)

  return {
    object: CLUSTER_EVIDENCE_LIST_OBJECT,
    apiVersion: CLUSTER_EVIDENCE_LIST_API_VERSION,
    campaignId: input.campaignId,
    analysisId: input.analysisId,
    clusterLabel: input.clusterLabel,
    lane: input.lane,
    evidence: items,
    pagination: {
      limit: input.pageSize,
      returned: items.length,
      hasMore: input.hasMore,
      nextCursor: input.hasMore && input.nextPositionId
        ? encodeClusterEvidenceCursor(input.lane, input.nextPositionId)
        : null,
      scannedRows: input.scannedRows,
      scanLimitReached: input.scanLimitReached,
      maxScanRowsPerRequest: MAX_CLUSTER_EVIDENCE_SCAN_ROWS,
    },
    boundaries: [
      "This endpoint exposes stored forensic evidence only; it does not recompute cluster membership, risk scores, policy, or wallet decisions.",
      "riskBearing is preserved from the persisted relationship or graph edge and is never promoted by this API layer.",
      "Neutralized infrastructure or trusted-funding context remains neutralized; pagination cannot turn it into malicious evidence.",
      "The cursor controls scan position inside one evidence lane only and cannot widen campaign, analysis, cluster, or owner authorization scope.",
    ],
    links: {
      clusterIntelligence: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}/clusters/${encodedCluster}`,
      members: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}/clusters/${encodedCluster}/members`,
      clusterCatalog: `/api/v2/campaigns/${encodedCampaign}/analyses/${encodedAnalysis}/clusters`,
    },
  }
}

export type ClusterEvidenceResource = ReturnType<typeof buildClusterEvidenceResource>
