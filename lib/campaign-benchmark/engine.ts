import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import type { CrossCampaignRiskMemory } from "@/lib/risk-memory/types"
import type { AnalysisDetail } from "@/types"

import {
  CAMPAIGN_BENCHMARK_VERSION,
  type CampaignBenchmarkComparison,
  type CampaignBenchmarkHistoryPoint,
  type CampaignBenchmarkMetricKey,
  type CampaignBenchmarkReport,
  type CampaignBenchmarkUnit,
  type CampaignBenchmarkWorkspaceSnapshot,
} from "@/lib/campaign-benchmark/types"

const metricDefinitions: Record<
  CampaignBenchmarkMetricKey,
  { label: string; unit: CampaignBenchmarkUnit; description: string }
> = {
  approval_rate: {
    label: "Approval rate",
    unit: "percent",
    description: "Share of wallets approved by the stored analysis decision.",
  },
  manual_review_rate: {
    label: "Manual review rate",
    unit: "percent",
    description: "Share of wallets routed to Gray Zone or human review.",
  },
  rejection_rate: {
    label: "Rejection rate",
    unit: "percent",
    description: "Share of wallets marked not eligible by the stored analysis decision.",
  },
  average_risk_score: {
    label: "Average risk score",
    unit: "score",
    description: "Mean stored risk score across campaign participants.",
  },
  analysis_duration_seconds: {
    label: "Analysis duration",
    unit: "seconds",
    description: "Elapsed time between analysis creation and completion when both timestamps exist.",
  },
  suspicious_clusters_per_1000_wallets: {
    label: "Suspicious clusters / 1,000 wallets",
    unit: "per_1000",
    description: "Suspicious cluster count normalized by campaign size.",
  },
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? rounded((numerator / denominator) * 100) : 0
}

function durationSeconds(createdAt: string, completedAt: string | null) {
  if (!completedAt) return null
  const start = Date.parse(createdAt)
  const end = Date.parse(completedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 1000)
}

function median(values: number[]) {
  if (values.length === 0) return null
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2
    ? ordered[middle]
    : rounded((ordered[middle - 1] + ordered[middle]) / 2)
}

function snapshotMetric(
  snapshot: CampaignBenchmarkWorkspaceSnapshot,
  key: CampaignBenchmarkMetricKey
) {
  if (key === "approval_rate") return percentage(snapshot.approvedCount, snapshot.totalWallets)
  if (key === "manual_review_rate") {
    return percentage(snapshot.manualReviewCount, snapshot.totalWallets)
  }
  if (key === "rejection_rate") return percentage(snapshot.rejectedCount, snapshot.totalWallets)
  if (key === "average_risk_score") return rounded(snapshot.averageRiskScore)
  if (key === "analysis_duration_seconds") {
    return durationSeconds(snapshot.createdAt, snapshot.completedAt)
  }
  return snapshot.totalWallets > 0
    ? rounded((snapshot.suspiciousClustersCount / snapshot.totalWallets) * 1000)
    : 0
}

function comparison(
  key: CampaignBenchmarkMetricKey,
  currentValue: number,
  workspace: CampaignBenchmarkWorkspaceSnapshot[]
): CampaignBenchmarkComparison {
  const values = workspace
    .map((snapshot) => snapshotMetric(snapshot, key))
    .filter((value): value is number => value !== null && Number.isFinite(value))
  const workspaceMedian = median(values)
  const definition = metricDefinitions[key]
  return {
    key,
    label: definition.label,
    unit: definition.unit,
    currentValue: rounded(currentValue),
    workspaceMedian,
    deltaFromMedian:
      workspaceMedian === null ? null : rounded(currentValue - workspaceMedian),
    sampleSize: values.length,
    description: definition.description,
  }
}

function historyPoint(
  snapshot: CampaignBenchmarkWorkspaceSnapshot
): CampaignBenchmarkHistoryPoint {
  return {
    analysisId: snapshot.analysisId,
    createdAt: snapshot.createdAt,
    completedAt: snapshot.completedAt,
    totalWallets: snapshot.totalWallets,
    approvalRate: percentage(snapshot.approvedCount, snapshot.totalWallets),
    manualReviewRate: percentage(snapshot.manualReviewCount, snapshot.totalWallets),
    rejectionRate: percentage(snapshot.rejectedCount, snapshot.totalWallets),
    averageRiskScore: rounded(snapshot.averageRiskScore),
    suspiciousClustersCount: snapshot.suspiciousClustersCount,
    analysisDurationSeconds: durationSeconds(snapshot.createdAt, snapshot.completedAt),
  }
}

function riskMemoryPartial(memory: CrossCampaignRiskMemory | null) {
  if (!memory) return false
  return (
    memory.coverage.graphNodesTruncated ||
    memory.coverage.walletAnalysesTruncated ||
    memory.coverage.telegramEventsTruncated
  )
}

export function buildCampaignBenchmarkReport(input: {
  analysis: AnalysisDetail
  policy: CampaignPolicyReport | null
  memory: CrossCampaignRiskMemory | null
  workspaceSnapshots: CampaignBenchmarkWorkspaceSnapshot[]
  campaignHistory: CampaignBenchmarkWorkspaceSnapshot[]
  workspaceCampaignLimit: number
  workspaceCampaignsTruncated: boolean
}): CampaignBenchmarkReport {
  const { analysis, policy, memory } = input
  const total = analysis.totalWallets
  const reviewedWallets = analysis.wallets.filter((wallet) => wallet.teamReview).length
  const changedHumanDecisions = analysis.wallets.filter(
    (wallet) => wallet.teamReview && wallet.teamReview.finalStatus !== wallet.status
  ).length
  const pendingReview = analysis.teamReviewSummary?.pendingReview ?? 0
  const reviewQueueSize = reviewedWallets + pendingReview
  const feedbackTotal = analysis.feedbackSummary?.totalFeedback ?? 0
  const explainableCount = analysis.wallets.filter((wallet) => wallet.decisionEvidence).length
  const highConfidenceCount = analysis.wallets.filter(
    (wallet) => wallet.decisionEvidence?.evidenceConfidence === "high"
  ).length
  const multiFamilyCount = analysis.wallets.filter(
    (wallet) => (wallet.decisionEvidence?.independentRiskFamilyCount ?? 0) >= 2
  ).length
  const dataLimitationCount = analysis.wallets.filter(
    (wallet) => (wallet.decisionEvidence?.limitations.length ?? 0) > 0
  ).length
  const clusteredWallets = analysis.wallets.filter((wallet) => wallet.clusterId).length
  const policyChanges = policy?.recommendations.filter(
    (item) => item.changesAutomatedDecision
  ).length

  const currentDuration = durationSeconds(analysis.createdAt, analysis.completedAt)
  const approvalRate = percentage(analysis.approvedCount, total)
  const manualReviewRate = percentage(analysis.manualReviewCount, total)
  const rejectionRate = percentage(analysis.rejectedCount, total)
  const clusterPerThousand =
    total > 0 ? rounded((analysis.suspiciousClustersCount / total) * 1000) : 0

  const summary = {
    totalWallets: total,
    approvalRate,
    manualReviewRate,
    rejectionRate,
    averageRiskScore: rounded(analysis.averageRiskScore),
    clusteredWalletRate: percentage(clusteredWallets, total),
    analysisDurationSeconds: currentDuration,
    reviewQueueSize,
    reviewedWallets,
    reviewCompletionRate:
      reviewQueueSize > 0 ? percentage(reviewedWallets, reviewQueueSize) : null,
    humanDecisionChangeRate:
      reviewedWallets > 0 ? percentage(changedHumanDecisions, reviewedWallets) : null,
    feedbackCoverageRate: percentage(feedbackTotal, total),
    falsePositiveFeedbackCount: analysis.feedbackSummary?.falsePositive ?? 0,
    falseNegativeFeedbackCount: analysis.feedbackSummary?.falseNegative ?? 0,
    explainableDecisionCoverageRate: percentage(explainableCount, total),
    highConfidenceDecisionRate: percentage(highConfidenceCount, total),
    multiFamilyEvidenceRate: percentage(multiFamilyCount, total),
    dataLimitationRate: percentage(dataLimitationCount, total),
    policyEscalationRate:
      policy && policyChanges !== undefined
        ? percentage(policyChanges, policy.coverage.walletsEvaluated)
        : null,
    policyReviewRecommendationRate: policy
      ? percentage(
          policy.summary.reviewRecommendations,
          policy.coverage.walletsEvaluated
        )
      : null,
    policyRejectRecommendationRate: policy
      ? percentage(
          policy.summary.rejectRecommendations,
          policy.coverage.walletsEvaluated
        )
      : null,
    repeatedParticipantRate: memory
      ? percentage(memory.summary.repeatedParticipants, total)
      : null,
    telegramCorroborationRate: policy
      ? percentage(policy.summary.telegramCorroborated, policy.coverage.walletsEvaluated)
      : null,
  }

  const comparisons = [
    comparison("approval_rate", approvalRate, input.workspaceSnapshots),
    comparison("manual_review_rate", manualReviewRate, input.workspaceSnapshots),
    comparison("rejection_rate", rejectionRate, input.workspaceSnapshots),
    comparison("average_risk_score", analysis.averageRiskScore, input.workspaceSnapshots),
    ...(currentDuration === null
      ? []
      : [
          comparison(
            "analysis_duration_seconds",
            currentDuration,
            input.workspaceSnapshots
          ),
        ]),
    comparison(
      "suspicious_clusters_per_1000_wallets",
      clusterPerThousand,
      input.workspaceSnapshots
    ),
  ]

  const measurementGaps = [
    "Workspace comparisons are operational context, not fraud-detection accuracy or causal performance claims.",
    "False-positive and false-negative counts reflect submitted feedback only; complete ground truth is not available.",
    "Reward exposure is not configured because campaign reward budget and distribution policy are not stored.",
    "Workspace baselines use only the latest analysis from each campaign inside the configured limit.",
  ]
  if (input.workspaceSnapshots.length < 3) {
    measurementGaps.push(
      "Fewer than three workspace analyses are available, so median comparisons are preliminary."
    )
  }
  if (!policy) measurementGaps.push("No policy report is available for this campaign analysis.")
  if (!memory) measurementGaps.push("No cross-campaign Risk Memory report is available.")
  if (riskMemoryPartial(memory)) {
    measurementGaps.push("Risk Memory reached a safety limit, so recurrence metrics are partial.")
  }
  if (feedbackTotal === 0) {
    measurementGaps.push("No reviewer feedback labels are available for outcome validation.")
  }

  return {
    schemaVersion: CAMPAIGN_BENCHMARK_VERSION,
    campaignId: analysis.project.id,
    campaignName: analysis.project.name,
    analysisId: analysis.id,
    generatedAt: new Date().toISOString(),
    summary,
    comparisons,
    history: input.campaignHistory.map(historyPoint),
    coverage: {
      workspaceCampaignsConsidered: input.workspaceSnapshots.length,
      workspaceAnalysesConsidered: input.workspaceSnapshots.length,
      workspaceCampaignLimit: input.workspaceCampaignLimit,
      workspaceCampaignsTruncated: input.workspaceCampaignsTruncated,
      riskMemoryAvailable: Boolean(memory),
      riskMemoryPartial: riskMemoryPartial(memory),
      policyAvailable: Boolean(policy),
      groundTruthAvailable: false,
      rewardExposureConfigured: false,
    },
    measurementGaps,
  }
}
