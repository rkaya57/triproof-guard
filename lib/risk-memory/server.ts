import { db } from "@/lib/db/prisma"
import {
  buildCrossCampaignRiskMemory,
  normalizeRiskMemoryValue,
  riskMemoryIdentityKey,
} from "@/lib/risk-memory/builder"
import type {
  CrossCampaignRiskMemory,
  RiskMemoryCampaignSnapshot,
  RiskMemoryDecision,
  RiskMemoryOccurrence,
  RiskMemoryRole,
} from "@/lib/risk-memory/types"
import { extractTelegramOnchainEntities } from "@/lib/telegram/intelligence"

const CAMPAIGN_LIMIT = 50
const GRAPH_NODE_LIMIT = 50_000
const WALLET_ANALYSIS_LIMIT = 50_000
const TELEGRAM_EVENT_LIMIT = 1_000

function decision(value: string | null | undefined): RiskMemoryDecision {
  if (value === "approved" || value === "manual_review" || value === "rejected") {
    return value
  }
  return null
}

function graphRole(kind: string): RiskMemoryRole | null {
  if (kind === "wallet") return "wallet"
  if (kind === "funder") return "funder"
  if (kind === "referrer") return "referrer"
  if (kind === "service") return "service"
  return null
}

function telegramRole(kind: string): RiskMemoryRole | null {
  if (kind === "wallet") return "wallet"
  if (kind === "token") return "token"
  if (kind === "contract") return "contract"
  if (kind === "program") return "program"
  if (kind === "domain") return "domain"
  if (kind === "url") return "url"
  return null
}

function reviewKey(analysisId: string, walletAddress: string, chain: string) {
  return `${analysisId}:${normalizeRiskMemoryValue("onchain_identity", walletAddress, chain)}`
}

export async function loadCrossCampaignRiskMemory(
  campaignId: string,
  userId: string
): Promise<CrossCampaignRiskMemory | null> {
  const current = await db.project.findFirst({
    where: { id: campaignId, userId },
    select: {
      id: true,
      name: true,
      chain: true,
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  })
  if (!current) return null

  const others = await db.project.findMany({
    where: { userId, id: { not: campaignId } },
    orderBy: { updatedAt: "desc" },
    take: CAMPAIGN_LIMIT - 1,
    select: {
      id: true,
      name: true,
      chain: true,
      analyses: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, createdAt: true },
      },
    },
  })
  const projects = [current, ...others]
  const analysisToProject = new Map<
    string,
    { id: string; name: string; chain: string; createdAt: Date }
  >()
  projects.forEach((project) => {
    const analysis = project.analyses[0]
    if (!analysis) return
    analysisToProject.set(analysis.id, {
      id: project.id,
      name: project.name,
      chain: project.chain,
      createdAt: analysis.createdAt,
    })
  })
  const analysisIds = Array.from(analysisToProject.keys())

  const [rawGraphNodes, rawWalletAnalyses, rawReviews, rawTelegramEvents] =
    await Promise.all([
      analysisIds.length
        ? db.walletGraphNode.findMany({
            where: {
              analysisId: { in: analysisIds },
              kind: { in: ["wallet", "funder", "referrer", "service"] },
            },
            orderBy: { createdAt: "desc" },
            take: GRAPH_NODE_LIMIT + 1,
            select: {
              analysisId: true,
              address: true,
              walletAddress: true,
              chain: true,
              kind: true,
              componentId: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      analysisIds.length
        ? db.walletAnalysis.findMany({
            where: { analysisId: { in: analysisIds } },
            orderBy: { createdAt: "desc" },
            take: WALLET_ANALYSIS_LIMIT + 1,
            select: {
              analysisId: true,
              walletAddress: true,
              chain: true,
              riskScore: true,
              status: true,
              graphComponentId: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      analysisIds.length
        ? db.teamReview.findMany({
            where: { analysisId: { in: analysisIds } },
            orderBy: { updatedAt: "desc" },
            take: WALLET_ANALYSIS_LIMIT,
            select: {
              analysisId: true,
              walletAddress: true,
              finalStatus: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      db.telegramScanEvent.findMany({
        where: { group: { ownerId: userId } },
        orderBy: { createdAt: "desc" },
        take: TELEGRAM_EVENT_LIMIT + 1,
        select: {
          id: true,
          groupId: true,
          telegramMessageId: true,
          target: true,
          domain: true,
          scanType: true,
          chain: true,
          riskLevel: true,
          score: true,
          confidence: true,
          summary: true,
          createdAt: true,
          group: { select: { title: true } },
        },
      }),
    ])

  const graphNodesTruncated = rawGraphNodes.length > GRAPH_NODE_LIMIT
  const walletAnalysesTruncated = rawWalletAnalyses.length > WALLET_ANALYSIS_LIMIT
  const telegramEventsTruncated = rawTelegramEvents.length > TELEGRAM_EVENT_LIMIT
  const graphNodes = rawGraphNodes.slice(0, GRAPH_NODE_LIMIT)
  const walletAnalyses = rawWalletAnalyses.slice(0, WALLET_ANALYSIS_LIMIT)
  const telegramEvents = rawTelegramEvents.slice(0, TELEGRAM_EVENT_LIMIT)

  const reviewMap = new Map<string, { finalStatus: RiskMemoryDecision; updatedAt: Date }>()
  rawReviews.forEach((review) => {
    const project = analysisToProject.get(review.analysisId)
    if (!project) return
    reviewMap.set(reviewKey(review.analysisId, review.walletAddress, project.chain), {
      finalStatus: decision(review.finalStatus),
      updatedAt: review.updatedAt,
    })
  })

  const snapshots = new Map<string, RiskMemoryCampaignSnapshot>()
  projects.forEach((project) => {
    snapshots.set(project.id, {
      id: project.id,
      name: project.name,
      chain: project.chain,
      analysisId: project.analyses[0]?.id ?? null,
      occurrences: [],
    })
  })

  const addOccurrence = (occurrence: RiskMemoryOccurrence) => {
    snapshots.get(occurrence.campaignId)?.occurrences.push(occurrence)
  }

  graphNodes.forEach((node) => {
    const project = analysisToProject.get(node.analysisId)
    const role = graphRole(node.kind)
    const value = node.address ?? node.walletAddress
    if (!project || !role || !value?.trim()) return
    addOccurrence({
      campaignId: project.id,
      campaignName: project.name,
      campaignChain: project.chain,
      analysisId: node.analysisId,
      identityKind: "onchain_identity",
      role,
      value,
      chain: node.chain ?? project.chain,
      source: "wallet_graph",
      riskScore: null,
      originalDecision: null,
      finalDecision: null,
      componentId: node.componentId,
      observedAt: node.createdAt.toISOString(),
      evidence: `Exact ${role} identity stored in the campaign wallet graph.`,
    })
  })

  walletAnalyses.forEach((wallet) => {
    const project = analysisToProject.get(wallet.analysisId)
    if (!project || !wallet.walletAddress.trim()) return
    const review = reviewMap.get(
      reviewKey(wallet.analysisId, wallet.walletAddress, wallet.chain)
    )
    addOccurrence({
      campaignId: project.id,
      campaignName: project.name,
      campaignChain: project.chain,
      analysisId: wallet.analysisId,
      identityKind: "onchain_identity",
      role: "participant",
      value: wallet.walletAddress,
      chain: wallet.chain,
      source: review ? "team_review" : "wallet_analysis",
      riskScore: wallet.riskScore,
      originalDecision: decision(wallet.status),
      finalDecision: review?.finalStatus ?? null,
      componentId: wallet.graphComponentId,
      observedAt: (review?.updatedAt ?? wallet.createdAt).toISOString(),
      evidence: review
        ? "Exact participant identity with a stored human review decision."
        : "Exact participant identity stored in the campaign analysis.",
    })
  })

  const campaignIdsByIdentity = new Map<string, Set<string>>()
  snapshots.forEach((snapshot) => {
    snapshot.occurrences.forEach((occurrence) => {
      if (occurrence.identityKind !== "onchain_identity") return
      const key = riskMemoryIdentityKey(occurrence)
      const ids = campaignIdsByIdentity.get(key) ?? new Set<string>()
      ids.add(snapshot.id)
      campaignIdsByIdentity.set(key, ids)
    })
  })

  telegramEvents.forEach((event) => {
    const entities = extractTelegramOnchainEntities({
      target: event.target,
      domain: event.domain,
      scanType: event.scanType,
      chain: event.chain,
    })
    const linkedCampaignIds = new Set<string>()
    entities.forEach((entity) => {
      if (!["wallet", "token", "contract", "program"].includes(entity.kind)) return
      const key = riskMemoryIdentityKey({
        identityKind: "onchain_identity",
        value: entity.value,
        chain: entity.chain,
      })
      campaignIdsByIdentity.get(key)?.forEach((id) => linkedCampaignIds.add(id))
    })
    if (linkedCampaignIds.size === 0) return

    linkedCampaignIds.forEach((linkedCampaignId) => {
      const snapshot = snapshots.get(linkedCampaignId)
      if (!snapshot) return
      entities.forEach((entity) => {
        const role = telegramRole(entity.kind)
        if (!role) return
        const identityKind =
          entity.kind === "domain"
            ? "domain"
            : entity.kind === "url"
              ? "url"
              : "onchain_identity"
        addOccurrence({
          campaignId: snapshot.id,
          campaignName: snapshot.name,
          campaignChain: snapshot.chain,
          analysisId: snapshot.analysisId,
          identityKind,
          role,
          value: entity.value,
          chain: entity.chain,
          source: "telegram_guardian",
          riskScore: event.score,
          originalDecision: null,
          finalDecision: null,
          componentId: null,
          observedAt: event.createdAt.toISOString(),
          evidence: `${entity.evidence} Telegram group: ${event.group?.title ?? event.groupId ?? "unknown"}; message ${event.telegramMessageId}; scan confidence ${event.confidence}.`,
        })
      })
    })
  })

  return buildCrossCampaignRiskMemory({
    currentCampaignId: campaignId,
    campaigns: Array.from(snapshots.values()),
    coverage: {
      campaignsConsidered: projects.length,
      analysesConsidered: analysisIds.length,
      graphNodeLimit: GRAPH_NODE_LIMIT,
      graphNodesRead: graphNodes.length,
      graphNodesTruncated,
      walletAnalysisLimit: WALLET_ANALYSIS_LIMIT,
      walletAnalysesRead: walletAnalyses.length,
      walletAnalysesTruncated,
      telegramEventLimit: TELEGRAM_EVENT_LIMIT,
      telegramEventsRead: telegramEvents.length,
      telegramEventsTruncated,
    },
  })
}
