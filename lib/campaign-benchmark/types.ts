export const CAMPAIGN_BENCHMARK_VERSION = "tri-proof-campaign-benchmark-v1" as const

export type CampaignBenchmarkMetricKey =
  | "approval_rate"
  | "manual_review_rate"
  | "rejection_rate"
  | "average_risk_score"
  | "analysis_duration_seconds"
  | "suspicious_clusters_per_1000_wallets"

export type CampaignBenchmarkUnit = "count" | "percent" | "score" | "seconds" | "per_1000"

export type CampaignBenchmarkComparison = {
  key: CampaignBenchmarkMetricKey
  label: string
  unit: CampaignBenchmarkUnit
  currentValue: number
  workspaceMedian: number | null
  deltaFromMedian: number | null
  sampleSize: number
  description: string
}

export type CampaignBenchmarkHistoryPoint = {
  analysisId: string
  createdAt: string
  completedAt: string | null
  totalWallets: number
  approvalRate: number
  manualReviewRate: number
  rejectionRate: number
  averageRiskScore: number
  suspiciousClustersCount: number
  analysisDurationSeconds: number | null
}

export type CampaignOutcomeSummary = {
  totalWallets: number
  approvalRate: number
  manualReviewRate: number
  rejectionRate: number
  averageRiskScore: number
  clusteredWalletRate: number
  analysisDurationSeconds: number | null
  reviewQueueSize: number
  reviewedWallets: number
  reviewCompletionRate: number | null
  humanDecisionChangeRate: number | null
  feedbackCoverageRate: number
  falsePositiveFeedbackCount: number
  falseNegativeFeedbackCount: number
  explainableDecisionCoverageRate: number
  highConfidenceDecisionRate: number
  multiFamilyEvidenceRate: number
  dataLimitationRate: number
  policyEscalationRate: number | null
  policyReviewRecommendationRate: number | null
  policyRejectRecommendationRate: number | null
  repeatedParticipantRate: number | null
  telegramCorroborationRate: number | null
}

export type CampaignBenchmarkCoverage = {
  workspaceCampaignsConsidered: number
  workspaceAnalysesConsidered: number
  workspaceCampaignLimit: number
  workspaceCampaignsTruncated: boolean
  riskMemoryAvailable: boolean
  riskMemoryPartial: boolean
  policyAvailable: boolean
  groundTruthAvailable: boolean
  rewardExposureConfigured: boolean
}

export type CampaignBenchmarkReport = {
  schemaVersion: typeof CAMPAIGN_BENCHMARK_VERSION
  campaignId: string
  campaignName: string
  analysisId: string
  generatedAt: string
  summary: CampaignOutcomeSummary
  comparisons: CampaignBenchmarkComparison[]
  history: CampaignBenchmarkHistoryPoint[]
  coverage: CampaignBenchmarkCoverage
  measurementGaps: string[]
}

export type CampaignBenchmarkWorkspaceSnapshot = {
  campaignId: string
  campaignName: string
  analysisId: string
  createdAt: string
  completedAt: string | null
  totalWallets: number
  approvedCount: number
  manualReviewCount: number
  rejectedCount: number
  averageRiskScore: number
  suspiciousClustersCount: number
}
