import { serializeAnalysis } from "@/lib/analysis/serializers"
import { attachFundingProvenanceDecisionEvidence } from "@/lib/campaign-security/funding-provenance-evidence"
import { loadDecisionFundingRelationships } from "@/lib/campaign-security/funding-provenance-evidence-server"
import { buildClusterInvestigation, type ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  assessClusterSupport,
  type ClusterSupportIntelligence,
} from "@/lib/cluster-investigation/intelligence"
import { db } from "@/lib/db/prisma"
import type { WalletGraphEdge, WalletGraphNode } from "@/types"

const MAX_CLUSTER_GRAPH_NODES = 1_500
const MAX_CLUSTER_GRAPH_EDGES = 2_000
const MAX_CLUSTER_EVENTS = 2_000

export type ClusterInvestigationLoadResult = {
  analysisId: string
  clusterLabel: string
  report: ClusterInvestigationReport | null
  intelligence: ClusterSupportIntelligence | null
}

async function loadAnalysis(analysisId: string, userId: string) {
  return db.analysis.findFirst({
    where: { id: analysisId, project: { userId } },
    include: {
      project: true,
      wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
      clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      teamReviews: { include: { reviewer: { select: { name: true } } } },
      feedbackEvents: true,
      graphSummary: true,
      aiBrief: true,
    },
  })
}

async function safeMemberGraphNodes(analysisId: string, walletAddresses: string[]) {
  if (!walletAddresses.length) return []
  try {
    return await db.walletGraphNode.findMany({
      where: { analysisId, walletAddress: { in: walletAddresses } },
      orderBy: [{ kind: "asc" }, { nodeKey: "asc" }],
      take: MAX_CLUSTER_GRAPH_NODES,
    })
  } catch (error) {
    console.warn("Cluster investigation member graph nodes unavailable", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

async function safeGraphContext(
  analysisId: string,
  walletAddresses: string[],
  memberNodes: Awaited<ReturnType<typeof safeMemberGraphNodes>>,
) {
  const componentIds = Array.from(
    new Set(memberNodes.map((node) => node.componentId).filter((value): value is string => Boolean(value))),
  )
  const memberNodeKeys = memberNodes.map((node) => node.nodeKey)

  try {
    const [nodes, edges] = await Promise.all([
      db.walletGraphNode.findMany({
        where: {
          analysisId,
          OR: [
            ...(walletAddresses.length ? [{ walletAddress: { in: walletAddresses } }] : []),
            ...(componentIds.length ? [{ componentId: { in: componentIds } }] : []),
          ],
        },
        orderBy: [{ kind: "asc" }, { nodeKey: "asc" }],
        take: MAX_CLUSTER_GRAPH_NODES,
      }),
      db.walletGraphEdge.findMany({
        where: {
          analysisId,
          OR: [
            ...(componentIds.length ? [{ componentId: { in: componentIds } }] : []),
            ...(memberNodeKeys.length ? [{ sourceKey: { in: memberNodeKeys } }, { targetKey: { in: memberNodeKeys } }] : []),
          ],
        },
        orderBy: [{ isRiskBearing: "desc" }, { confidence: "desc" }, { edgeKey: "asc" }],
        take: MAX_CLUSTER_GRAPH_EDGES,
      }),
    ])

    const graphNodes: WalletGraphNode[] = nodes.map((node) => ({
      nodeKey: node.nodeKey,
      address: node.address,
      chain: node.chain,
      kind: node.kind as WalletGraphNode["kind"],
      label: node.label,
      walletAddress: node.walletAddress,
      componentId: node.componentId,
      metadata: node.metadata && typeof node.metadata === "object" && !Array.isArray(node.metadata)
        ? (node.metadata as Record<string, unknown>)
        : {},
    }))
    const graphEdges: WalletGraphEdge[] = edges.map((edge) => ({
      edgeKey: edge.edgeKey,
      sourceKey: edge.sourceKey,
      targetKey: edge.targetKey,
      kind: edge.kind as WalletGraphEdge["kind"],
      confidence: edge.confidence,
      isRiskBearing: edge.isRiskBearing,
      componentId: edge.componentId,
      observedAt: edge.observedAt?.toISOString() ?? null,
      transactionId: edge.transactionId,
      amount: edge.amount,
      evidence: Array.isArray(edge.evidence) ? edge.evidence.map((item) => String(item)) : [],
      metadata: edge.metadata && typeof edge.metadata === "object" && !Array.isArray(edge.metadata)
        ? (edge.metadata as Record<string, unknown>)
        : {},
    }))

    return { graphNodes, graphEdges }
  } catch (error) {
    console.warn("Cluster investigation graph context unavailable", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { graphNodes: [] as WalletGraphNode[], graphEdges: [] as WalletGraphEdge[] }
  }
}

async function safeTimelineEvents(analysisId: string, walletAddresses: string[]) {
  if (!walletAddresses.length) return []
  try {
    const rows = await db.normalizedOnchainEvent.findMany({
      where: { analysisRunId: analysisId, walletAddress: { in: walletAddresses } },
      select: {
        eventKey: true,
        chain: true,
        txHash: true,
        walletAddress: true,
        counterpartyAddress: true,
        kind: true,
        direction: true,
        assetSymbol: true,
        amount: true,
        observedAt: true,
        confidence: true,
      },
      orderBy: [{ observedAt: "asc" }, { eventKey: "asc" }],
      take: MAX_CLUSTER_EVENTS,
    })

    return rows.map((row) => ({
      eventKey: row.eventKey,
      chain: row.chain,
      txHash: row.txHash,
      walletAddress: row.walletAddress,
      counterpartyAddress: row.counterpartyAddress,
      kind: row.kind,
      direction: row.direction,
      assetSymbol: row.assetSymbol,
      amount: row.amount?.toString() ?? null,
      observedAt: row.observedAt,
      confidence: row.confidence,
    }))
  } catch (error) {
    console.warn("Cluster investigation normalized event timeline unavailable", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function loadClusterInvestigation(
  analysisId: string,
  userId: string,
  clusterLabel: string,
): Promise<ClusterInvestigationLoadResult | null> {
  const analysis = await loadAnalysis(analysisId, userId)
  if (!analysis) return null

  const fundingRelationships = await loadDecisionFundingRelationships(analysisId)
  const serialized = attachFundingProvenanceDecisionEvidence(
    serializeAnalysis(analysis),
    fundingRelationships,
  )
  const cluster = serialized.clusters.find((item) => item.clusterLabel === clusterLabel)
  if (!cluster) {
    return { analysisId, clusterLabel, report: null, intelligence: null }
  }

  const walletAddresses = serialized.wallets
    .filter((wallet) => wallet.clusterId === clusterLabel)
    .map((wallet) => wallet.walletAddress)
  const memberNodes = await safeMemberGraphNodes(analysisId, walletAddresses)
  const [{ graphNodes, graphEdges }, events] = await Promise.all([
    safeGraphContext(analysisId, walletAddresses, memberNodes),
    safeTimelineEvents(analysisId, walletAddresses),
  ])

  const report = buildClusterInvestigation({
    analysis: serialized,
    clusterLabel,
    fundingRelationships,
    graphNodes,
    graphEdges,
    events,
  })

  return {
    analysisId,
    clusterLabel,
    report,
    intelligence: report ? assessClusterSupport(report, serialized) : null,
  }
}
