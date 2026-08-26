import { db } from "@/lib/db/prisma"

export type InternalGraphContextEvidence = {
  status: "available" | "unavailable" | "disabled"
  source: "triproof-graph"
  walletAddress: string
  observedAnalyses: number
  observedComponents: number
  riskBearingEdges: number
  edgeKinds: string[]
  maxEdgeConfidence?: number
  latestObservedAt?: string
  checkedAt: string
  error?: string
}

type GraphNodeRef = {
  analysisId: string
  componentId: string | null
}

type GraphEdgeRow = {
  analysisId: string
  componentId: string | null
  kind: string
  confidence: number
  observedAt: Date | null
  createdAt: Date
}

function normalizeWallet(value: string, chain?: string) {
  const trimmed = value.trim()
  return chain?.toLowerCase() === "evm" && /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? trimmed.toLowerCase()
    : trimmed
}

export function summarizeGraphContext(nodes: GraphNodeRef[], edges: GraphEdgeRow[]) {
  const analysisIds = new Set(nodes.map((node) => node.analysisId))
  const components = new Set(nodes.map((node) => `${node.analysisId}:${node.componentId ?? ""}`))
  const edgeKinds = Array.from(new Set(edges.map((edge) => edge.kind))).slice(0, 12)
  const maxEdgeConfidence = edges.length ? Math.max(...edges.map((edge) => edge.confidence)) : undefined
  const latest = edges
    .map((edge) => edge.observedAt ?? edge.createdAt)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return {
    observedAnalyses: analysisIds.size,
    observedComponents: components.size,
    riskBearingEdges: edges.length,
    edgeKinds,
    maxEdgeConfidence,
    latestObservedAt: latest?.toISOString(),
  }
}

export async function inspectInternalGraphContext(walletAddress: string, chain?: string): Promise<InternalGraphContextEvidence> {
  const normalized = normalizeWallet(walletAddress, chain)
  const checkedAt = new Date().toISOString()
  if (!normalized) {
    return {
      status: "unavailable",
      source: "triproof-graph",
      walletAddress: normalized,
      observedAnalyses: 0,
      observedComponents: 0,
      riskBearingEdges: 0,
      edgeKinds: [],
      checkedAt,
      error: "Wallet address is empty",
    }
  }

  if (!process.env.DATABASE_URL) {
    return {
      status: "disabled",
      source: "triproof-graph",
      walletAddress: normalized,
      observedAnalyses: 0,
      observedComponents: 0,
      riskBearingEdges: 0,
      edgeKinds: [],
      checkedAt,
    }
  }

  try {
    const nodes = await db.walletGraphNode.findMany({
      where: { walletAddress: normalized },
      select: { analysisId: true, componentId: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    if (!nodes.length) {
      return {
        status: "available",
        source: "triproof-graph",
        walletAddress: normalized,
        observedAnalyses: 0,
        observedComponents: 0,
        riskBearingEdges: 0,
        edgeKinds: [],
        checkedAt,
      }
    }

    const componentPairs = nodes
      .filter((node) => node.componentId)
      .map((node) => ({ analysisId: node.analysisId, componentId: node.componentId as string }))

    const edges = componentPairs.length
      ? await db.walletGraphEdge.findMany({
          where: {
            isRiskBearing: true,
            OR: componentPairs.map((pair) => ({ analysisId: pair.analysisId, componentId: pair.componentId })),
          },
          select: {
            analysisId: true,
            componentId: true,
            kind: true,
            confidence: true,
            observedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : []

    return {
      status: "available",
      source: "triproof-graph",
      walletAddress: normalized,
      ...summarizeGraphContext(nodes, edges),
      checkedAt,
    }
  } catch (error) {
    return {
      status: "unavailable",
      source: "triproof-graph",
      walletAddress: normalized,
      observedAnalyses: 0,
      observedComponents: 0,
      riskBearingEdges: 0,
      edgeKinds: [],
      checkedAt,
      error: error instanceof Error ? error.message.slice(0, 240) : "Internal graph lookup failed",
    }
  }
}
