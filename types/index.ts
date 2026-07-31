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

export type RiskPolicy = "conservative" | "balanced" | "strict"

export type FeedbackLabel =
  | "correct_decision"
  | "false_positive"
  | "false_negative"
  | "confirmed_risk"
  | "trusted_user"
  | "needs_more_data"

export type EnrichmentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"

export type PolicyAction = "approve" | "manual_review" | "reject" | null

export type TeamReviewState = {
  finalStatus: WalletStatus
  feedbackLabel: FeedbackLabel | null
  notes: string | null
  reviewerName: string | null
  updatedAt: string
}

export type ParsedWallet = {
  walletAddress: string
  chain: string
  txCount: number | null
  walletAgeDays: number | null
  fundingSource: string | null
  firstFundingAt?: string | null
  firstFundingAmount?: number | null
  historyTruncated?: boolean | null
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
  policyAction?: PolicyAction
  reputationLabel?: string | null
  policyReason?: string | null
  customerLabel?: string | null
  referrerAddress?: string | null
  referralCode?: string | null
  referralTimestamp?: string | null
  campaignEventAt?: string | null
  campaignEventType?: string | null
  campaignPoints?: number | null
  /** One-way, campaign-supplied participant/session fingerprint. Raw identifiers are not accepted. */
  participantFingerprint?: string | null
  enrichmentProvider?: string | null
  enrichmentStatus?: EnrichmentStatus | null
  sourceRow?: number
}

export type WalletGraphNodeKind =
  | "wallet"
  | "funder"
  | "referrer"
  | "referral_code"
  | "service"

export type WalletGraphEdgeKind = "funded" | "referred" | "self_referral"

export type WalletGraphSeverity = "info" | "caution" | "high" | "critical"

export type WalletGraphNode = {
  nodeKey: string
  address: string | null
  chain: string | null
  kind: WalletGraphNodeKind
  label: string | null
  walletAddress: string | null
  componentId: string | null
  metadata: Record<string, unknown>
}

export type WalletGraphEdge = {
  edgeKey: string
  sourceKey: string
  targetKey: string
  kind: WalletGraphEdgeKind
  confidence: number
  isRiskBearing: boolean
  componentId: string | null
  observedAt: string | null
  transactionId: string | null
  amount: number | null
  evidence: string[]
  metadata: Record<string, unknown>
}

export type WalletGraphFinding = {
  code: string
  title: string
  description: string
  severity: WalletGraphSeverity
  evidenceCount: number
  walletAddresses: string[]
  nodeKey: string | null
}

export type WalletGraphComponent = {
  componentId: string
  nodeKeys: string[]
  walletAddresses: string[]
  edgeCount: number
  riskScore: number
  severity: WalletGraphSeverity
  dominantFunder: string | null
  dominantReferrer: string | null
  reasons: string[]
}

export type WalletGraphSummary = {
  totalNodes: number
  totalEdges: number
  connectedWallets: number
  externalFunders: number
  referralLinks: number
  highRiskComponents: number
  neutralServiceFunders: number
  largestComponent: number
  maxComponentRisk: number
  components: WalletGraphComponent[]
  findings: WalletGraphFinding[]
}

export type WalletGraphData = WalletGraphSummary & {
  nodes: WalletGraphNode[]
  edges: WalletGraphEdge[]
}

export type AiBriefSource = "gemini" | "fallback"

export type AiBriefDriver = {
  title: string
  explanation: string
  severity: "info" | "caution" | "high"
}

export type AiAnalysisBrief = {
  source: AiBriefSource
  model: string | null
  generatedAt: string
  executiveSummary: string
  decisionRationale: string
  riskDrivers: AiBriefDriver[]
  recommendedActions: string[]
  limitations: string[]
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
  firstFundingAt?: string | null
  firstFundingAmount?: number | null
  historyTruncated?: boolean | null
  txCount: number | null
  walletAgeDays: number | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  clusterId: string | null
  graphComponentId?: string | null
  graphRiskScore?: number | null
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
  policyAction?: PolicyAction
  reputationLabel?: string | null
  policyReason?: string | null
  customerLabel?: string | null
  enrichmentProvider?: string | null
  enrichmentStatus?: EnrichmentStatus | null
  teamReview?: TeamReviewState | null
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

export type FeedbackSummary = {
  totalFeedback: number
  correctDecision: number
  falsePositive: number
  falseNegative: number
  confirmedRisk: number
  trustedUser: number
  needsMoreData: number
}

export type TeamReviewSummary = {
  reviewedWallets: number
  pendingReview: number
  approvedByTeam: number
  grayZoneByTeam: number
  rejectedByTeam: number
}

export type AnalysisResult = {
  wallets: WalletRiskResult[]
  clusters: ClusterResult[]
  graph: WalletGraphData
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
  riskPolicy?: RiskPolicy | null
  enrichment?: EnrichmentMeta | null
  feedbackSummary?: FeedbackSummary | null
  teamReviewSummary?: TeamReviewSummary | null
  project: {
    id: string
    name: string
    campaignType: string
    chain: string
    notes: string | null
  }
  wallets: WalletRiskResult[]
  clusters: ClusterResult[]
  graph?: WalletGraphSummary | null
  aiBrief?: AiAnalysisBrief | null
}
