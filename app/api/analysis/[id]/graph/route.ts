import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

function boundedLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "120", 10)
  if (!Number.isFinite(parsed)) return 120
  return Math.min(Math.max(parsed, 20), 250)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown, limit = 5) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .slice(0, limit)
    : []
}

type AiClusterAuditRow = {
  source: string
  model: string | null
  recommendation: string
  confidence: number | null
  payload: unknown
  createdAt: Date
}

async function latestAiRelationshipInsight(analysisId: string) {
  const rows = await db.$queryRaw<AiClusterAuditRow[]>(Prisma.sql`
    SELECT "source", "model", "recommendation", "confidence", "payload", "createdAt"
    FROM "AiEvidenceAudit"
    WHERE "analysisId" = ${analysisId}
      AND "context" = 'production_analysis'
      AND "subjectKind" = 'cluster'
      AND "stage" = 'cluster_evidence'
    ORDER BY "createdAt" DESC
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const payload = asRecord(row.payload)

  return {
    source: row.source === "gemini" ? "gemini" : "fallback",
    model: row.model,
    recommendation: stringValue(payload.recommendation) ?? row.recommendation,
    confidence: numberValue(payload.confidence) ?? row.confidence,
    evidenceSufficiency: numberValue(payload.evidenceSufficiency),
    coordinationEvidenceStrength: numberValue(payload.coordinationEvidenceStrength),
    automationEvidenceStrength: numberValue(payload.automationEvidenceStrength),
    neutralExplanationStrength: numberValue(payload.neutralExplanationStrength),
    heterogeneityEvidenceStrength: numberValue(payload.heterogeneityEvidenceStrength),
    interpretation: stringValue(payload.interpretation),
    counterEvidence: stringArray(payload.counterEvidence),
    unresolvedQuestions: stringArray(payload.unresolvedQuestions),
    limitations: stringArray(payload.limitations),
    generatedAt: row.createdAt.toISOString(),
  }
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
      aiInsight: null,
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
  const [edges, aiInsight] = await Promise.all([
    db.walletGraphEdge.findMany({
      where: edgeWhere,
      orderBy: [{ isRiskBearing: "desc" }, { confidence: "desc" }, { edgeKey: "asc" }],
      take: limit,
    }),
    latestAiRelationshipInsight(id),
  ])
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
    aiInsight,
  })
}
