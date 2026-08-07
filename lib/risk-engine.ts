import type {
  AnalysisResult,
  ClusterResult,
  EnrichmentMeta,
  ParsedWallet,
  RiskLevel,
  RiskPolicy,
  SuggestedAction,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import {
  isNeutralServiceAddress,
  normalizeGraphAddress,
  type WalletGraphContext,
} from "@/lib/graph-intelligence"
import { normalizeAnalysisSemantics } from "@/lib/risk-engine/semantic-safety"
import {
  analyzeWallets as analyzeWalletsLegacy,
  normalizeRiskPolicy,
  riskPolicyFromNotes,
  type CrossCampaignContext,
  type CrossCampaignWalletSignal,
} from "./risk-engine/index"

export { normalizeRiskPolicy, riskPolicyFromNotes }
export type { CrossCampaignContext, CrossCampaignWalletSignal }

export const SYBIL_ENGINE_VERSION = "2.1.0"
export const SYBIL_RULESET_VERSION = "2026-08-07"
export const RISK_POLICY_VERSION = "2"

type SafetyPolicy = {
  approveMax: number
  rejectMin: number
  hardRejectMin: number
  clusterRejectSize: number
  label: string
}

const SAFETY_POLICY: Record<RiskPolicy, SafetyPolicy> = {
  conservative: {
    approveMax: 35,
    rejectMin: 90,
    hardRejectMin: 85,
    clusterRejectSize: 14,
    label: "Conservative",
  },
  balanced: {
    approveMax: 35,
    rejectMin: 80,
    hardRejectMin: 70,
    clusterRejectSize: 10,
    label: "Balanced",
  },
  strict: {
    approveMax: 25,
    rejectMin: 70,
    hardRejectMin: 55,
    clusterRejectSize: 6,
    label: "Strict",
  },
}

export function riskPolicyThresholdSnapshot(policy: RiskPolicy) {
  const normalized = normalizeRiskPolicy(policy)
  return {
    engineVersion: SYBIL_ENGINE_VERSION,
    rulesetVersion: SYBIL_RULESET_VERSION,
    riskPolicyVersion: RISK_POLICY_VERSION,
    policy: normalized,
    ...SAFETY_POLICY[normalized],
    automaticExclusionRequiresCorroboration: true,
    importedLabelsOverrideEngine: false,
    insufficientDataDecision: "manual_review",
    conflictingPriorLabelsDecision: "manual_review",
  }
}

type EvidenceFamily =
  | "funding"
  | "temporal"
  | "behavior"
  | "referral"
  | "campaign_event"
  | "participant"

type WalletDecision = {
  status: WalletStatus
  recommendedAction: SuggestedAction
  statusExplanation: string
  decisionReason: string
}

function clusterEvidenceFamilies(cluster: ClusterResult | null) {
  const families = new Set<EvidenceFamily>()
  ;(cluster?.reasons ?? []).forEach((reason) => {
    if (reason.startsWith("Funding evidence:")) families.add("funding")
    if (reason.startsWith("Temporal evidence:")) families.add("temporal")
    if (reason.startsWith("Behavior evidence:")) families.add("behavior")
    if (reason.startsWith("Referral evidence:")) families.add("referral")
    if (/matching task type|completion time window/i.test(reason)) families.add("campaign_event")
    if (/participant fingerprint/i.test(reason)) families.add("participant")
  })
  return families
}

function clusterHasAutomaticExclusionEvidence(cluster: ClusterResult | null) {
  const families = clusterEvidenceFamilies(cluster)
  if (families.size >= 3) return true

  const hasFunding = families.has("funding")
  const hasIndependentRelationship =
    families.has("behavior") ||
    families.has("temporal") ||
    families.has("referral") ||
    families.has("participant")

  if (hasFunding && hasIndependentRelationship) return true
  if (families.has("participant") && families.has("behavior")) return true

  return false
}

function isNonUserAccount(wallet: WalletRiskResult) {
  if (wallet.entityType !== "user") return true
  return Boolean(
    wallet.accountType &&
      wallet.accountType !== "system_user_wallet" &&
      wallet.accountType !== "historical_unresolved_account"
  )
}

function hasReliableEvidence(wallet: WalletRiskResult) {
  if (wallet.enrichmentStatus === "failed") return false
  if (wallet.accountType === "missing_or_closed_account") return false
  if (wallet.entityType !== "user") return true

  return (
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

function hasHardEvidence(wallet: WalletRiskResult) {
  return wallet.reasons.some((reason) =>
    /known-bad source|explicit self-referral|circular funding\/referral path|same wallet is both the participant's funder and referrer|share both a funding origin and referral source/i.test(
      reason
    )
  )
}

function hasStrongStandaloneBehaviorReviewEvidence(wallet: WalletRiskResult) {
  const highBotProbability = (wallet.botScriptScore ?? 0) >= 80
  const corroboratingBehavior =
    (wallet.campaignOnlyRatio ?? 0) >= 0.5 ||
    (wallet.behaviorDiversityScore !== null &&
      wallet.behaviorDiversityScore !== undefined &&
      wallet.behaviorDiversityScore < 45) ||
    (wallet.campaignQualityScore !== null &&
      wallet.campaignQualityScore !== undefined &&
      wallet.campaignQualityScore < 50)

  return highBotProbability && corroboratingBehavior
}

function contextOnlyReason(wallet: ParsedWallet) {
  if (!wallet.policyAction && !wallet.reputationLabel && !wallet.customerLabel) return null
  const label = wallet.reputationLabel ?? wallet.customerLabel ?? wallet.policyAction
  return `Customer-provided context retained without overriding the engine decision${label ? ` (${label})` : ""}.`
}

function prepareCrossCampaignContext(context: CrossCampaignContext | null) {
  if (!context) {
    return {
      context: null,
      conflictKeys: new Set<string>(),
    }
  }

  const conflictKeys = new Set<string>()
  const walletSignals = Object.fromEntries(
    Object.entries(context.walletSignals).map(([key, signal]) => {
      const riskConfirmations =
        signal.confirmedRiskCount + signal.reviewedRejectionCount
      const hasConflict = riskConfirmations > 0 && signal.trustedUserCount > 0

      if (hasConflict) conflictKeys.add(key)

      return [
        key,
        hasConflict
          ? {
              ...signal,
              trustedUserCount: 0,
            }
          : signal,
      ]
    })
  )

  return {
    context: { walletSignals } satisfies CrossCampaignContext,
    conflictKeys,
  }
}

function decideWallet({
  wallet,
  cluster,
  riskPolicy,
}: {
  wallet: WalletRiskResult
  cluster: ClusterResult | null
  riskPolicy: RiskPolicy
}): WalletDecision {
  const policy = SAFETY_POLICY[riskPolicy]
  const hardEvidence = hasHardEvidence(wallet)
  const strongClusterEvidence = clusterHasAutomaticExclusionEvidence(cluster)
  const strongBehaviorReviewEvidence =
    hasStrongStandaloneBehaviorReviewEvidence(wallet)
  const clusterSize = cluster?.walletCount ?? 0

  if (wallet.enrichmentStatus === "failed") {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Gray Zone: on-chain provider access was unavailable. Retry enrichment before making an eligibility decision.",
      decisionReason: "provider_unavailable",
    }
  }

  if (!hasReliableEvidence(wallet)) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Gray Zone: insufficient reliable on-chain evidence. This wallet is not classified as Sybil and requires an eligibility review or a fresh enrichment attempt.",
      decisionReason: "insufficient_data",
    }
  }

  if (wallet.accountType === "historical_unresolved_account") {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        "Gray Zone: historical activity exists, but the current account state is unresolved. This is not treated as malicious evidence.",
      decisionReason: "account_state_uncertain",
    }
  }

  if (isNonUserAccount(wallet)) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        wallet.statusExplanation ||
        "Not eligible: the address is a known service, protocol, contract, token, program, or other non-user account.",
      decisionReason: "ineligible_non_user_account",
    }
  }

  if (
    wallet.riskScore <= policy.approveMax &&
    !cluster &&
    !hardEvidence &&
    !strongBehaviorReviewEvidence
  ) {
    return {
      status: "approved",
      recommendedAction: "approve",
      statusExplanation:
        `Approved under ${policy.label} policy: sufficient evidence is available and no corroborated cluster or hard Sybil signal was found.`,
      decisionReason: "approved",
    }
  }

  if (hardEvidence && wallet.riskScore >= policy.hardRejectMin) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected under ${policy.label} policy: a high-confidence graph signal is supported by a risk score of ${wallet.riskScore}.`,
      decisionReason: "rejected_sybil",
    }
  }

  if (strongClusterEvidence && clusterSize >= policy.clusterRejectSize) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected under ${policy.label} policy: a severe ${clusterSize}-wallet cohort is supported by sufficiently independent evidence families.`,
      decisionReason: "rejected_sybil",
    }
  }

  if (
    wallet.riskScore >= policy.rejectMin &&
    (hardEvidence || strongClusterEvidence)
  ) {
    return {
      status: "rejected",
      recommendedAction: "reject",
      statusExplanation:
        `Rejected under ${policy.label} policy: the automatic exclusion threshold was crossed with corroborated high-confidence evidence.`,
      decisionReason: "rejected_sybil",
    }
  }

  if (strongBehaviorReviewEvidence) {
    return {
      status: "manual_review",
      recommendedAction: "manual_review",
      statusExplanation:
        `Gray Zone under ${policy.label} policy: very high bot-likelihood is corroborated by concentrated or low-diversity campaign behavior. Behavioral evidence alone does not trigger automatic Sybil rejection, but it blocks automatic approval.`,
      decisionReason: "strong_behavior_review_evidence",
    }
  }

  const weakCluster = Boolean(cluster) && !strongClusterEvidence
  return {
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation: weakCluster
      ? `Gray Zone under ${policy.label} policy: the cohort is based on signals that can be common in legitimate campaigns. Referral, campaign timing, or similar participation evidence cannot trigger automatic exclusion without stronger corroboration.`
      : `Gray Zone under ${policy.label} policy: risk evidence requires human review but does not meet the automatic Sybil rejection standard.`,
    decisionReason: weakCluster ? "weak_cluster_evidence" : "manual_review",
  }
}

function applyCrossCampaignConflict(
  decision: WalletDecision,
  hasConflict: boolean
): WalletDecision {
  if (!hasConflict || decision.status === "rejected") return decision
  return {
    status: "manual_review",
    recommendedAction: "manual_review",
    statusExplanation:
      "Gray Zone: prior workspace reviews contain both trusted-user and confirmed-risk/rejection evidence. Conflicting historical labels cannot approve or reject the current wallet automatically.",
    decisionReason: "cross_campaign_conflict",
  }
}

function safeClusterAction(
  cluster: ClusterResult,
  walletResults: WalletRiskResult[],
  riskPolicy: RiskPolicy
): SuggestedAction {
  const policy = SAFETY_POLICY[riskPolicy]
  const strongEvidence = clusterHasAutomaticExclusionEvidence(cluster)
  const members = walletResults.filter((wallet) => wallet.clusterId === cluster.clusterLabel)
  const hasHardSignal = members.some(hasHardEvidence)

  if (!strongEvidence && !hasHardSignal) return "manual_review"
  if (hasHardSignal && cluster.averageRiskScore >= policy.hardRejectMin) return "reject"
  if (strongEvidence && cluster.walletCount >= policy.clusterRejectSize) return "reject"
  if (strongEvidence && cluster.averageRiskScore >= policy.rejectMin) return "reject"
  return "manual_review"
}

function parsedObservedFundingTime(wallet: ParsedWallet) {
  const value = wallet.firstFundingAt ?? (wallet.historyTruncated ? null : wallet.firstSeen)
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isUserLikeInput(wallet: ParsedWallet) {
  return (
    !wallet.accountType ||
    wallet.accountType === "system_user_wallet" ||
    wallet.accountType === "historical_unresolved_account"
  )
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 30) return "low"
  if (score <= 60) return "medium"
  if (score <= 85) return "high"
  return "critical"
}

function buildAdversarialFundingTimeClusters({
  wallets,
  walletResults,
  graphContext,
}: {
  wallets: ParsedWallet[]
  walletResults: WalletRiskResult[]
  graphContext: WalletGraphContext | null
}): {
  clusters: ClusterResult[]
  clusterByWalletKey: Map<string, ClusterResult>
  subsumedLegacyClusterIds: Set<string>
} {
  const resultByKey = new Map(
    walletResults.map((wallet) => [
      `${wallet.chain}:${wallet.walletAddress}`,
      wallet,
    ])
  )
  const groups = new Map<string, ParsedWallet[]>()

  wallets.forEach((wallet) => {
    if (!isUserLikeInput(wallet) || !wallet.fundingSource) return
    if (
      isNeutralServiceAddress(
        wallet.fundingSource,
        wallet.chain,
        graphContext
      )
    ) {
      return
    }
    const observedAt = parsedObservedFundingTime(wallet)
    if (observedAt === null) return
    const key = `${wallet.chain}:${normalizeGraphAddress(
      wallet.fundingSource,
      wallet.chain
    )}`
    groups.set(key, [...(groups.get(key) ?? []), wallet])
  })

  const clusters: ClusterResult[] = []
  const clusterByWalletKey = new Map<string, ClusterResult>()
  const subsumedLegacyClusterIds = new Set<string>()

  Array.from(groups.values()).forEach((group) => {
    if (group.length < 3) return

    const members = group
      .map((wallet) => resultByKey.get(`${wallet.chain}:${wallet.walletAddress}`))
      .filter((wallet): wallet is WalletRiskResult => Boolean(wallet))
    if (members.length < 3) return

    const timestamps = group
      .map(parsedObservedFundingTime)
      .filter((value): value is number => value !== null)
    if (timestamps.length < Math.ceil(group.length * 0.7)) return

    const spreadHours =
      (Math.max(...timestamps) - Math.min(...timestamps)) / 3_600_000
    if (spreadHours > 24) return

    const existingClusterIds = new Set(
      members
        .map((wallet) => wallet.clusterId)
        .filter((clusterId): clusterId is string => Boolean(clusterId))
    )
    const [onlyExistingClusterId] = Array.from(existingClusterIds)
    const alreadyFullyCovered =
      existingClusterIds.size === 1 &&
      Boolean(onlyExistingClusterId) &&
      members.every((wallet) => wallet.clusterId === onlyExistingClusterId)

    if (alreadyFullyCovered) return

    existingClusterIds.forEach((clusterId) => {
      subsumedLegacyClusterIds.add(clusterId)
    })

    const label = `SC-${String(clusters.length + 1).padStart(3, "0")}`
    const averageRiskScore = Math.max(
      30,
      members.reduce((sum, wallet) => sum + wallet.riskScore, 0) /
        members.length
    )
    const cluster: ClusterResult = {
      clusterLabel: label,
      walletCount: members.length,
      averageRiskScore: Number(averageRiskScore.toFixed(1)),
      sharedFundingSource: normalizeGraphAddress(
        group[0]?.fundingSource ?? "",
        group[0]?.chain ?? ""
      ),
      behaviorSimilarityScore: Math.min(88, 64 + members.length * 4),
      suggestedAction: "manual_review",
      reasons: [
        "V2.1 adversarial guard: coordinated funding timing survived transaction-count and activity-history jitter",
        "Funding evidence: shared first observed funding source",
        "Temporal evidence: tightly aligned first funding or first observed activity window",
        "Anti-evasion evidence: transaction-count variation does not neutralize same-source funding coordination.",
      ],
      walletAddresses: members.map((wallet) => wallet.walletAddress),
    }
    clusters.push(cluster)
    members.forEach((wallet) => {
      clusterByWalletKey.set(`${wallet.chain}:${wallet.walletAddress}`, cluster)
    })
  })

  return { clusters, clusterByWalletKey, subsumedLegacyClusterIds }
}

export function analyzeWallets(
  wallets: ParsedWallet[],
  enrichment: EnrichmentMeta | null = null,
  riskPolicy: RiskPolicy = "balanced",
  graphContext: WalletGraphContext | null = null,
  crossCampaignContext: CrossCampaignContext | null = null
): AnalysisResult {
  const normalizedPolicy = normalizeRiskPolicy(riskPolicy)
  const originalWalletByKey = new Map(
    wallets.map((wallet) => [`${wallet.chain}:${wallet.walletAddress}`, wallet])
  )
  const customerContext = new Map(
    wallets.map((wallet) => [
      `${wallet.chain}:${wallet.walletAddress}`,
      {
        policyAction: wallet.policyAction ?? null,
        reputationLabel: wallet.reputationLabel ?? null,
        policyReason: wallet.policyReason ?? null,
        customerLabel: wallet.customerLabel ?? null,
      },
    ])
  )

  const sanitizedWallets = wallets.map((wallet) => ({
    ...wallet,
    policyAction: null,
  }))
  const preparedCrossCampaign = prepareCrossCampaignContext(crossCampaignContext)

  const legacyResult = analyzeWalletsLegacy(
    sanitizedWallets,
    enrichment,
    normalizedPolicy,
    graphContext,
    preparedCrossCampaign.context
  )
  const adversarialFundingTime = buildAdversarialFundingTimeClusters({
    wallets: sanitizedWallets,
    walletResults: legacyResult.wallets,
    graphContext,
  })
  const effectiveClusters = [
    ...legacyResult.clusters.filter(
      (cluster) =>
        !adversarialFundingTime.subsumedLegacyClusterIds.has(cluster.clusterLabel)
    ),
    ...adversarialFundingTime.clusters,
  ]
  const clusterById = new Map(
    effectiveClusters.map((cluster) => [cluster.clusterLabel, cluster])
  )

  const safeWallets = legacyResult.wallets.map((wallet) => {
    const walletKey = `${wallet.chain}:${wallet.walletAddress}`
    const context = customerContext.get(walletKey)
    const safetyCluster = adversarialFundingTime.clusterByWalletKey.get(walletKey)
    const effectiveClusterId = safetyCluster?.clusterLabel ?? wallet.clusterId ?? null
    const cluster = effectiveClusterId
      ? clusterById.get(effectiveClusterId) ?? null
      : null
    const safetyRiskScore = safetyCluster
      ? Math.max(wallet.riskScore, 30)
      : wallet.riskScore
    const decisionWallet: WalletRiskResult = {
      ...wallet,
      clusterId: effectiveClusterId,
      riskScore: safetyRiskScore,
      riskLevel: riskLevelFromScore(safetyRiskScore),
    }
    const crossCampaignKey = normalizeGraphAddress(wallet.walletAddress, wallet.chain)
    const baseDecision = decideWallet({
      wallet: decisionWallet,
      cluster,
      riskPolicy: normalizedPolicy,
    })
    const decision = applyCrossCampaignConflict(
      baseDecision,
      preparedCrossCampaign.conflictKeys.has(crossCampaignKey)
    )
    const original = originalWalletByKey.get(walletKey)
    const customerReason = original ? contextOnlyReason(original) : null
    const reasons = [
      ...wallet.reasons.filter(
        (reason) =>
          !reason.startsWith("V1.4 reputation/policy signal:") &&
          !reason.startsWith("V1.4 policy reason:")
      ),
      ...(safetyCluster ? safetyCluster.reasons : []),
      ...(preparedCrossCampaign.conflictKeys.has(crossCampaignKey)
        ? [
            "Cross-campaign conflict: prior trusted-user and confirmed-risk/reviewer-rejection labels coexist; manual review is required.",
          ]
        : []),
      `Decision category: ${decision.decisionReason}`,
      `Engine version: ${SYBIL_ENGINE_VERSION}`,
      `Ruleset version: ${SYBIL_RULESET_VERSION}`,
      ...(customerReason ? [customerReason] : []),
    ]

    return {
      ...decisionWallet,
      status: decision.status,
      recommendedAction: decision.recommendedAction,
      statusExplanation: decision.statusExplanation,
      reasons,
      policyAction: context?.policyAction ?? null,
      reputationLabel: context?.reputationLabel ?? null,
      policyReason: context?.policyReason ?? null,
      customerLabel: context?.customerLabel ?? null,
    }
  })

  const safeClusters = effectiveClusters.map((cluster) => ({
    ...cluster,
    suggestedAction: safeClusterAction(cluster, safeWallets, normalizedPolicy),
  }))

  const totalWallets = safeWallets.length
  const approvedCount = safeWallets.filter((wallet) => wallet.status === "approved").length
  const manualReviewCount = safeWallets.filter(
    (wallet) => wallet.status === "manual_review"
  ).length
  const rejectedCount = safeWallets.filter((wallet) => wallet.status === "rejected").length

  return normalizeAnalysisSemantics({
    ...legacyResult,
    wallets: safeWallets,
    clusters: safeClusters,
    totalWallets,
    approvedCount,
    manualReviewCount,
    rejectedCount,
  })
}
