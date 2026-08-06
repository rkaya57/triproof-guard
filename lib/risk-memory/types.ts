export const CROSS_CAMPAIGN_RISK_MEMORY_VERSION =
  "tri-proof-cross-campaign-risk-memory-v1" as const

export type RiskMemoryIdentityKind =
  | "onchain_identity"
  | "domain"
  | "url"

export type RiskMemoryRole =
  | "participant"
  | "funder"
  | "referrer"
  | "service"
  | "token"
  | "contract"
  | "program"
  | "wallet"
  | "domain"
  | "url"

export type RiskMemorySource =
  | "wallet_analysis"
  | "wallet_graph"
  | "telegram_guardian"
  | "team_review"

export type RiskMemoryDecision =
  | "approved"
  | "manual_review"
  | "rejected"
  | null

export type RiskMemoryOccurrence = {
  campaignId: string
  campaignName: string
  campaignChain: string
  analysisId: string | null
  identityKind: RiskMemoryIdentityKind
  role: RiskMemoryRole
  value: string
  chain: string | null
  source: RiskMemorySource
  riskScore: number | null
  originalDecision: RiskMemoryDecision
  finalDecision: RiskMemoryDecision
  componentId: string | null
  observedAt: string | null
  evidence: string
}

export type RiskMemoryMatch = {
  key: string
  identityKind: RiskMemoryIdentityKind
  value: string
  chain: string | null
  campaignCount: number
  priorCampaignCount: number
  roles: RiskMemoryRole[]
  crossRole: boolean
  highestRiskScore: number | null
  priorRejectedCount: number
  priorManualReviewCount: number
  telegramEvidenceCount: number
  latestObservedAt: string | null
  signals: string[]
  occurrences: RiskMemoryOccurrence[]
}

export type RiskMemoryCoverage = {
  campaignsConsidered: number
  analysesConsidered: number
  graphNodeLimit: number
  graphNodesRead: number
  graphNodesTruncated: boolean
  walletAnalysisLimit: number
  walletAnalysesRead: number
  walletAnalysesTruncated: boolean
  telegramEventLimit: number
  telegramEventsRead: number
  telegramEventsTruncated: boolean
}

export type CrossCampaignRiskMemory = {
  schemaVersion: typeof CROSS_CAMPAIGN_RISK_MEMORY_VERSION
  campaignId: string
  campaignName: string
  generatedAt: string
  summary: {
    matchedEntities: number
    repeatedParticipants: number
    repeatedInfrastructure: number
    crossRoleEntities: number
    entitiesWithPriorRejection: number
    telegramLinkedEntities: number
  }
  coverage: RiskMemoryCoverage
  matches: RiskMemoryMatch[]
}

export type RiskMemoryCampaignSnapshot = {
  id: string
  name: string
  chain: string
  analysisId: string | null
  occurrences: RiskMemoryOccurrence[]
}
