export type CampaignType =
  | "Airdrop"
  | "Testnet"
  | "Whitelist"
  | "Quest"
  | "Points Program"
  | "Community Reward"
  | "Other"

export type Chain =
  | "Ethereum"
  | "Base"
  | "Arbitrum"
  | "Optimism"
  | "Polygon"
  | "BNB Chain"
  | "Solana"
  | "Other"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export type WalletStatus = "approved" | "manual_review" | "rejected"

export type SuggestedAction = "approve" | "manual_review" | "reject"

export type EntityType =
  | "exchange"
  | "service"
  | "bridge"
  | "contract"
  | "protocol"
  | "unknown"
  | "user"

export type AnalysisMode = "csv_only" | "onchain" | "hybrid"

export type EnrichmentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"

export type ParsedWallet = {
  walletAddress: string
  chain: string
  txCount: number | null
  walletAgeDays: number | null
  fundingSource: string | null
  firstSeen: string | null
  lastSeen: string | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  nativeBalance?: number | null
  tokenCount?: number | null
  uniqueCounterparties?: number | null
  lastActiveDaysAgo?: number | null
  isContract?: boolean | null
  knownEntityLabel?: string | null
  knownEntityType?: EntityType | null
  accountType?: string | null
  ownerProgram?: string | null
  behaviorFingerprint?: string[] | null
  campaignQualityScore?: number | null
  campaignOnlyRatio?: number | null
  behaviorDiversityScore?: number | null
  botScriptScore?: number | null
  enrichmentProvider?: string | null
  enrichmentStatus?: EnrichmentStatus | null
  sourceRow?: number
}

export type CsvIssue = {
  row: number
  walletAddress?: string
  issue: string
}

export type CsvParseResult = {
  wallets: ParsedWallet[]
  issues: CsvIssue[]
  duplicates: CsvIssue[]
  mode: "basic" | "enriched"
  headers: string[]
}

export type WalletRiskResult = {
  walletAddress: string
  chain: string
  entityLabel: string | null
  entityType: EntityType
  entityRiskReason: string | null
  riskScore: number
  riskLevel: RiskLevel
  status: WalletStatus
  recommendedAction: SuggestedAction
  statusExplanation: string
  fundingSource: string | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  clusterId: string | null
  reasons: string[]
  firstSeen?: string | null
  lastSeen?: string | null
  nativeBalance?: number | null
  tokenCount?: number | null
  uniqueCounterparties?: number | null
  lastActiveDaysAgo?: number | null
  isContract?: boolean | null
  accountType?: string | null
  ownerProgram?: string | null
  behaviorFingerprint?: string[] | null
  campaignQualityScore?: number | null
  campaignOnlyRatio?: number | null
  behaviorDiversityScore?: number | null
  botScriptScore?: number | null
  enrichmentProvider?: string | null
  enrichmentStatus?: EnrichmentStatus | null
}

export type EnrichmentMeta = {
  mode: AnalysisMode
  provider: string
  enrichedCount: number
  failedCount: number
  skippedCount: number
  cacheHits: number
  usedMockFallback: boolean
  warnings: string[]
}

export type ClusterResult = {
  clusterLabel: string
  walletCount: number
  averageRiskScore: number
  sharedFundingSource: string | null
  behaviorSimilarityScore: number
  suggestedAction: SuggestedAction
  reasons: string[]
  walletAddresses: string[]
}

export type AnalysisResult = {
  wallets: WalletRiskResult[]
  clusters: ClusterResult[]
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  riskDistribution: Record<RiskLevel, number>
  enrichment?: EnrichmentMeta | null
}

export type AnalysisDetail = {
  id: string
  status: string
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
  csvFileName: string | null
  createdAt: string
  completedAt: string | null
  analysisMode?: AnalysisMode | null
  enrichment?: EnrichmentMeta | null
  project: {
    id: string
    name: string
    campaignType: string
    chain: string
    notes: string | null
  }
  wallets: WalletRiskResult[]
  clusters: ClusterResult[]
}
