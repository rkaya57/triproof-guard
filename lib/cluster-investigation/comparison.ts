import { chainAddressKey } from "@/lib/address-normalization"
import type { FundingDecisionRelationshipInput } from "@/lib/campaign-security/funding-provenance-evidence"
import { storedGroupingFamilies, type ClusterGroupingFamily } from "@/lib/cluster-investigation/builder"
import type {
  AnalysisDetail,
  DecisionEvidenceFamily,
  RiskLevel,
  SuggestedAction,
  WalletStatus,
} from "@/types"

export const CROSS_CLUSTER_COMPARISON_SCHEMA_VERSION = "tri-proof-cross-cluster-comparison-v1" as const
export const MAX_COMPARED_CLUSTERS = 4

export type ClusterComparisonItem = {
  clusterLabel: string
  walletCount: number
  averageRiskScore: number
  behaviorSimilarityScore: number
  suggestedAction: SuggestedAction
  groupingFamilies: ClusterGroupingFamily[]
  statusCounts: Record<WalletStatus, number>
  riskLevelCounts: Record<RiskLevel, number>
  decisionEvidenceFamilyCounts: Partial<Record<DecisionEvidenceFamily, number>>
  teamReviewedCount: number
  fundingSources: string[]
  graphComponentIds: string[]
}

export type ClusterPairComparison = {
  leftClusterLabel: string
  rightClusterLabel: string
  averageRiskScoreDelta: number
  behaviorSimilarityDelta: number
  sameSuggestedAction: boolean
  sharedGroupingFamilies: ClusterGroupingFamily[]
  sharedFundingSources: string[]
  sharedGraphComponentIds: string[]
  sharedMemberWallets: string[]
}

export type CrossClusterComparisonReport = {
  schemaVersion: typeof CROSS_CLUSTER_COMPARISON_SCHEMA_VERSION
  analysisId: string
  project: AnalysisDetail["project"]
  selectedClusterLabels: string[]
  clusters: ClusterComparisonItem[]
  common: {
    groupingFamilies: ClusterGroupingFamily[]
    fundingSources: string[]
    graphComponentIds: string[]
  }
  pairwise: ClusterPairComparison[]
  caveats: string[]
}

function intersection<T>(sets: readonly Set<T>[]) {
  if (!sets.length) return [] as T[]
  return Array.from(sets[0]).filter((value) => sets.slice(1).every((set) => set.has(value)))
}

function statusCounts() {
  return { approved: 0, manual_review: 0, rejected: 0 } satisfies Record<WalletStatus, number>
}

function riskLevelCounts() {
  return { low: 0, medium: 0, high: 0, critical: 0 } satisfies Record<RiskLevel, number>
}

function relationshipSourcesForCluster(
  members: AnalysisDetail["wallets"],
  relationships: readonly FundingDecisionRelationshipInput[],
) {
  const memberKeys = new Set(members.map((wallet) => chainAddressKey(wallet.walletAddress, wallet.chain)))
  const sources = new Set<string>()

  for (const member of members) {
    if (member.fundingSource) sources.add(member.fundingSource)
  }

  for (const relationship of relationships) {
    const sourceMember = memberKeys.has(chainAddressKey(relationship.sourceAddress, relationship.chain))
    const targetMember = memberKeys.has(chainAddressKey(relationship.targetAddress, relationship.chain))
    if (!sourceMember && !targetMember) continue

    if (relationship.viaAddress) sources.add(relationship.viaAddress)
    if (relationship.kind === "FUNDED_BY" && sourceMember) sources.add(relationship.targetAddress)
  }

  return Array.from(sources).sort()
}

function evidenceFamilyCounts(members: AnalysisDetail["wallets"]) {
  const counts: Partial<Record<DecisionEvidenceFamily, number>> = {}
  for (const wallet of members) {
    const families = new Set(wallet.decisionEvidence?.evidenceFamilies ?? [])
    for (const family of families) counts[family] = (counts[family] ?? 0) + 1
  }
  return counts
}

function comparePair(
  left: ClusterComparisonItem,
  right: ClusterComparisonItem,
  membersByCluster: Map<string, Set<string>>,
): ClusterPairComparison {
  const leftFamilies = new Set(left.groupingFamilies)
  const rightFamilies = new Set(right.groupingFamilies)
  const leftFunding = new Set(left.fundingSources)
  const rightFunding = new Set(right.fundingSources)
  const leftComponents = new Set(left.graphComponentIds)
  const rightComponents = new Set(right.graphComponentIds)
  const leftMembers = membersByCluster.get(left.clusterLabel) ?? new Set<string>()
  const rightMembers = membersByCluster.get(right.clusterLabel) ?? new Set<string>()

  return {
    leftClusterLabel: left.clusterLabel,
    rightClusterLabel: right.clusterLabel,
    averageRiskScoreDelta: Number(Math.abs(left.averageRiskScore - right.averageRiskScore).toFixed(1)),
    behaviorSimilarityDelta: Number(Math.abs(left.behaviorSimilarityScore - right.behaviorSimilarityScore).toFixed(1)),
    sameSuggestedAction: left.suggestedAction === right.suggestedAction,
    sharedGroupingFamilies: Array.from(leftFamilies).filter((family) => rightFamilies.has(family)).sort(),
    sharedFundingSources: Array.from(leftFunding).filter((source) => rightFunding.has(source)).sort(),
    sharedGraphComponentIds: Array.from(leftComponents).filter((component) => rightComponents.has(component)).sort(),
    sharedMemberWallets: Array.from(leftMembers).filter((wallet) => rightMembers.has(wallet)).sort(),
  }
}

export function buildCrossClusterComparison(input: {
  analysis: AnalysisDetail
  clusterLabels: readonly string[]
  fundingRelationships?: readonly FundingDecisionRelationshipInput[]
}): CrossClusterComparisonReport {
  const requestedLabels = Array.from(
    new Set(input.clusterLabels.map((label) => label.trim()).filter(Boolean)),
  )
  const selectedClusters = requestedLabels
    .map((label) => input.analysis.clusters.find((cluster) => cluster.clusterLabel === label))
    .filter((cluster): cluster is AnalysisDetail["clusters"][number] => Boolean(cluster))
    .slice(0, MAX_COMPARED_CLUSTERS)

  const membersByCluster = new Map<string, Set<string>>()
  const clusters: ClusterComparisonItem[] = selectedClusters.map((cluster) => {
    const members = input.analysis.wallets.filter((wallet) => wallet.clusterId === cluster.clusterLabel)
    membersByCluster.set(cluster.clusterLabel, new Set(members.map((wallet) => wallet.walletAddress)))

    const statuses = statusCounts()
    const riskLevels = riskLevelCounts()
    const components = new Set<string>()
    let teamReviewedCount = 0

    for (const wallet of members) {
      statuses[wallet.status] += 1
      riskLevels[wallet.riskLevel] += 1
      if (wallet.graphComponentId) components.add(wallet.graphComponentId)
      if (wallet.teamReview) teamReviewedCount += 1
    }

    return {
      clusterLabel: cluster.clusterLabel,
      walletCount: members.length,
      averageRiskScore: cluster.averageRiskScore,
      behaviorSimilarityScore: cluster.behaviorSimilarityScore,
      suggestedAction: cluster.suggestedAction,
      groupingFamilies: storedGroupingFamilies(cluster.reasons).map((family) => family.family),
      statusCounts: statuses,
      riskLevelCounts: riskLevels,
      decisionEvidenceFamilyCounts: evidenceFamilyCounts(members),
      teamReviewedCount,
      fundingSources: relationshipSourcesForCluster(members, input.fundingRelationships ?? []),
      graphComponentIds: Array.from(components).sort(),
    }
  })

  const pairwise: ClusterPairComparison[] = []
  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
      const left = clusters[leftIndex]
      const right = clusters[rightIndex]
      if (left && right) pairwise.push(comparePair(left, right, membersByCluster))
    }
  }

  return {
    schemaVersion: CROSS_CLUSTER_COMPARISON_SCHEMA_VERSION,
    analysisId: input.analysis.id,
    project: input.analysis.project,
    selectedClusterLabels: clusters.map((cluster) => cluster.clusterLabel),
    clusters,
    common: {
      groupingFamilies: intersection(clusters.map((cluster) => new Set(cluster.groupingFamilies))).sort(),
      fundingSources: intersection(clusters.map((cluster) => new Set(cluster.fundingSources))).sort(),
      graphComponentIds: intersection(clusters.map((cluster) => new Set(cluster.graphComponentIds))).sort(),
    },
    pairwise,
    caveats: [
      "Cross-cluster comparison is descriptive and does not merge, split, or rescore stored clusters.",
      "Shared funding sources or graph components can reflect legitimate infrastructure and are not standalone proof of common control.",
      "A shared grouping family means both clusters were independently grouped using that family; it does not mean the same underlying event or actor connected both clusters.",
      "Stored human reviews remain wallet-level context and do not alter cluster membership in this comparison.",
    ],
  }
}
