import type {
  DecisionEvidenceConfidence,
  DecisionEvidenceFamily,
  RiskPolicy,
  SuggestedAction,
  WalletStatus,
} from "@/types"

export const CAMPAIGN_POLICY_ENGINE_VERSION = "tri-proof-campaign-policy-v1" as const

export type CampaignPolicyRuleSeverity = "info" | "caution" | "high" | "critical"

export type CampaignPolicyRuleCode =
  | "HUMAN_DECISION_PRECEDENCE"
  | "ELIGIBILITY_EXCLUSION"
  | "DECISIVE_CURRENT_SIGNAL"
  | "DATA_COVERAGE_REVIEW"
  | "MULTI_FAMILY_CORROBORATION"
  | "PRIOR_REJECTION_REVIEW"
  | "CROSS_ROLE_INFRASTRUCTURE_REVIEW"
  | "TELEGRAM_ONCHAIN_CORROBORATION"
  | "CROSS_CAMPAIGN_CORROBORATION"
  | "RECURRENCE_CONTEXT_ONLY"
  | "CURRENT_DECISION_BASELINE"

export type CampaignPolicyThresholds = {
  corroboratedRejectScore: number
  corroboratedFamilyCount: number
}

export type CampaignPolicyMatchedRule = {
  code: CampaignPolicyRuleCode
  title: string
  action: SuggestedAction
  severity: CampaignPolicyRuleSeverity
  rationale: string
  evidenceCodes: string[]
  evidenceFamilies: DecisionEvidenceFamily[]
}

export type CampaignPolicyMemoryContext = {
  campaignCount: number
  priorCampaignCount: number
  roles: string[]
  crossRole: boolean
  highestRiskScore: number | null
  priorRejectedCount: number
  priorManualReviewCount: number
  telegramEvidenceCount: number
}

export type CampaignPolicyRecommendation = {
  walletAddress: string
  chain: string
  currentDecision: WalletStatus
  finalHumanDecision: WalletStatus | null
  recommendedAction: SuggestedAction
  changesAutomatedDecision: boolean
  requiresHumanReview: boolean
  confidence: DecisionEvidenceConfidence
  matchedRules: CampaignPolicyMatchedRule[]
  safeguards: string[]
  explanation: string
  riskMemory: CampaignPolicyMemoryContext | null
}

export type CampaignPolicyCoverage = {
  walletsEvaluated: number
  riskMemoryAvailable: boolean
  riskMemoryPartial: boolean
  campaignsConsidered: number
  analysesConsidered: number
}

export type CampaignPolicyReport = {
  schemaVersion: typeof CAMPAIGN_POLICY_ENGINE_VERSION
  campaignId: string
  campaignName: string
  analysisId: string
  preset: RiskPolicy
  thresholds: CampaignPolicyThresholds
  generatedAt: string
  summary: {
    approveRecommendations: number
    reviewRecommendations: number
    rejectRecommendations: number
    escalatedFromApproved: number
    escalatedFromReview: number
    humanDecisionsPreserved: number
    crossCampaignCorroborated: number
    telegramCorroborated: number
    dataCoverageReviews: number
  }
  coverage: CampaignPolicyCoverage
  recommendations: CampaignPolicyRecommendation[]
}
