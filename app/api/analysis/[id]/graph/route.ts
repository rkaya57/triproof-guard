import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { db } from "@/lib/db/prisma"
import { parseVisualDecisionProofRequest } from "@/lib/graph/visual-decision-proof"
import type {
  EnrichmentStatus,
  FeedbackLabel,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

export const runtime = "nodejs"

const privateNoStoreHeaders = { "Cache-Control": "private, no-store" }

function privateJson(body: unknown, init?: Omit<ResponseInit, "headers">) {
  return NextResponse.json(body, {
    ...init,
    headers: privateNoStoreHeaders,
  })
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
  try {
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
  } catch (error) {
    console.warn("AI relationship audit context unavailable; serving deterministic graph only", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function selectedCluster(
  analysisId: string,
  clusterLabel: string | null,
  limit: number
) {
  if (!clusterLabel) return null

  const cluster = await db.cluster.findFirst({
    where: { analysisId, clusterLabel },
    select: {
      clusterLabel: true,
      walletCount: true,
      reasons: true,
    },
  })
  if (!cluster) return null

  const members = await db.walletAnalysis.findMany({
    where: { analysisId, clusterId: clusterLabel },
    orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }],
    take: limit,
    select: {
      walletAddress: true,
      status: true,
      riskScore: true,
      graphComponentId: true,
    },
  })

  return {
    label: cluster.clusterLabel,
    walletCount: cluster.walletCount,
    reasons: stringArray(cluster.reasons, 8),
    members: members.map((member) => ({
      walletAddress: member.walletAddress,
      status: member.status as WalletStatus,
      riskScore: member.riskScore,
      graphComponentId: member.graphComponentId,
    })),
    truncated: members.length < cluster.walletCount,
  }
}

async function selectedWalletFocus(analysisId: string, nodeKey: string | null) {
  if (!nodeKey) return null

  const node = await db.walletGraphNode.findFirst({
    where: { analysisId, nodeKey },
    select: { walletAddress: true },
  })
  if (!node?.walletAddress) return null

  const [wallet, review] = await Promise.all([
    db.walletAnalysis.findFirst({
      where: { analysisId, walletAddress: node.walletAddress },
      select: {
        walletAddress: true,
        chain: true,
        entityLabel: true,
        entityType: true,
        entityRiskReason: true,
        riskScore: true,
        riskLevel: true,
        status: true,
        recommendedAction: true,
        statusExplanation: true,
        fundingSource: true,
        txCount: true,
        walletAgeDays: true,
        totalVolume: true,
        contractsCount: true,
        campaignActionsCount: true,
        clusterId: true,
        graphComponentId: true,
        graphRiskScore: true,
        reasons: true,
        firstSeen: true,
        lastSeen: true,
        nativeBalance: true,
        tokenCount: true,
        uniqueCounterparties: true,
        lastActiveDaysAgo: true,
        isContract: true,
        enrichmentProvider: true,
        enrichmentStatus: true,
      },
    }),
    db.teamReview.findUnique({
      where: { analysisId_walletAddress: { analysisId, walletAddress: node.walletAddress } },
      include: { reviewer: { select: { name: true } } },
    }),
  ])
  if (!wallet) return null

  const walletResult: WalletRiskResult = {
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    entityLabel: wallet.entityLabel,
    entityType: wallet.entityType,
    entityRiskReason: wallet.entityRiskReason,
    riskScore: wallet.riskScore,
    riskLevel: wallet.riskLevel,
    status: wallet.status,
    recommendedAction: wallet.recommendedAction,
    statusExplanation: wallet.statusExplanation ?? "No stored decision explanation.",
    fundingSource: wallet.fundingSource,
    txCount: wallet.txCount,
    walletAgeDays: wallet.walletAgeDays,
    totalVolume: wallet.totalVolume,
    contractsCount: wallet.contractsCount,
    campaignActionsCount: wallet.campaignActionsCount,
    clusterId: wallet.clusterId,
    graphComponentId: wallet.graphComponentId,
    graphRiskScore: wallet.graphRiskScore,
    reasons: stringArray(wallet.reasons, 100),
    firstSeen: wallet.firstSeen?.toISOString() ?? null,
    lastSeen: wallet.lastSeen?.toISOString() ?? null,
    nativeBalance: wallet.nativeBalance,
    tokenCount: wallet.tokenCount,
    uniqueCounterparties: wallet.uniqueCounterparties,
    lastActiveDaysAgo: wallet.lastActiveDaysAgo,
    isContract: wallet.isContract,
    enrichmentProvider: wallet.enrichmentProvider,
    enrichmentStatus: wallet.enrichmentStatus as EnrichmentStatus | null,
    teamReview: review
      ? {
          finalStatus: review.finalStatus as WalletStatus,
          feedbackLabel: review.feedbackLabel as FeedbackLabel | null,
          notes: review.notes,
          reviewerName: review.reviewer.name,
          updatedAt: review.updatedAt.toISOString(),
        }
      : null,
  }
  const evidence = buildExplainableDecision(walletResult)

  return {
    walletAddress: wallet.walletAddress,
    risk: { score: wallet.riskScore, level: wallet.riskLevel },
    decision: {
      status: wallet.status,
      recommendedAction: wallet.recommendedAction,
      explanation: walletResult.statusExplanation,
    },
    evidence,
    provider:
      wallet.enrichmentProvider || wallet.enrichmentStatus
        ? {
            name: wallet.enrichmentProvider ?? "Provider not recorded",
            status: wallet.enrichmentStatus as EnrichmentStatus | null,
          }
        : null,
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return privateJson({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const url = new URL(request.url)
  const parsedRequest = parseVisualDecisionProofRequest(url.searchParams)
  if (!parsedRequest.ok) return privateJson({ error: parsedRequest.error }, { status: 400 })
  const { component: requestedComponent, node: requestedNode, cluster: requestedCluster, limit, focusOnly } = parsedRequest.value

  const analysis = await db.analysis.findFirst({
    where: { id, project: { userId: user.id } },
    select: {
      id: true,
      graphSummary: true,
    },
  })

  if (!analysis) {
    return privateJson({ error: "Analysis not found" }, { status: 404 })
  }
  if (!analysis.graphSummary) {
    return privateJson({
      graph: null,
      aiInsight: null,
      clusterIndex: [],
      cluster: null,
      focus: null,
      message: "This analysis predates graph intelligence. Run a new analysis to create graph evidence.",
    })
  }

  if (focusOnly) {
    const focus = await selectedWalletFocus(id, requestedNode)
    return privateJson({
      graph: null,
      aiInsight: null,
      clusterIndex: [],
      cluster: null,
      focus,
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
  const [edges, aiInsight, clusterIndex, cluster] = await Promise.all([
    db.walletGraphEdge.findMany({
      where: edgeWhere,
      orderBy: [{ isRiskBearing: "desc" }, { confidence: "desc" }, { edgeKey: "asc" }],
      take: limit,
    }),
    latestAiRelationshipInsight(id),
    db.cluster.findMany({
      where: { analysisId: id },
      orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }],
      take: 24,
      select: {
        clusterLabel: true,
        walletCount: true,
        averageRiskScore: true,
        suggestedAction: true,
      },
    }),
    selectedCluster(id, requestedCluster, limit),
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

  return privateJson({
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
    clusterIndex: clusterIndex.map((item) => ({
      label: item.clusterLabel,
      walletCount: item.walletCount,
      averageRiskScore: item.averageRiskScore,
      suggestedAction: item.suggestedAction as SuggestedAction,
    })),
    cluster,
    focus: null,
  })
}
