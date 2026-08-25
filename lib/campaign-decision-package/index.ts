import { chainAddressKey } from "@/lib/address-normalization"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import { storedGroupingFamilies } from "@/lib/cluster-investigation/builder"
import type { ClusterReviewRecord } from "@/lib/cluster-investigation/review"
import type { AnalysisDetail, SuggestedAction, WalletStatus } from "@/types"

export const CAMPAIGN_DECISION_PACKAGE_SCHEMA_VERSION = "tri-proof-campaign-decision-package-v1" as const
export const MAX_DECISION_PACKAGE_WALLETS = 50_000

export type CampaignExecutionAction = "allow" | "review" | "exclude"
export type CampaignDecisionPackageReadiness =
  | "ready"
  | "review_required"
  | "policy_unavailable"
  | "analysis_mismatch"

export type CampaignDecisionPackageWallet = {
  walletAddress: string
  chain: string
  storedStatus: WalletStatus
  policyAction: SuggestedAction
  executionAction: CampaignExecutionAction
  confidence: "low" | "medium" | "high"
  finalHumanDecision: WalletStatus | null
  changesStoredDecision: boolean
  clusterId: string | null
  clusterReviewDisposition: ClusterReviewRecord["disposition"] | null
  matchedRuleCodes: string[]
  explanation: string
}

export type CampaignDecisionPackage = {
  schemaVersion: typeof CAMPAIGN_DECISION_PACKAGE_SCHEMA_VERSION
  campaignId: string
  campaignName: string
  analysisId: string
  project: AnalysisDetail["project"]
  policy: {
    status: "available" | "unavailable" | "analysis_mismatch"
    preset: CampaignPolicyReport["preset"] | null
    thresholds: CampaignPolicyReport["thresholds"] | null
    coverage: CampaignPolicyReport["coverage"] | null
  }
  readiness: {
    status: CampaignDecisionPackageReadiness
    blockers: Array<{
      code: string
      description: string
      count: number
    }>
    warnings: Array<{
      code: string
      description: string
      count: number
    }>
  }
  summary: {
    totalWallets: number
    allowCount: number
    reviewCount: number
    excludeCount: number
    humanDecisionsPreserved: number
    policyChangesStoredDecision: number
    clusteredWallets: number
    clusters: number
    clusterReviewsRecorded: number
  }
  clusters: Array<{
    clusterLabel: string
    walletCount: number
    averageRiskScore: number
    groupingFamilies: string[]
    latestReviewDisposition: ClusterReviewRecord["disposition"] | null
    executionCounts: Record<CampaignExecutionAction, number>
  }>
  wallets: CampaignDecisionPackageWallet[]
  safeguards: string[]
}

function executionAction(action: SuggestedAction): CampaignExecutionAction {
  if (action === "approve") return "allow"
  if (action === "reject") return "exclude"
  return "review"
}

function executionCounts() {
  return { allow: 0, review: 0, exclude: 0 } satisfies Record<CampaignExecutionAction, number>
}

function reviewMap(reviews: readonly ClusterReviewRecord[]) {
  const result = new Map<string, ClusterReviewRecord>()
  for (const review of reviews) {
    if (!result.has(review.clusterLabel)) result.set(review.clusterLabel, review)
  }
  return result
}

function unavailablePackage(input: {
  analysis: AnalysisDetail
  campaignId: string
  campaignName: string
  policyStatus: "unavailable" | "analysis_mismatch"
  clusterReviews: readonly ClusterReviewRecord[]
}): CampaignDecisionPackage {
  const reviews = reviewMap(input.clusterReviews)
  const blockers = [{
    code: input.policyStatus === "analysis_mismatch" ? "POLICY_ANALYSIS_MISMATCH" : "POLICY_UNAVAILABLE",
    description: input.policyStatus === "analysis_mismatch"
      ? "Campaign policy belongs to a different analysis run. No execution list is produced."
      : "Campaign policy is unavailable. No execution list is produced.",
    count: input.analysis.totalWallets,
  }]
  return {
    schemaVersion: CAMPAIGN_DECISION_PACKAGE_SCHEMA_VERSION,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    analysisId: input.analysis.id,
    project: input.analysis.project,
    policy: { status: input.policyStatus, preset: null, thresholds: null, coverage: null },
    readiness: {
      status: input.policyStatus === "unavailable" ? "policy_unavailable" : "analysis_mismatch",
      blockers,
      warnings: [],
    },
    summary: {
      totalWallets: input.analysis.totalWallets,
      allowCount: 0,
      reviewCount: 0,
      excludeCount: 0,
      humanDecisionsPreserved: 0,
      policyChangesStoredDecision: 0,
      clusteredWallets: input.analysis.wallets.filter((wallet) => wallet.clusterId).length,
      clusters: input.analysis.clusters.length,
      clusterReviewsRecorded: input.analysis.clusters.filter((cluster) => reviews.has(cluster.clusterLabel)).length,
    },
    clusters: input.analysis.clusters.map((cluster) => ({
      clusterLabel: cluster.clusterLabel,
      walletCount: cluster.walletCount,
      averageRiskScore: cluster.averageRiskScore,
      groupingFamilies: storedGroupingFamilies(cluster.reasons).map((family) => family.label),
      latestReviewDisposition: reviews.get(cluster.clusterLabel)?.disposition ?? null,
      executionCounts: executionCounts(),
    })),
    wallets: [],
    safeguards: [
      "No wallet execution action is emitted without a matching campaign-policy report for this exact analysis run.",
      "The package is read-only and never updates wallet status, cluster membership, policy state, or reward lists.",
    ],
  }
}

export function buildCampaignDecisionPackage(input: {
  analysis: AnalysisDetail
  campaignId: string
  campaignName: string
  policyReport: CampaignPolicyReport | null
  clusterReviews?: readonly ClusterReviewRecord[]
}): CampaignDecisionPackage {
  const clusterReviews = input.clusterReviews ?? []
  if (!input.policyReport) {
    return unavailablePackage({
      analysis: input.analysis,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      policyStatus: "unavailable",
      clusterReviews,
    })
  }
  if (input.policyReport.analysisId !== input.analysis.id) {
    return unavailablePackage({
      analysis: input.analysis,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      policyStatus: "analysis_mismatch",
      clusterReviews,
    })
  }

  const reviews = reviewMap(clusterReviews)
  const walletByIdentity = new Map(
    input.analysis.wallets.map((wallet) => [chainAddressKey(wallet.walletAddress, wallet.chain), wallet]),
  )
  const recommendations = input.policyReport.recommendations.slice(0, MAX_DECISION_PACKAGE_WALLETS)
  const packageWallets: CampaignDecisionPackageWallet[] = []
  const counts = executionCounts()
  let humanDecisionsPreserved = 0
  let policyChangesStoredDecision = 0

  for (const recommendation of recommendations) {
    const wallet = walletByIdentity.get(chainAddressKey(recommendation.walletAddress, recommendation.chain))
    if (!wallet) continue
    const action = executionAction(recommendation.recommendedAction)
    counts[action] += 1
    if (recommendation.finalHumanDecision !== null) humanDecisionsPreserved += 1
    if (recommendation.changesAutomatedDecision) policyChangesStoredDecision += 1
    packageWallets.push({
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      storedStatus: wallet.status,
      policyAction: recommendation.recommendedAction,
      executionAction: action,
      confidence: recommendation.confidence,
      finalHumanDecision: recommendation.finalHumanDecision,
      changesStoredDecision: recommendation.changesAutomatedDecision,
      clusterId: wallet.clusterId,
      clusterReviewDisposition: wallet.clusterId
        ? reviews.get(wallet.clusterId)?.disposition ?? null
        : null,
      matchedRuleCodes: recommendation.matchedRules.map((rule) => rule.code),
      explanation: recommendation.explanation,
    })
  }

  const blockers: CampaignDecisionPackage["readiness"]["blockers"] = []
  const warnings: CampaignDecisionPackage["readiness"]["warnings"] = []
  if (counts.review > 0) {
    blockers.push({
      code: "WALLET_REVIEW_REQUIRED",
      description: "One or more policy recommendations still require a human wallet-level decision before final execution.",
      count: counts.review,
    })
  }
  if (input.policyReport.coverage.riskMemoryPartial) {
    blockers.push({
      code: "RISK_MEMORY_PARTIAL",
      description: "Cross-campaign risk-memory coverage is partial. Resolve coverage before treating this package as final.",
      count: 1,
    })
  }
  if (input.policyReport.summary.dataCoverageReviews > 0) {
    blockers.push({
      code: "DATA_COVERAGE_REVIEW",
      description: "Policy detected wallet evidence-coverage limitations that require review.",
      count: input.policyReport.summary.dataCoverageReviews,
    })
  }

  const escalatedClusters = input.analysis.clusters.filter(
    (cluster) => reviews.get(cluster.clusterLabel)?.disposition === "escalate",
  )
  const needsDataClusters = input.analysis.clusters.filter(
    (cluster) => reviews.get(cluster.clusterLabel)?.disposition === "needs_more_data",
  )
  const unsupportedClusters = input.analysis.clusters.filter(
    (cluster) => reviews.get(cluster.clusterLabel)?.disposition === "grouping_not_supported",
  )
  if (escalatedClusters.length) {
    blockers.push({
      code: "CLUSTER_INVESTIGATION_ESCALATED",
      description: "A cluster reviewer requested deeper investigation. Wallet actions remain unchanged, but campaign execution should wait for that investigation to close.",
      count: escalatedClusters.length,
    })
  }
  if (needsDataClusters.length) {
    blockers.push({
      code: "CLUSTER_NEEDS_MORE_DATA",
      description: "A cluster reviewer requested more evidence. Wallet actions remain unchanged, but the campaign package is not considered final.",
      count: needsDataClusters.length,
    })
  }
  if (unsupportedClusters.length) {
    warnings.push({
      code: "CLUSTER_GROUPING_NOT_SUPPORTED",
      description: "A reviewer does not support relying on one or more stored cluster groupings. Those dispositions do not rewrite wallet execution actions.",
      count: unsupportedClusters.length,
    })
  }
  if (recommendations.length < input.policyReport.recommendations.length) {
    blockers.push({
      code: "PACKAGE_WALLET_LIMIT",
      description: `Decision-package output is bounded to ${MAX_DECISION_PACKAGE_WALLETS} wallet recommendations.`,
      count: input.policyReport.recommendations.length - recommendations.length,
    })
  }

  const clusterExecutionCounts = new Map<string, Record<CampaignExecutionAction, number>>()
  for (const wallet of packageWallets) {
    if (!wallet.clusterId) continue
    const clusterCounts = clusterExecutionCounts.get(wallet.clusterId) ?? executionCounts()
    clusterCounts[wallet.executionAction] += 1
    clusterExecutionCounts.set(wallet.clusterId, clusterCounts)
  }

  const clusters = input.analysis.clusters.map((cluster) => ({
    clusterLabel: cluster.clusterLabel,
    walletCount: cluster.walletCount,
    averageRiskScore: cluster.averageRiskScore,
    groupingFamilies: storedGroupingFamilies(cluster.reasons).map((family) => family.label),
    latestReviewDisposition: reviews.get(cluster.clusterLabel)?.disposition ?? null,
    executionCounts: clusterExecutionCounts.get(cluster.clusterLabel) ?? executionCounts(),
  }))

  return {
    schemaVersion: CAMPAIGN_DECISION_PACKAGE_SCHEMA_VERSION,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    analysisId: input.analysis.id,
    project: input.analysis.project,
    policy: {
      status: "available",
      preset: input.policyReport.preset,
      thresholds: input.policyReport.thresholds,
      coverage: input.policyReport.coverage,
    },
    readiness: {
      status: blockers.length ? "review_required" : "ready",
      blockers,
      warnings,
    },
    summary: {
      totalWallets: input.analysis.totalWallets,
      allowCount: counts.allow,
      reviewCount: counts.review,
      excludeCount: counts.exclude,
      humanDecisionsPreserved,
      policyChangesStoredDecision,
      clusteredWallets: input.analysis.wallets.filter((wallet) => wallet.clusterId).length,
      clusters: input.analysis.clusters.length,
      clusterReviewsRecorded: input.analysis.clusters.filter((cluster) => reviews.has(cluster.clusterLabel)).length,
    },
    clusters,
    wallets: packageWallets,
    safeguards: [
      "This package is a read-only execution recommendation and does not update wallet status, campaign policy, cluster membership, or reward lists.",
      "Stored wallet-level human decisions take precedence through the campaign policy engine.",
      "Cluster reviewer dispositions provide investigation/readiness context and never rewrite per-wallet execution actions.",
      "Allow, Review, and Exclude are policy recommendations for campaign operations; they are not claims that a wallet owner is malicious.",
      "Shared funding, graph, recurrence, or cluster context is not standalone proof of common control.",
    ],
  }
}
