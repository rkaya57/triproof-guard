import type {
  AnalysisDetail,
  AnalysisMode,
  ClusterResult,
  EnrichmentMeta,
  EnrichmentStatus,
  FeedbackLabel,
  RiskPolicy,
  TeamReviewState,
  WalletGraphComponent,
  WalletGraphFinding,
  WalletGraphSummary,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

type DbWallet = {
  walletAddress: string
  chain: string
  entityLabel: string | null
  entityType: string | null
  entityRiskReason: string | null
  riskScore: number
  riskLevel: string
  status: string
  recommendedAction: string | null
  statusExplanation: string | null
  fundingSource: string | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  clusterId: string | null
  graphComponentId?: string | null
  graphRiskScore?: number | null
  reasons: unknown
  firstSeen?: Date | null
  lastSeen?: Date | null
  nativeBalance?: number | null
  tokenCount?: number | null
  uniqueCounterparties?: number | null
  lastActiveDaysAgo?: number | null
  isContract?: boolean | null
  enrichmentProvider?: string | null
  enrichmentStatus?: string | null
}

type DbTeamReview = {
  walletAddress: string
  finalStatus: string
  feedbackLabel: string | null
  notes: string | null
  updatedAt: Date
  reviewer?: { name?: string | null } | null
}

type DbFeedbackEvent = {
  label: string
}

type DbCluster = {
  clusterLabel: string
  walletCount: number
  averageRiskScore: number
  sharedFundingSource: string | null
  behaviorSimilarityScore: number
  suggestedAction: string
  reasons: unknown
}

type DbAnalysis = {
  id: string
  status: string
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
  csvFileName: string | null
  createdAt: Date
  completedAt: Date | null
  analysisMode?: string | null
  enrichmentStatus?: string | null
  enrichmentProvider?: string | null
  enrichedWalletCount?: number | null
  failedEnrichmentCount?: number | null
  cacheHitCount?: number | null
  usedMockFallback?: boolean | null
  enrichmentWarnings?: unknown
  project: {
    id: string
    name: string
    campaignType: string
    chain: string
    notes: string | null
  }
  wallets: DbWallet[]
  clusters: DbCluster[]
  teamReviews?: DbTeamReview[]
  feedbackEvents?: DbFeedbackEvent[]
  graphSummary?: {
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
}

function reasonsToStrings(reasons: unknown) {
  return Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : []
}

function riskPolicyFromNotes(notes: string | null | undefined): RiskPolicy {
  const match = notes?.match(/^TRIPROOF_RISK_POLICY=(conservative|balanced|strict)$/m)
  if (match?.[1] === "conservative" || match?.[1] === "strict") return match[1]
  return "balanced"
}

function feedbackCount(events: DbFeedbackEvent[] | undefined, label: FeedbackLabel) {
  return (events ?? []).filter((event) => event.label === label).length
}

export function serializeAnalysis(analysis: DbAnalysis): AnalysisDetail {
  const reviewMap = new Map<string, TeamReviewState>()
  ;(analysis.teamReviews ?? []).forEach((review) => {
    reviewMap.set(review.walletAddress, {
      finalStatus: review.finalStatus as WalletStatus,
      feedbackLabel: review.feedbackLabel as FeedbackLabel | null,
      notes: review.notes,
      reviewerName: review.reviewer?.name ?? null,
      updatedAt: review.updatedAt.toISOString(),
    })
  })

  const wallets: WalletRiskResult[] = analysis.wallets.map((wallet) => ({
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    entityLabel: wallet.entityLabel,
    entityType: (wallet.entityType ?? "user") as WalletRiskResult["entityType"],
    entityRiskReason: wallet.entityRiskReason,
    riskScore: wallet.riskScore,
    riskLevel: wallet.riskLevel as WalletRiskResult["riskLevel"],
    status: wallet.status as WalletRiskResult["status"],
    recommendedAction:
      (wallet.recommendedAction ?? "manual_review") as WalletRiskResult["recommendedAction"],
    statusExplanation:
      wallet.statusExplanation ??
      "Status is based on risk score and contextual wallet signals.",
    fundingSource: wallet.fundingSource,
    txCount: wallet.txCount,
    walletAgeDays: wallet.walletAgeDays,
    totalVolume: wallet.totalVolume,
    contractsCount: wallet.contractsCount,
    campaignActionsCount: wallet.campaignActionsCount,
    clusterId: wallet.clusterId,
    graphComponentId: wallet.graphComponentId ?? null,
    graphRiskScore: wallet.graphRiskScore ?? null,
    reasons: reasonsToStrings(wallet.reasons),
    firstSeen: wallet.firstSeen ? wallet.firstSeen.toISOString() : null,
    lastSeen: wallet.lastSeen ? wallet.lastSeen.toISOString() : null,
    nativeBalance: wallet.nativeBalance ?? null,
    tokenCount: wallet.tokenCount ?? null,
    uniqueCounterparties: wallet.uniqueCounterparties ?? null,
    lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
    isContract: wallet.isContract ?? null,
    enrichmentProvider: wallet.enrichmentProvider ?? null,
    enrichmentStatus: (wallet.enrichmentStatus ?? null) as EnrichmentStatus | null,
    teamReview: reviewMap.get(wallet.walletAddress) ?? null,
  }))

  const clusters: ClusterResult[] = analysis.clusters.map((cluster) => ({
    clusterLabel: cluster.clusterLabel,
    walletCount: cluster.walletCount,
    averageRiskScore: cluster.averageRiskScore,
    sharedFundingSource: cluster.sharedFundingSource,
    behaviorSimilarityScore: cluster.behaviorSimilarityScore,
    suggestedAction: cluster.suggestedAction as ClusterResult["suggestedAction"],
    reasons: reasonsToStrings(cluster.reasons),
    walletAddresses: wallets
      .filter((wallet) => wallet.clusterId === cluster.clusterLabel)
      .map((wallet) => wallet.walletAddress),
  }))

  const enrichment: EnrichmentMeta | null = analysis.enrichmentStatus
    ? {
        mode: (analysis.analysisMode ?? "onchain") as AnalysisMode,
        provider: analysis.enrichmentProvider ?? "unknown",
        enrichedCount: analysis.enrichedWalletCount ?? 0,
        failedCount: analysis.failedEnrichmentCount ?? 0,
        skippedCount: 0,
        cacheHits: analysis.cacheHitCount ?? 0,
        usedMockFallback: analysis.usedMockFallback ?? false,
        warnings: reasonsToStrings(analysis.enrichmentWarnings),
      }
    : null

  const reviewedWallets = analysis.teamReviews?.length ?? 0
  const feedbackEvents = analysis.feedbackEvents ?? []
  const graph: WalletGraphSummary | null = analysis.graphSummary
    ? {
        totalNodes: analysis.graphSummary.totalNodes,
        totalEdges: analysis.graphSummary.totalEdges,
        connectedWallets: analysis.graphSummary.connectedWallets,
        externalFunders: analysis.graphSummary.externalFunders,
        referralLinks: analysis.graphSummary.referralLinks,
        highRiskComponents: analysis.graphSummary.highRiskComponents,
        neutralServiceFunders: analysis.graphSummary.neutralServiceFunders,
        largestComponent: analysis.graphSummary.largestComponent,
        maxComponentRisk: analysis.graphSummary.maxComponentRisk,
        components: Array.isArray(analysis.graphSummary.components)
          ? (analysis.graphSummary.components as WalletGraphComponent[])
          : [],
        findings: Array.isArray(analysis.graphSummary.findings)
          ? (analysis.graphSummary.findings as WalletGraphFinding[])
          : [],
      }
    : null

  return {
    id: analysis.id,
    status: analysis.status,
    totalWallets: analysis.totalWallets,
    approvedCount: analysis.approvedCount,
    manualReviewCount: analysis.manualReviewCount,
    rejectedCount: analysis.rejectedCount,
    averageRiskScore: analysis.averageRiskScore,
    suspiciousClustersCount: analysis.suspiciousClustersCount,
    csvFileName: analysis.csvFileName,
    createdAt: analysis.createdAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
    analysisMode: (analysis.analysisMode ?? "csv_only") as AnalysisMode,
    riskPolicy: riskPolicyFromNotes(analysis.project.notes),
    enrichment,
    feedbackSummary: {
      totalFeedback: feedbackEvents.length,
      correctDecision: feedbackCount(feedbackEvents, "correct_decision"),
      falsePositive: feedbackCount(feedbackEvents, "false_positive"),
      falseNegative: feedbackCount(feedbackEvents, "false_negative"),
      confirmedRisk: feedbackCount(feedbackEvents, "confirmed_risk"),
      trustedUser: feedbackCount(feedbackEvents, "trusted_user"),
      needsMoreData: feedbackCount(feedbackEvents, "needs_more_data"),
    },
    teamReviewSummary: {
      reviewedWallets,
      pendingReview: Math.max(analysis.totalWallets - reviewedWallets, 0),
      approvedByTeam: (analysis.teamReviews ?? []).filter((review) => review.finalStatus === "approved").length,
      grayZoneByTeam: (analysis.teamReviews ?? []).filter((review) => review.finalStatus === "manual_review").length,
      rejectedByTeam: (analysis.teamReviews ?? []).filter((review) => review.finalStatus === "rejected").length,
    },
    project: analysis.project,
    wallets,
    clusters,
    graph,
  }
}
