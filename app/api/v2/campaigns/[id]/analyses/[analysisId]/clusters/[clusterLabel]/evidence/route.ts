import { chainAddressKey } from "@/lib/address-normalization"
import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildClusterEvidenceResource,
  clusterMemberKeySet,
  decodeClusterEvidenceCursor,
  fundingEvidenceTouchesCluster,
  graphEvidenceTouchesCluster,
  MAX_CLUSTER_EVIDENCE_SCAN_ROWS,
  parseClusterEvidenceLane,
  parseClusterEvidencePageSize,
  type FundingEvidenceRowInput,
  type GraphEvidenceRowInput,
} from "@/lib/campaigns/cluster-evidence-api"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const SCAN_CHUNK_SIZE = 500

async function scanFundingEvidence(input: {
  analysisId: string
  startId: string | null
  pageSize: number
  memberKeys: ReadonlySet<string>
}) {
  const matches: FundingEvidenceRowInput[] = []
  let scannedRows = 0
  let positionId = input.startId
  let sourceExhausted = false

  while (scannedRows < MAX_CLUSTER_EVIDENCE_SCAN_ROWS && matches.length <= input.pageSize) {
    const chunkSize = Math.min(SCAN_CHUNK_SIZE, MAX_CLUSTER_EVIDENCE_SCAN_ROWS - scannedRows)
    const rows = await db.campaignFundingRelationship.findMany({
      where: {
        analysisRunId: input.analysisId,
        ...(positionId ? { id: { gt: positionId } } : {}),
      },
      orderBy: { id: "asc" },
      take: chunkSize + 1,
      select: {
        id: true,
        relationshipKey: true,
        kind: true,
        chain: true,
        sourceAddress: true,
        targetAddress: true,
        viaAddress: true,
        hopCount: true,
        cohortSize: true,
        confidence: true,
        riskBearing: true,
        suppressionReason: true,
        evidenceEventKeys: true,
        observedAt: true,
        metadata: true,
      },
    })

    const hasBeyondChunk = rows.length > chunkSize
    const chunk = rows.slice(0, chunkSize)
    if (!chunk.length) {
      sourceExhausted = true
      break
    }

    for (const row of chunk) {
      scannedRows += 1
      positionId = row.id
      if (fundingEvidenceTouchesCluster(row, input.memberKeys)) {
        matches.push({ ...row, kind: String(row.kind) })
        if (matches.length > input.pageSize) break
      }
    }

    if (matches.length > input.pageSize) break
    if (!hasBeyondChunk) {
      sourceExhausted = true
      break
    }
  }

  if (matches.length > input.pageSize) {
    const page = matches.slice(0, input.pageSize)
    return {
      items: page,
      hasMore: true,
      nextPositionId: page.at(-1)?.id ?? null,
      scannedRows,
      scanLimitReached: false,
    }
  }

  const scanLimitReached = scannedRows >= MAX_CLUSTER_EVIDENCE_SCAN_ROWS && !sourceExhausted
  return {
    items: matches,
    hasMore: scanLimitReached,
    nextPositionId: scanLimitReached ? positionId : null,
    scannedRows,
    scanLimitReached,
  }
}

async function scanGraphEvidence(input: {
  analysisId: string
  startId: string | null
  pageSize: number
  componentIds: ReadonlySet<string>
  memberNodeKeys: ReadonlySet<string>
}) {
  const matches: GraphEvidenceRowInput[] = []
  let scannedRows = 0
  let positionId = input.startId
  let sourceExhausted = false

  while (scannedRows < MAX_CLUSTER_EVIDENCE_SCAN_ROWS && matches.length <= input.pageSize) {
    const chunkSize = Math.min(SCAN_CHUNK_SIZE, MAX_CLUSTER_EVIDENCE_SCAN_ROWS - scannedRows)
    const rows = await db.walletGraphEdge.findMany({
      where: {
        analysisId: input.analysisId,
        ...(positionId ? { id: { gt: positionId } } : {}),
      },
      orderBy: { id: "asc" },
      take: chunkSize + 1,
      select: {
        id: true,
        edgeKey: true,
        sourceKey: true,
        targetKey: true,
        kind: true,
        confidence: true,
        isRiskBearing: true,
        componentId: true,
        observedAt: true,
        transactionId: true,
        amount: true,
        evidence: true,
        metadata: true,
      },
    })

    const hasBeyondChunk = rows.length > chunkSize
    const chunk = rows.slice(0, chunkSize)
    if (!chunk.length) {
      sourceExhausted = true
      break
    }

    for (const row of chunk) {
      scannedRows += 1
      positionId = row.id
      if (graphEvidenceTouchesCluster(row, input.componentIds, input.memberNodeKeys)) {
        matches.push(row)
        if (matches.length > input.pageSize) break
      }
    }

    if (matches.length > input.pageSize) break
    if (!hasBeyondChunk) {
      sourceExhausted = true
      break
    }
  }

  if (matches.length > input.pageSize) {
    const page = matches.slice(0, input.pageSize)
    return {
      items: page,
      hasMore: true,
      nextPositionId: page.at(-1)?.id ?? null,
      scannedRows,
      scanLimitReached: false,
    }
  }

  const scanLimitReached = scannedRows >= MAX_CLUSTER_EVIDENCE_SCAN_ROWS && !sourceExhausted
  return {
    items: matches,
    hasMore: scanLimitReached,
    nextPositionId: scanLimitReached ? positionId : null,
    scannedRows,
    scanLimitReached,
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string; clusterLabel: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id, analysisId, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  if (!normalizedClusterLabel) return apiError("Cluster label is required", 400)

  const url = new URL(request.url)
  const lane = parseClusterEvidenceLane(url.searchParams.get("lane"))
  if (!lane) return apiError("Cluster evidence lane must be funding or graph", 400)

  const pageSize = parseClusterEvidencePageSize(url.searchParams.get("limit"))
  if (pageSize === null) return apiError("Cluster evidence limit must be a positive integer", 400)

  const cursor = decodeClusterEvidenceCursor(url.searchParams.get("cursor"), lane)
  if (!cursor.ok) return apiError(cursor.error, 400)

  try {
    const cluster = await db.cluster.findFirst({
      where: {
        analysisId,
        clusterLabel: normalizedClusterLabel,
        analysis: {
          projectId: id,
          project: { userId: auth.user.id },
        },
      },
      select: { clusterLabel: true },
    })
    if (!cluster) return apiError("Cluster not found", 404)

    const members = await db.walletAnalysis.findMany({
      where: { analysisId, clusterId: normalizedClusterLabel },
      select: { walletAddress: true, chain: true, graphComponentId: true },
    })
    const memberKeys = clusterMemberKeySet(members)

    if (lane === "funding") {
      const page = await scanFundingEvidence({
        analysisId,
        startId: cursor.id,
        pageSize,
        memberKeys,
      })
      return Response.json(
        buildClusterEvidenceResource({
          campaignId: id,
          analysisId,
          clusterLabel: normalizedClusterLabel,
          lane,
          pageSize,
          ...page,
        }),
        { headers: { "Cache-Control": "private, no-store" } },
      )
    }

    const componentIds = new Set(
      members.map((member) => member.graphComponentId).filter((value): value is string => Boolean(value)),
    )
    const walletNodes = await db.walletGraphNode.findMany({
      where: { analysisId, walletAddress: { not: null } },
      select: { nodeKey: true, walletAddress: true, chain: true },
    })
    const memberNodeKeys = new Set(
      walletNodes.flatMap((node) => {
        if (!node.walletAddress) return []
        return memberKeys.has(chainAddressKey(node.walletAddress, node.chain)) ? [node.nodeKey] : []
      }),
    )

    const page = await scanGraphEvidence({
      analysisId,
      startId: cursor.id,
      pageSize,
      componentIds,
      memberNodeKeys,
    })
    return Response.json(
      buildClusterEvidenceResource({
        campaignId: id,
        analysisId,
        clusterLabel: normalizedClusterLabel,
        lane,
        pageSize,
        ...page,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Campaign cluster evidence API failed", error)
    return apiError("Cluster evidence could not be loaded", 500)
  }
}
