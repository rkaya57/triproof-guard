import type {
  AnalysisResult,
  ClusterResult,
  EnrichmentMeta,
  EnrichmentStatus,
  EntityType,
  ParsedWallet,
  RiskLevel,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import { detectKnownEntity, isReviewOnlyEntityType } from "@/lib/risk-engine/known-entities"

type StatusDecision = {
  status: WalletStatus
  recommendedAction: SuggestedAction
  statusExplanation: string
}

type EnrichedWallet = {
  walletAddress: string
  chain: string
  txCount: number
  walletAgeDays: number
  fundingSource: string
  totalVolume: number
  contractsCount: number
  campaignActionsCount: number
  // Pass-through on-chain enrichment fields (null when enrichment did not run).
  firstSeen: string | null
  lastSeen: string | null
  nativeBalance: number | null
  tokenCount: number | null
  uniqueCounterparties: number | null
  lastActiveDaysAgo: number | null
  isContract: boolean | null
  enrichmentProvider: string | null
  enrichmentStatus: EnrichmentStatus | null
}

type ClusterDraft = {
  clusterLabel: string
  walletIndexes: number[]
  sharedFundingSource: string | null
  behaviorSimilarityScore: number
  reasons: string[]
}

function hashString(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function pickNumber(hash: number, min: number, max: number, salt: number) {
  const mixed = (hash ^ Math.imul(salt + 17, 2654435761)) >>> 0
  return min + (mixed % (max - min + 1))
}

function mockFundingSource(hash: number, index: number) {
  const clusterSeed = index % 11 === 0 ? 1 : index % 17 === 0 ? 2 : hash % 23
  const hex = clusterSeed.toString(16).padStart(40, "0")
  return `0x${hex}`
}

function hydrateWallet(wallet: ParsedWallet, index: number): EnrichedWallet {
  const hash = hashString(`${wallet.walletAddress}:${index}`)
  const txCount = wallet.txCount ?? pickNumber(hash, 1, 48, 1)
  const walletAgeDays = wallet.walletAgeDays ?? pickNumber(hash, 2, 540, 2)
  const campaignActionsCount =
    wallet.campaignActionsCount ?? pickNumber(hash, 1, 12, 3)
  const contractsCount = wallet.contractsCount ?? pickNumber(hash, 0, 20, 4)
  const totalVolume =
    wallet.totalVolume ?? Number((pickNumber(hash, 1, 150000, 5) / 100).toFixed(2))

  return {
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    txCount,
    walletAgeDays,
    fundingSource: wallet.fundingSource ?? mockFundingSource(hash, index),
    totalVolume,
    contractsCount,
    campaignActionsCount,
    firstSeen: wallet.firstSeen ?? null,
    lastSeen: wallet.lastSeen ?? null,
    nativeBalance: wallet.nativeBalance ?? null,
    tokenCount: wallet.tokenCount ?? null,
    uniqueCounterparties: wallet.uniqueCounterparties ?? null,
    lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
    isContract: wallet.isContract ?? null,
    enrichmentProvider: wallet.enrichmentProvider ?? null,
    enrichmentStatus: wallet.enrichmentStatus ?? null,
  }
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 30) return "low"
  if (score <= 60) return "medium"
  if (score <= 85) return "high"
  return "critical"
}

function explainContextualSignals(clusterId: string | null, fundingGroupSize: number) {
  const signals: string[] = []
  if (clusterId) {
    signals.push(`part of suspicious cluster ${clusterId}`)
  }
  if (fundingGroupSize >= 5) {
    signals.push(`shares funding source with ${fundingGroupSize} wallets`)
  }

  return signals.join(" and ")
}

function statusFromSignals(
  score: number,
  riskLevel: RiskLevel,
  clusterId: string | null,
  clusterSize: number,
  fundingGroupSize: number,
  entityType: EntityType
): StatusDecision {
  const contextualSignals = explainContextualSignals(clusterId, fundingGroupSize)
  const hasClusterSignal = Boolean(clusterId)
  const hasSharedFundingSignal = fundingGroupSize >= 5
  const isSevereCluster = hasClusterSignal && clusterSize >= 6

  if (isReviewOnlyEntityType(entityType)) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        `Known ${entityType} wallet should be reviewed before reward inclusion. It is not necessarily malicious, but it is not a typical individual participant.`,
    }
  }

  if (score >= 86 && isSevereCluster) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Critical risk score and severe cluster membership detected. Wallet is ${contextualSignals}.`,
    }
  }

  if (score >= 86) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Critical risk score detected, but contextual cluster evidence is not severe enough for automatic rejection.",
    }
  }

  if (riskLevel === "high") {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        contextualSignals
          ? `High risk score with contextual signal: wallet is ${contextualSignals}.`
          : "High risk score requires project team review before reward inclusion.",
    }
  }

  if (hasClusterSignal) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        `Wallet is part of suspicious cluster ${clusterId}. Cluster members are not automatically approved even when the numeric score is low.`,
    }
  }

  if (hasSharedFundingSignal) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        `Wallet shares funding source with ${fundingGroupSize} wallets. Shared funding groups of 5 or more require manual review.`,
    }
  }

  if (riskLevel === "medium") {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Medium risk score requires project team review before reward inclusion.",
    }
  }

  return {
    status: "approved",
    recommendedAction: "approve",
    statusExplanation:
      "Low risk score with no known entity, suspicious cluster, or shared funding source signal.",
  }
}

function clusterRisk(size: number) {
  if (size >= 21) return 35
  if (size >= 6) return 20
  if (size >= 3) return 10
  return 0
}

function bucket(value: number, size: number) {
  return Math.round(value / size) * size
}

function nextClusterLabel(index: number) {
  return `CL-${String(index + 1).padStart(3, "0")}`
}

function createClusters(wallets: EnrichedWallet[]) {
  const drafts: ClusterDraft[] = []
  const assigned = new Map<number, string>()
  const fundingGroups = new Map<string, number[]>()

  wallets.forEach((wallet, index) => {
    if (!wallet.fundingSource) return
    const key = wallet.fundingSource.toLowerCase()
    fundingGroups.set(key, [...(fundingGroups.get(key) ?? []), index])
  })

  Array.from(fundingGroups.entries())
    .filter(([, indexes]) => indexes.length >= 3)
    .forEach(([fundingSource, indexes]) => {
      const label = nextClusterLabel(drafts.length)
      indexes.forEach((walletIndex) => assigned.set(walletIndex, label))
      drafts.push({
        clusterLabel: label,
        walletIndexes: indexes,
        sharedFundingSource: fundingSource,
        behaviorSimilarityScore: Math.min(98, 58 + indexes.length * 3),
        reasons: [
          "Shared funding source",
          "Multiple wallets funded from the same origin",
        ],
      })
    })

  const secondaryGroups = new Map<string, number[]>()
  wallets.forEach((wallet, index) => {
    if (assigned.has(index)) return
    const key = [
      wallet.chain,
      bucket(wallet.walletAgeDays, 14),
      bucket(wallet.txCount, 5),
      bucket(wallet.campaignActionsCount, 3),
    ].join(":")
    secondaryGroups.set(key, [...(secondaryGroups.get(key) ?? []), index])
  })

  Array.from(secondaryGroups.values())
    .filter((indexes) => indexes.length >= 3)
    .forEach((indexes) => {
      const label = nextClusterLabel(drafts.length)
      indexes.forEach((walletIndex) => assigned.set(walletIndex, label))
      drafts.push({
        clusterLabel: label,
        walletIndexes: indexes,
        sharedFundingSource: null,
        behaviorSimilarityScore: Math.min(94, 52 + indexes.length * 4),
        reasons: [
          "Similar wallet age",
          "Similar transaction count",
          "Similar campaign activity",
          "Same chain behavior pattern",
        ],
      })
    })

  return { drafts, assigned, fundingGroups }
}

function suggestedActionFromCluster(
  averageRiskScore: number,
  behaviorSimilarityScore: number,
  walletCount: number,
  sharedFundingSource: string | null,
  reasons: string[]
): SuggestedAction {
  // Severe cluster: high risk + strong similarity + enough wallets
  if (averageRiskScore >= 86 && behaviorSimilarityScore >= 80 && walletCount >= 5) {
    return "reject"
  }
  // High risk band
  if (averageRiskScore >= 61) {
    return "manual_review"
  }
  // Lower risk but shared funding with 3+ wallets
  if (walletCount >= 3 && sharedFundingSource !== null) {
    return "manual_review"
  }
  // Very low risk but carries a suspicious signal reason
  if (
    averageRiskScore < 31 &&
    reasons.some(
      (r) => r === "Shared funding source" || r.startsWith("Part of suspicious cluster")
    )
  ) {
    return "manual_review"
  }
  // All cluster cards are at minimum manual_review — never approve
  return "manual_review"
}

const knownEntityRiskReason =
  "Known public exchange/service wallet detected. This address is not necessarily malicious, but it is not a typical individual reward campaign participant and should be manually reviewed."

export function analyzeWallets(
  wallets: ParsedWallet[],
  enrichment: EnrichmentMeta | null = null
): AnalysisResult {
  const enrichedWallets = wallets.map(hydrateWallet)
  const { drafts, assigned, fundingGroups } = createClusters(enrichedWallets)

  const walletResults: WalletRiskResult[] = enrichedWallets.map((wallet, index) => {
    const reasons: string[] = []
    const knownEntity = detectKnownEntity(wallet.walletAddress)
    const entityType: EntityType = knownEntity?.type ?? (wallet.isContract ? "contract" : "user")
    const entityRiskReason = knownEntity ? knownEntityRiskReason : null
    let score = 0
    const fundingGroupSize = wallet.fundingSource
      ? fundingGroups.get(wallet.fundingSource.toLowerCase())?.length ?? 0
      : 0
    const clusterId = assigned.get(index) ?? null
    const clusterSize = clusterId
      ? drafts.find((cluster) => cluster.clusterLabel === clusterId)?.walletIndexes.length ?? 0
      : 0

    if (wallet.walletAgeDays < 7) {
      score += 25
      reasons.push("Wallet is younger than 7 days")
    } else if (wallet.walletAgeDays <= 30) {
      score += 15
      reasons.push("Wallet is between 7 and 30 days old")
    } else if (wallet.walletAgeDays <= 90) {
      score += 8
      reasons.push("Wallet is younger than 90 days")
    }

    if (wallet.txCount <= 2) {
      score += 20
      reasons.push("Low transaction count")
    } else if (wallet.txCount <= 5) {
      score += 12
      reasons.push("Limited transaction history")
    } else if (wallet.txCount <= 15) {
      score += 5
      reasons.push("Moderate transaction history")
    }

    if (wallet.campaignActionsCount >= 5 && wallet.txCount <= 10) {
      score += 15
      reasons.push("Campaign-only behavior pattern")
    }

    const fundingRisk = clusterRisk(fundingGroupSize)
    if (fundingRisk > 0) {
      score += fundingRisk
      reasons.push(`Shared funding source with ${fundingGroupSize} wallets`)
    }

    const clusterScore = clusterRisk(clusterSize)
    if (clusterScore > 0 && clusterId) {
      score += clusterScore
      reasons.push(`Part of suspicious cluster ${clusterId}`)
    }

    if (wallet.contractsCount <= 1) {
      score += 15
      reasons.push("Low contract interaction diversity")
    } else if (wallet.contractsCount <= 3) {
      score += 8
      reasons.push("Limited contract interaction diversity")
    }

    if (wallet.totalVolume < 5 && wallet.campaignActionsCount > 3) {
      score += 10
      reasons.push("Low total volume despite campaign activity")
    }

    // Additional signals only fire when on-chain enrichment actually ran, so
    // CSV-only analyses keep their existing scoring behaviour unchanged.
    if (wallet.enrichmentStatus === "completed") {
      if (
        wallet.uniqueCounterparties !== null &&
        wallet.uniqueCounterparties <= 2 &&
        wallet.txCount > 2
      ) {
        score += 8
        reasons.push("Very few unique counterparties")
      }

      if (
        wallet.lastActiveDaysAgo !== null &&
        wallet.lastActiveDaysAgo > 180 &&
        wallet.campaignActionsCount > 0
      ) {
        score += 10
        reasons.push("Dormant wallet reactivated for campaign activity")
      }

      if (
        wallet.walletAgeDays < 7 &&
        wallet.campaignActionsCount > 0 &&
        wallet.txCount <= 5
      ) {
        score += 5
        reasons.push("Brand-new wallet active only during campaign")
      }
    }

    if (knownEntity) {
      score = Math.max(score, 65)
      reasons.unshift(knownEntityRiskReason)
    }

    const riskScore = Math.min(100, score)
    const riskLevel = riskLevelFromScore(riskScore)
    const decision = statusFromSignals(
      riskScore,
      riskLevel,
      clusterId,
      clusterSize,
      fundingGroupSize,
      entityType
    )

    if (!reasons.length) {
      reasons.push("No major risk signals detected")
    }

    return {
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      entityLabel: knownEntity?.label ?? null,
      entityType,
      entityRiskReason,
      riskScore,
      riskLevel,
      status: decision.status,
      recommendedAction: decision.recommendedAction,
      statusExplanation: decision.statusExplanation,
      fundingSource: wallet.fundingSource,
      txCount: wallet.txCount,
      walletAgeDays: wallet.walletAgeDays,
      totalVolume: wallet.totalVolume,
      contractsCount: wallet.contractsCount,
      campaignActionsCount: wallet.campaignActionsCount,
      clusterId,
      reasons,
      firstSeen: wallet.firstSeen,
      lastSeen: wallet.lastSeen,
      nativeBalance: wallet.nativeBalance,
      tokenCount: wallet.tokenCount,
      uniqueCounterparties: wallet.uniqueCounterparties,
      lastActiveDaysAgo: wallet.lastActiveDaysAgo,
      isContract: wallet.isContract,
      enrichmentProvider: wallet.enrichmentProvider,
      enrichmentStatus: wallet.enrichmentStatus,
    }
  })

  const clusters: ClusterResult[] = drafts.map((cluster) => {
    const clusterWallets = cluster.walletIndexes.map((index) => walletResults[index])
    const averageRiskScore =
      clusterWallets.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
      clusterWallets.length

    return {
      clusterLabel: cluster.clusterLabel,
      walletCount: clusterWallets.length,
      averageRiskScore: Number(averageRiskScore.toFixed(1)),
      sharedFundingSource: cluster.sharedFundingSource,
      behaviorSimilarityScore: cluster.behaviorSimilarityScore,
      suggestedAction: suggestedActionFromCluster(
        averageRiskScore,
        cluster.behaviorSimilarityScore,
        clusterWallets.length,
        cluster.sharedFundingSource,
        cluster.reasons
      ),
      reasons: cluster.reasons,
      walletAddresses: clusterWallets.map((wallet) => wallet.walletAddress),
    }
  })

  const totalWallets = walletResults.length
  const approvedCount = walletResults.filter((wallet) => wallet.status === "approved").length
  const manualReviewCount = walletResults.filter(
    (wallet) => wallet.status === "manual_review"
  ).length
  const rejectedCount = walletResults.filter((wallet) => wallet.status === "rejected").length
  const averageRiskScore = totalWallets
    ? walletResults.reduce((sum, wallet) => sum + wallet.riskScore, 0) / totalWallets
    : 0

  return {
    wallets: walletResults,
    clusters,
    totalWallets,
    approvedCount,
    manualReviewCount,
    rejectedCount,
    averageRiskScore: Number(averageRiskScore.toFixed(1)),
    riskDistribution: {
      low: walletResults.filter((wallet) => wallet.riskLevel === "low").length,
      medium: walletResults.filter((wallet) => wallet.riskLevel === "medium").length,
      high: walletResults.filter((wallet) => wallet.riskLevel === "high").length,
      critical: walletResults.filter((wallet) => wallet.riskLevel === "critical").length,
    },
    enrichment,
  }
}
