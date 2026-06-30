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
  txCount: number | null
  walletAgeDays: number | null
  fundingSource: string | null
  totalVolume: number | null
  contractsCount: number | null
  campaignActionsCount: number | null
  firstSeen: string | null
  lastSeen: string | null
  nativeBalance: number | null
  tokenCount: number | null
  uniqueCounterparties: number | null
  lastActiveDaysAgo: number | null
  isContract: boolean | null
  knownEntityLabel: string | null
  knownEntityType: EntityType | null
  accountType: string | null
  ownerProgram: string | null
  behaviorFingerprint: string[] | null
  campaignQualityScore: number | null
  campaignOnlyRatio: number | null
  behaviorDiversityScore: number | null
  botScriptScore: number | null
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

const onChainCleanReason =
  "On-chain evidence: no major risk signals detected from available provider data"

const knownEntityRiskReason =
  "On-chain entity evidence: known public exchange/service/protocol wallet detected. This address is not a typical individual reward campaign participant."

function hydrateWallet(wallet: ParsedWallet): EnrichedWallet {
  return {
    walletAddress: wallet.walletAddress,
    chain: wallet.chain,
    txCount: wallet.txCount ?? null,
    walletAgeDays: wallet.walletAgeDays ?? null,
    fundingSource: wallet.fundingSource ?? null,
    totalVolume: wallet.totalVolume ?? null,
    contractsCount: wallet.contractsCount ?? null,
    campaignActionsCount: wallet.campaignActionsCount ?? null,
    firstSeen: wallet.firstSeen ?? null,
    lastSeen: wallet.lastSeen ?? null,
    nativeBalance: wallet.nativeBalance ?? null,
    tokenCount: wallet.tokenCount ?? null,
    uniqueCounterparties: wallet.uniqueCounterparties ?? null,
    lastActiveDaysAgo: wallet.lastActiveDaysAgo ?? null,
    isContract: wallet.isContract ?? null,
    knownEntityLabel: wallet.knownEntityLabel ?? null,
    knownEntityType: wallet.knownEntityType ?? null,
    accountType: wallet.accountType ?? null,
    ownerProgram: wallet.ownerProgram ?? null,
    behaviorFingerprint: wallet.behaviorFingerprint ?? null,
    campaignQualityScore: wallet.campaignQualityScore ?? null,
    campaignOnlyRatio: wallet.campaignOnlyRatio ?? null,
    behaviorDiversityScore: wallet.behaviorDiversityScore ?? null,
    botScriptScore: wallet.botScriptScore ?? null,
    enrichmentProvider: wallet.enrichmentProvider ?? null,
    enrichmentStatus: wallet.enrichmentStatus ?? null,
  }
}

function isUserLikeAccount(wallet: EnrichedWallet) {
  return !wallet.accountType || wallet.accountType === "system_user_wallet"
}

function hasEvidence(wallet: EnrichedWallet, entityType: EntityType) {
  if (wallet.accountType === "missing_or_closed_account") return false
  return (
    entityType !== "user" ||
    wallet.txCount !== null ||
    wallet.walletAgeDays !== null ||
    wallet.fundingSource !== null ||
    wallet.totalVolume !== null ||
    wallet.contractsCount !== null ||
    wallet.campaignActionsCount !== null ||
    wallet.uniqueCounterparties !== null ||
    wallet.lastActiveDaysAgo !== null ||
    wallet.isContract !== null ||
    wallet.accountType !== null ||
    wallet.enrichmentStatus === "completed"
  )
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 30) return "low"
  if (score <= 60) return "medium"
  if (score <= 85) return "high"
  return "critical"
}

function explainContextualSignals(clusterId: string | null, fundingGroupSize: number) {
  const signals: string[] = []
  if (clusterId) signals.push(`part of suspicious cluster ${clusterId}`)
  if (fundingGroupSize >= 5) signals.push(`shares funding source with ${fundingGroupSize} wallets`)
  return signals.join(" and ")
}

function statusFromSignals({
  score,
  riskLevel,
  clusterId,
  clusterSize,
  fundingGroupSize,
  entityType,
  evidenceAvailable,
  accountType,
  hardSybilSignal,
}: {
  score: number
  riskLevel: RiskLevel
  clusterId: string | null
  clusterSize: number
  fundingGroupSize: number
  entityType: EntityType
  evidenceAvailable: boolean
  accountType: string | null
  hardSybilSignal: boolean
}): StatusDecision {
  const contextualSignals = explainContextualSignals(clusterId, fundingGroupSize)
  const hasClusterSignal = Boolean(clusterId)
  const hasSharedFundingSignal = fundingGroupSize >= 5
  const largeSharedFundingGroup = fundingGroupSize >= 10
  const largeCluster = clusterSize >= 10
  const severeCluster = hasClusterSignal && (clusterSize >= 6 || largeSharedFundingGroup)

  if (!evidenceAvailable) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        "Rejected as unverified/not eligible: no reliable on-chain evidence was available. Tri-Proof does not approve wallets without enough evidence for reward inclusion.",
    }
  }

  if (accountType && accountType !== "system_user_wallet") {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected as not eligible: non-user Solana account detected (${accountType}). Program, token, sysvar, protocol, closed, or program-owned accounts are excluded from normal user reward lists.`,
    }
  }

  if (isReviewOnlyEntityType(entityType)) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected as not eligible: known ${entityType} address. It may not be malicious, but it is not a typical individual campaign participant.`,
    }
  }

  if (score >= 80) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation: contextualSignals
        ? `Rejected: very high risk score with contextual evidence; wallet is ${contextualSignals}.`
        : "Rejected: very high wallet risk score.",
    }
  }

  if (hardSybilSignal) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation: contextualSignals
        ? `Rejected: high-confidence Sybil/farming signal detected; wallet is ${contextualSignals}.`
        : "Rejected: high-confidence Sybil/farming signal detected.",
    }
  }

  if (severeCluster || largeCluster || largeSharedFundingGroup) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected: severe cluster evidence detected. Wallet is ${contextualSignals || "part of a large suspicious wallet group"}.`,
    }
  }

  if (score <= 35 && !hasClusterSignal && !hasSharedFundingSignal) {
    return {
      status: "approved",
      recommendedAction: "approve",
      statusExplanation:
        "Approved: wallet has enough on-chain evidence and no known entity, shared funding-source, or suspicious cluster signal.",
    }
  }

  if (score >= 60 && (hasClusterSignal || hasSharedFundingSignal || riskLevel === "high")) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation: contextualSignals
        ? `Rejected: high risk score with cluster/funding evidence; wallet is ${contextualSignals}.`
        : "Rejected: high risk score with strong contextual evidence.",
    }
  }

  if (score >= 60) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Manual review: high score, but no hard Sybil or severe cluster signal was strong enough for automatic rejection.",
    }
  }

  if (score >= 36) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Manual review: medium-risk gray-zone wallet. It has some weak risk signals but not enough evidence for automatic rejection.",
    }
  }

  return {
    status: "approved",
    recommendedAction: "approve",
    statusExplanation:
      "Approved: low risk score and no hard Sybil, cluster, known-entity, or no-data signal detected.",
  }
}

function clusterRisk(size: number) {
  if (size >= 21) return 40
  if (size >= 10) return 30
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

function timeBucket(iso: string | null, hours: number) {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  const bucketMs = hours * 60 * 60 * 1000
  return Math.floor(parsed / bucketMs)
}

function fingerprintKey(wallet: EnrichedWallet) {
  const fp = wallet.behaviorFingerprint ?? []
  return fp.slice(0, 8).join("|")
}

function hasBehaviorClusterInputs(wallet: EnrichedWallet) {
  return (
    isUserLikeAccount(wallet) &&
    wallet.walletAgeDays !== null &&
    wallet.txCount !== null &&
    (wallet.contractsCount !== null || wallet.uniqueCounterparties !== null || Boolean(wallet.behaviorFingerprint?.length))
  )
}

function createClusters(wallets: EnrichedWallet[]) {
  const drafts: ClusterDraft[] = []
  const assigned = new Map<number, string>()
  const fundingGroups = new Map<string, number[]>()

  wallets.forEach((wallet, index) => {
    if (!isUserLikeAccount(wallet) || !wallet.fundingSource) return
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
        behaviorSimilarityScore: Math.min(99, 62 + indexes.length * 3),
        reasons: [
          "V1.2 funding cluster: shared funding source",
          "Funding cluster evidence: multiple user-like wallets were funded from the same on-chain origin",
          indexes.length >= 10
            ? "Auto-reject threshold: large shared funding group"
            : "Manual/reject threshold: shared funding group requires cluster-aware decisioning",
        ],
      })
    })

  const temporalGroups = new Map<string, number[]>()
  wallets.forEach((wallet, index) => {
    if (assigned.has(index) || !isUserLikeAccount(wallet)) return
    const bucketId = timeBucket(wallet.firstSeen, 24)
    if (bucketId === null) return
    const key = [wallet.chain, bucketId, bucket(wallet.txCount ?? 0, 5)].join(":")
    temporalGroups.set(key, [...(temporalGroups.get(key) ?? []), index])
  })

  Array.from(temporalGroups.values())
    .filter((indexes) => indexes.length >= 5)
    .forEach((indexes) => {
      const label = nextClusterLabel(drafts.length)
      indexes.forEach((walletIndex) => assigned.set(walletIndex, label))
      drafts.push({
        clusterLabel: label,
        walletIndexes: indexes,
        sharedFundingSource: null,
        behaviorSimilarityScore: Math.min(94, 54 + indexes.length * 4),
        reasons: [
          "V1.2 temporal cohort: wallets first appeared in the same time window",
          "Behavior cluster evidence: similar transaction count inside the cohort",
          indexes.length >= 10
            ? "Auto-reject threshold: large same-time cohort"
            : "Manual/reject threshold: same-time cohort requires cluster-aware decisioning",
        ],
      })
    })

  const secondaryGroups = new Map<string, number[]>()
  wallets.forEach((wallet, index) => {
    if (assigned.has(index) || !hasBehaviorClusterInputs(wallet)) return
    const key = [
      wallet.chain,
      bucket(wallet.walletAgeDays as number, 14),
      bucket(wallet.txCount as number, 5),
      bucket(wallet.contractsCount ?? 0, 3),
      bucket(wallet.tokenCount ?? 0, 2),
      fingerprintKey(wallet),
    ].join(":")
    secondaryGroups.set(key, [...(secondaryGroups.get(key) ?? []), index])
  })

  Array.from(secondaryGroups.values())
    .filter((indexes) => indexes.length >= 4)
    .forEach((indexes) => {
      const label = nextClusterLabel(drafts.length)
      indexes.forEach((walletIndex) => assigned.set(walletIndex, label))
      drafts.push({
        clusterLabel: label,
        walletIndexes: indexes,
        sharedFundingSource: null,
        behaviorSimilarityScore: Math.min(96, 56 + indexes.length * 4),
        reasons: [
          "V1.2 behavior cluster: similar wallet age",
          "Behavior cluster evidence: similar transaction count",
          "Behavior cluster evidence: similar protocol/program interaction diversity",
          "Behavior fingerprint evidence: similar sampled program/instruction pattern",
          indexes.length >= 10
            ? "Auto-reject threshold: large behavior-similar wallet group"
            : "Manual/reject threshold: behavior-similar group requires cluster-aware decisioning",
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
  const largeCluster = walletCount >= 10
  const highSimilarity = behaviorSimilarityScore >= 80
  const sharedFunding = sharedFundingSource !== null
  const autoRejectReason = reasons.some((reason) => reason.startsWith("Auto-reject threshold"))

  if (autoRejectReason || largeCluster || (sharedFunding && walletCount >= 6) || (highSimilarity && averageRiskScore >= 60)) {
    return "reject"
  }

  return "manual_review"
}

export function analyzeWallets(
  wallets: ParsedWallet[],
  enrichment: EnrichmentMeta | null = null
): AnalysisResult {
  const enrichedWallets = wallets.map(hydrateWallet)
  const { drafts, assigned, fundingGroups } = createClusters(enrichedWallets)

  const walletResults: WalletRiskResult[] = enrichedWallets.map((wallet, index) => {
    const reasons: string[] = []
    const knownEntity = detectKnownEntity(wallet.walletAddress)
    const entityLabel = knownEntity?.label ?? wallet.knownEntityLabel ?? null
    const entityType: EntityType = knownEntity?.type ?? wallet.knownEntityType ?? (wallet.isContract ? "contract" : "user")
    const entityRiskReason = knownEntity?.reason ?? (entityLabel ? knownEntityRiskReason : null)
    const evidenceAvailable = hasEvidence(wallet, entityType)
    let score = 0
    const fundingGroupSize = wallet.fundingSource
      ? fundingGroups.get(wallet.fundingSource.toLowerCase())?.length ?? 0
      : 0
    const clusterId = assigned.get(index) ?? null
    const cluster = clusterId ? drafts.find((item) => item.clusterLabel === clusterId) ?? null : null
    const clusterSize = cluster?.walletIndexes.length ?? 0
    const clusterSimilarity = cluster?.behaviorSimilarityScore ?? 0

    if (wallet.enrichmentStatus === "completed" && wallet.enrichmentProvider) {
      reasons.push(`On-chain verified via ${wallet.enrichmentProvider}`)
    }

    if (wallet.accountType) {
      reasons.push(`Solana account intelligence: ${wallet.accountType}`)
      if (wallet.ownerProgram) reasons.push(`Solana owner program: ${wallet.ownerProgram}`)
      if (wallet.accountType !== "system_user_wallet") {
        score = Math.max(score, wallet.accountType === "missing_or_closed_account" ? 45 : 75)
        reasons.push("Account type evidence: not a normal end-user wallet")
      }
    }

    if (!evidenceAvailable && !entityLabel) {
      score = Math.max(score, 45)
      reasons.push("Unverified evidence: no reliable on-chain data was available; excluded from automatic approval")
    }

    if (wallet.walletAgeDays !== null) {
      if (wallet.walletAgeDays < 7) {
        score += 25
        reasons.push("On-chain evidence: wallet is younger than 7 days")
      } else if (wallet.walletAgeDays <= 30) {
        score += 15
        reasons.push("On-chain evidence: wallet is between 7 and 30 days old")
      } else if (wallet.walletAgeDays <= 90) {
        score += 8
        reasons.push("On-chain evidence: wallet is younger than 90 days")
      }
    }

    if (wallet.txCount !== null) {
      if (wallet.txCount <= 2) {
        score += 20
        reasons.push("On-chain evidence: low transaction count")
      } else if (wallet.txCount <= 5) {
        score += 12
        reasons.push("On-chain evidence: limited transaction history")
      } else if (wallet.txCount <= 15) {
        score += 5
        reasons.push("On-chain evidence: moderate transaction history")
      }
    }

    const campaignOnlyPattern =
      wallet.campaignActionsCount !== null &&
      wallet.txCount !== null &&
      wallet.campaignActionsCount >= 5 &&
      wallet.txCount <= 10

    if (campaignOnlyPattern) {
      score += 20
      reasons.push("Campaign evidence: campaign-only behavior pattern")
    }

    if (wallet.campaignOnlyRatio !== null) {
      const percent = Math.round(wallet.campaignOnlyRatio * 100)
      if (wallet.campaignOnlyRatio >= 0.8) {
        score += 30
        reasons.push(`V1.3 behavior intelligence: ${percent}% of sampled activity is campaign-only`)
      } else if (wallet.campaignOnlyRatio >= 0.5) {
        score += 18
        reasons.push(`V1.3 behavior intelligence: ${percent}% campaign-only activity concentration`)
      } else if (wallet.campaignOnlyRatio >= 0.25) {
        score += 8
        reasons.push(`V1.3 behavior intelligence: ${percent}% campaign-action concentration`)
      }
    }

    if (wallet.behaviorDiversityScore !== null) {
      if (wallet.behaviorDiversityScore < 25) {
        score += 18
        reasons.push("V1.3 behavior intelligence: very low behavior diversity")
      } else if (wallet.behaviorDiversityScore < 45) {
        score += 8
        reasons.push("V1.3 behavior intelligence: limited behavior diversity")
      } else if (wallet.behaviorDiversityScore >= 75) {
        reasons.push("V1.3 behavior intelligence: healthy behavior diversity")
      }
    }

    if (wallet.botScriptScore !== null) {
      if (wallet.botScriptScore >= 80) {
        score += 35
        reasons.push(`V1.3 bot-script probability: very high (${wallet.botScriptScore}/100)`)
      } else if (wallet.botScriptScore >= 60) {
        score += 22
        reasons.push(`V1.3 bot-script probability: high (${wallet.botScriptScore}/100)`)
      } else if (wallet.botScriptScore >= 40) {
        score += 10
        reasons.push(`V1.3 bot-script probability: moderate (${wallet.botScriptScore}/100)`)
      } else if (wallet.botScriptScore <= 20) {
        reasons.push(`V1.3 bot-script probability: low (${wallet.botScriptScore}/100)`)
      }
    }

    if (wallet.campaignQualityScore !== null) {
      if (wallet.campaignQualityScore < 30) {
        score += 25
        reasons.push("Campaign quality evidence: very weak organic wallet history")
      } else if (wallet.campaignQualityScore < 50) {
        score += 15
        reasons.push("Campaign quality evidence: weak organic wallet history")
      } else if (wallet.campaignQualityScore < 70) {
        score += 7
        reasons.push("Campaign quality evidence: limited organic wallet history")
      } else if (wallet.campaignQualityScore >= 85) {
        reasons.push("Campaign quality evidence: strong organic wallet profile")
      }
    }

    const fundingRisk = clusterRisk(fundingGroupSize)
    if (fundingRisk > 0) {
      score += fundingRisk
      reasons.push(`Shared funding source evidence: funding cluster with ${fundingGroupSize} wallets`)
    }

    const clusterScore = clusterRisk(clusterSize)
    if (clusterScore > 0 && clusterId) {
      score += clusterScore
      reasons.push(`Cluster evidence: part of suspicious cluster ${clusterId}`)
    }

    if (wallet.contractsCount !== null) {
      if (wallet.contractsCount <= 1) {
        score += 15
        reasons.push("On-chain evidence: low protocol/program interaction diversity")
      } else if (wallet.contractsCount <= 3) {
        score += 8
        reasons.push("On-chain evidence: limited protocol/program interaction diversity")
      }
    }

    if (
      wallet.totalVolume !== null &&
      wallet.campaignActionsCount !== null &&
      wallet.totalVolume < 5 &&
      wallet.campaignActionsCount > 3
    ) {
      score += 10
      reasons.push("On-chain evidence: low total volume despite campaign activity")
    }

    if (wallet.enrichmentStatus === "completed") {
      if (
        wallet.uniqueCounterparties !== null &&
        wallet.txCount !== null &&
        wallet.uniqueCounterparties <= 2 &&
        wallet.txCount > 2
      ) {
        score += 8
        reasons.push("On-chain evidence: very few unique counterparties")
      }

      if (
        wallet.lastActiveDaysAgo !== null &&
        wallet.campaignActionsCount !== null &&
        wallet.lastActiveDaysAgo > 180 &&
        wallet.campaignActionsCount > 0
      ) {
        score += 10
        reasons.push("On-chain evidence: dormant wallet reactivated for campaign activity")
      }

      if (
        wallet.walletAgeDays !== null &&
        wallet.campaignActionsCount !== null &&
        wallet.txCount !== null &&
        wallet.walletAgeDays < 7 &&
        wallet.campaignActionsCount > 0 &&
        wallet.txCount <= 5
      ) {
        score += 10
        reasons.push("On-chain evidence: brand-new wallet active only during campaign")
      }
    }

    if (entityLabel) {
      score = Math.max(score, 75)
      reasons.unshift(entityRiskReason ?? knownEntityRiskReason)
    }

    const hardSybilSignal =
      campaignOnlyPattern ||
      fundingGroupSize >= 10 ||
      clusterSize >= 10 ||
      (clusterSize >= 6 && clusterSimilarity >= 75) ||
      (wallet.botScriptScore !== null && wallet.botScriptScore >= 80) ||
      (wallet.campaignOnlyRatio !== null && wallet.campaignOnlyRatio >= 0.8 && (wallet.txCount ?? 0) <= 15) ||
      (wallet.behaviorDiversityScore !== null && wallet.behaviorDiversityScore < 20 && (wallet.txCount ?? 0) <= 5) ||
      (wallet.walletAgeDays !== null && wallet.walletAgeDays < 7 && wallet.txCount !== null && wallet.txCount <= 2)

    const riskScore = Math.min(100, score)
    const riskLevel = riskLevelFromScore(riskScore)
    const decision = statusFromSignals({
      score: riskScore,
      riskLevel,
      clusterId,
      clusterSize,
      fundingGroupSize,
      entityType,
      evidenceAvailable,
      accountType: wallet.accountType,
      hardSybilSignal,
    })

    if (!reasons.length || (reasons.length === 1 && reasons[0].startsWith("On-chain verified"))) {
      reasons.push(onChainCleanReason)
    }

    return {
      walletAddress: wallet.walletAddress,
      chain: wallet.chain,
      entityLabel,
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
      accountType: wallet.accountType,
      ownerProgram: wallet.ownerProgram,
      behaviorFingerprint: wallet.behaviorFingerprint,
      campaignQualityScore: wallet.campaignQualityScore,
      campaignOnlyRatio: wallet.campaignOnlyRatio,
      behaviorDiversityScore: wallet.behaviorDiversityScore,
      botScriptScore: wallet.botScriptScore,
      enrichmentProvider: wallet.enrichmentProvider,
      enrichmentStatus: wallet.enrichmentStatus,
    }
  })

  const clusters: ClusterResult[] = drafts.map((cluster) => {
    const clusterWallets = cluster.walletIndexes.map((index) => walletResults[index])
    const averageRiskScore =
      clusterWallets.reduce((sum, wallet) => sum + wallet.riskScore, 0) / clusterWallets.length

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
  const manualReviewCount = walletResults.filter((wallet) => wallet.status === "manual_review").length
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
