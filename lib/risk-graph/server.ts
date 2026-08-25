import type {
  WalletGraphData,
  WalletGraphEdgeKind,
  WalletGraphNodeKind,
  WalletGraphSeverity,
} from "@/types"
import { db } from "@/lib/db/prisma"
import {
  addScamDnaSource,
  addScamGuardIntelSource,
  addTelegramSource,
  addWalletGraphSource,
} from "@/lib/risk-graph/adapters"
import { SharedRiskGraphBuilder } from "@/lib/risk-graph/builder"
import { addFundingProvenanceSource } from "@/lib/risk-graph/funding-provenance"
import { addTelegramOnchainSource } from "@/lib/risk-graph/telegram-onchain"
import {
  loadCampaignTelegramObservations,
  telegramDomains,
  telegramIntelCandidates,
} from "@/lib/risk-graph/telegram-server"
import type {
  SharedRiskGraph,
  SharedRiskGraphScamDnaObservation,
} from "@/lib/risk-graph/types"

const FUNDING_GRAPH_PROJECTION_LIMIT = 2_500
const FUNDING_INTEL_CANDIDATE_LIMIT = 1_000

const walletGraphNodeKinds = new Set<WalletGraphNodeKind>([
  "wallet",
  "funder",
  "referrer",
  "referral_code",
  "service",
])
const walletGraphEdgeKinds = new Set<WalletGraphEdgeKind>([
  "funded",
  "referred",
  "self_referral",
])
const graphSeverities = new Set<WalletGraphSeverity>([
  "info",
  "caution",
  "high",
  "critical",
])

function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function walletGraphData(analysis: {
  graphSummary: {
    totalNodes: number
    totalEdges: number
    connectedWallets: number
    externalFunders: number
    referralLinks: number
    highRiskComponents: number
    neutralServiceFunders: number
    largestComponent: number
    maxComponentRisk: number
    components: unknown
    findings: unknown
  } | null
  graphNodes: Array<{
    nodeKey: string
    address: string | null
    chain: string | null
    kind: string
    label: string | null
    walletAddress: string | null
    componentId: string | null
    metadata: unknown
  }>
  graphEdges: Array<{
    edgeKey: string
    sourceKey: string
    targetKey: string
    kind: string
    confidence: number
    isRiskBearing: boolean
    componentId: string | null
    observedAt: Date | null
    transactionId: string | null
    amount: number | null
    evidence: unknown
    metadata: unknown
  }>
}): WalletGraphData | null {
  if (analysis.graphNodes.length === 0) return null
  const summary = analysis.graphSummary
  const nodes = analysis.graphNodes
    .filter((node) => walletGraphNodeKinds.has(node.kind as WalletGraphNodeKind))
    .map((node) => ({
      nodeKey: node.nodeKey,
      address: node.address,
      chain: node.chain,
      kind: node.kind as WalletGraphNodeKind,
      label: node.label,
      walletAddress: node.walletAddress,
      componentId: node.componentId,
      metadata: record(node.metadata),
    }))
  const nodeKeys = new Set(nodes.map((node) => node.nodeKey))
  const edges = analysis.graphEdges
    .filter(
      (edge) =>
        walletGraphEdgeKinds.has(edge.kind as WalletGraphEdgeKind) &&
        nodeKeys.has(edge.sourceKey) &&
        nodeKeys.has(edge.targetKey)
    )
    .map((edge) => ({
      edgeKey: edge.edgeKey,
      sourceKey: edge.sourceKey,
      targetKey: edge.targetKey,
      kind: edge.kind as WalletGraphEdgeKind,
      confidence: edge.confidence,
      isRiskBearing: edge.isRiskBearing,
      componentId: edge.componentId,
      observedAt: edge.observedAt?.toISOString() ?? null,
      transactionId: edge.transactionId,
      amount: edge.amount,
      evidence: strings(edge.evidence),
      metadata: record(edge.metadata),
    }))
  const rawComponents = Array.isArray(summary?.components) ? summary.components : []
  const components = rawComponents.flatMap((value) => {
    const item = record(value)
    if (!item.componentId) return []
    const severity = String(item.severity ?? "info")
    return [{
      componentId: String(item.componentId),
      nodeKeys: strings(item.nodeKeys),
      walletAddresses: strings(item.walletAddresses),
      edgeCount: Number(item.edgeCount ?? 0),
      riskScore: Number(item.riskScore ?? 0),
      severity: graphSeverities.has(severity as WalletGraphSeverity)
        ? (severity as WalletGraphSeverity)
        : "info",
      dominantFunder: item.dominantFunder ? String(item.dominantFunder) : null,
      dominantReferrer: item.dominantReferrer ? String(item.dominantReferrer) : null,
      reasons: strings(item.reasons),
    }]
  })

  return {
    totalNodes: summary?.totalNodes ?? nodes.length,
    totalEdges: summary?.totalEdges ?? edges.length,
    connectedWallets: summary?.connectedWallets ?? 0,
    externalFunders: summary?.externalFunders ?? 0,
    referralLinks: summary?.referralLinks ?? 0,
    highRiskComponents: summary?.highRiskComponents ?? 0,
    neutralServiceFunders: summary?.neutralServiceFunders ?? 0,
    largestComponent: summary?.largestComponent ?? 0,
    maxComponentRisk: summary?.maxComponentRisk ?? 0,
    findings: [],
    nodes,
    edges,
    components,
  }
}

export async function loadCampaignRiskGraph(
  campaignId: string,
  userId: string
): Promise<SharedRiskGraph | null> {
  const project = await db.project.findFirst({
    where: { id: campaignId, userId },
    select: {
      id: true,
      name: true,
      chain: true,
      campaignType: true,
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          graphSummary: true,
          graphNodes: true,
          graphEdges: true,
        },
      },
    },
  })
  if (!project) return null

  const analysis = project.analyses[0] ?? null
  const builder = new SharedRiskGraphBuilder({
    id: project.id,
    name: project.name,
    chain: project.chain,
    campaignType: project.campaignType,
    analysisId: analysis?.id ?? null,
  })
  const currentGraph = analysis ? walletGraphData(analysis) : null
  addWalletGraphSource(builder, currentGraph)

  // The database keeps the complete canonical relationship set. The shared
  // interactive graph intentionally projects a bounded, highest-signal slice so
  // 50k-wallet campaigns do not create unbounded payloads or browser layouts.
  const fundingRelationships = analysis
    ? await db.campaignFundingRelationship.findMany({
        where: { analysisRunId: analysis.id },
        orderBy: [
          { riskBearing: "desc" },
          { cohortSize: "desc" },
          { confidence: "desc" },
          { createdAt: "asc" },
        ],
        take: FUNDING_GRAPH_PROJECTION_LIMIT,
        select: {
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
    : []
  addFundingProvenanceSource(builder, fundingRelationships)

  const fundingAddressCandidates = fundingRelationships
    .flatMap((relationship) => [
      relationship.sourceAddress,
      relationship.targetAddress,
      relationship.viaAddress,
    ])
    .filter((value): value is string => Boolean(value?.trim()))
    .slice(0, FUNDING_INTEL_CANDIDATE_LIMIT)

  const addressCandidates = Array.from(
    new Set([
      ...(currentGraph?.nodes
        .flatMap((node) => [node.address, node.walletAddress])
        .filter((value): value is string => Boolean(value?.trim())) ?? []),
      ...fundingAddressCandidates,
    ])
  )

  if (addressCandidates.length > 0) {
    const telegramObservations = await loadCampaignTelegramObservations(
      userId,
      addressCandidates
    )
    addTelegramSource(builder, telegramObservations)
    addTelegramOnchainSource(builder, telegramObservations)

    const intelCandidates = Array.from(
      new Set([...addressCandidates, ...telegramIntelCandidates(telegramObservations)])
    )
    if (intelCandidates.length > 0) {
      const intel = await db.scamGuardIntelEntry.findMany({
        where: { active: true, normalized: { in: intelCandidates } },
        select: {
          id: true,
          kind: true,
          normalized: true,
          chain: true,
          verdict: true,
          label: true,
          source: true,
        },
        take: 300,
      })
      addScamGuardIntelSource(
        builder,
        intel.map((item) => ({
          ...item,
          kind: String(item.kind),
          verdict: String(item.verdict),
        }))
      )
    }

    const domains = telegramDomains(telegramObservations)
    if (domains.length > 0) {
      const fingerprints = await db.scamDnaFingerprint.findMany({
        where: { domain: { in: domains }, campaignId: { not: null } },
        select: {
          domain: true,
          campaign: {
            select: {
              id: true,
              clusterKey: true,
              verdict: true,
              label: true,
              domains: true,
              strongestRisk: true,
              lastSeenAt: true,
            },
          },
        },
        take: 200,
      })
      const campaigns = new Map<string, SharedRiskGraphScamDnaObservation>()
      fingerprints.forEach((fingerprint) => {
        const campaign = fingerprint.campaign
        if (!campaign) return
        const current = campaigns.get(campaign.id)
        const campaignDomains = Array.isArray(campaign.domains)
          ? campaign.domains.map((value) => String(value))
          : []
        campaigns.set(campaign.id, {
          id: campaign.id,
          clusterKey: campaign.clusterKey,
          verdict: String(campaign.verdict),
          label: campaign.label,
          domains: Array.from(
            new Set([...(current?.domains ?? []), ...campaignDomains, fingerprint.domain])
          ),
          strongestRisk: campaign.strongestRisk,
          lastSeenAt: campaign.lastSeenAt.toISOString(),
        })
      })
      addScamDnaSource(builder, Array.from(campaigns.values()))
    }
  }

  return builder.finalize()
}
