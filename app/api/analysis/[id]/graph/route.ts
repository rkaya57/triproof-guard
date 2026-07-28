import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

function boundedLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "120", 10)
  if (!Number.isFinite(parsed)) return 120
  return Math.min(Math.max(parsed, 20), 250)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const url = new URL(request.url)
  const requestedComponent = url.searchParams.get("component")?.trim() || null
  const limit = boundedLimit(url.searchParams.get("limit"))

  const analysis = await db.analysis.findFirst({
    where: { id, project: { userId: user.id } },
    select: {
      id: true,
      graphSummary: true,
    },
  })

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  }
  if (!analysis.graphSummary) {
    return NextResponse.json({
      graph: null,
      message: "This analysis predates graph intelligence. Run a new analysis to create graph evidence.",
    })
  }

  const components = Array.isArray(analysis.graphSummary.components)
    ? (analysis.graphSummary.components as Array<{ componentId?: string }>)
    : []
  const allowedComponents = new Set(
    components.map((component) => component.componentId).filter(Boolean)
  )
  const componentId =
    requestedComponent && allowedComponents.has(requestedComponent)
      ? requestedComponent
      : components[0]?.componentId ?? null

  const edgeWhere = {
    analysisId: id,
    ...(componentId ? { componentId } : {}),
  }
  const edges = await db.walletGraphEdge.findMany({
    where: edgeWhere,
    orderBy: [{ isRiskBearing: "desc" }, { confidence: "desc" }, { edgeKey: "asc" }],
    take: limit,
  })
  const nodeKeys = Array.from(
    new Set(edges.flatMap((edge) => [edge.sourceKey, edge.targetKey]))
  )
  const nodes = await db.walletGraphNode.findMany({
    where: {
      analysisId: id,
      ...(nodeKeys.length ? { nodeKey: { in: nodeKeys } } : componentId ? { componentId } : {}),
    },
    orderBy: [{ kind: "asc" }, { nodeKey: "asc" }],
    take: limit,
  })

  return NextResponse.json({
    graph: {
      componentId,
      nodes: nodes.map((node) => ({
        nodeKey: node.nodeKey,
        address: node.address,
        chain: node.chain,
        kind: node.kind,
        label: node.label,
        walletAddress: node.walletAddress,
        componentId: node.componentId,
        metadata: node.metadata ?? {},
      })),
      edges: edges.map((edge) => ({
        edgeKey: edge.edgeKey,
        sourceKey: edge.sourceKey,
        targetKey: edge.targetKey,
        kind: edge.kind,
        confidence: edge.confidence,
        isRiskBearing: edge.isRiskBearing,
        componentId: edge.componentId,
        observedAt: edge.observedAt?.toISOString() ?? null,
        transactionId: edge.transactionId,
        amount: edge.amount,
        evidence: Array.isArray(edge.evidence)
          ? edge.evidence.map((item) => String(item))
          : [],
        metadata: edge.metadata ?? {},
      })),
      truncated: edges.length >= limit || nodes.length >= limit,
    },
  })
}
