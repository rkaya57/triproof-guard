import type {
  AnalysisDetail,
  AnalysisMode,
  ClusterResult,
  EnrichmentMeta,
  EnrichmentStatus,
  WalletRiskResult,
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
}

function reasonsToStrings(reasons: unknown) {
  return Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : []
}

export function serializeAnalysis(analysis: DbAnalysis): AnalysisDetail {
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
    enrichment,
    project: analysis.project,
    wallets,
    clusters,
  }
}
